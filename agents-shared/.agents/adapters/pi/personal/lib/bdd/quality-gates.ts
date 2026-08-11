import { createHash } from "node:crypto";
import { runCommand } from "./run-command.ts";
import {
	assuranceHandoffGaps,
	fingerprintGateResults,
	formatAssuranceHandoff,
	formatGuardianStatus,
} from "./assurance-handoff.ts";
import {
	FIT_INTERNAL_GATE_IDS,
	QUALITY_GATE_KINDS,
	type AssuranceConfig,
	type AssuranceEvidence,
	type AssuranceGateResult,
	type ExecutorKind,
	type GateExecutorSpec,
	type GateStatus,
	type InternalGateEvidence,
	type QualityGateKind,
	type SecurityGateSlotStatusV1,
	type TrustProfile,
	type TrustTier,
} from "./types.ts";
import type { ProjectCommands, ProjectProfile } from "./project-profile.ts";

export {
	assuranceHandoffGaps,
	fingerprintGateResults,
	formatAssuranceHandoff,
	formatGuardianStatus,
} from "./assurance-handoff.ts";

export type GateAvailability = "ready" | "unavailable";
export type GateSource = "config" | "detected";

export interface QualityGate {
	id: string;
	kind: QualityGateKind;
	command?: string;
	source: GateSource;
	required: boolean;
	availability: GateAvailability;
	timeoutMs: number;
	threshold?: number;
	executorKind?: ExecutorKind;
	trustTier?: TrustTier | string;
	executor?: GateExecutorSpec;
}

export interface QualityGatePlan {
	version: 1;
	profileFingerprint: string;
	fingerprint: string;
	trustProfile?: TrustProfile;
	gates: QualityGate[];
}

export interface GateCommandResult {
	command: string;
	exitCode: number;
	summary: string;
	timedOut?: boolean;
	spawnError?: boolean;
	policyRejected?: boolean;
	executorKind?: ExecutorKind;
	trustTier?: TrustTier | string;
}

const COMMAND_KEYS: Partial<Record<QualityGateKind, keyof ProjectCommands>> = {
	format: "format",
	static: "staticAnalysis",
	types: "typecheck",
	unit: "unitTest",
	acceptance: "acceptanceTest",
	property: "propertyTest",
	coverage: "coverage",
	mutation: "mutation",
	architecture: "architecture",
	doctor: "doctor",
	security: "security",
	performance: "performance",
};

function thresholdFor(kind: QualityGateKind, assurance: AssuranceConfig): number | undefined {
	if (kind === "coverage") return assurance.coverageThreshold;
	if (kind === "mutation") return assurance.mutationThreshold;
	if (kind === "doctor") return assurance.doctorThreshold;
	return undefined;
}

function displayCommand(executor: GateExecutorSpec | undefined, fallback?: string): string | undefined {
	if (!executor) return fallback;
	if (executor.kind === "shell") return executor.command || fallback;
	if (executor.kind === "argv") {
		const args = executor.args?.length ? ` ${executor.args.join(" ")}` : "";
		return `${executor.file}${args}`;
	}
	if (executor.kind === "internal") return `internal:${executor.id}`;
	return fallback;
}

function resolveExecutor(
	kind: QualityGateKind,
	assurance: AssuranceConfig,
	shellCommand: string | undefined,
): { executor?: GateExecutorSpec; executorKind: ExecutorKind; trustTier: TrustTier | string } {
	const trustProfile: TrustProfile = assurance.trustProfile ?? "interactive";
	const fromConfig = assurance.executors?.[kind];

	if (fromConfig?.kind === "argv") {
		return {
			executor: fromConfig,
			executorKind: "argv",
			trustTier: trustProfile === "interactive" ? "trusted" : "trusted",
		};
	}
	if (fromConfig?.kind === "internal") {
		return {
			executor: fromConfig,
			executorKind: "internal",
			trustTier: "trusted",
		};
	}
	if (fromConfig?.kind === "shell") {
		// E42 / R6 — shell can never self-label trusted; force interactive_untrusted.
		const forced: GateExecutorSpec = {
			...fromConfig,
			kind: "shell",
			trustTier: "interactive_untrusted",
		};
		return {
			executor: forced,
			executorKind: "shell",
			trustTier: "interactive_untrusted",
		};
	}

	// Legacy shell string path
	if (shellCommand) {
		const shellExec: GateExecutorSpec = {
			kind: "shell",
			command: shellCommand,
			trustTier: "interactive_untrusted",
		};
		return {
			executor: shellExec,
			executorKind: "shell",
			trustTier: "interactive_untrusted",
		};
	}

	return {
		executorKind: "shell",
		trustTier: "interactive_untrusted",
	};
}

function canonicalPlan(plan: Omit<QualityGatePlan, "fingerprint">): string {
	return JSON.stringify(plan);
}

export function buildQualityGatePlan(input: {
	profile: ProjectProfile;
	assurance?: AssuranceConfig;
}): QualityGatePlan {
	const assurance = input.assurance ?? {};
	const trustProfile: TrustProfile = assurance.trustProfile ?? "interactive";
	const configuredRequired = assurance.requiredGateKinds;
	const required = new Set<QualityGateKind>(
		configuredRequired?.length ? configuredRequired : assurance.enabled ? ["unit"] : [],
	);
	const advisory = new Set<QualityGateKind>(assurance.advisoryGateKinds ?? []);
	const gates: QualityGate[] = [];
	for (const kind of QUALITY_GATE_KINDS) {
		const override = assurance.commands?.[kind]?.trim();
		const commandKey = COMMAND_KEYS[kind];
		const detected = commandKey ? input.profile.commands[commandKey]?.trim() : undefined;
		const shellCommand = override || detected;
		const execInfo = resolveExecutor(kind, assurance, shellCommand);
		const hasExecutor = Boolean(execInfo.executor);
		const command = displayCommand(execInfo.executor, shellCommand);

		// Include gate when required/advisory, or when a command/executor exists
		if (!command && !hasExecutor && !required.has(kind) && !advisory.has(kind)) continue;

		const ready =
			execInfo.executorKind === "internal"
				? true
				: execInfo.executorKind === "argv"
					? Boolean(execInfo.executor && execInfo.executor.kind === "argv" && execInfo.executor.file)
					: Boolean(command);

		gates.push({
			id: `quality:${kind}`,
			kind,
			command,
			source: override || assurance.executors?.[kind] ? "config" : "detected",
			required: required.has(kind),
			availability: ready ? "ready" : "unavailable",
			timeoutMs: assurance.gateTimeoutMs?.[kind] ?? assurance.defaultTimeoutMs ?? 120_000,
			threshold: thresholdFor(kind, assurance),
			executorKind: execInfo.executorKind,
			trustTier: execInfo.trustTier,
			executor: execInfo.executor,
		});
	}
	const partial = {
		version: 1 as const,
		profileFingerprint: input.profile.fingerprint,
		trustProfile,
		gates,
	};
	return {
		...partial,
		fingerprint: createHash("sha256").update(canonicalPlan(partial)).digest("hex"),
	};
}

function resultForUnavailable(gate: QualityGate): AssuranceGateResult {
	return {
		id: gate.id,
		kind: gate.kind,
		required: gate.required,
		status: "unavailable",
		summary: gate.required
			? "Required gate has no configured or locally detected command"
			: "Advisory gate is not configured locally",
		executorKind: gate.executorKind,
		trustTier: gate.trustTier,
	};
}

function skipped(gate: QualityGate, reason: string): AssuranceGateResult {
	return {
		id: gate.id,
		kind: gate.kind,
		required: gate.required,
		status: "skipped",
		command: gate.command,
		summary: reason,
		executorKind: gate.executorKind,
		trustTier: gate.trustTier,
	};
}

function policyRejectedResult(gate: QualityGate, reason: string): AssuranceGateResult {
	return {
		id: gate.id,
		kind: gate.kind,
		required: gate.required,
		status: "failed",
		command: gate.command,
		exitCode: 126,
		summary: reason,
		executorKind: gate.executorKind ?? "shell",
		trustTier: "policy_rejected",
		policyRejected: true,
		reasonCode: "FIT01_POLICY_REJECTED",
	};
}

function evidenceFingerprint(value: Record<string, unknown>): string {
	return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function bindResultToPlan(
	plan: QualityGatePlan,
	result: AssuranceGateResult,
): AssuranceGateResult {
	return {
		...result,
		planFingerprint: plan.fingerprint,
		profileFingerprint: plan.profileFingerprint,
		evidenceFingerprint:
			result.evidenceFingerprint ??
			evidenceFingerprint({
				id: result.id,
				kind: result.kind,
				status: result.status,
				executorKind: result.executorKind ?? null,
				trustTier: result.trustTier ?? null,
				exitCode: result.exitCode ?? null,
				reasonCode: result.reasonCode ?? null,
				summary: result.summary,
			}),
	};
}

const INTERNAL_ADAPTER_BY_ID: Readonly<Record<string, InternalGateEvidence["adapter"]>> =
	Object.freeze({
		[FIT_INTERNAL_GATE_IDS.trajectory]: "trajectory",
		[FIT_INTERNAL_GATE_IDS.decision]: "decision",
		[FIT_INTERNAL_GATE_IDS.budget]: "budget",
		[FIT_INTERNAL_GATE_IDS.security]: "security",
	});

function internalResult(
	gate: QualityGate,
	input: {
		status: GateStatus;
		reasonCode: string;
		summary: string;
		startedAt: string;
		completedAt: string;
		observedAt?: string;
		evidenceFacts?: Record<string, unknown>;
	},
): AssuranceGateResult {
	return {
		id: gate.id,
		kind: gate.kind,
		required: gate.required,
		status: input.status,
		command: gate.command,
		summary: input.summary,
		startedAt: input.startedAt,
		completedAt: input.completedAt,
		observedAt: input.observedAt,
		executorKind: "internal",
		trustTier: "trusted",
		policyRejected: false,
		reasonCode: input.reasonCode,
		evidenceFingerprint: evidenceFingerprint({
			id: gate.id,
			status: input.status,
			reasonCode: input.reasonCode,
			observedAt: input.observedAt ?? null,
			...(input.evidenceFacts ?? {}),
		}),
	};
}

function securityStatus(
	statuses: readonly SecurityGateSlotStatusV1[],
): { status: GateStatus; reasonCode: string } | undefined {
	if (statuses.includes("timeout")) {
		return { status: "timeout", reasonCode: "FIT01_SECURITY_TIMEOUT" };
	}
	if (statuses.includes("stale")) {
		return { status: "stale", reasonCode: "FIT01_SECURITY_STALE" };
	}
	if (statuses.some((status) => status === "failed" || status === "aborted" || status === "untrusted")) {
		return { status: "failed", reasonCode: "FIT01_SECURITY_FAILED" };
	}
	if (statuses.some((status) => status === "unknown" || status === "unavailable")) {
		return { status: "unavailable", reasonCode: "FIT01_SECURITY_UNAVAILABLE" };
	}
	return undefined;
}

/**
 * Pure typed adapter for the four FIT-01 internal gate sources. All currentness
 * facts are explicit; no dependency prose or ambient state is inspected.
 */
export function adaptInternalGateEvidence(input: {
	gate: QualityGate;
	plan: QualityGatePlan;
	evidence?: InternalGateEvidence;
	startedAt: string;
	completedAt: string;
}): AssuranceGateResult {
	const id =
		input.gate.executor?.kind === "internal" ? input.gate.executor.id : "unknown";
	const expectedAdapter = INTERNAL_ADAPTER_BY_ID[id];
	const base = {
		startedAt: input.startedAt,
		completedAt: input.completedAt,
		observedAt: input.evidence?.observedAt,
	};
	if (!expectedAdapter) {
		return internalResult(input.gate, {
			...base,
			status: "unavailable",
			reasonCode: "FIT01_INTERNAL_GATE_UNKNOWN",
			summary: `Unknown internal gate id '${id}'`,
			evidenceFacts: { id },
		});
	}
	if (!input.evidence) {
		return internalResult(input.gate, {
			...base,
			status: "unavailable",
			reasonCode: "FIT01_REQUIRED_INTERNAL_GATE_MISSING",
			summary: "Typed internal gate evidence is unavailable",
			evidenceFacts: { id, adapter: expectedAdapter },
		});
	}
	const observedAtMs = Date.parse(input.evidence.observedAt);
	const completedAtMs = Date.parse(input.completedAt);
	if (
		input.evidence.version !== 1 ||
		!Number.isFinite(observedAtMs) ||
		!Number.isFinite(completedAtMs)
	) {
		return internalResult(input.gate, {
			...base,
			status: "failed",
			reasonCode: "FIT01_INTERNAL_EVIDENCE_INVALID",
			summary: "Internal evidence envelope is invalid",
			evidenceFacts: { id, adapter: input.evidence.adapter },
		});
	}
	if (observedAtMs > completedAtMs) {
		return internalResult(input.gate, {
			...base,
			status: "stale",
			reasonCode: "FIT01_INTERNAL_EVIDENCE_STALE",
			summary: "Internal evidence observation is not current for this run",
			evidenceFacts: { id, adapter: input.evidence.adapter },
		});
	}
	if (
		input.evidence.planFingerprint !== input.plan.fingerprint ||
		input.evidence.profileFingerprint !== input.plan.profileFingerprint
	) {
		return internalResult(input.gate, {
			...base,
			status: "stale",
			reasonCode: "FIT01_INTERNAL_EVIDENCE_STALE",
			summary: "Internal evidence is bound to another plan or profile",
			evidenceFacts: {
				id,
				adapter: input.evidence.adapter,
				planFingerprint: input.evidence.planFingerprint,
				profileFingerprint: input.evidence.profileFingerprint,
			},
		});
	}
	if (input.evidence.adapter !== expectedAdapter) {
		return internalResult(input.gate, {
			...base,
			status: "failed",
			reasonCode: "FIT01_INTERNAL_ADAPTER_MISMATCH",
			summary: "Internal evidence adapter does not match the configured id",
			evidenceFacts: { id, adapter: input.evidence.adapter },
		});
	}

	const evidence = input.evidence;
	if (evidence.adapter === "trajectory") {
		if (evidence.result.runId !== evidence.expectedRunId) {
			return internalResult(input.gate, {
				...base,
				status: "stale",
				reasonCode: "FIT01_TRAJECTORY_STALE",
				summary: "Trajectory evaluation is for another run",
				evidenceFacts: { id, runId: evidence.result.runId, expectedRunId: evidence.expectedRunId },
			});
		}
		if (evidence.result.status === "unavailable") {
			return internalResult(input.gate, {
				...base,
				status: "unavailable",
				reasonCode: "FIT01_TRAJECTORY_UNAVAILABLE",
				summary: "Trajectory evaluation is unavailable",
				evidenceFacts: { id, runId: evidence.result.runId, status: evidence.result.status },
			});
		}
		const passed = evidence.result.status === "pass" && evidence.result.ok === true;
		return internalResult(input.gate, {
			...base,
			status: passed ? "passed" : "failed",
			reasonCode: passed ? "FIT01_TRAJECTORY_PASSED" : "FIT01_TRAJECTORY_FAILED",
			summary: passed ? "Typed trajectory evaluation passed" : "Typed trajectory evaluation did not pass",
			evidenceFacts: { id, runId: evidence.result.runId, status: evidence.result.status ?? null, ok: evidence.result.ok },
		});
	}

	if (evidence.adapter === "decision") {
		if (!evidence.result.ok) {
			return internalResult(input.gate, {
				...base,
				status: "failed",
				reasonCode: "FIT01_DECISION_REFUSED",
				summary: "Decision handoff evidence was refused",
				evidenceFacts: { id, code: evidence.result.code },
			});
		}
		const decision = evidence.result.evidence;
		if (decision.approvalFingerprint === null) {
			return internalResult(input.gate, {
				...base,
				status: "failed",
				reasonCode: "FIT01_DECISION_APPROVAL_MISSING",
				summary: "Current human-approved decision fingerprint is missing",
				evidenceFacts: { id, storeFingerprint: decision.storeFingerprint },
			});
		}
		if (
			evidence.expectedStoreFingerprint !== evidence.expectedApprovalFingerprint ||
			decision.storeFingerprint !== evidence.expectedStoreFingerprint ||
			decision.approvalFingerprint !== evidence.expectedApprovalFingerprint
		) {
			return internalResult(input.gate, {
				...base,
				status: "stale",
				reasonCode: "FIT01_DECISION_STALE",
				summary: "Decision store or human approval fingerprint is stale",
				evidenceFacts: {
					id,
					storeFingerprint: decision.storeFingerprint,
					approvalFingerprint: decision.approvalFingerprint,
					expectedStoreFingerprint: evidence.expectedStoreFingerprint,
					expectedApprovalFingerprint: evidence.expectedApprovalFingerprint,
				},
			});
		}
		const trusted =
			decision.executorKind === "internal" &&
			decision.trustTier === "trusted" &&
			decision.status === "passed";
		return internalResult(input.gate, {
			...base,
			status: trusted ? "passed" : "failed",
			reasonCode: trusted ? "FIT01_DECISION_PASSED" : "FIT01_DECISION_FAILED",
			summary: trusted ? "Current human-approved decision evidence passed" : "Decision handoff evidence did not pass",
			evidenceFacts: { id, status: decision.status, storeFingerprint: decision.storeFingerprint, approvalFingerprint: decision.approvalFingerprint },
		});
	}

	if (evidence.adapter === "budget") {
		if ("code" in evidence.result) {
			return internalResult(input.gate, {
				...base,
				status: "failed",
				reasonCode: "FIT01_BUDGET_REFUSED",
				summary: "Budget evidence was refused",
				evidenceFacts: { id, code: evidence.result.code },
			});
		}
		if (evidence.result.status === "unknown") {
			return internalResult(input.gate, {
				...base,
				status: "unavailable",
				reasonCode: "FIT01_BUDGET_USAGE_UNKNOWN",
				summary: `Budget usage is unknown under ${input.plan.trustProfile ?? "interactive"} profile`,
				evidenceFacts: { id, status: evidence.result.status, trustProfile: input.plan.trustProfile ?? "interactive" },
			});
		}
		const passed =
			!evidence.result.circuitBroken &&
			(evidence.result.status === "ok" || evidence.result.status === "warn");
		return internalResult(input.gate, {
			...base,
			status: passed ? "passed" : "failed",
			reasonCode: passed ? "FIT01_BUDGET_PASSED" : "FIT01_BUDGET_EXCEEDED",
			summary: passed ? `Typed budget status is ${evidence.result.status}` : "Budget circuit is broken or exceeded",
			evidenceFacts: { id, status: evidence.result.status, circuitBroken: evidence.result.circuitBroken },
		});
	}

	if (
		evidence.candidateSha !== evidence.expectedCandidateSha ||
		evidence.inventoryFingerprint !== evidence.expectedInventoryFingerprint
	) {
		return internalResult(input.gate, {
			...base,
			status: "stale",
			reasonCode: "FIT01_SECURITY_STALE",
			summary: "Security candidate or inventory fingerprint is stale",
			evidenceFacts: {
				id,
				candidateSha: evidence.candidateSha,
				expectedCandidateSha: evidence.expectedCandidateSha,
				inventoryFingerprint: evidence.inventoryFingerprint,
				expectedInventoryFingerprint: evidence.expectedInventoryFingerprint,
			},
		});
	}
	if (!evidence.result.ok) {
		return internalResult(input.gate, {
			...base,
			status: "failed",
			reasonCode: "FIT01_SECURITY_REFUSED",
			summary: "Security slot evidence was refused",
			evidenceFacts: { id, code: evidence.result.code },
		});
	}
	if (evidence.requiredSlots.length === 0) {
		return internalResult(input.gate, {
			...base,
			status: "unavailable",
			reasonCode: "FIT01_SECURITY_REQUIRED_SLOTS_MISSING",
			summary: "A required security gate has no required slots",
			evidenceFacts: { id },
		});
	}
	const requiredStatuses = evidence.requiredSlots.map(
		(slot) => evidence.result.slots.find((item) => item.slot === slot)?.status ?? "unknown",
	);
	const nonPassing = securityStatus(requiredStatuses);
	if (nonPassing) {
		return internalResult(input.gate, {
			...base,
			...nonPassing,
			summary: "One or more required security slots are non-passing",
			evidenceFacts: { id, slots: evidence.requiredSlots.map((slot, index) => [slot, requiredStatuses[index]]) },
		});
	}
	const passed = evidence.result.available === true && evidence.result.evidence != null;
	return internalResult(input.gate, {
		...base,
		status: passed ? "passed" : "unavailable",
		reasonCode: passed ? "FIT01_SECURITY_PASSED" : "FIT01_SECURITY_UNAVAILABLE",
		summary: passed ? "Current required security slots passed" : "Security evidence is unavailable",
		evidenceFacts: { id, candidateSha: evidence.candidateSha, inventoryFingerprint: evidence.inventoryFingerprint, requiredSlots: evidence.requiredSlots },
	});
}

export async function runQualityGatePlan(input: {
	cwd: string;
	plan: QualityGatePlan;
	execute?: (input: {
		cwd: string;
		command: string;
		timeoutMs: number;
		executor?: GateExecutorSpec;
		executorKind?: ExecutorKind;
	}) => Promise<GateCommandResult>;
	/** Process-local typed results keyed by configured internal executor id. */
	internalEvidence?: Readonly<Record<string, InternalGateEvidence | undefined>>;
	now?: () => string;
}): Promise<AssuranceEvidence> {
	const now = input.now ?? (() => new Date().toISOString());
	const startedAt = now();
	const trustProfile: TrustProfile = input.plan.trustProfile ?? "interactive";
	const strictish = trustProfile === "strict" || trustProfile === "overnight";
	const execute =
		input.execute ??
		(async ({ cwd, command, timeoutMs, executor, executorKind }) => {
			if (executorKind === "argv" && executor && executor.kind === "argv") {
				const result = await runCommand({
					cwd,
					argv: {
						version: 1,
						file: executor.file,
						args: executor.args,
						cwd: executor.cwd,
						maxOutputBytes: executor.maxOutputBytes,
						timeoutMs: executor.timeoutMs ?? timeoutMs,
					},
					trust: "trusted",
					projectRoot: cwd,
					timeoutMs,
				});
				return result satisfies GateCommandResult;
			}
			const result = await runCommand({ cwd, command, timeoutMs });
			return result satisfies GateCommandResult;
		});
	const results: AssuranceGateResult[] = [];
	const push = (result: AssuranceGateResult): void => {
		results.push(bindResultToPlan(input.plan, result));
	};
	let halted = false;
	for (const gate of input.plan.gates) {
		if (halted) {
			push({
				...skipped(gate, "Skipped after required gate failure"),
				reasonCode: "FIT01_SKIPPED_AFTER_REQUIRED_GATE",
			});
			continue;
		}
		if (gate.availability === "unavailable" && gate.executorKind !== "internal") {
			push({
				...resultForUnavailable(gate),
				reasonCode: "FIT01_GATE_UNAVAILABLE",
			});
			if (gate.required) halted = true;
			continue;
		}

		if (gate.executorKind === "internal") {
			const id = gate.executor?.kind === "internal" ? gate.executor.id : "unknown";
			const gateStartedAt = now();
			let adapted: AssuranceGateResult;
			try {
				adapted = adaptInternalGateEvidence({
					gate,
					plan: input.plan,
					evidence: input.internalEvidence?.[id],
					startedAt: gateStartedAt,
					completedAt: now(),
				});
			} catch {
				adapted = internalResult(gate, {
					status: "failed",
					reasonCode: "FIT01_INTERNAL_ADAPTER_FAILED",
					summary: "Typed internal adapter failed closed",
					startedAt: gateStartedAt,
					completedAt: now(),
					evidenceFacts: { id },
				});
			}
			push(adapted);
			if (gate.required && adapted.status !== "passed") halted = true;
			continue;
		}

		// R6 / E21 — strict/overnight reject shell before spawn
		if ((gate.executorKind === "shell" || !gate.executorKind) && strictish) {
			push(
				policyRejectedResult(
					gate,
					`policy rejected: shell commands are untrusted under ${trustProfile} profile`,
				),
			);
			if (gate.required) halted = true;
			continue;
		}

		// R11 / E44 — argv kind without a valid matching argv executor rejects before spawn
		// (no shell fallthrough under any profile; especially strict/overnight).
		const hasValidArgv =
			gate.executor?.kind === "argv" &&
			typeof gate.executor.file === "string" &&
			Boolean(gate.executor.file.trim()) &&
			Array.isArray(gate.executor.args);
		if (gate.executorKind === "argv" && !hasValidArgv) {
			push(
				policyRejectedResult(
					gate,
					`policy rejected: argv executor kind requires a valid matching argv executor (no shell fallthrough)`,
				),
			);
			if (gate.required) halted = true;
			continue;
		}

		if (!gate.command && gate.executorKind !== "argv") {
			push({ ...resultForUnavailable(gate), reasonCode: "FIT01_GATE_UNAVAILABLE" });
			if (gate.required) halted = true;
			continue;
		}

		const gateStartedAt = now();
		const result = await execute({
			cwd: input.cwd,
			command: gate.command ?? "",
			timeoutMs: gate.timeoutMs,
			executor: gate.executor,
			executorKind: gate.executorKind,
		});
		if (result.policyRejected) {
			push({
				id: gate.id,
				kind: gate.kind,
				required: gate.required,
				status: "failed",
				command: gate.command,
				exitCode: result.exitCode,
				summary: result.summary,
				startedAt: gateStartedAt,
				completedAt: now(),
				executorKind: gate.executorKind ?? result.executorKind,
				trustTier: "policy_rejected",
				policyRejected: true,
				reasonCode: "FIT01_POLICY_REJECTED",
			});
			if (gate.required) halted = true;
			continue;
		}
		const commandPassed = result.exitCode === 0 && !result.timedOut && !result.spawnError;
		const executorKind = gate.executorKind ?? result.executorKind;
		const trustTier = gate.trustTier ?? result.trustTier;
		const trustedRequiredExecutor =
			executorKind === "argv" || executorKind === "internal"
				? trustTier === "trusted"
				: false;
		const passed = commandPassed && (!gate.required || trustedRequiredExecutor);
		const status: GateStatus = result.timedOut ? "timeout" : passed ? "passed" : "failed";
		push({
			id: gate.id,
			kind: gate.kind,
			required: gate.required,
			status,
			command: gate.command,
			exitCode: result.exitCode,
			summary: result.summary,
			startedAt: gateStartedAt,
			completedAt: now(),
			executorKind,
			trustTier,
			policyRejected: false,
			reasonCode: result.timedOut
				? "FIT01_COMMAND_TIMEOUT"
				: result.spawnError
					? "FIT01_COMMAND_SPAWN_FAILED"
					: !commandPassed
						? "FIT01_COMMAND_NONZERO"
						: gate.required && !trustedRequiredExecutor
							? "FIT01_REQUIRED_EXECUTOR_UNTRUSTED"
							: "FIT01_GATE_PASSED",
		});
		if (!passed && gate.required) halted = true;
	}
	return {
		profileFingerprint: input.plan.profileFingerprint,
		planFingerprint: input.plan.fingerprint,
		startedAt,
		completedAt: now(),
		ok: results.every((result) => !result.required || result.status === "passed"),
		results,
		resultsFingerprint: fingerprintGateResults(results),
	};
}

export function formatQualityGatePlan(plan: QualityGatePlan): string {
	const lines = [
		"# Deterministic quality-gate plan",
		"",
		`- profile: \`${plan.profileFingerprint}\``,
		`- plan: \`${plan.fingerprint}\``,
		"",
	];
	for (const gate of plan.gates) {
		const policy = gate.required ? "required" : "advisory";
		const command = gate.command ? `\`${gate.command}\`` : "_(unavailable)_";
		const threshold = gate.threshold != null
			? ` · threshold ${gate.threshold} (command-enforced)`
			: "";
		lines.push(`- **${gate.kind}** [${policy}/${gate.source}] ${command}${threshold}`);
	}
	return lines.join("\n");
}

export function formatQualityGateRun(run: AssuranceEvidence): string {
	const counts = (status: AssuranceGateResult["status"]) =>
		run.results.filter((result) => result.status === status).length;
	return [
		`# Assurance gates — ${run.ok ? "PASS" : "FAIL"}`,
		``,
		`- plan: \`${run.planFingerprint}\``,
		`- results: \`${run.resultsFingerprint ?? "missing"}\``,
		`- passed: ${counts("passed")}`,
		`- failed: ${counts("failed")}`,
		`- unavailable: ${counts("unavailable")}`,
		`- timeout: ${counts("timeout")}`,
		`- stale: ${counts("stale")}`,
		`- skipped: ${counts("skipped")}`,
		``,
		...run.results.map(
			(result) =>
				`- ${result.status === "passed" ? "✅" : result.status === "failed" ? "❌" : "⚠️"} **${result.kind}**${result.required ? " (required)" : ""} — ${result.summary}`,
		),
	].join("\n");
}

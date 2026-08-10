import { createHash } from "node:crypto";
import { runCommand } from "./run-command.ts";
import {
	QUALITY_GATE_KINDS,
	type AssuranceConfig,
	type AssuranceEvidence,
	type AssuranceGateResult,
	type BddEvidence,
	type ExecutorKind,
	type GateExecutorSpec,
	type QualityGateKind,
	type TrustProfile,
	type TrustTier,
} from "./types.ts";
import type { ProjectCommands, ProjectProfile } from "./project-profile.ts";

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

const COMMAND_KEYS: Record<QualityGateKind, keyof ProjectCommands> = {
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
		return {
			executor: fromConfig,
			executorKind: "shell",
			trustTier:
				assurance.commandTrust?.[kind] ??
				fromConfig.trustTier ??
				"interactive_untrusted",
		};
	}

	// Legacy shell string path
	if (shellCommand) {
		const shellExec: GateExecutorSpec = {
			kind: "shell",
			command: shellCommand,
			trustTier: assurance.commandTrust?.[kind] ?? "interactive_untrusted",
		};
		return {
			executor: shellExec,
			executorKind: "shell",
			trustTier: shellExec.trustTier ?? "interactive_untrusted",
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
		const detected = input.profile.commands[COMMAND_KEYS[kind]]?.trim();
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
	};
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
	let halted = false;
	for (const gate of input.plan.gates) {
		if (halted) {
			results.push(skipped(gate, "Skipped after required gate failure"));
			continue;
		}
		if (gate.availability === "unavailable" && gate.executorKind !== "internal") {
			results.push(resultForUnavailable(gate));
			if (gate.required) halted = true;
			continue;
		}

		// R7 / E23 — unknown internal checks fail closed (no FIT-01 adapters in BDD-01)
		if (gate.executorKind === "internal") {
			const id =
				gate.executor && gate.executor.kind === "internal" ? gate.executor.id : "unknown";
			results.push({
				id: gate.id,
				kind: gate.kind,
				required: gate.required,
				status: "unavailable",
				summary: `Unknown internal check id '${id}' — FIT-01 adapter not available (fail closed)`,
				executorKind: "internal",
				trustTier: gate.trustTier ?? "trusted",
				startedAt: now(),
				completedAt: now(),
			});
			if (gate.required) halted = true;
			continue;
		}

		// R6 / E21 — strict/overnight reject shell before spawn
		if ((gate.executorKind === "shell" || !gate.executorKind) && strictish) {
			results.push(
				policyRejectedResult(
					gate,
					`policy rejected: shell commands are untrusted under ${trustProfile} profile`,
				),
			);
			if (gate.required) halted = true;
			continue;
		}

		if (!gate.command && gate.executorKind !== "argv") {
			results.push(resultForUnavailable(gate));
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
			results.push({
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
			});
			if (gate.required) halted = true;
			continue;
		}
		const passed = result.exitCode === 0 && !result.timedOut && !result.spawnError;
		results.push({
			id: gate.id,
			kind: gate.kind,
			required: gate.required,
			status: passed ? "passed" : "failed",
			command: gate.command,
			exitCode: result.exitCode,
			summary: result.summary,
			startedAt: gateStartedAt,
			completedAt: now(),
			executorKind: gate.executorKind ?? result.executorKind,
			trustTier: gate.trustTier ?? result.trustTier,
			policyRejected: false,
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
	};
}

export function assuranceHandoffGaps(
	evidence: BddEvidence,
	policy: {
		enabled?: boolean;
		expectedPlanFingerprint?: string;
		expectedRequiredGateKinds?: readonly QualityGateKind[];
		expectedConfigFingerprint?: string;
		requireCausalRed?: boolean;
		requireCommandBackedMatchedMutation?: boolean;
	},
): string[] {
	if (!policy.enabled) return [];
	const run = evidence.assurance;
	if (!run) return ["assurance gate run"];
	const gaps: string[] = [];
	if (!run.ok || run.results.some((result) => result.required && result.status !== "passed")) {
		gaps.push("assurance required gates are not green");
	}
	const expectedRequired = policy.expectedRequiredGateKinds?.length
		? policy.expectedRequiredGateKinds
		: (["unit"] as const);
	for (const kind of expectedRequired) {
		const passed = run.results.some(
			(result) => result.kind === kind && result.required && result.status === "passed",
		);
		if (!passed) gaps.push(`assurance required gate ${kind} lacks current passing evidence`);
	}
	if (policy.expectedPlanFingerprint && run.planFingerprint !== policy.expectedPlanFingerprint) {
		gaps.push("assurance plan fingerprint is stale");
	}
	if (
		policy.expectedConfigFingerprint &&
		run.configFingerprint !== policy.expectedConfigFingerprint
	) {
		gaps.push("assurance config fingerprint is stale (stale-config)");
	}
	if (evidence.green?.at && run.completedAt <= evidence.green.at) {
		gaps.push("assurance gate run is older than the latest green evidence");
	}

	// E28 — untrusted required gate cannot satisfy assurance
	for (const result of run.results) {
		if (!result.required || result.status !== "passed") continue;
		const tier = `${result.trustTier ?? ""}`;
		if (/interactive_untrusted|untrusted|legacy|policy_rejected/i.test(tier)) {
			gaps.push(
				`required gate ${result.kind} result is untrusted (${tier}) and cannot satisfy assurance`,
			);
		}
	}

	// Non-causal / legacy red under assurance
	if (policy.requireCausalRed) {
		const red = evidence.red;
		if (!red || red.assuranceEligible !== true) {
			gaps.push(
				"non-causal red: assurance-eligible expected-red evidence required under assurance",
			);
		}
	}

	// E29 — note-only mutation cannot satisfy command-backed matched mutation
	if (policy.requireCommandBackedMatchedMutation) {
		const mutation = evidence.mutation;
		const hasCommands = Boolean(mutation?.failCommand?.trim() && mutation?.passCommand?.trim());
		const matched = mutation?.matched !== false && hasCommands;
		if (!mutation?.proven || !matched) {
			gaps.push(
				"command-backed matched mutation / sensitivity evidence required (note-only is insufficient)",
			);
		}
	}

	return gaps;
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
		`- passed: ${counts("passed")}`,
		`- failed: ${counts("failed")}`,
		`- unavailable: ${counts("unavailable")}`,
		`- skipped: ${counts("skipped")}`,
		``,
		...run.results.map(
			(result) =>
				`- ${result.status === "passed" ? "✅" : result.status === "failed" ? "❌" : "⚠️"} **${result.kind}**${result.required ? " (required)" : ""} — ${result.summary}`,
		),
	].join("\n");
}

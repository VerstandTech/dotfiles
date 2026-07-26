import { createHash } from "node:crypto";
import { runCommand } from "./run-command.ts";
import {
	QUALITY_GATE_KINDS,
	type AssuranceConfig,
	type AssuranceEvidence,
	type AssuranceGateResult,
	type BddEvidence,
	type QualityGateKind,
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
}

export interface QualityGatePlan {
	version: 1;
	profileFingerprint: string;
	fingerprint: string;
	gates: QualityGate[];
}

export interface GateCommandResult {
	command: string;
	exitCode: number;
	summary: string;
	timedOut?: boolean;
	spawnError?: boolean;
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

function canonicalPlan(plan: Omit<QualityGatePlan, "fingerprint">): string {
	return JSON.stringify(plan);
}

export function buildQualityGatePlan(input: {
	profile: ProjectProfile;
	assurance?: AssuranceConfig;
}): QualityGatePlan {
	const assurance = input.assurance ?? {};
	const configuredRequired = assurance.requiredGateKinds;
	const required = new Set<QualityGateKind>(
		configuredRequired?.length ? configuredRequired : assurance.enabled ? ["unit"] : [],
	);
	const advisory = new Set<QualityGateKind>(assurance.advisoryGateKinds ?? []);
	const gates: QualityGate[] = [];
	for (const kind of QUALITY_GATE_KINDS) {
		const override = assurance.commands?.[kind]?.trim();
		const detected = input.profile.commands[COMMAND_KEYS[kind]]?.trim();
		const command = override || detected;
		if (!command && !required.has(kind) && !advisory.has(kind)) continue;
		gates.push({
			id: `quality:${kind}`,
			kind,
			command,
			source: override ? "config" : "detected",
			required: required.has(kind),
			availability: command ? "ready" : "unavailable",
			timeoutMs: assurance.gateTimeoutMs?.[kind] ?? assurance.defaultTimeoutMs ?? 120_000,
			threshold: thresholdFor(kind, assurance),
		});
	}
	const partial = {
		version: 1 as const,
		profileFingerprint: input.profile.fingerprint,
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
	};
}

export async function runQualityGatePlan(input: {
	cwd: string;
	plan: QualityGatePlan;
	execute?: (input: { cwd: string; command: string; timeoutMs: number }) => Promise<GateCommandResult>;
	now?: () => string;
}): Promise<AssuranceEvidence> {
	const now = input.now ?? (() => new Date().toISOString());
	const startedAt = now();
	const execute =
		input.execute ??
		(async ({ cwd, command, timeoutMs }) => {
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
		if (gate.availability === "unavailable" || !gate.command) {
			results.push(resultForUnavailable(gate));
			if (gate.required) halted = true;
			continue;
		}
		const gateStartedAt = now();
		const result = await execute({ cwd: input.cwd, command: gate.command, timeoutMs: gate.timeoutMs });
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
	if (evidence.green?.at && run.completedAt <= evidence.green.at) {
		gaps.push("assurance gate run is older than the latest green evidence");
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

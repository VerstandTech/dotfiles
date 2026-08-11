import { createHash } from "node:crypto";
import type {
	AssuranceEvidence,
	BddEvidence,
	GateResult,
	QualityGateKind,
} from "./types.ts";

/** Fixed-field projection used for exact, deterministic handoff evidence. */
function canonicalGateResult(result: GateResult): Record<string, unknown> {
	return {
		id: result.id,
		kind: result.kind,
		required: result.required,
		status: result.status,
		command: result.command ?? null,
		exitCode: result.exitCode ?? null,
		summary: result.summary,
		startedAt: result.startedAt ?? null,
		completedAt: result.completedAt ?? null,
		observedAt: result.observedAt ?? null,
		executorKind: result.executorKind ?? null,
		trustTier: result.trustTier ?? null,
		policyRejected: result.policyRejected === true,
		reasonCode: result.reasonCode ?? null,
		planFingerprint: result.planFingerprint ?? null,
		profileFingerprint: result.profileFingerprint ?? null,
		evidenceFingerprint: result.evidenceFingerprint ?? null,
	};
}

export function fingerprintGateResults(results: readonly GateResult[]): string {
	return createHash("sha256")
		.update(JSON.stringify(results.map(canonicalGateResult)))
		.digest("hex");
}

export interface AssuranceHandoffPolicy {
	enabled?: boolean;
	expectedPlanFingerprint?: string;
	expectedRequiredGateKinds?: readonly QualityGateKind[];
	expectedConfigFingerprint?: string;
	requireCausalRed?: boolean;
	requireCommandBackedMatchedMutation?: boolean;
	/** FIT-01 strict integration: require exact digest and per-result bindings. */
	requireResultsFingerprint?: boolean;
}

export function assuranceHandoffGaps(
	evidence: BddEvidence,
	policy: AssuranceHandoffPolicy,
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

	// BDD-01 trust lock: required passing evidence must explicitly be trusted
	// argv/internal evidence. A tier string cannot repair a shell/missing kind.
	for (const result of run.results) {
		if (!result.required || result.status !== "passed") continue;
		const tier = `${result.trustTier ?? ""}`;
		const kind = `${result.executorKind ?? ""}`;
		const trustedKind = /^(argv|internal)$/i.test(kind);
		if (!trustedKind) {
			gaps.push(
				`required gate ${result.kind} has untrusted or missing executor kind (${kind || "missing"}) and cannot satisfy assurance`,
			);
			continue;
		}
		if (!/^trusted$/i.test(tier)) {
			gaps.push(
				`required gate ${result.kind} result is untrusted (${tier || "missing"}) and cannot satisfy assurance`,
			);
		}
	}

	if (policy.requireResultsFingerprint) {
		const expectedResultsFingerprint = fingerprintGateResults(run.results);
		if (!run.resultsFingerprint) {
			gaps.push("assurance results fingerprint is missing from exact result evidence");
		} else if (run.resultsFingerprint !== expectedResultsFingerprint) {
			gaps.push("assurance results fingerprint does not match exact result evidence");
		}
		for (const result of run.results) {
			if (result.planFingerprint !== run.planFingerprint) {
				gaps.push(`assurance result ${result.id} has stale plan binding`);
			}
			if (result.profileFingerprint !== run.profileFingerprint) {
				gaps.push(`assurance result ${result.id} has stale profile binding`);
			}
			if (!result.evidenceFingerprint) {
				gaps.push(`assurance result ${result.id} lacks typed evidence fingerprint`);
			}
		}
	}

	if (policy.requireCausalRed) {
		const red = evidence.red;
		if (!red || red.assuranceEligible !== true) {
			gaps.push(
				"non-causal red: assurance-eligible expected-red evidence required under assurance",
			);
		}
	}

	if (policy.expectedConfigFingerprint) {
		const expected = policy.expectedConfigFingerprint;
		if (evidence.red?.configFingerprint && evidence.red.configFingerprint !== expected) {
			gaps.push(
				`stale red config fingerprint (red=${evidence.red.configFingerprint}, expected=${expected})`,
			);
		}
		if (evidence.green?.configFingerprint && evidence.green.configFingerprint !== expected) {
			gaps.push(
				`stale green config fingerprint (green=${evidence.green.configFingerprint}, expected=${expected})`,
			);
		}
		if (evidence.red && !evidence.red.configFingerprint) {
			gaps.push("red config fingerprint missing (must bind current config)");
		}
		if (evidence.green && !evidence.green.configFingerprint) {
			gaps.push("green config fingerprint missing (must bind current config)");
		}
	}

	if (policy.requireCommandBackedMatchedMutation) {
		const mutation = evidence.mutation;
		const hasCommands = Boolean(mutation?.failCommand?.trim() && mutation?.passCommand?.trim());
		const matched = mutation?.matched === true && hasCommands;
		if (!mutation?.proven || !matched) {
			gaps.push(
				"command-backed matched mutation / sensitivity evidence required (matched must be true; note-only or undefined matched is insufficient)",
			);
		}
	}

	return gaps;
}

function resultLine(result: GateResult): string {
	const policy = result.required ? "required" : "advisory";
	const executor = `${result.executorKind ?? "missing"}/${result.trustTier ?? "missing"}`;
	const reason = result.reasonCode ?? "FIT01_REASON_MISSING";
	const evidence = result.evidenceFingerprint ?? "missing";
	return `- **${result.id}** [${policy}] ${result.status} · ${executor} · ${reason} · evidence \`${evidence}\``;
}

/** Exact canonical assurance block appended to BDD handoff output. */
export function formatAssuranceHandoff(run: AssuranceEvidence | undefined): string {
	if (!run) return "## Exact assurance evidence\n\n_(not run)_";
	return [
		"## Exact assurance evidence",
		"",
		`- profile: \`${run.profileFingerprint}\``,
		`- plan: \`${run.planFingerprint}\``,
		`- results: \`${run.resultsFingerprint ?? "missing"}\``,
		`- verdict: ${run.ok ? "PASS" : "FAIL"}`,
		"",
		...run.results.map(resultLine),
	].join("\n");
}

function isTrustedRequiredPass(result: GateResult): boolean {
	return (
		result.status === "passed" &&
		(result.executorKind === "argv" || result.executorKind === "internal") &&
		result.trustTier === "trusted"
	);
}

/** Concise read-only report consumed by the Fitness Guardian role. */
export function formatGuardianStatus(run: AssuranceEvidence): string {
	const blockers = run.results.filter(
		(result) => result.required && !isTrustedRequiredPass(result),
	);
	const advisory = run.results.filter(
		(result) => !result.required && result.status !== "passed" && result.status !== "skipped",
	);
	const concise = (result: GateResult) =>
		`- ${result.id}: ${result.status} (${result.reasonCode ?? "FIT01_REASON_MISSING"})`;
	return [
		`# Fitness Guardian — ${blockers.length === 0 && run.ok ? "PASS" : "BLOCKED"}`,
		`- plan: \`${run.planFingerprint}\``,
		`- results: \`${run.resultsFingerprint ?? "missing"}\``,
		`- required blockers: ${blockers.length}`,
		...(blockers.length ? blockers.map(concise) : ["- none"]),
		`- advisory findings: ${advisory.length}`,
		...(advisory.length ? advisory.map(concise) : ["- none"]),
	].join("\n");
}

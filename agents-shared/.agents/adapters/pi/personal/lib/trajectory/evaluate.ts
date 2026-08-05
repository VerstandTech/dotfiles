/**
 * Evaluate trajectory assertions + anti-patterns for a run.
 */

import { detectTrajectoryAntiPatterns, formatAntiPatternHits } from "./anti-patterns.ts";
import type {
	GoldenTrajectorySuite,
	TrajectoryAssertion,
	TrajectoryAssertionResult,
	TrajectoryEvaluation,
	TrajectoryEvent,
	TrajectoryMetrics,
	TrajectoryRun,
} from "./types.ts";

export function computeTrajectoryMetrics(run: TrajectoryRun): TrajectoryMetrics {
	const events = run.events ?? [];
	const toolCalls = events.filter((e) => e.kind === "tool_call").length;
	const errors = events.filter((e) => e.kind === "error").length;
	const phaseChanges = events.filter((e) => e.kind === "phase_change").length;
	const gateFailures = events.filter(
		(e) =>
			e.kind === "gate_result" &&
			(e.data?.status === "failed" || e.data?.ok === false),
	).length;
	let durationMs = run.metrics?.durationMs;
	if (durationMs == null && run.startedAt && run.completedAt) {
		const a = Date.parse(run.startedAt);
		const b = Date.parse(run.completedAt);
		if (Number.isFinite(a) && Number.isFinite(b) && b >= a) durationMs = b - a;
	}
	return {
		toolCalls,
		errors,
		phaseChanges,
		gateFailures,
		durationMs,
		estimatedTokens: run.metrics?.estimatedTokens,
		estimatedCostUsd: run.metrics?.estimatedCostUsd,
	};
}

function toolSequence(events: TrajectoryEvent[]): string[] {
	return events
		.filter((e) => e.kind === "tool_call")
		.map((e) => e.tool ?? String(e.data?.tool ?? ""))
		.filter(Boolean);
}

function assertRequiredTools(
	assertion: TrajectoryAssertion,
	tools: string[],
): TrajectoryAssertionResult {
	const required = assertion.requiredTools ?? [];
	if (!required.length) {
		return { id: assertion.id, ok: true, summary: "No required tools" };
	}
	const mode = assertion.matchMode ?? "subset";
	if (mode === "strict") {
		const ok =
			tools.length === required.length && tools.every((t, i) => t === required[i]);
		return {
			id: assertion.id,
			ok,
			summary: ok
				? `Strict tool sequence match (${required.length})`
				: `Strict tool sequence mismatch: got [${tools.join(", ")}] want [${required.join(", ")}]`,
		};
	}
	if (mode === "unordered") {
		const a = [...tools].sort().join("\0");
		const b = [...required].sort().join("\0");
		const ok = a === b;
		return {
			id: assertion.id,
			ok,
			summary: ok ? "Unordered tool multiset match" : "Unordered tool multiset mismatch",
		};
	}
	// subset (default): all required appear in order (not necessarily contiguous)
	let i = 0;
	for (const t of tools) {
		if (t === required[i]) i++;
		if (i >= required.length) break;
	}
	const ok = i >= required.length;
	return {
		id: assertion.id,
		ok,
		summary: ok
			? `Required tools present in order (${required.join(" → ")})`
			: `Missing required tools in order; matched ${i}/${required.length}`,
	};
}

export function evaluateAssertion(
	run: TrajectoryRun,
	assertion: TrajectoryAssertion,
): TrajectoryAssertionResult {
	const events = run.events ?? [];
	const tools = toolSequence(events);

	if (assertion.requiredTools?.length) {
		const toolResult = assertRequiredTools(assertion, tools);
		if (!toolResult.ok) return toolResult;
	}

	if (assertion.forbiddenTools?.length) {
		const hit = tools.find((t) => assertion.forbiddenTools!.includes(t));
		if (hit) {
			return {
				id: assertion.id,
				ok: false,
				summary: `Forbidden tool used: ${hit}`,
			};
		}
	}

	if (assertion.requiredKinds?.length) {
		const kinds = new Set(events.map((e) => e.kind));
		const missing = assertion.requiredKinds.filter((k) => !kinds.has(k));
		if (missing.length) {
			return {
				id: assertion.id,
				ok: false,
				summary: `Missing event kinds: ${missing.join(", ")}`,
			};
		}
	}

	if (assertion.forbidSuccessAfterFailedGate) {
		const metrics = computeTrajectoryMetrics(run);
		if (run.outcome === "success" && metrics.gateFailures > 0) {
			return {
				id: assertion.id,
				ok: false,
				summary: "Success outcome with gate failures",
			};
		}
	}

	if (assertion.maxToolCalls != null && tools.length > assertion.maxToolCalls) {
		return {
			id: assertion.id,
			ok: false,
			summary: `Tool calls ${tools.length} exceed max ${assertion.maxToolCalls}`,
		};
	}

	if (assertion.maxErrors != null) {
		const errors = events.filter((e) => e.kind === "error").length;
		if (errors > assertion.maxErrors) {
			return {
				id: assertion.id,
				ok: false,
				summary: `Errors ${errors} exceed max ${assertion.maxErrors}`,
			};
		}
	}

	return {
		id: assertion.id,
		ok: true,
		summary: assertion.description || "All checks passed",
	};
}

export function evaluateTrajectory(
	run: TrajectoryRun,
	assertions: TrajectoryAssertion[] = [],
): TrajectoryEvaluation {
	const metrics = computeTrajectoryMetrics(run);
	const results = assertions.map((a) => evaluateAssertion(run, a));
	const anti = detectTrajectoryAntiPatterns(run);
	const errorAnti = anti.filter((h) => h.severity === "error");
	const ok = results.every((r) => r.ok) && errorAnti.length === 0;
	return {
		runId: run.runId,
		ok,
		results,
		metrics,
		antiPatterns: anti.map((h) => `${h.code}: ${h.message}`),
	};
}

export function formatTrajectoryEvaluation(ev: TrajectoryEvaluation): string {
	const lines = [
		`# Trajectory evaluation — ${ev.ok ? "PASS" : "FAIL"}`,
		``,
		`- run: \`${ev.runId}\``,
		`- toolCalls: ${ev.metrics.toolCalls}`,
		`- errors: ${ev.metrics.errors}`,
		`- gateFailures: ${ev.metrics.gateFailures}`,
		``,
		`## Assertions`,
		...ev.results.map(
			(r) => `- ${r.ok ? "✅" : "❌"} **${r.id}** — ${r.summary}`,
		),
		``,
		`## Anti-patterns`,
		ev.antiPatterns.length
			? ev.antiPatterns.map((a) => `- ⚠️ ${a}`).join("\n")
			: "- none",
	];
	return lines.join("\n");
}

/** Evaluate every entry in a golden suite against provided runs keyed by entry id. */
export function evaluateGoldenSuite(
	suite: GoldenTrajectorySuite,
	runsByEntryId: Record<string, TrajectoryRun>,
): { ok: boolean; results: Array<{ entryId: string; evaluation: TrajectoryEvaluation }> } {
	const results: Array<{ entryId: string; evaluation: TrajectoryEvaluation }> = [];
	for (const entry of suite.entries) {
		const run = runsByEntryId[entry.id];
		if (!run) {
			results.push({
				entryId: entry.id,
				evaluation: {
					runId: "missing",
					ok: false,
					results: [
						{
							id: "missing-run",
							ok: false,
							summary: `No run provided for golden entry ${entry.id}`,
						},
					],
					metrics: {
						toolCalls: 0,
						errors: 0,
						phaseChanges: 0,
						gateFailures: 0,
					},
					antiPatterns: [],
				},
			});
			continue;
		}
		results.push({
			entryId: entry.id,
			evaluation: evaluateTrajectory(run, entry.assertions),
		});
	}
	return {
		ok: results.every((r) => r.evaluation.ok),
		results,
	};
}

export { formatAntiPatternHits };

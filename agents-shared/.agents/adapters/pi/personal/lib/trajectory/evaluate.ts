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

const MAX_EVENTS = 10_000;
const MAX_ASSERTIONS = 256;

function emptyMetrics(): TrajectoryMetrics {
	return { toolCalls: 0, errors: 0, phaseChanges: 0, gateFailures: 0 };
}

function invalidEvaluation(runId: string, message: string): TrajectoryEvaluation {
	return Object.freeze({
		runId,
		ok: false,
		status: "invalid",
		results: Object.freeze([
			Object.freeze({ id: "invalid-run", ok: false, summary: message }),
		]),
		metrics: Object.freeze(emptyMetrics()),
		antiPatterns: Object.freeze([`INVALID_TRAJECTORY: ${message}`]),
	});
}

function isTimestamp(value: unknown): value is string {
	return typeof value === "string" && value.length > 0 && value.length <= 64;
}

function timestampMs(value: string): number | undefined {
	// Strict ordering is enforced only for parseable timestamps (ISO-like).
	// Legacy short fixture stamps such as "t" remain accepted for compatibility.
	if (!/\d{4}-\d{2}-\d{2}/.test(value)) return undefined;
	const ms = Date.parse(value);
	return Number.isFinite(ms) ? ms : undefined;
}

export function validateTrajectoryRunV1(run: unknown): { ok: true; value: TrajectoryRun } | { ok: false; code: string; message: string } {
	if (!run || typeof run !== "object" || Array.isArray(run)) {
		return { ok: false, code: "invalid-run", message: "Run must be a plain object" };
	}
	const candidate = run as Record<string, unknown>;
	if (candidate.version !== 1) {
		return { ok: false, code: "unsupported-version", message: "Unsupported run version" };
	}
	if (typeof candidate.runId !== "string" || candidate.runId.length === 0) {
		return { ok: false, code: "invalid-run", message: "Missing runId" };
	}
	if (typeof candidate.taskId !== "string" || candidate.taskId.length === 0) {
		return { ok: false, code: "invalid-run", message: "Missing taskId" };
	}
	if (!isTimestamp(candidate.startedAt)) {
		return { ok: false, code: "invalid-run", message: "Invalid startedAt" };
	}
	if (!Array.isArray(candidate.events)) {
		return { ok: false, code: "invalid-run", message: "Missing events" };
	}
	if (candidate.events.length > MAX_EVENTS) {
		return { ok: false, code: "bound-exceeded", message: "Too many events" };
	}
	let previousSeq = 0;
	let previousAt = 0;
	for (let i = 0; i < candidate.events.length; i++) {
		const event = candidate.events[i];
		if (!event || typeof event !== "object" || Array.isArray(event)) {
			return { ok: false, code: "invalid-event", message: `Invalid event at index ${i}` };
		}
		const row = event as TrajectoryEvent;
		if (!Number.isSafeInteger(row.seq) || row.seq !== previousSeq + 1) {
			return { ok: false, code: "sequence-invalid", message: "Event sequence must be contiguous from 1" };
		}
		previousSeq = row.seq;
		if (!isTimestamp(row.at)) {
			return { ok: false, code: "invalid-event", message: `Invalid timestamp at seq ${row.seq}` };
		}
		const atMs = timestampMs(row.at);
		if (atMs !== undefined) {
			if (previousAt > 0 && atMs < previousAt) {
				return { ok: false, code: "invalid-event", message: `Decreasing timestamp at seq ${row.seq}` };
			}
			previousAt = atMs;
		}
		if (typeof row.kind !== "string" || row.kind.length === 0) {
			return { ok: false, code: "invalid-event-kind", message: `Missing event kind at seq ${row.seq}` };
		}
	}
	return { ok: true, value: candidate as unknown as TrajectoryRun };
}

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
	if (mode !== "subset" && mode !== "superset") {
		return {
			id: assertion.id,
			ok: false,
			summary: `Unknown assertion match mode: ${String(mode)}`,
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
	if (assertions.length > MAX_ASSERTIONS) {
		return invalidEvaluation(typeof run?.runId === "string" ? run.runId : "invalid", "Too many assertions");
	}
	const validated = validateTrajectoryRunV1(run);
	if (!validated.ok) {
		return invalidEvaluation(typeof run?.runId === "string" ? run.runId : "invalid", validated.message);
	}
	const metrics = computeTrajectoryMetrics(validated.value);
	const results = assertions.map((a) => evaluateAssertion(validated.value, a));
	const anti = detectTrajectoryAntiPatterns(validated.value);
	const errorAnti = anti.filter((h) => h.severity === "error");
	const ok = results.every((r) => r.ok) && errorAnti.length === 0;
	return Object.freeze({
		runId: validated.value.runId,
		ok,
		status: ok ? "pass" : "fail",
		results: Object.freeze(results.map((r) => Object.freeze(r))),
		metrics: Object.freeze(metrics),
		antiPatterns: Object.freeze(anti.map((h) => `${h.code}: ${h.message}`)),
	});
}

export function formatTrajectoryEvaluation(ev: TrajectoryEvaluation): string {
	const lines = [
		`# Trajectory evaluation — ${ev.ok ? "PASS" : "FAIL"}`,
		``,
		`- run: \`${ev.runId}\``,
		`- status: ${ev.status ?? (ev.ok ? "pass" : "fail")}`,
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

function entryMatchesExpectation(
	entry: GoldenTrajectorySuite["entries"][number],
	evaluation: TrajectoryEvaluation,
): boolean {
	const expectedOk = entry.expectedOk ?? true;
	if (evaluation.ok !== expectedOk) return false;
	const required = entry.requiredAntiPatterns ?? [];
	return required.every((code) => evaluation.antiPatterns.some((item) => item.startsWith(`${code}:`)));
}

/** Evaluate every entry in a golden suite against provided runs keyed by entry id. */
export function evaluateGoldenSuite(
	suite: GoldenTrajectorySuite,
	runsByEntryId: Record<string, TrajectoryRun>,
): { ok: boolean; results: Array<{ entryId: string; evaluation: TrajectoryEvaluation; matched: boolean }> } {
	if (!suite || suite.version !== 1 || !Array.isArray(suite.entries)) {
		return {
			ok: false,
			results: [
				{
					entryId: "suite",
					matched: false,
					evaluation: invalidEvaluation("suite", "Unsupported or invalid golden suite"),
				},
			],
		};
	}
	const ids = new Set<string>();
	const paths = new Set<string>();
	const results: Array<{ entryId: string; evaluation: TrajectoryEvaluation; matched: boolean }> = [];
	for (const entry of suite.entries) {
		if (ids.has(entry.id) || paths.has(entry.runPath)) {
			results.push({
				entryId: entry.id,
				matched: false,
				evaluation: invalidEvaluation(entry.id, "Duplicate golden entry id or run path"),
			});
			continue;
		}
		ids.add(entry.id);
		paths.add(entry.runPath);
		const run = runsByEntryId[entry.id];
		if (!run) {
			results.push({
				entryId: entry.id,
				matched: false,
				evaluation: {
					runId: "missing",
					ok: false,
					status: "unavailable",
					results: [
						{
							id: "missing-run",
							ok: false,
							summary: `No run provided for golden entry ${entry.id}`,
						},
					],
					metrics: emptyMetrics(),
					antiPatterns: [],
				},
			});
			continue;
		}
		const evaluation = evaluateTrajectory(run, entry.assertions);
		results.push({
			entryId: entry.id,
			evaluation,
			matched: entryMatchesExpectation(entry, evaluation),
		});
	}
	return {
		ok: results.every((r) => r.matched),
		results,
	};
}

export { formatAntiPatternHits };

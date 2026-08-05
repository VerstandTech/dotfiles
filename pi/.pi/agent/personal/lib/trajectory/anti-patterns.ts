/**
 * Deterministic anti-pattern detectors for multi-agent trajectories.
 * These are process oracles — green tests via an unsafe path still fail here.
 */

import type { TrajectoryEvent, TrajectoryRun } from "./types.ts";

export interface AntiPatternHit {
	code: string;
	severity: "error" | "warning";
	message: string;
	seq?: number;
}

/** Known process anti-patterns from the high-assurance playbook. */
export const ANTI_PATTERN_CODES = [
	"FALSE_COMPLETION",
	"TEST_AND_IMPL_SAME_AGENT",
	"UNBOUNDED_LOOP",
	"MISSING_RED_BEFORE_GREEN",
	"BYPASS_WITHOUT_REASON",
	"SUCCESS_AFTER_FAILED_GATE",
	"IMPL_BEFORE_TESTS",
	"EMPTY_HANDOFF",
	"SECRET_IN_PREVIEW",
] as const;

export type AntiPatternCode = (typeof ANTI_PATTERN_CODES)[number];

function toolName(e: TrajectoryEvent): string | undefined {
	return e.tool ?? (typeof e.data?.tool === "string" ? e.data.tool : undefined);
}

function isToolCall(e: TrajectoryEvent): boolean {
	return e.kind === "tool_call";
}

/**
 * Scan a run for process anti-patterns. Pure / deterministic.
 */
export function detectTrajectoryAntiPatterns(run: TrajectoryRun): AntiPatternHit[] {
	const hits: AntiPatternHit[] = [];
	const events = run.events ?? [];

	// FALSE_COMPLETION: outcome success but a required gate failed later or after claim
	const gateFails = events.filter(
		(e) =>
			e.kind === "gate_result" &&
			(e.data?.status === "failed" || e.data?.ok === false || e.preview?.includes("FAIL")),
	);
	if (run.outcome === "success" && gateFails.length > 0) {
		const lastGateFail = gateFails[gateFails.length - 1]!;
		hits.push({
			code: "SUCCESS_AFTER_FAILED_GATE",
			severity: "error",
			message: "Run marked success but contains a failed gate result",
			seq: lastGateFail.seq,
		});
	}

	// Claim done / handoff while gate failures exist after last success claim
	for (const e of events) {
		const claimsDone =
			e.kind === "handoff" ||
			(e.kind === "decision" &&
				typeof e.preview === "string" &&
				/\b(done|complete|ship|merge)\b/i.test(e.preview));
		if (!claimsDone) continue;
		const priorFail = gateFails.find((g) => g.seq <= e.seq);
		const laterFail = gateFails.find((g) => g.seq > e.seq);
		if (priorFail && !events.some((x) => x.kind === "gate_result" && x.seq > priorFail.seq && x.data?.status === "passed")) {
			// soft: only if no recovery pass after
		}
		if (laterFail) {
			hits.push({
				code: "FALSE_COMPLETION",
				severity: "error",
				message: "Completion/handoff claimed before a subsequent gate failure was resolved",
				seq: e.seq,
			});
		}
	}

	// Same agent both designing tests and implementing (weak signal via tools)
	const byAgent = new Map<string, Set<string>>();
	for (const e of events) {
		if (!e.agent || !isToolCall(e)) continue;
		const tool = toolName(e) ?? "";
		const set = byAgent.get(e.agent) ?? new Set();
		set.add(tool);
		byAgent.set(e.agent, set);
	}
	for (const [agent, tools] of byAgent) {
		const writesTests =
			[...tools].some((t) => /test|bdd_assert_red|write/.test(t)) &&
			events.some(
				(e) =>
					e.agent === agent &&
					e.kind === "tool_call" &&
					typeof e.preview === "string" &&
					/\.(test|spec)\.|feature/i.test(e.preview),
			);
		const writesImpl =
			events.some(
				(e) =>
					e.agent === agent &&
					e.kind === "tool_call" &&
					typeof e.preview === "string" &&
					/\/(src|app|lib)\//i.test(e.preview) &&
					!/\.(test|spec)\./i.test(e.preview),
			);
		if (writesTests && writesImpl) {
			hits.push({
				code: "TEST_AND_IMPL_SAME_AGENT",
				severity: "error",
				message: `Agent ${agent} appears to write both tests and production code in one trajectory`,
			});
		}
	}

	// Unbounded loop: too many consecutive identical tool calls
	let streak = 1;
	for (let i = 1; i < events.length; i++) {
		const prev = events[i - 1]!;
		const cur = events[i]!;
		if (
			isToolCall(prev) &&
			isToolCall(cur) &&
			toolName(prev) === toolName(cur) &&
			prev.preview === cur.preview
		) {
			streak++;
			if (streak >= 8) {
				hits.push({
					code: "UNBOUNDED_LOOP",
					severity: "warning",
					message: `Repeated identical tool call ${toolName(cur)} ×${streak}`,
					seq: cur.seq,
				});
				break;
			}
		} else {
			streak = 1;
		}
	}

	// Missing red before green (phase_change signals)
	const phases = events.filter((e) => e.kind === "phase_change");
	const phaseNames = phases.map((e) => String(e.data?.phase ?? e.preview ?? ""));
	const greenIdx = phaseNames.findIndex((p) => p === "green");
	const redIdx = phaseNames.findIndex((p) => p === "red");
	if (greenIdx >= 0 && (redIdx < 0 || redIdx > greenIdx)) {
		hits.push({
			code: "MISSING_RED_BEFORE_GREEN",
			severity: "error",
			message: "Green phase entered without a prior red phase in the trajectory",
			seq: phases[greenIdx]?.seq,
		});
	}

	// Bypass without reason
	for (const e of events) {
		if (e.kind !== "decision" && e.kind !== "tool_call") continue;
		const text = `${e.tool ?? ""} ${e.preview ?? ""} ${JSON.stringify(e.data ?? {})}`;
		if (/\bbypass\b/i.test(text) && !/\breason\b/i.test(text)) {
			hits.push({
				code: "BYPASS_WITHOUT_REASON",
				severity: "warning",
				message: "Bypass observed without an explicit reason field",
				seq: e.seq,
			});
		}
	}

	// Impl-looking writes before any test write
	let sawTestWrite = false;
	let sawImplWrite = false;
	for (const e of events) {
		if (!isToolCall(e)) continue;
		const preview = e.preview ?? "";
		if (/\.(test|spec)\.|features\/.+\.feature/i.test(preview)) sawTestWrite = true;
		if (/\/(src|app)\//i.test(preview) && !/\.(test|spec)\./i.test(preview)) {
			if (!sawTestWrite && !sawImplWrite) {
				hits.push({
					code: "IMPL_BEFORE_TESTS",
					severity: "warning",
					message: "Production path edit before any test/feature write in trajectory",
					seq: e.seq,
				});
			}
			sawImplWrite = true;
		}
	}

	// Empty handoff
	for (const e of events) {
		if (e.kind !== "handoff") continue;
		const body = String(e.data?.body ?? e.preview ?? "").trim();
		if (body.length < 40) {
			hits.push({
				code: "EMPTY_HANDOFF",
				severity: "warning",
				message: "Handoff event has empty or very short body",
				seq: e.seq,
			});
		}
	}

	// Secret-shaped previews (heuristic)
	const secretRe =
		/(api[_-]?key|secret|password|token)\s*[:=]\s*['\"]?[A-Za-z0-9_\-]{16,}/i;
	for (const e of events) {
		const blob = `${e.preview ?? ""} ${JSON.stringify(e.data ?? {})}`;
		if (secretRe.test(blob)) {
			hits.push({
				code: "SECRET_IN_PREVIEW",
				severity: "error",
				message: "Trajectory event appears to contain a secret-like value",
				seq: e.seq,
			});
		}
	}

	return hits;
}

export function formatAntiPatternHits(hits: AntiPatternHit[]): string {
	if (!hits.length) return "No trajectory anti-patterns detected.";
	return hits
		.map((h) => `- [${h.severity}] **${h.code}**${h.seq != null ? ` @${h.seq}` : ""} — ${h.message}`)
		.join("\n");
}

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
	"INVALID_TRAJECTORY",
] as const;

export type AntiPatternCode = (typeof ANTI_PATTERN_CODES)[number];

function toolName(e: TrajectoryEvent): string | undefined {
	return e.tool ?? (typeof e.data?.tool === "string" ? e.data.tool : undefined);
}

function isToolCall(e: TrajectoryEvent): boolean {
	return e.kind === "tool_call";
}

function isFailedGate(e: TrajectoryEvent): boolean {
	if (e.kind !== "gate_result") return false;
	return e.data?.status === "failed" || e.data?.ok === false || (typeof e.preview === "string" && e.preview.includes("FAIL"));
}

function isPassedGate(e: TrajectoryEvent): boolean {
	if (e.kind !== "gate_result") return false;
	return e.data?.status === "passed" || e.data?.ok === true;
}

function gateIdOf(e: TrajectoryEvent): string {
	const id = e.data?.gateId;
	return typeof id === "string" && id.length > 0 ? id : "__anonymous__";
}

function isRequiredGate(e: TrajectoryEvent): boolean {
	return e.data?.required === true || e.data?.required === undefined;
}

/** Required gate failures that are not later resolved by the same gate id. */
function unresolvedRequiredGateFails(events: TrajectoryEvent[]): TrajectoryEvent[] {
	const fails = events.filter((e) => isFailedGate(e) && isRequiredGate(e));
	return fails.filter((fail) => {
		const id = gateIdOf(fail);
		return !events.some((e) => e.seq > fail.seq && isPassedGate(e) && gateIdOf(e) === id);
	});
}

function pathClass(e: TrajectoryEvent): "test" | "production" | undefined {
	const value = e.data?.pathClass;
	if (value === "test" || value === "production") return value;
	const preview = e.preview ?? "";
	if (/\.(test|spec)\.|features\/.+\.feature|\.feature$/i.test(preview)) return "test";
	if (/\/(src|app|lib)\//i.test(preview) && !/\.(test|spec)\./i.test(preview)) return "production";
	return undefined;
}

function stripRedactionMarkers(value: string): string {
	return value
		.replaceAll("[REDACTED:encoded]", "")
		.replaceAll("[REDACTED:path]", "")
		.replaceAll(/\[REDACTED_KEY_\d+\]/g, "")
		.replaceAll("[REDACTED]", "");
}

/**
 * Scan a run for process anti-patterns. Pure / deterministic.
 */
export function detectTrajectoryAntiPatterns(run: TrajectoryRun): AntiPatternHit[] {
	const hits: AntiPatternHit[] = [];
	const events = run.events ?? [];
	const unresolvedFails = unresolvedRequiredGateFails(events);
	const allFails = events.filter(isFailedGate);

	if (run.outcome === "success" && unresolvedFails.length > 0) {
		const last = unresolvedFails[unresolvedFails.length - 1]!;
		hits.push({
			code: "SUCCESS_AFTER_FAILED_GATE",
			severity: "error",
			message: "Run marked success but contains an unresolved required gate failure",
			seq: last.seq,
		});
	}

	for (const e of events) {
		const claimsDone =
			e.kind === "handoff" ||
			(e.kind === "decision" &&
				typeof e.preview === "string" &&
				/\b(done|complete|ship|merge)\b/i.test(e.preview));
		if (!claimsDone) continue;
		const laterFail = allFails.find((g) => g.seq > e.seq);
		if (laterFail) {
			hits.push({
				code: "FALSE_COMPLETION",
				severity: "error",
				message: "Completion/handoff claimed before a subsequent gate failure was resolved",
				seq: e.seq,
			});
		}
	}

	const byAgent = new Map<string, { test: boolean; production: boolean }>();
	for (const e of events) {
		if (!e.agent || !isToolCall(e)) continue;
		const klass = pathClass(e);
		if (!klass) continue;
		const set = byAgent.get(e.agent) ?? { test: false, production: false };
		set[klass] = true;
		byAgent.set(e.agent, set);
	}
	for (const [agent, classes] of byAgent) {
		if (classes.test && classes.production) {
			hits.push({
				code: "TEST_AND_IMPL_SAME_AGENT",
				severity: "error",
				message: `Agent ${agent} appears to write both tests and production code in one trajectory`,
			});
		}
	}

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

	let sawTestWrite = false;
	let sawImplWrite = false;
	for (const e of events) {
		if (!isToolCall(e)) continue;
		const klass = pathClass(e);
		if (klass === "test") sawTestWrite = true;
		if (klass === "production") {
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

	const secretRe =
		/(api[_-]?key|secret|password|token)\s*[:=]\s*['"]?[A-Za-z0-9_-]{16,}/i;
	for (const e of events) {
		const blob = stripRedactionMarkers(`${e.preview ?? ""} ${JSON.stringify(e.data ?? {})}`);
		if (secretRe.test(blob)) {
			hits.push({
				code: "SECRET_IN_PREVIEW",
				severity: "error",
				message: "Trajectory event appears to contain a secret-like value",
				seq: e.seq,
			});
		}
	}

	hits.sort((a, b) => {
		const sa = a.seq ?? Number.MAX_SAFE_INTEGER;
		const sb = b.seq ?? Number.MAX_SAFE_INTEGER;
		if (sa !== sb) return sa - sb;
		return a.code.localeCompare(b.code);
	});
	return hits;
}

export function formatAntiPatternHits(hits: AntiPatternHit[]): string {
	if (!hits.length) return "No trajectory anti-patterns detected.";
	return hits
		.map((h) => `- [${h.severity}] **${h.code}**${h.seq != null ? ` @${h.seq}` : ""} — ${h.message}`)
		.join("\n");
}

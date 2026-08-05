import { describe, expect, test } from "bun:test";
import { detectTrajectoryAntiPatterns } from "./anti-patterns.ts";
import {
	computeTrajectoryMetrics,
	evaluateGoldenSuite,
	evaluateTrajectory,
} from "./evaluate.ts";
import type { GoldenTrajectorySuite, TrajectoryRun } from "./types.ts";

function run(partial: Partial<TrajectoryRun> & Pick<TrajectoryRun, "runId" | "events">): TrajectoryRun {
	return {
		version: 1,
		taskId: "t",
		goal: "g",
		startedAt: "2026-08-01T00:00:00.000Z",
		...partial,
	};
}

describe("computeTrajectoryMetrics", () => {
	test("counts tool calls and gate failures", () => {
		const m = computeTrajectoryMetrics(
			run({
				runId: "r1",
				events: [
					{ seq: 1, at: "t", kind: "tool_call", tool: "read" },
					{ seq: 2, at: "t", kind: "gate_result", data: { status: "failed" } },
					{ seq: 3, at: "t", kind: "error" },
				],
			}),
		);
		expect(m.toolCalls).toBe(1);
		expect(m.gateFailures).toBe(1);
		expect(m.errors).toBe(1);
	});
});

describe("evaluateTrajectory", () => {
	test("required tools subset in order", () => {
		const ev = evaluateTrajectory(
			run({
				runId: "r2",
				events: [
					{ seq: 1, at: "t", kind: "tool_call", tool: "read" },
					{ seq: 2, at: "t", kind: "tool_call", tool: "bdd_assert_red" },
					{ seq: 3, at: "t", kind: "tool_call", tool: "edit" },
					{ seq: 4, at: "t", kind: "tool_call", tool: "bdd_assert_green" },
				],
			}),
			[
				{
					id: "red-green",
					description: "red then green",
					requiredTools: ["bdd_assert_red", "bdd_assert_green"],
					matchMode: "subset",
				},
			],
		);
		expect(ev.ok).toBe(true);
	});

	test("forbidden tool fails", () => {
		const ev = evaluateTrajectory(
			run({
				runId: "r3",
				events: [{ seq: 1, at: "t", kind: "tool_call", tool: "bash" }],
			}),
			[
				{
					id: "no-bash",
					description: "no bash",
					forbiddenTools: ["bash"],
				},
			],
		);
		expect(ev.ok).toBe(false);
	});

	test("success after failed gate is anti-pattern error", () => {
		const r = run({
			runId: "r4",
			outcome: "success",
			events: [
				{ seq: 1, at: "t", kind: "gate_result", data: { status: "failed" } },
			],
		});
		const hits = detectTrajectoryAntiPatterns(r);
		expect(hits.some((h) => h.code === "SUCCESS_AFTER_FAILED_GATE")).toBe(true);
		const ev = evaluateTrajectory(r, []);
		expect(ev.ok).toBe(false);
	});

	test("missing red before green", () => {
		const hits = detectTrajectoryAntiPatterns(
			run({
				runId: "r5",
				events: [
					{ seq: 1, at: "t", kind: "phase_change", data: { phase: "green" } },
				],
			}),
		);
		expect(hits.some((h) => h.code === "MISSING_RED_BEFORE_GREEN")).toBe(true);
	});
});

describe("evaluateGoldenSuite", () => {
	test("missing run fails entry", () => {
		const suite: GoldenTrajectorySuite = {
			version: 1,
			name: "smoke",
			entries: [
				{
					id: "happy-red-green",
					description: "basic",
					runPath: "fixtures/missing.json",
					assertions: [],
				},
			],
		};
		const result = evaluateGoldenSuite(suite, {});
		expect(result.ok).toBe(false);
	});

	test("passes when run satisfies assertions", () => {
		const suite: GoldenTrajectorySuite = {
			version: 1,
			name: "smoke",
			entries: [
				{
					id: "happy-red-green",
					description: "basic",
					runPath: "fixtures/happy.json",
					assertions: [
						{
							id: "has-red",
							description: "red assert",
							requiredTools: ["bdd_assert_red"],
						},
					],
				},
			],
		};
		const runs = {
			"happy-red-green": run({
				runId: "golden-1",
				events: [{ seq: 1, at: "t", kind: "tool_call", tool: "bdd_assert_red" }],
			}),
		};
		expect(evaluateGoldenSuite(suite, runs).ok).toBe(true);
	});
});

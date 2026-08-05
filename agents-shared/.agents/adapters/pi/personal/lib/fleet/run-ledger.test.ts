import { describe, expect, test } from "bun:test";
import type { FleetPlan } from "./plan.ts";
import {
	buildFleetRunRecord,
	collectFleetRunsFromBranch,
	extractRunIdentity,
	fleetHandoffGaps,
	FLEET_RUN_RECORD_TYPE,
	mergeEvidenceFleetRuns,
	mergeFleetRuns,
	writePlanManifest,
} from "./run-ledger.ts";

describe("extractRunIdentity", () => {
	test("reads details.runId and asyncDir", () => {
		const id = extractRunIdentity({
			text: "launched",
			details: {
				runId: "abc-123",
				asyncDir: "/tmp/async/abc-123",
				asyncId: "abc-123",
			},
		});
		expect(id).toEqual({
			runId: "abc-123",
			asyncDir: "/tmp/async/abc-123",
			asyncId: "abc-123",
		});
	});

	test("parses bracket uuid from text", () => {
		const id = extractRunIdentity({
			text: "Async parallel: [fleet-reviewer] [8e0a712f-bc3a-44fb-9fe7-d538783d4e0d]",
		});
		expect(id?.runId).toBe("8e0a712f-bc3a-44fb-9fe7-d538783d4e0d");
	});

	test("returns undefined when missing", () => {
		expect(extractRunIdentity({ text: "no id here" })).toBeUndefined();
	});
});

describe("mergeFleetRuns / branch collect", () => {
	test("merges by runId", () => {
		const a = buildFleetRunRecord({
			identity: { runId: "r1" },
			kind: "review",
			expectedCount: 3,
			at: "t1",
		});
		const b = { ...a, synthesisPath: "syn.md", at: "t2" };
		const merged = mergeFleetRuns([a], b);
		expect(merged).toHaveLength(1);
		expect(merged[0]!.synthesisPath).toBe("syn.md");
	});

	test("collectFleetRunsFromBranch", () => {
		const branch = [
			{
				type: "custom",
				customType: FLEET_RUN_RECORD_TYPE,
				data: { runId: "x", kind: "review", expectedCount: 2, at: "t" },
			},
		];
		expect(collectFleetRunsFromBranch(branch)[0]!.runId).toBe("x");
	});

	test("mergeEvidenceFleetRuns prefers evidence synthesis", () => {
		const branch = [
			buildFleetRunRecord({ identity: { runId: "r1" }, kind: "review", expectedCount: 1 }),
		];
		const evidence = [{ ...branch[0]!, synthesisPath: "/syn.md" }];
		const m = mergeEvidenceFleetRuns(evidence, branch);
		expect(m[0]!.synthesisPath).toBe("/syn.md");
	});
});

describe("writePlanManifest", () => {
	test("writes plan.json under run dir", () => {
		const files: Record<string, string> = {};
		const dirs: string[] = [];
		const plan = {
			kind: "review",
			topic: "t",
			count: 2,
			concurrency: 2,
			context: "fresh",
			async: true,
			tasks: [
				{
					agent: "fleet-reviewer",
					task: "x",
					label: "L",
					personaId: "p",
					model: "xai/grok-4.5",
					output: "out.md",
				},
			],
			subagentParams: { tasks: [], concurrency: 2, context: "fresh" as const, async: true as const },
			warnings: [],
		} satisfies FleetPlan;

		const { planPath, dir } = writePlanManifest(
			"/proj",
			"run-1",
			plan,
			{ runId: "run-1", asyncDir: "/tmp/a" },
			{
				mkdir: (p) => {
					dirs.push(p);
				},
				write: (p, b) => {
					files[p] = b;
				},
			},
		);
		expect(dir).toBe("/proj/.pi/fleet-runs/run-1");
		expect(planPath).toBe("/proj/.pi/fleet-runs/run-1/plan.json");
		const body = JSON.parse(files[planPath]!);
		expect(body.runId).toBe("run-1");
		expect(body.kind).toBe("review");
		expect(body.tasks).toHaveLength(1);
	});
});

describe("fleetHandoffGaps", () => {
	test("review without synthesis is gap", () => {
		const gaps = fleetHandoffGaps([
			buildFleetRunRecord({ identity: { runId: "r1" }, kind: "review", expectedCount: 3 }),
		]);
		expect(gaps.some((g) => /synthesis/.test(g))).toBe(true);
	});

	test("research without synthesis ok", () => {
		expect(
			fleetHandoffGaps([
				buildFleetRunRecord({ identity: { runId: "r1" }, kind: "research", expectedCount: 2 }),
			]),
		).toEqual([]);
	});

	test("review with synthesisPath ok", () => {
		const r = buildFleetRunRecord({
			identity: { runId: "r1" },
			kind: "review",
			expectedCount: 1,
		});
		r.synthesisPath = ".pi/fleet-runs/r1/synthesis.md";
		expect(fleetHandoffGaps([r])).toEqual([]);
	});
});

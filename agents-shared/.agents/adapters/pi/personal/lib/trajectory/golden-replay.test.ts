import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { evaluateGoldenSuite, evaluateTrajectory } from "./evaluate.ts";
import type { GoldenTrajectorySuite, TrajectoryRun } from "./types.ts";

const fixtureRoot = fileURLToPath(new URL("./fixtures/", import.meta.url));
const suitePath = fileURLToPath(new URL("./golden-suite.v1.json", import.meta.url));

function readJson<T>(path: string): T {
	return JSON.parse(readFileSync(path, "utf8")) as T;
}

function loadFixtureSet(): { suite: GoldenTrajectorySuite; runs: Record<string, TrajectoryRun> } {
	if (!existsSync(suitePath)) throw new Error("OBS01_GOLDEN_FIXTURES_MISSING");
	const suite = readJson<GoldenTrajectorySuite>(suitePath);
	const runs: Record<string, TrajectoryRun> = {};
	for (const entry of suite.entries) {
		const path = `${fixtureRoot}${entry.runPath.split("/").at(-1)}`;
		if (!existsSync(path)) throw new Error("OBS01_GOLDEN_FIXTURES_MISSING");
		runs[entry.id] = readJson<TrajectoryRun>(path);
	}
	return { suite, runs };
}

describe("OBS-01 committed golden replay", () => {
	test("replaces the weak stub with one accepted and five rejected exact fixtures", () => {
		const { suite } = loadFixtureSet();
		expect(suite.version).toBe(1);
		expect(suite.name).toBe("pi-high-assurance-trajectory-v1");
		expect(suite.entries.map((entry) => entry.id)).toEqual([
			"happy-red-green",
			"missing-red-before-green",
			"false-completion",
			"test-and-impl-same-agent",
			"success-after-failed-gate",
			"secret-in-preview",
		]);
	});

	test("suite passes only when positive and negative expected verdicts match", () => {
		const { suite, runs } = loadFixtureSet();
		const result = evaluateGoldenSuite(suite, runs);
		expect(result.ok).toBe(true);
		expect(result.results).toHaveLength(6);
	});

	test("each negative fixture fails for its locked anti-pattern code", () => {
		const { suite, runs } = loadFixtureSet();
		for (const entry of suite.entries) {
			const expectedOk = (entry as any).expectedOk ?? true;
			const required = (entry as any).requiredAntiPatterns ?? [];
			const evaluation = evaluateTrajectory(runs[entry.id]!, entry.assertions);
			expect(evaluation.ok).toBe(expectedOk);
			for (const code of required) {
				expect(evaluation.antiPatterns.some((item) => item.startsWith(`${code}:`))).toBe(true);
			}
		}
	});

	test("a negative fixture rejected for the wrong reason does not satisfy its entry", () => {
		const { suite, runs } = loadFixtureSet();
		const changed = structuredClone(runs);
		changed["false-completion"] = { ...changed["false-completion"]!, events: [] };
		const result = evaluateGoldenSuite(suite, changed);
		expect(result.ok).toBe(false);
	});

	test("rejects non-contiguous replay sequence before anti-pattern evaluation", () => {
		const { runs } = loadFixtureSet();
		const changed = structuredClone(runs["happy-red-green"]!);
		changed.events[1]!.seq = 3;
		const evaluation = evaluateTrajectory(changed, []);
		expect(evaluation.ok).toBe(false);
		expect((evaluation as any).status).toBe("invalid");
		expect(evaluation.antiPatterns.some((item) => item.startsWith("INVALID_TRAJECTORY:"))).toBe(true);
	});

	test("same-gate recovery resolves failure while different-gate pass does not", () => {
		const base: TrajectoryRun = {
			version: 1,
			runId: "77777777-7777-4777-8777-777777777777",
			taskId: "gate-recovery",
			goal: "structured gate recovery",
			startedAt: "2026-08-11T21:10:00.000Z",
			outcome: "success",
			events: [
				{ seq: 1, at: "2026-08-11T21:10:01.000Z", kind: "gate_result", data: { gateId: "security", required: true, status: "failed" } },
				{ seq: 2, at: "2026-08-11T21:10:02.000Z", kind: "gate_result", data: { gateId: "unit", required: true, status: "passed" } },
			],
		};
		expect(evaluateTrajectory(base, []).antiPatterns.some((item) => item.startsWith("SUCCESS_AFTER_FAILED_GATE:"))).toBe(true);
		base.events.push({ seq: 3, at: "2026-08-11T21:10:03.000Z", kind: "gate_result", data: { gateId: "security", required: true, status: "passed" } });
		expect(evaluateTrajectory(base, []).antiPatterns.some((item) => item.startsWith("SUCCESS_AFTER_FAILED_GATE:"))).toBe(false);
	});

	test("redaction markers do not trigger the legacy secret oracle", () => {
		const run: TrajectoryRun = {
			version: 1,
			runId: "88888888-8888-4888-8888-888888888888",
			taskId: "redaction-marker",
			goal: "safe markers",
			startedAt: "2026-08-11T21:11:00.000Z",
			events: [{ seq: 1, at: "2026-08-11T21:11:01.000Z", kind: "error", preview: "token=[REDACTED] path=[REDACTED:path]" }],
		};
		expect(evaluateTrajectory(run, []).antiPatterns.some((item) => item.startsWith("SECRET_IN_PREVIEW:"))).toBe(false);
	});
});

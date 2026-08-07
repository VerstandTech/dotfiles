import { describe, expect, test } from "bun:test";
import {
	buildContinueMessage,
	buildKickoffMessage,
	buildStatusReport,
	buildTranscript,
	createActiveGoal,
	decideGoalSettle,
	footerStatusText,
	formatDuration,
	isClearArg,
	loadLatestGoalState,
	markAchieved,
	markCleared,
	parseEvaluationResponse,
	parseStopAfterTurns,
	pickEvaluatorModel,
	resolveMaxTurns,
	restoreActiveGoalOnResume,
	GOAL_STATE_TYPE,
} from "./goal.ts";

describe("isClearArg", () => {
	test("accepts clear aliases", () => {
		for (const a of ["clear", "STOP", " off ", "reset", "none", "cancel"]) {
			expect(isClearArg(a)).toBe(true);
		}
	});
	test("rejects conditions", () => {
		expect(isClearArg("all tests pass")).toBe(false);
		expect(isClearArg("clear the cache")).toBe(false);
	});
});

describe("parseStopAfterTurns / resolveMaxTurns", () => {
	test("parses stop after N turns", () => {
		expect(parseStopAfterTurns("ship it or stop after 20 turns")).toBe(20);
		expect(parseStopAfterTurns("halt after 5 turn")).toBe(5);
	});
	test("resolve prefers condition over env", () => {
		expect(resolveMaxTurns("done or stop after 3 turns", "99")).toBe(3);
		expect(resolveMaxTurns("just finish", "12")).toBe(12);
		expect(resolveMaxTurns("just finish")).toBe(40);
	});
});

describe("parseEvaluationResponse", () => {
	test("parses YES", () => {
		const r = parseEvaluationResponse("VERDICT: YES\nREASON: npm test exited 0");
		expect(r.met).toBe(true);
		expect(r.reason).toContain("npm test");
	});
	test("parses NO", () => {
		const r = parseEvaluationResponse("VERDICT: NO\nREASON: still failing");
		expect(r.met).toBe(false);
		expect(r.reason).toBe("still failing");
	});
	test("fail-closed on garbage", () => {
		const r = parseEvaluationResponse("maybe later");
		expect(r.met).toBe(false);
		expect(r.reason).toMatch(/Unparseable|treating as NO/i);
	});
	test("leading YES fallback", () => {
		expect(parseEvaluationResponse("YES — tests green").met).toBe(true);
	});
});

describe("pickEvaluatorModel", () => {
	const models = [
		{ provider: "xai", id: "grok-4.5" },
		{ provider: "xai", id: "grok-4-1-fast-reasoning" },
		{ provider: "anthropic", id: "claude-haiku-4-5" },
		{ provider: "openai", id: "gpt-4o" },
	];

	test("prefers haiku", () => {
		const m = pickEvaluatorModel(models);
		expect(m).toEqual({ provider: "anthropic", id: "claude-haiku-4-5" });
	});

	test("honors preferred provider/id", () => {
		const m = pickEvaluatorModel(models, {
			preferred: "xai/grok-4-1-fast-reasoning",
		});
		expect(m?.id).toBe("grok-4-1-fast-reasoning");
	});

	test("respects hasAuth filter", () => {
		const m = pickEvaluatorModel(models, {
			hasAuth: (ref) => ref.provider === "xai",
		});
		expect(m?.provider).toBe("xai");
		expect(m?.id).toContain("fast");
	});
});

describe("buildTranscript", () => {
	test("includes user/assistant/tool results", () => {
		const t = buildTranscript([
			{
				type: "message",
				message: {
					role: "user",
					content: [{ type: "text", text: "fix it" }],
				},
			},
			{
				type: "message",
				message: {
					role: "assistant",
					content: [
						{ type: "text", text: "running tests" },
						{ type: "toolCall", name: "bash" },
					],
				},
			},
			{
				type: "message",
				message: {
					role: "toolResult",
					content: [{ type: "text", text: "exit 0" }],
				},
			},
		]);
		expect(t).toContain("USER:");
		expect(t).toContain("fix it");
		expect(t).toContain("ASSISTANT:");
		expect(t).toContain("[toolCall bash]");
		expect(t).toContain("TOOL_RESULT:");
		expect(t).toContain("exit 0");
	});

	test("prefers tail when over budget", () => {
		const entries = Array.from({ length: 20 }, (_, i) => ({
			type: "message" as const,
			message: {
				role: "user" as const,
				content: [{ type: "text" as const, text: `msg-${i}-${"x".repeat(200)}` }],
			},
		}));
		const t = buildTranscript(entries, 800);
		expect(t).toContain("transcript truncated");
		expect(t).toContain("msg-19");
		expect(t).not.toContain("msg-0-");
	});
});

describe("decideGoalSettle", () => {
	const base = createActiveGoal("done", { maxTurns: 3, now: 1 });

	test("pre-max stops", () => {
		const g = { ...base, turnsEvaluated: 3 };
		const d = decideGoalSettle(g, { kind: "pre-max" });
		expect(d.action).toBe("stop-max");
	});

	test("unavailable / error fail-closed stop", () => {
		expect(
			decideGoalSettle(base, { kind: "unavailable", reason: "no model" }).action,
		).toBe("stop-eval-failed");
		expect(
			decideGoalSettle(base, { kind: "error", reason: "timeout" }).action,
		).toBe("stop-eval-failed");
	});

	test("verdict yes achieves", () => {
		const d = decideGoalSettle(base, {
			kind: "verdict",
			met: true,
			reason: "ok",
			tokens: 10,
			evaluatorModel: "xai/fast",
		});
		expect(d.action).toBe("achieved");
		if (d.action === "achieved") expect(d.state.status).toBe("achieved");
	});

	test("verdict no continues until max", () => {
		const d = decideGoalSettle(base, {
			kind: "verdict",
			met: false,
			reason: "wip",
			tokens: 1,
			evaluatorModel: "xai/fast",
		});
		expect(d.action).toBe("continue");
		if (d.action === "continue") expect(d.state.turnsEvaluated).toBe(1);

		const near = { ...base, turnsEvaluated: 2 };
		const stop = decideGoalSettle(near, {
			kind: "verdict",
			met: false,
			reason: "still",
			tokens: 1,
			evaluatorModel: "xai/fast",
		});
		expect(stop.action).toBe("stop-max");
	});
});

describe("goal state lifecycle", () => {
	test("create / achieve / clear / resume", () => {
		const g = createActiveGoal("all tests pass", { now: 1000, maxTurns: 10 });
		expect(g.status).toBe("active");
		expect(footerStatusText(g, 1000 + 65_000)).toContain("1m");

		const achieved = markAchieved(g, "tests green", 2000);
		expect(achieved.status).toBe("achieved");
		expect(footerStatusText(achieved)).toBeUndefined();

		const cleared = markCleared(g, 3000);
		expect(cleared.status).toBe("cleared");

		const restored = restoreActiveGoalOnResume(
			{ ...g, turnsEvaluated: 5, lastReason: "old" },
			{ now: 9000 },
		);
		expect(restored.turnsEvaluated).toBe(0);
		expect(restored.startedAt).toBe(9000);
		expect(restored.condition).toBe("all tests pass");
	});

	test("loadLatestGoalState from entries", () => {
		const entries = [
			{
				type: "custom",
				customType: GOAL_STATE_TYPE,
				data: createActiveGoal("v1", { now: 1 }),
			},
			{
				type: "custom",
				customType: GOAL_STATE_TYPE,
				data: markAchieved(createActiveGoal("v2", { now: 2 }), "done", 3),
			},
		];
		const latest = loadLatestGoalState(entries);
		expect(latest?.condition).toBe("v2");
		expect(latest?.status).toBe("achieved");
	});
});

describe("messages and status", () => {
	test("kickoff and continue mention condition", () => {
		expect(buildKickoffMessage("lint clean")).toContain("lint clean");
		expect(buildContinueMessage("lint clean", "still dirty", 2, 10)).toContain(
			"2/10",
		);
	});

	test("status report for active goal", () => {
		const g = createActiveGoal("ship", { now: 0, maxTurns: 8 });
		g.turnsEvaluated = 2;
		g.lastReason = "wip";
		const report = buildStatusReport(g, { now: 5000 });
		expect(report).toContain("Goal active");
		expect(report).toContain("ship");
		expect(report).toContain("wip");
	});

	test("formatDuration", () => {
		expect(formatDuration(500)).toBe("0s");
		expect(formatDuration(1500)).toBe("1s");
		expect(formatDuration(65_000)).toBe("1m 5s");
		expect(formatDuration(3_661_000)).toBe("1h 1m");
	});
});

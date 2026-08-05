import { describe, expect, test } from "bun:test";
import { buildFleetPlan, pickModel, resolveModelPool } from "./plan.ts";

describe("resolveModelPool / pickModel exclusive precedence", () => {
	test("explicit model alone pins all indices", () => {
		const policy = { model: "only-me", explicitOverride: true, pool: ["a", "b"] };
		expect(resolveModelPool("review", policy)).toEqual(["only-me"]);
		expect(pickModel(0, "review", policy)).toBe("only-me");
		expect(pickModel(1, "review", policy)).toBe("only-me");
	});

	test("explicit models[] exclusive rotate", () => {
		const policy = {
			models: ["m1", "m2"],
			explicitOverride: true,
			byKind: { review: "kind-model" },
			pool: ["pool"],
		};
		expect(pickModel(0, "review", policy)).toBe("m1");
		expect(pickModel(1, "review", policy)).toBe("m2");
		expect(pickModel(2, "review", policy)).toBe("m1");
	});

	test("explicit models[] preserves duplicate weights (2+2+6)", () => {
		const models = [
			"claude",
			"claude",
			"gpt",
			"gpt",
			"grok",
			"grok",
			"grok",
			"grok",
			"grok",
			"grok",
		];
		const policy = { models, explicitOverride: true, pool: ["nope"] };
		const assigned = models.map((_, i) => pickModel(i, "review", policy));
		expect(assigned.filter((m) => m === "claude")).toHaveLength(2);
		expect(assigned.filter((m) => m === "gpt")).toHaveLength(2);
		expect(assigned.filter((m) => m === "grok")).toHaveLength(6);
	});

	test("native providers preferred over openrouter when context provided", () => {
		const policy = {
			models: [
				"openrouter/anthropic/claude-fable-5",
				"openrouter/openai/gpt-5.6-sol:high",
				"openrouter/x-ai/grok-4.5",
			],
			explicitOverride: true,
		};
		const ctx = {
			authenticatedProviders: new Set(["anthropic", "openai-codex", "xai", "openrouter"]),
			knownModels: new Set<string>(),
		};
		expect(pickModel(0, "review", policy, { modelResolveContext: ctx })).toBe(
			"anthropic/claude-fable-5",
		);
		expect(pickModel(1, "review", policy, { modelResolveContext: ctx })).toBe(
			"openai-codex/gpt-5.6-sol:high",
		);
		expect(pickModel(2, "review", policy, { modelResolveContext: ctx })).toBe("xai/grok-4.5");
	});

	test("byKind exclusive when no tool override", () => {
		const policy = {
			byKind: { review: "xai/review-only" },
			pool: ["xai/pool-a", "xai/pool-b"],
			defaultModel: "xai/default",
		};
		expect(resolveModelPool("review", policy)).toEqual(["xai/review-only"]);
		expect(pickModel(0, "review", policy)).toBe("xai/review-only");
		expect(pickModel(5, "review", policy)).toBe("xai/review-only");
	});

	test("pool used when kind unset", () => {
		const policy = { pool: ["a", "b"], defaultModel: "d" };
		expect(pickModel(0, "research", policy)).toBe("a");
		expect(pickModel(1, "research", policy)).toBe("b");
	});
});

describe("buildFleetPlan", () => {
	test("builds 10 distinct research tasks with exclusive models", () => {
		const plan = buildFleetPlan({
			kind: "research",
			topic: "Pi subagents fanout",
			count: 10,
			modelPolicy: {
				models: ["xai/grok-4.5", "xai/grok-4-1-fast"],
				explicitOverride: true,
			},
		});
		expect(plan.tasks).toHaveLength(10);
		expect(plan.async).toBe(true);
		expect(plan.subagentParams.async).toBe(true);
		expect(plan.tasks[0]!.model).toBe("xai/grok-4.5");
		expect(plan.tasks[1]!.model).toBe("xai/grok-4-1-fast");
		expect(plan.tasks[0]!.output).toMatch(/^\.pi\/fleet-runs\//);
	});

	test("clamps to maxTasks with warning", () => {
		const plan = buildFleetPlan({
			kind: "review",
			topic: "diff",
			count: 20,
			maxTasks: 5,
		});
		expect(plan.count).toBe(5);
		expect(plan.warnings[0]).toMatch(/clamping/i);
	});

	test("clamps concurrency to maxConcurrency", () => {
		const plan = buildFleetPlan({
			kind: "ux",
			topic: "flow",
			count: 20,
			concurrency: 100,
			maxConcurrency: 8,
			maxTasks: 48,
		});
		expect(plan.concurrency).toBe(8);
		expect(plan.warnings.some((w) => /concurrency/i.test(w))).toBe(true);
	});

	test("forces async true with warning when async false requested", () => {
		const plan = buildFleetPlan({
			kind: "review",
			topic: "x",
			count: 2,
			async: false,
		});
		expect(plan.async).toBe(true);
		expect(plan.subagentParams.async).toBe(true);
		expect(plan.warnings.some((w) => /async/i.test(w))).toBe(true);
	});

	test("invalid concurrency falls back", () => {
		const plan = buildFleetPlan({
			kind: "review",
			topic: "x",
			count: 3,
			concurrency: 0 as unknown as number,
		});
		expect(plan.concurrency).toBeGreaterThanOrEqual(1);
		expect(plan.concurrency).toBeLessThanOrEqual(3);
	});

	test("scope and extra instructions appear", () => {
		const plan = buildFleetPlan({
			kind: "ux",
			topic: "checkout flow",
			count: 2,
			scope: "app/checkout/page.tsx",
			extraInstructions: "Ignore pricing page",
		});
		expect(plan.tasks[0]!.task).toContain("app/checkout/page.tsx");
		expect(plan.tasks[0]!.task).toContain("Ignore pricing page");
		expect(plan.tasks[0]!.agent).toBe("fleet-ux");
	});
});

import { describe, expect, test } from "bun:test";
import {
	DEFAULT_INTERACTIVE_BUDGET,
	evaluateCostBudget,
	mergeCostBudgetPolicy,
} from "./cost-budget.ts";

describe("evaluateCostBudget", () => {
	test("ok when under limits", () => {
		const r = evaluateCostBudget(
			{ maxCostUsd: 5, maxTokens: 1000, maxIterations: 10 },
			{ costUsd: 1, tokens: 100, iterations: 3 },
		);
		expect(r.ok).toBe(true);
		expect(r.status).toBe("ok");
		expect(r.circuitBroken).toBe(false);
	});

	test("warn near limit", () => {
		const r = evaluateCostBudget(
			{ maxTokens: 1000, warnFraction: 0.8 },
			{ tokens: 850 },
		);
		expect(r.ok).toBe(true);
		expect(r.status).toBe("warn");
	});

	test("exceeded breaks circuit", () => {
		const r = evaluateCostBudget(
			{ maxCostUsd: 2, maxIterations: 5 },
			{ costUsd: 3, iterations: 2 },
		);
		expect(r.ok).toBe(false);
		expect(r.circuitBroken).toBe(true);
		expect(r.dimensions.some((d) => d.dimension === "costUsd" && d.status === "exceeded")).toBe(
			true,
		);
	});
});

describe("mergeCostBudgetPolicy", () => {
	test("overlay wins", () => {
		const m = mergeCostBudgetPolicy(DEFAULT_INTERACTIVE_BUDGET, { maxCostUsd: 1 });
		expect(m.maxCostUsd).toBe(1);
		expect(m.maxIterations).toBe(DEFAULT_INTERACTIVE_BUDGET.maxIterations);
	});
});

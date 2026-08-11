import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
	DEFAULT_INTERACTIVE_BUDGET,
	DEFAULT_OVERNIGHT_BUDGET,
	DEFAULT_STRICT_BUDGET,
	evaluateCostBudget,
	formatCostBudgetResult,
	isCostBudgetRefusal,
	mergeCostBudgetPolicy,
	type CostBudgetResult,
} from "./cost-budget.ts";

describe("evaluateCostBudget", () => {
	test("ok when under limits", () => {
		const r = evaluateCostBudget(
			{ maxCostUsd: 5, maxTokens: 1000, maxIterations: 10 },
			{ costUsd: 1, tokens: 100, iterations: 3 },
		);
		expect(isCostBudgetRefusal(r)).toBe(false);
		if (isCostBudgetRefusal(r)) return;
		expect(r.ok).toBe(true);
		expect(r.status).toBe("ok");
		expect(r.circuitBroken).toBe(false);
	});

	test("warn near limit does not break circuit", () => {
		const r = evaluateCostBudget(
			{ maxTokens: 1000, warnFraction: 0.8 },
			{ tokens: 850 },
		);
		expect(isCostBudgetRefusal(r)).toBe(false);
		if (isCostBudgetRefusal(r)) return;
		expect(r.ok).toBe(true);
		expect(r.status).toBe("warn");
		expect(r.circuitBroken).toBe(false);
	});

	test("exceeded breaks circuit", () => {
		const r = evaluateCostBudget(
			{ maxCostUsd: 2, maxIterations: 5 },
			{ costUsd: 3, iterations: 2 },
		);
		expect(isCostBudgetRefusal(r)).toBe(false);
		if (isCostBudgetRefusal(r)) return;
		expect(r.ok).toBe(false);
		expect(r.circuitBroken).toBe(true);
		expect(r.status).toBe("exceeded");
		expect(r.dimensions.some((d) => d.dimension === "costUsd" && d.status === "exceeded")).toBe(
			true,
		);
	});

	test("null-usage-is-unknown: limited dimension with missing used is unknown not ok", () => {
		// Causal RED: legacy treated used==null as ok. Must be unknown.
		const r = evaluateCostBudget({ maxTokens: 100 }, {});
		expect(isCostBudgetRefusal(r)).toBe(false);
		if (isCostBudgetRefusal(r)) return;
		const tokens = r.dimensions.find((d) => d.dimension === "tokens");
		expect(tokens?.status).toBe("unknown");
		expect(r.status).toBe("unknown");
		// Hard-exceed free: unknown alone does not set circuitBroken
		expect(r.circuitBroken).toBe(false);
		// Overall is not status "ok"
		expect(r.status).not.toBe("ok");
	});

	test("used null and used undefined both yield unknown", () => {
		const a = evaluateCostBudget({ maxTokens: 10 }, { tokens: undefined });
		const b = evaluateCostBudget({ maxTokens: 10 }, { tokens: null as unknown as number });
		expect(isCostBudgetRefusal(a)).toBe(false);
		expect(isCostBudgetRefusal(b)).toBe(false);
		if (isCostBudgetRefusal(a) || isCostBudgetRefusal(b)) return;
		expect(a.dimensions[0]?.status).toBe("unknown");
		expect(b.dimensions[0]?.status).toBe("unknown");
	});

	test("explicit zero usage is ok when under limit", () => {
		const r = evaluateCostBudget({ maxTokens: 100 }, { tokens: 0 });
		expect(isCostBudgetRefusal(r)).toBe(false);
		if (isCostBudgetRefusal(r)) return;
		expect(r.dimensions[0]?.status).toBe("ok");
		expect(r.status).toBe("ok");
		expect(r.circuitBroken).toBe(false);
	});

	test("exact limit is not exceeded", () => {
		const r = evaluateCostBudget({ maxTokens: 100, warnFraction: 0.8 }, { tokens: 100 });
		expect(isCostBudgetRefusal(r)).toBe(false);
		if (isCostBudgetRefusal(r)) return;
		expect(r.circuitBroken).toBe(false);
		expect(r.status === "ok" || r.status === "warn").toBe(true);
		expect(r.dimensions[0]?.status === "ok" || r.dimensions[0]?.status === "warn").toBe(true);
	});

	test.each([
		["tokens", 100, 101],
		["costUsd", 1, 1.01],
		["durationMs", 1000, 1001],
		["iterations", 10, 11],
	] as const)("hard exceed on %s breaks circuit", (dimension, limit, used) => {
		const policyKey =
			dimension === "tokens"
				? "maxTokens"
				: dimension === "costUsd"
					? "maxCostUsd"
					: dimension === "durationMs"
						? "maxDurationMs"
						: "maxIterations";
		const r = evaluateCostBudget({ [policyKey]: limit }, { [dimension]: used });
		expect(isCostBudgetRefusal(r)).toBe(false);
		if (isCostBudgetRefusal(r)) return;
		expect(r.status).toBe("exceeded");
		expect(r.circuitBroken).toBe(true);
		expect(r.ok).toBe(false);
	});

	test("mix of ok and unknown is overall unknown, circuit not broken", () => {
		const r = evaluateCostBudget(
			{ maxTokens: 100, maxCostUsd: 5 },
			{ costUsd: 1 },
		);
		expect(isCostBudgetRefusal(r)).toBe(false);
		if (isCostBudgetRefusal(r)) return;
		expect(r.status).toBe("unknown");
		expect(r.circuitBroken).toBe(false);
		expect(r.dimensions.some((d) => d.status === "unknown")).toBe(true);
		expect(r.dimensions.some((d) => d.dimension === "costUsd" && d.status === "ok")).toBe(true);
	});

	test("no limits configured yields ok with empty dimensions", () => {
		const r = evaluateCostBudget({}, { tokens: 999 });
		expect(isCostBudgetRefusal(r)).toBe(false);
		if (isCostBudgetRefusal(r)) return;
		expect(r.status).toBe("ok");
		expect(r.dimensions).toEqual([]);
		expect(r.circuitBroken).toBe(false);
		expect(r.ok).toBe(true);
	});

	test("refuses negative usage", () => {
		const r = evaluateCostBudget({ maxTokens: 100 }, { tokens: -1 });
		expect(isCostBudgetRefusal(r)).toBe(true);
		if (!isCostBudgetRefusal(r)) return;
		expect(r.code).toBe("invalid-usage");
		expect(r.ok).toBe(false);
	});

	test("refuses non-finite usage", () => {
		for (const tokens of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
			const r = evaluateCostBudget({ maxTokens: 100 }, { tokens });
			expect(isCostBudgetRefusal(r)).toBe(true);
			if (!isCostBudgetRefusal(r)) continue;
			expect(r.code).toBe("invalid-usage");
		}
	});

	test("refuses negative limits", () => {
		const r = evaluateCostBudget({ maxTokens: -1 }, { tokens: 0 });
		expect(isCostBudgetRefusal(r)).toBe(true);
		if (!isCostBudgetRefusal(r)) return;
		expect(r.code).toBe("invalid-policy");
	});

	test("refuses invalid warnFraction", () => {
		for (const warnFraction of [0, -0.1, 1.1, Number.NaN]) {
			const r = evaluateCostBudget({ maxTokens: 10, warnFraction }, { tokens: 1 });
			expect(isCostBudgetRefusal(r)).toBe(true);
			if (!isCostBudgetRefusal(r)) continue;
			expect(r.code).toBe("invalid-policy");
		}
	});
});

describe("formatCostBudgetResult", () => {
	test("distinguishes unknown from ok", () => {
		const r = evaluateCostBudget({ maxTokens: 100 }, {}) as CostBudgetResult;
		expect(isCostBudgetRefusal(r)).toBe(false);
		const text = formatCostBudgetResult(r);
		expect(text).toMatch(/unknown/i);
		expect(text).not.toMatch(/tokens: no usage recorded \(limit 100\)/);
		// Must not claim dimension OK
		expect(text).not.toMatch(/✅.*no usage/i);
		expect(text).toMatch(/UNKNOWN|unknown/);
	});
});

describe("mergeCostBudgetPolicy", () => {
	test("overlay wins and keeps base defaults", () => {
		const m = mergeCostBudgetPolicy(DEFAULT_INTERACTIVE_BUDGET, { maxCostUsd: 1 });
		expect(m.maxCostUsd).toBe(1);
		expect(m.maxIterations).toBe(DEFAULT_INTERACTIVE_BUDGET.maxIterations);
		expect(m.maxTokens).toBe(DEFAULT_INTERACTIVE_BUDGET.maxTokens);
	});
});

describe("DEFAULT budgets", () => {
	test("remain finite positive caps", () => {
		for (const policy of [
			DEFAULT_INTERACTIVE_BUDGET,
			DEFAULT_OVERNIGHT_BUDGET,
			DEFAULT_STRICT_BUDGET,
		]) {
			expect(Number.isFinite(policy.maxCostUsd)).toBe(true);
			expect(Number.isFinite(policy.maxTokens)).toBe(true);
			expect(Number.isFinite(policy.maxDurationMs)).toBe(true);
			expect(Number.isFinite(policy.maxIterations)).toBe(true);
			expect((policy.maxCostUsd ?? 0) > 0).toBe(true);
			expect((policy.maxTokens ?? 0) > 0).toBe(true);
			expect((policy.maxDurationMs ?? 0) > 0).toBe(true);
			expect((policy.maxIterations ?? 0) > 0).toBe(true);
		}
	});
});

describe("module surface", () => {
	test("no increaseBudget or unlimited escape helper is exported", async () => {
		const mod = await import("./cost-budget.ts");
		expect("increaseBudget" in mod).toBe(false);
		expect("setMaxUnlimited" in mod).toBe(false);
		expect(typeof (mod as { increaseBudget?: unknown }).increaseBudget).toBe("undefined");
		const src = readFileSync(new URL("./cost-budget.ts", import.meta.url), "utf8");
		expect(src).not.toMatch(/\bexport\s+(async\s+)?function\s+increaseBudget\b/);
		expect(src).not.toMatch(/\bexport\s+.*\bincreaseBudget\b/);
		expect(src).not.toMatch(/\bsetMaxUnlimited\b/);
	});
});

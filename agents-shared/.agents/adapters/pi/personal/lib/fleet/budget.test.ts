import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
	DEFAULT_INTERACTIVE_BUDGET,
	DEFAULT_OVERNIGHT_BUDGET,
} from "../bdd/cost-budget.ts";
import {
	DEFAULT_STRICT_BUDGET,
	isSpawnBudgetGateRefusal,
	planSpawnBudgetGateV1,
	resolveBudgetGatePolicyV1,
} from "./budget.ts";

describe("planSpawnBudgetGateV1", () => {
	test("spawn-blocked on unknown usage under strict hardBudgetOnUnknown", () => {
		const policy = resolveBudgetGatePolicyV1({
			profile: "strict",
			costBudget: { maxTokens: 100 },
			maxChildren: 4,
		});
		expect(policy.hardBudgetOnUnknown).toBe(true);
		const r = planSpawnBudgetGateV1({
			policy,
			usage: {},
			childCount: 1,
		});
		expect(isSpawnBudgetGateRefusal(r)).toBe(false);
		if (isSpawnBudgetGateRefusal(r)) return;
		expect(r.decision).toBe("spawn-blocked");
		expect(r.ok).toBe(false);
	});

	test("spawn-blocked on unknown usage under overnight hardBudgetOnUnknown", () => {
		const policy = resolveBudgetGatePolicyV1({
			profile: "overnight",
			costBudget: DEFAULT_OVERNIGHT_BUDGET,
			maxChildren: 8,
		});
		expect(policy.hardBudgetOnUnknown).toBe(true);
		const r = planSpawnBudgetGateV1({
			policy,
			usage: {},
			childCount: 1,
		});
		expect(isSpawnBudgetGateRefusal(r)).toBe(false);
		if (isSpawnBudgetGateRefusal(r)) return;
		expect(r.decision).toBe("spawn-blocked");
	});

	test("spawn-blocked when circuitBroken from exceeded usage", () => {
		const policy = resolveBudgetGatePolicyV1({
			profile: "strict",
			costBudget: { maxTokens: 100 },
			maxChildren: 4,
		});
		const r = planSpawnBudgetGateV1({
			policy,
			usage: { tokens: 101 },
			childCount: 1,
		});
		expect(isSpawnBudgetGateRefusal(r)).toBe(false);
		if (isSpawnBudgetGateRefusal(r)) return;
		expect(r.decision).toBe("spawn-blocked");
		expect(r.budget?.circuitBroken).toBe(true);
	});

	test("child count above policy requires confirmation reference", () => {
		const policy = resolveBudgetGatePolicyV1({
			profile: "strict",
			costBudget: { maxTokens: 1000 },
			maxChildren: 2,
		});
		const r = planSpawnBudgetGateV1({
			policy,
			usage: { tokens: 10 },
			childCount: 5,
		});
		expect(isSpawnBudgetGateRefusal(r)).toBe(false);
		if (isSpawnBudgetGateRefusal(r)) return;
		expect(r.decision).toBe("confirmation-required");
		expect(r.ok).toBe(false);
	});

	test("model boolean confirmed:true alone is ignored", () => {
		const policy = resolveBudgetGatePolicyV1({
			profile: "strict",
			costBudget: { maxTokens: 1000 },
			maxChildren: 2,
		});
		const r = planSpawnBudgetGateV1({
			policy,
			usage: { tokens: 10 },
			childCount: 5,
			confirmed: true,
		});
		expect(isSpawnBudgetGateRefusal(r)).toBe(false);
		if (isSpawnBudgetGateRefusal(r)) return;
		expect(r.decision).toBe("confirmation-required");
	});

	test("external confirmation ref allows high count when budget otherwise ok", () => {
		const policy = resolveBudgetGatePolicyV1({
			profile: "strict",
			costBudget: { maxTokens: 1000 },
			maxChildren: 2,
		});
		const r = planSpawnBudgetGateV1({
			policy,
			usage: { tokens: 10 },
			childCount: 5,
			confirmationRef: "human-approval:abc123",
		});
		expect(isSpawnBudgetGateRefusal(r)).toBe(false);
		if (isSpawnBudgetGateRefusal(r)) return;
		expect(r.decision).toBe("allow");
		expect(r.ok).toBe(true);
	});

	test("allow when under limits and count within policy", () => {
		const policy = resolveBudgetGatePolicyV1({
			profile: "interactive",
			costBudget: DEFAULT_INTERACTIVE_BUDGET,
			maxChildren: 8,
		});
		const r = planSpawnBudgetGateV1({
			policy,
			usage: {
				costUsd: 0.5,
				tokens: 1000,
				durationMs: 1000,
				iterations: 2,
			},
			childCount: 3,
		});
		expect(isSpawnBudgetGateRefusal(r)).toBe(false);
		if (isSpawnBudgetGateRefusal(r)) return;
		expect(r.decision).toBe("allow");
		expect(r.ok).toBe(true);
	});

	test("interactive with hardBudgetOnUnknown false may advisory-allow unknown usage", () => {
		const policy = resolveBudgetGatePolicyV1({
			profile: "interactive",
			costBudget: { maxTokens: 100 },
			maxChildren: 4,
			hardBudgetOnUnknown: false,
		});
		expect(policy.hardBudgetOnUnknown).toBe(false);
		const r = planSpawnBudgetGateV1({
			policy,
			usage: {},
			childCount: 1,
		});
		expect(isSpawnBudgetGateRefusal(r)).toBe(false);
		if (isSpawnBudgetGateRefusal(r)) return;
		expect(r.decision).toBe("allow");
		expect(r.budget?.status).toBe("unknown");
	});

	test("interactive default remains fail-closed on unknown", () => {
		const policy = resolveBudgetGatePolicyV1({
			profile: "interactive",
			costBudget: { maxTokens: 100 },
			maxChildren: 4,
		});
		expect(policy.hardBudgetOnUnknown).toBe(true);
		const r = planSpawnBudgetGateV1({
			policy,
			usage: {},
			childCount: 1,
		});
		expect(isSpawnBudgetGateRefusal(r)).toBe(false);
		if (isSpawnBudgetGateRefusal(r)) return;
		expect(r.decision).toBe("spawn-blocked");
	});

	test("refuses zero or negative child count", () => {
		const policy = resolveBudgetGatePolicyV1({
			profile: "strict",
			costBudget: { maxTokens: 100 },
			maxChildren: 4,
		});
		for (const childCount of [0, -1, -5]) {
			const r = planSpawnBudgetGateV1({
				policy,
				usage: { tokens: 1 },
				childCount,
			});
			expect(isSpawnBudgetGateRefusal(r)).toBe(true);
			if (!isSpawnBudgetGateRefusal(r)) continue;
			expect(r.code).toBe("invalid-count");
		}
	});

	test("refuses oversized child count", () => {
		const policy = resolveBudgetGatePolicyV1({
			profile: "strict",
			costBudget: { maxTokens: 100 },
			maxChildren: 4,
		});
		const r = planSpawnBudgetGateV1({
			policy,
			usage: { tokens: 1 },
			childCount: 10_000,
		});
		expect(isSpawnBudgetGateRefusal(r)).toBe(true);
		if (!isSpawnBudgetGateRefusal(r)) return;
		expect(r.code).toBe("bound-exceeded");
	});

	test("propagates invalid usage refusal", () => {
		const policy = resolveBudgetGatePolicyV1({
			profile: "strict",
			costBudget: { maxTokens: 100 },
			maxChildren: 4,
		});
		const r = planSpawnBudgetGateV1({
			policy,
			usage: { tokens: Number.NaN },
			childCount: 1,
		});
		expect(isSpawnBudgetGateRefusal(r)).toBe(true);
		if (!isSpawnBudgetGateRefusal(r)) return;
		expect(r.code).toBe("invalid-usage");
	});

	test("unknown profile is refused", () => {
		const r = resolveBudgetGatePolicyV1({
			profile: "lab" as "strict",
			costBudget: { maxTokens: 10 },
			maxChildren: 1,
		});
		expect("ok" in r && r.ok === false).toBe(true);
	});
});

describe("DEFAULT budget profiles", () => {
	test("strict/overnight hardBudgetOnUnknown true and finite caps", () => {
		expect(DEFAULT_STRICT_BUDGET.maxTokens).toBeGreaterThan(0);
		expect(Number.isFinite(DEFAULT_STRICT_BUDGET.maxTokens)).toBe(true);
		const strict = resolveBudgetGatePolicyV1({
			profile: "strict",
			costBudget: DEFAULT_STRICT_BUDGET,
			maxChildren: 4,
		});
		const overnight = resolveBudgetGatePolicyV1({
			profile: "overnight",
			costBudget: DEFAULT_OVERNIGHT_BUDGET,
			maxChildren: 8,
		});
		expect(strict.hardBudgetOnUnknown).toBe(true);
		expect(overnight.hardBudgetOnUnknown).toBe(true);
	});
});

describe("purity and surface", () => {
	test("module source has no process.env network or fs reads", () => {
		const src = readFileSync(new URL("./budget.ts", import.meta.url), "utf8");
		// Strip block/line comments so docstrings cannot false-positive purity checks.
		const code = src
			.replace(/\/\*[\s\S]*?\*\//g, "")
			.replace(/\/\/.*$/gm, "");
		expect(code).not.toMatch(/process\.env/);
		expect(code).not.toMatch(/from ["']node:fs["']/);
		expect(code).not.toMatch(/from ["']node:net["']/);
		expect(code).not.toMatch(/\bfetch\s*\(/);
		expect(code).not.toMatch(/\bincreaseBudget\b/);
	});

	test("no increaseBudget export", async () => {
		const mod = await import("./budget.ts");
		expect("increaseBudget" in mod).toBe(false);
	});
});

/**
 * BUD-01 — Pure fleet spawn budget preflight.
 *
 * No ambient environment, network, filesystem, or RPC access.
 * Wiring into extensions/agentic-fleet.ts is deferred to a serialized follow-up.
 */

import {
	DEFAULT_INTERACTIVE_BUDGET,
	DEFAULT_OVERNIGHT_BUDGET,
	DEFAULT_STRICT_BUDGET,
	evaluateCostBudget,
	isCostBudgetRefusal,
	type CostBudgetPolicy,
	type CostBudgetRefusal,
	type CostBudgetResult,
	type CostBudgetUsage,
} from "../bdd/cost-budget.ts";

export { DEFAULT_STRICT_BUDGET };

/** Hard upper bound on requested child count (refuse above this). */
export const SPAWN_BUDGET_MAX_CHILD_BOUND_V1 = 512 as const;

export type BudgetProfileV1 = "interactive" | "strict" | "overnight";

export type SpawnBudgetDecisionV1 =
	| "allow"
	| "spawn-blocked"
	| "confirmation-required";

export type SpawnBudgetGateRefusalCodeV1 =
	| "invalid-usage"
	| "invalid-policy"
	| "invalid-count"
	| "bound-exceeded"
	| "invalid-profile";

export type SpawnBudgetGateRefusalV1 = Readonly<{
	ok: false;
	code: SpawnBudgetGateRefusalCodeV1;
}>;

export interface SpawnBudgetGatePolicyV1 {
	profile: BudgetProfileV1;
	costBudget: CostBudgetPolicy;
	/** Max children allowed without an external confirmation ref */
	maxChildren: number;
	/**
	 * When true, unknown usage blocks spawn.
	 * Defaults true for all profiles (interactive soft-unknown only when explicitly false).
	 */
	hardBudgetOnUnknown: boolean;
}

export interface PlanSpawnBudgetGateInputV1 {
	policy: SpawnBudgetGatePolicyV1;
	usage: CostBudgetUsage;
	childCount: number;
	/** Model-supplied boolean — never authoritative */
	confirmed?: boolean;
	/** External human confirmation reference (required for over-cap counts) */
	confirmationRef?: string;
}

export type PlanSpawnBudgetGateResultV1 =
	| Readonly<{
			ok: true;
			decision: "allow";
			budget: CostBudgetResult;
	  }>
	| Readonly<{
			ok: false;
			decision: "spawn-blocked" | "confirmation-required";
			reason: string;
			budget: CostBudgetResult;
	  }>
	| SpawnBudgetGateRefusalV1;

const PROFILES = new Set<BudgetProfileV1>(["interactive", "strict", "overnight"]);

function freezeDecision<T extends object>(value: T): T {
	return Object.freeze(value);
}

function refuse(code: SpawnBudgetGateRefusalCodeV1): SpawnBudgetGateRefusalV1 {
	return freezeDecision({ ok: false, code });
}

export function isSpawnBudgetGateRefusal(
	result: PlanSpawnBudgetGateResultV1 | SpawnBudgetGatePolicyV1 | SpawnBudgetGateRefusalV1,
): result is SpawnBudgetGateRefusalV1 {
	return (
		result != null &&
		typeof result === "object" &&
		"code" in result &&
		typeof (result as SpawnBudgetGateRefusalV1).code === "string" &&
		!("decision" in result) &&
		!("costBudget" in result)
	);
}

export type ResolveBudgetGatePolicyInputV1 = {
	profile: BudgetProfileV1;
	costBudget: CostBudgetPolicy;
	maxChildren: number;
	/** Explicit override; default true for all profiles */
	hardBudgetOnUnknown?: boolean;
};

/**
 * Resolve a closed spawn-gate policy. Unknown profiles refuse.
 * hardBudgetOnUnknown defaults true (fail-closed) for interactive/strict/overnight.
 */
export function resolveBudgetGatePolicyV1(
	input: ResolveBudgetGatePolicyInputV1,
): SpawnBudgetGatePolicyV1 | SpawnBudgetGateRefusalV1 {
	if (input == null || typeof input !== "object") return refuse("invalid-policy");
	if (typeof input.profile !== "string" || !PROFILES.has(input.profile)) {
		return refuse("invalid-profile");
	}
	if (
		typeof input.maxChildren !== "number" ||
		!Number.isFinite(input.maxChildren) ||
		!Number.isInteger(input.maxChildren) ||
		input.maxChildren < 0
	) {
		return refuse("invalid-policy");
	}
	if (input.maxChildren > SPAWN_BUDGET_MAX_CHILD_BOUND_V1) {
		return refuse("bound-exceeded");
	}
	if (input.costBudget == null || typeof input.costBudget !== "object") {
		return refuse("invalid-policy");
	}
	const hardBudgetOnUnknown =
		input.hardBudgetOnUnknown === undefined ? true : Boolean(input.hardBudgetOnUnknown);

	return freezeDecision({
		profile: input.profile,
		costBudget: { ...input.costBudget },
		maxChildren: input.maxChildren,
		hardBudgetOnUnknown,
	});
}

function hasExternalConfirmation(ref: string | undefined): boolean {
	return typeof ref === "string" && ref.trim().length > 0;
}

/**
 * Pure spawn preflight:
 * - spawn-blocked on exceeded (circuitBroken) or unknown under hardBudgetOnUnknown
 * - confirmation-required when childCount > maxChildren without external confirmationRef
 * - model `confirmed: true` is ignored
 */
export function planSpawnBudgetGateV1(
	input: PlanSpawnBudgetGateInputV1,
): PlanSpawnBudgetGateResultV1 {
	if (input == null || typeof input !== "object") return refuse("invalid-policy");
	const policy = input.policy;
	if (policy == null || typeof policy !== "object") return refuse("invalid-policy");
	if (typeof policy.profile !== "string" || !PROFILES.has(policy.profile)) {
		return refuse("invalid-profile");
	}
	if (
		typeof policy.maxChildren !== "number" ||
		!Number.isFinite(policy.maxChildren) ||
		!Number.isInteger(policy.maxChildren) ||
		policy.maxChildren < 0
	) {
		return refuse("invalid-policy");
	}

	const childCount = input.childCount;
	if (typeof childCount !== "number" || !Number.isFinite(childCount) || !Number.isInteger(childCount)) {
		return refuse("invalid-count");
	}
	if (childCount <= 0) return refuse("invalid-count");
	if (childCount > SPAWN_BUDGET_MAX_CHILD_BOUND_V1) return refuse("bound-exceeded");

	const evaluated = evaluateCostBudget(policy.costBudget, input.usage ?? {});
	if (isCostBudgetRefusal(evaluated)) {
		return refuse(evaluated.code as CostBudgetRefusal["code"]);
	}
	const budget = evaluated;

	if (budget.circuitBroken || budget.status === "exceeded") {
		return freezeDecision({
			ok: false,
			decision: "spawn-blocked",
			reason: "circuit-broken: hard budget exceeded",
			budget,
		});
	}

	const hardOnUnknown = policy.hardBudgetOnUnknown !== false;
	if (budget.status === "unknown" && hardOnUnknown) {
		return freezeDecision({
			ok: false,
			decision: "spawn-blocked",
			reason: "unknown-usage: limited dimension missing usage under hardBudgetOnUnknown",
			budget,
		});
	}

	// Model-supplied `confirmed` is intentionally ignored — only external confirmationRef counts.

	if (childCount > policy.maxChildren) {
		if (!hasExternalConfirmation(input.confirmationRef)) {
			return freezeDecision({
				ok: false,
				decision: "confirmation-required",
				reason: `childCount ${childCount} exceeds maxChildren ${policy.maxChildren}; external confirmationRef required`,
				budget,
			});
		}
	}

	return freezeDecision({
		ok: true,
		decision: "allow",
		budget,
	});
}

/** Convenience defaults for profile-tagged cost budgets (finite). */
export function defaultCostBudgetForProfileV1(profile: BudgetProfileV1): CostBudgetPolicy {
	switch (profile) {
		case "strict":
			return { ...DEFAULT_STRICT_BUDGET };
		case "overnight":
			return { ...DEFAULT_OVERNIGHT_BUDGET };
		case "interactive":
		default:
			return { ...DEFAULT_INTERACTIVE_BUDGET };
	}
}

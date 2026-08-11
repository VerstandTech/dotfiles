/**
 * Cost / latency / iteration budgets as first-class fitness controls.
 * Pure evaluation helpers — agents must not bypass these checks.
 * BUD-01: missing usage is typed `unknown`, never coerced to ok/zero.
 */

export interface CostBudgetPolicy {
	/** Hard max estimated USD for a task (optional) */
	maxCostUsd?: number;
	/** Hard max tokens (input+output estimate) */
	maxTokens?: number;
	/** Hard max wall-clock ms */
	maxDurationMs?: number;
	/** Hard max agent loop iterations / tool rounds */
	maxIterations?: number;
	/** Soft warning thresholds (fraction of max, default 0.8) */
	warnFraction?: number;
}

export interface CostBudgetUsage {
	costUsd?: number;
	tokens?: number;
	durationMs?: number;
	iterations?: number;
}

export type BudgetStatus = "ok" | "warn" | "exceeded" | "unknown";

export type CostBudgetRefusalCode = "invalid-usage" | "invalid-policy";

export type CostBudgetRefusal = Readonly<{
	ok: false;
	code: CostBudgetRefusalCode;
}>;

export interface BudgetDimensionResult {
	dimension: keyof CostBudgetUsage;
	status: BudgetStatus;
	limit?: number;
	used?: number;
	summary: string;
}

export interface CostBudgetResult {
	/**
	 * Hard-exceed free. Unknown does not flip this false (spawn gate decides).
	 * `ok: false` only when circuitBroken (a hard limit exceeded).
	 */
	ok: boolean;
	status: BudgetStatus;
	dimensions: BudgetDimensionResult[];
	/** True only when any hard limit exceeded — not for unknown alone */
	circuitBroken: boolean;
}

export type EvaluateCostBudgetResult = CostBudgetResult | CostBudgetRefusal;

export function isCostBudgetRefusal(
	result: EvaluateCostBudgetResult,
): result is CostBudgetRefusal {
	return (
		result != null &&
		typeof result === "object" &&
		"code" in result &&
		((result as CostBudgetRefusal).code === "invalid-usage" ||
			(result as CostBudgetRefusal).code === "invalid-policy")
	);
}

function freezeResult(result: CostBudgetResult): CostBudgetResult {
	return Object.freeze({
		ok: result.ok,
		status: result.status,
		circuitBroken: result.circuitBroken,
		dimensions: Object.freeze(result.dimensions.map((d) => Object.freeze({ ...d }))),
	});
}

function refuse(code: CostBudgetRefusalCode): CostBudgetRefusal {
	return Object.freeze({ ok: false, code });
}

function isMissingUsed(used: number | undefined | null): boolean {
	return used == null;
}

function isInvalidNumber(value: unknown): boolean {
	return typeof value !== "number" || !Number.isFinite(value);
}

function validatePolicy(policy: CostBudgetPolicy): CostBudgetRefusal | null {
	if (policy == null || typeof policy !== "object") return refuse("invalid-policy");
	const limits = [
		policy.maxCostUsd,
		policy.maxTokens,
		policy.maxDurationMs,
		policy.maxIterations,
	];
	for (const limit of limits) {
		if (limit === undefined) continue;
		if (isInvalidNumber(limit) || limit < 0) return refuse("invalid-policy");
	}
	if (policy.warnFraction !== undefined) {
		const w = policy.warnFraction;
		if (isInvalidNumber(w) || w <= 0 || w > 1) return refuse("invalid-policy");
	}
	return null;
}

function validateUsage(usage: CostBudgetUsage): CostBudgetRefusal | null {
	if (usage == null || typeof usage !== "object") return refuse("invalid-usage");
	const fields: Array<keyof CostBudgetUsage> = [
		"costUsd",
		"tokens",
		"durationMs",
		"iterations",
	];
	for (const key of fields) {
		const value = usage[key];
		if (value === undefined || value === null) continue;
		if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
			return refuse("invalid-usage");
		}
	}
	return null;
}

function dim(
	dimension: keyof CostBudgetUsage,
	used: number | undefined | null,
	limit: number | undefined,
	warnFraction: number,
): BudgetDimensionResult | null {
	if (limit == null) return null;
	if (isMissingUsed(used)) {
		return {
			dimension,
			status: "unknown",
			limit,
			used: undefined,
			summary: `${dimension}: unknown usage (limit ${limit})`,
		};
	}
	const value = used as number;
	if (value > limit) {
		return {
			dimension,
			status: "exceeded",
			limit,
			used: value,
			summary: `${dimension}: ${value} exceeds hard limit ${limit}`,
		};
	}
	if (value >= limit * warnFraction) {
		return {
			dimension,
			status: "warn",
			limit,
			used: value,
			summary: `${dimension}: ${value} ≥ ${Math.round(warnFraction * 100)}% of limit ${limit}`,
		};
	}
	return {
		dimension,
		status: "ok",
		limit,
		used: value,
		summary: `${dimension}: ${value} / ${limit}`,
	};
}

/**
 * Evaluate usage against policy.
 * - Missing used on a limited dimension → status `unknown` (not ok).
 * - circuitBroken only when a hard limit is exceeded.
 * - ok = !circuitBroken (hard-exceed free; spawn gate handles unknown).
 */
export function evaluateCostBudget(
	policy: CostBudgetPolicy,
	usage: CostBudgetUsage,
): EvaluateCostBudgetResult {
	const policyRefusal = validatePolicy(policy);
	if (policyRefusal) return policyRefusal;
	const usageRefusal = validateUsage(usage);
	if (usageRefusal) return usageRefusal;

	const warnFraction = policy.warnFraction ?? 0.8;
	const dimensions: BudgetDimensionResult[] = [];
	const push = (d: BudgetDimensionResult | null) => {
		if (d) dimensions.push(d);
	};
	push(dim("costUsd", usage.costUsd, policy.maxCostUsd, warnFraction));
	push(dim("tokens", usage.tokens, policy.maxTokens, warnFraction));
	push(dim("durationMs", usage.durationMs, policy.maxDurationMs, warnFraction));
	push(dim("iterations", usage.iterations, policy.maxIterations, warnFraction));

	const circuitBroken = dimensions.some((d) => d.status === "exceeded");
	const anyUnknown = dimensions.some((d) => d.status === "unknown");
	const anyWarn = dimensions.some((d) => d.status === "warn");
	const status: BudgetStatus = circuitBroken
		? "exceeded"
		: anyUnknown
			? "unknown"
			: anyWarn
				? "warn"
				: "ok";

	return freezeResult({
		ok: !circuitBroken,
		status,
		dimensions,
		circuitBroken,
	});
}

export function formatCostBudgetResult(result: CostBudgetResult): string {
	const lines = [
		`# Cost budget — ${result.status.toUpperCase()}`,
		``,
		`- ok: ${result.ok}`,
		`- circuitBroken: ${result.circuitBroken}`,
		``,
		...result.dimensions.map((d) => {
			const icon =
				d.status === "ok"
					? "✅"
					: d.status === "warn"
						? "⚠️"
						: d.status === "unknown"
							? "❓"
							: "❌";
			return `- ${icon} ${d.summary}`;
		}),
	];
	return lines.join("\n");
}

/** Default interactive coding budget (conservative; projects should override). */
export const DEFAULT_INTERACTIVE_BUDGET: CostBudgetPolicy = Object.freeze({
	maxCostUsd: 5,
	maxTokens: 500_000,
	maxDurationMs: 30 * 60_000,
	maxIterations: 80,
	warnFraction: 0.8,
});

/** Overnight / background batch budget (higher wall clock, still capped spend). */
export const DEFAULT_OVERNIGHT_BUDGET: CostBudgetPolicy = Object.freeze({
	maxCostUsd: 25,
	maxTokens: 2_000_000,
	maxDurationMs: 8 * 60 * 60_000,
	maxIterations: 400,
	warnFraction: 0.85,
});

/** Strict profile cost caps (finite; fail-closed spawn gate pairs with hardBudgetOnUnknown). */
export const DEFAULT_STRICT_BUDGET: CostBudgetPolicy = Object.freeze({
	maxCostUsd: 10,
	maxTokens: 750_000,
	maxDurationMs: 60 * 60_000,
	maxIterations: 120,
	warnFraction: 0.8,
});

/**
 * Merge project overlay onto a base policy (explicit fields win).
 */
export function mergeCostBudgetPolicy(
	base: CostBudgetPolicy,
	overlay?: Partial<CostBudgetPolicy>,
): CostBudgetPolicy {
	if (!overlay) return { ...base };
	return {
		maxCostUsd: overlay.maxCostUsd ?? base.maxCostUsd,
		maxTokens: overlay.maxTokens ?? base.maxTokens,
		maxDurationMs: overlay.maxDurationMs ?? base.maxDurationMs,
		maxIterations: overlay.maxIterations ?? base.maxIterations,
		warnFraction: overlay.warnFraction ?? base.warnFraction,
	};
}

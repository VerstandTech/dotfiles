/**
 * Cost / latency / iteration budgets as first-class fitness controls.
 * Orchestrator-level helpers — agents must not bypass these checks.
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

export type BudgetStatus = "ok" | "warn" | "exceeded";

export interface BudgetDimensionResult {
	dimension: keyof CostBudgetUsage;
	status: BudgetStatus;
	limit?: number;
	used?: number;
	summary: string;
}

export interface CostBudgetResult {
	ok: boolean;
	status: BudgetStatus;
	dimensions: BudgetDimensionResult[];
	/** True when any hard limit exceeded */
	circuitBroken: boolean;
}

function dim(
	dimension: keyof CostBudgetUsage,
	used: number | undefined,
	limit: number | undefined,
	warnFraction: number,
): BudgetDimensionResult | null {
	if (limit == null) return null;
	if (used == null) {
		return {
			dimension,
			status: "ok",
			limit,
			used,
			summary: `${dimension}: no usage recorded (limit ${limit})`,
		};
	}
	if (used > limit) {
		return {
			dimension,
			status: "exceeded",
			limit,
			used,
			summary: `${dimension}: ${used} exceeds hard limit ${limit}`,
		};
	}
	if (used >= limit * warnFraction) {
		return {
			dimension,
			status: "warn",
			limit,
			used,
			summary: `${dimension}: ${used} ≥ ${Math.round(warnFraction * 100)}% of limit ${limit}`,
		};
	}
	return {
		dimension,
		status: "ok",
		limit,
		used,
		summary: `${dimension}: ${used} / ${limit}`,
	};
}

/**
 * Evaluate usage against policy. ok=false only when a hard limit is exceeded.
 */
export function evaluateCostBudget(
	policy: CostBudgetPolicy,
	usage: CostBudgetUsage,
): CostBudgetResult {
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
	const anyWarn = dimensions.some((d) => d.status === "warn");
	const status: BudgetStatus = circuitBroken ? "exceeded" : anyWarn ? "warn" : "ok";
	return {
		ok: !circuitBroken,
		status,
		dimensions,
		circuitBroken,
	};
}

export function formatCostBudgetResult(result: CostBudgetResult): string {
	const lines = [
		`# Cost budget — ${result.status.toUpperCase()}`,
		``,
		`- ok: ${result.ok}`,
		`- circuitBroken: ${result.circuitBroken}`,
		``,
		...result.dimensions.map((d) => {
			const icon = d.status === "ok" ? "✅" : d.status === "warn" ? "⚠️" : "❌";
			return `- ${icon} ${d.summary}`;
		}),
	];
	return lines.join("\n");
}

/** Default interactive coding budget (conservative; projects should override). */
export const DEFAULT_INTERACTIVE_BUDGET: CostBudgetPolicy = {
	maxCostUsd: 5,
	maxTokens: 500_000,
	maxDurationMs: 30 * 60_000,
	maxIterations: 80,
	warnFraction: 0.8,
};

/** Overnight / background batch budget (higher wall clock, still capped spend). */
export const DEFAULT_OVERNIGHT_BUDGET: CostBudgetPolicy = {
	maxCostUsd: 25,
	maxTokens: 2_000_000,
	maxDurationMs: 8 * 60 * 60_000,
	maxIterations: 400,
	warnFraction: 0.85,
};

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

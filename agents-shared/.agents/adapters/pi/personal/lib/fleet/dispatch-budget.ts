import {
  defaultCostBudgetForProfileV1,
  planSpawnBudgetGateV1,
  resolveBudgetGatePolicyV1,
  type BudgetProfileV1,
} from "./budget.ts";
import type { CostBudgetUsage } from "../bdd/cost-budget.ts";

export interface FleetDispatchBudgetInputV1 {
  profile: BudgetProfileV1;
  childCount: number;
  usage: CostBudgetUsage;
  confirmationRef?: string;
}

interface TrustedFleetBudgetFactsInputV1 {
  mode: "tui" | "rpc" | "json" | "print";
  configuredProfile: BudgetProfileV1;
  branch: readonly unknown[];
}

function ownValue(record: unknown, key: string): unknown {
  if (!record || typeof record !== "object") return undefined;
  try {
    const descriptor = Object.getOwnPropertyDescriptor(record, key);
    return descriptor && "value" in descriptor ? descriptor.value : undefined;
  } catch {
    return undefined;
  }
}

function finiteNonnegative(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

export function deriveTrustedFleetBudgetFactsV1(input: TrustedFleetBudgetFactsInputV1): Readonly<{
  profile: BudgetProfileV1;
  usage: CostBudgetUsage;
}> {
  const profile: BudgetProfileV1 = "strict";
  let tokens = 0;
  let costUsd = 0;
  let iterations = 0;
  let firstTimestamp: number | undefined;
  let lastTimestamp: number | undefined;
  let complete = true;
  if (!Array.isArray(input.branch)) return Object.freeze({ profile, usage: Object.freeze({}) });
  for (const entry of input.branch) {
    const type = ownValue(entry, "type");
    let usage: unknown;
    if (type === "message") {
      const message = ownValue(entry, "message");
      const role = ownValue(message, "role");
      if (role === "assistant") usage = ownValue(message, "usage");
      else if (role === "toolResult") {
        const reported = ownValue(message, "usage");
        if (reported === undefined) continue;
        usage = reported;
      } else continue;
    } else if (type === "compaction" || type === "branch_summary") {
      usage = ownValue(entry, "usage");
    } else continue;
    const totalTokens = finiteNonnegative(ownValue(usage, "totalTokens"));
    const cost = finiteNonnegative(ownValue(ownValue(usage, "cost"), "total"));
    const timestampValue = ownValue(entry, "timestamp");
    const timestamp = typeof timestampValue === "string" ? Date.parse(timestampValue) : Number.NaN;
    if (totalTokens === undefined || cost === undefined || !Number.isFinite(timestamp)) {
      complete = false;
      continue;
    }
    tokens += totalTokens;
    costUsd += cost;
    iterations += 1;
    firstTimestamp = firstTimestamp === undefined ? timestamp : Math.min(firstTimestamp, timestamp);
    lastTimestamp = lastTimestamp === undefined ? timestamp : Math.max(lastTimestamp, timestamp);
  }
  const usageResult: CostBudgetUsage = complete
    ? {
        tokens,
        costUsd: Number(costUsd.toFixed(12)),
        durationMs: firstTimestamp === undefined || lastTimestamp === undefined ? 0 : lastTimestamp - firstTimestamp,
        iterations,
      }
    : {};
  return Object.freeze({ profile, usage: Object.freeze(usageResult) });
}

export async function authorizeFleetDispatchBudgetV1(input: Readonly<{
  facts: Readonly<{ profile: BudgetProfileV1; usage: CostBudgetUsage }>;
  childCount: number;
  confirmHighCount?: () => boolean | Promise<boolean>;
  readCurrentFacts?: () => Readonly<{ profile: BudgetProfileV1; usage: CostBudgetUsage }>;
}>) {
  const initial = planFleetDispatchBudgetV1({
    profile: input.facts.profile,
    usage: input.facts.usage,
    childCount: input.childCount,
  });
  if (!("decision" in initial) || initial.decision !== "confirmation-required") return initial;
  if (!input.confirmHighCount || await input.confirmHighCount() !== true || !input.readCurrentFacts) return initial;
  const current = input.readCurrentFacts();
  return planFleetDispatchBudgetV1({
    profile: current.profile,
    usage: current.usage,
    childCount: input.childCount,
    confirmationRef: "human-tui-current-dispatch",
  });
}

export function planFleetDispatchBudgetV1(input: FleetDispatchBudgetInputV1) {
  const policy = resolveBudgetGatePolicyV1({
    profile: input.profile,
    costBudget: defaultCostBudgetForProfileV1(input.profile),
    maxChildren: 5,
  });
  return planSpawnBudgetGateV1({
    policy,
    usage: input.usage,
    childCount: input.childCount,
    confirmationRef: input.confirmationRef,
  });
}

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

type Api = typeof import("./dispatch-budget");
let api: Api;
try {
  api = await import("./dispatch-budget");
} catch {
  api = { planFleetDispatchBudgetV1: () => { throw new Error("PKG01_FLEET_BUDGET_WIRING_MISSING"); } } as unknown as Api;
}

const { planFleetDispatchBudgetV1, deriveTrustedFleetBudgetFactsV1 } = api;
const authorizeFleetDispatchBudgetV1 = (api as any).authorizeFleetDispatchBudgetV1 ?? (async () => {
  throw new Error("PKG01_HIGH_COUNT_CONFIRMATION_MISSING");
});

describe("PKG-01 fleet dispatch budget wiring", () => {
  test("PKG01_FLEET_BUDGET_WIRING_MISSING: strict unknown usage blocks before spawn", () => {
    expect(planFleetDispatchBudgetV1({ profile: "strict", childCount: 2, usage: {} })).toMatchObject({
      decision: "spawn-blocked",
    });
  });

  test("overnight unknown usage blocks", () => {
    expect(planFleetDispatchBudgetV1({ profile: "overnight", childCount: 1, usage: {} })).toMatchObject({ decision: "spawn-blocked" });
  });

  test("interactive known zero usage within count permits", () => {
    expect(planFleetDispatchBudgetV1({
      profile: "interactive",
      childCount: 2,
      usage: { tokens: 0, costUsd: 0, durationMs: 0, iterations: 0 },
    })).toMatchObject({ decision: "allow" });
  });

  test("high child count requires an external confirmation ref", () => {
    expect(planFleetDispatchBudgetV1({
      profile: "interactive",
      childCount: 6,
      usage: { tokens: 0, costUsd: 0, durationMs: 0, iterations: 0 },
    })).toMatchObject({ decision: "confirmation-required" });
  });

  test("PKG01_TRUSTED_USAGE_MISSING: derives usage only from trusted session entries", () => {
    const facts = deriveTrustedFleetBudgetFactsV1({
      mode: "tui",
      configuredProfile: "interactive",
      branch: [
        {
          type: "message",
          timestamp: "2026-01-01T00:00:00.000Z",
          message: {
            role: "assistant",
            usage: { totalTokens: 12, cost: { total: 0.25 } },
          },
        },
        {
          type: "message",
          timestamp: "2026-01-01T00:00:02.000Z",
          message: {
            role: "assistant",
            usage: { totalTokens: 8, cost: { total: 0.15 } },
          },
        },
      ],
    });
    expect(facts).toEqual({
      profile: "strict",
      usage: { tokens: 20, costUsd: 0.4, durationMs: 2000, iterations: 2 },
    });
  });

  test("missing runtime context stays unknown while real empty branch is known zero", () => {
    expect(deriveTrustedFleetBudgetFactsV1({ mode: "print", configuredProfile: "strict", branch: undefined as any })).toEqual({ profile: "strict", usage: {} });
    expect(deriveTrustedFleetBudgetFactsV1({ mode: "print", configuredProfile: "strict", branch: [] })).toEqual({ profile: "strict", usage: { tokens: 0, costUsd: 0, durationMs: 0, iterations: 0 } });
  });

  test("runtime defaults strict and project configuration cannot weaken profile", () => {
    expect(deriveTrustedFleetBudgetFactsV1({ mode: "tui", configuredProfile: "overnight", branch: [] })).toEqual({
      profile: "strict",
      usage: { tokens: 0, costUsd: 0, durationMs: 0, iterations: 0 },
    });
    expect(deriveTrustedFleetBudgetFactsV1({ mode: "print", configuredProfile: "interactive", branch: [] })).toEqual({
      profile: "strict",
      usage: { tokens: 0, costUsd: 0, durationMs: 0, iterations: 0 },
    });
  });

  test("attributes reported usage and ignores ordinary tool results without usage", () => {
    const usage = { totalTokens: 3, cost: { total: 0.1 } };
    expect(deriveTrustedFleetBudgetFactsV1({
      mode: "tui",
      configuredProfile: "strict",
      branch: [
        { type: "message", timestamp: "2026-01-01T00:00:00.000Z", message: { role: "assistant", usage } },
        { type: "message", timestamp: "2026-01-01T00:00:01.000Z", message: { role: "toolResult" } },
        { type: "compaction", timestamp: "2026-01-01T00:00:02.000Z", usage },
        { type: "branch_summary", timestamp: "2026-01-01T00:00:03.000Z", usage },
      ],
    })).toEqual({ profile: "strict", usage: { tokens: 9, costUsd: 0.3, durationMs: 3000, iterations: 3 } });
    expect(deriveTrustedFleetBudgetFactsV1({
      mode: "tui",
      configuredProfile: "strict",
      branch: [{ type: "compaction", timestamp: "2026-01-01T00:00:00.000Z" }],
    })).toEqual({ profile: "strict", usage: {} });
  });

  test("malformed session usage remains unknown and hostile accessors are not invoked", () => {
    let reads = 0;
    const entry: Record<string, unknown> = { type: "message", timestamp: "2026-01-01T00:00:00.000Z" };
    Object.defineProperty(entry, "message", { enumerable: true, get() { reads += 1; return {}; } });
    expect(deriveTrustedFleetBudgetFactsV1({ mode: "tui", configuredProfile: "interactive", branch: [entry] })).toEqual({
      profile: "strict",
      usage: { tokens: 0, costUsd: 0, durationMs: 0, iterations: 0 },
    });
    expect(reads).toBe(0);
  });

  test("PKG01_HIGH_COUNT_CONFIRMATION: re-derives current facts after positive TUI decision", async () => {
    const input = {
      facts: {
        profile: "interactive" as const,
        usage: { tokens: 20, costUsd: 0.4, durationMs: 2000, iterations: 2 },
      },
      childCount: 6,
    };
    expect(await authorizeFleetDispatchBudgetV1({ ...input, confirmHighCount: async () => false })).toMatchObject({ decision: "confirmation-required" });
    let reads = 0;
    expect(await authorizeFleetDispatchBudgetV1({ ...input, confirmHighCount: async () => true, readCurrentFacts: () => { reads += 1; return input.facts; } })).toMatchObject({ decision: "allow" });
    expect(reads).toBe(1);
    expect(await authorizeFleetDispatchBudgetV1({ ...input, confirmHighCount: async () => true })).toMatchObject({ decision: "confirmation-required" });
  });

  test("extension gates trusted usage before RPC and never reports a blocked run as launched", () => {
    const source = readFileSync(new URL("../../extensions/agentic-fleet.ts", import.meta.url), "utf8");
    const derive = source.indexOf("deriveTrustedFleetBudgetFactsV1(");
    const gate = source.indexOf("authorizeFleetDispatchBudgetV1(");
    const spawn = source.indexOf('callSubagentRpc(pi.events, "spawn"');
    expect(derive).toBeGreaterThan(-1);
    expect(gate).toBeGreaterThan(derive);
    expect(spawn).toBeGreaterThan(gate);
    expect(source).not.toContain("usage: {},");
    expect(source).toContain("if (!result.ok) return;");
    expect(source).toContain("authorizeFleetDispatchBudgetV1(");
    expect(source).toContain("ctx.ui.confirm(");
  });
});

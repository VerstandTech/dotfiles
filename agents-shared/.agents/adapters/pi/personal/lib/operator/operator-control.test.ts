import { describe, expect, test } from "bun:test";

type OperatorApi = typeof import("./operator-control");

let api: OperatorApi;
try {
  api = await import("./operator-control");
} catch {
  const missing = () => {
    throw new Error("OPS01_OPERATOR_CONTROL_MISSING");
  };
  api = {
    planCleanupV1: missing,
    planNotificationV1: missing,
    planRecoveryV1: missing,
    resolveWaitOutcomeV1: missing,
  } as unknown as OperatorApi;
}

const {
  planCleanupV1,
  planNotificationV1,
  planRecoveryV1,
  resolveWaitOutcomeV1,
} = api;

const SHA = "a".repeat(40);
const MERGE = "b".repeat(40);

function identity(overrides: Record<string, unknown> = {}) {
  return {
    agentName: "worker-1",
    paneId: "w1:p2",
    generation: 1,
    sequence: 2,
    ...overrides,
  };
}

describe("OPS-01 bounded operator control", () => {
  test("OPS01_OPERATOR_CONTROL_MISSING: current transition emits one closed notification", () => {
    expect(planNotificationV1({
      identity: identity(),
      previous: { state: "working", sequence: 1 },
      current: { state: "idle", sequence: 2 },
      emittedSequences: [],
      transitionCount: 1,
      maxTransitions: 4,
    })).toEqual({
      ok: true,
      status: "notify",
      notification: {
        kind: "completed",
        agentName: "worker-1",
        paneId: "w1:p2",
        generation: 1,
        sequence: 2,
      },
    });
  });

  test("OPS01_STALE_SEQUENCE: stale or duplicate transitions never notify", () => {
    for (const current of [
      { state: "idle", sequence: 1 },
      { state: "needs-attention", sequence: 2 },
    ]) {
      const result = planNotificationV1({
        identity: identity(),
        previous: { state: "working", sequence: 2 },
        current,
        emittedSequences: [2],
        transitionCount: 1,
        maxTransitions: 4,
      });
      expect(result).toMatchObject({ ok: false });
      expect(JSON.stringify(result)).not.toContain("completed");
    }
  });

  test("OPS01_NOTIFICATION_BOUND: initial repeated and excess transitions suppress", () => {
    expect(planNotificationV1({
      identity: identity(),
      previous: null,
      current: { state: "working", sequence: 2 },
      emittedSequences: [],
      transitionCount: 0,
      maxTransitions: 4,
    })).toMatchObject({ ok: true, status: "quiet" });
    expect(planNotificationV1({
      identity: identity(),
      previous: { state: "idle", sequence: 1 },
      current: { state: "working", sequence: 2 },
      emittedSequences: [],
      transitionCount: 4,
      maxTransitions: 4,
    })).toMatchObject({ ok: true, status: "suppressed" });
  });

  test("OPS01_TIMEOUT_UNKNOWN: timeout and unavailable cannot become completion", () => {
    expect(resolveWaitOutcomeV1({ kind: "timeout" })).toEqual({ ok: true, status: "unknown" });
    expect(resolveWaitOutcomeV1({ kind: "unavailable" })).toEqual({ ok: true, status: "unavailable" });
    expect(resolveWaitOutcomeV1({ kind: "observation", state: "idle", current: true })).toEqual({ ok: true, status: "completed" });
  });

  test("OPS01_RECOVERY_PLAN: partial launch creates no executable authority", () => {
    expect(planRecoveryV1({ paneId: "w1:p2", worktreePath: null, agentStatus: "unknown" })).toEqual({
      ok: true,
      status: "cleanup-required",
      steps: [{ kind: "inspect-pane", target: "w1:p2", requiresHuman: true }],
    });
  });

  test("OPS01_CLEANUP_BLOCKED: dirty unmerged leased and mismatched resources fail closed", () => {
    const base = {
      repository: "VerstandTech/dotfiles",
      worktreePath: "/workspace/task",
      branch: "feat/task",
      candidateSha: SHA,
      observedCandidateSha: SHA,
      mergeSha: MERGE,
      merged: true,
      clean: true,
      writerLeaseActive: false,
      paneId: "w1:p2",
      paneCurrent: true,
    };
    for (const change of [
      { clean: false },
      { merged: false },
      { writerLeaseActive: true },
      { observedCandidateSha: MERGE },
      { paneCurrent: false },
    ]) {
      expect(planCleanupV1({ ...base, ...change })).toMatchObject({ ok: true, status: "blocked" });
    }
  });

  test("OPS01_CLEANUP_ORDER: exact facts produce planner-only stop-on-failure steps", () => {
    const result = planCleanupV1({
      repository: "VerstandTech/dotfiles",
      worktreePath: "/workspace/task",
      branch: "feat/task",
      candidateSha: SHA,
      observedCandidateSha: SHA,
      mergeSha: MERGE,
      merged: true,
      clean: true,
      writerLeaseActive: false,
      paneId: "w1:p2",
      paneCurrent: true,
    });
    expect(result).toMatchObject({ ok: true, status: "ready", executes: false });
    expect(result.steps.map((step: { kind: string }) => step.kind)).toEqual([
      "release-agent",
      "close-pane",
      "remove-worktree",
      "delete-local-branch",
      "delete-remote-branch-if-exact",
      "clear-exact-lease",
      "verify-cleanup",
    ]);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.steps)).toBe(true);
  });

  test("OPS01_HOSTILE_INPUT: accessors are never invoked and errors do not echo", () => {
    let reads = 0;
    const input: Record<string, unknown> = {};
    Object.defineProperty(input, "kind", { enumerable: true, get() { reads += 1; return "timeout"; } });
    const result = resolveWaitOutcomeV1(input);
    expect(reads).toBe(0);
    expect(result).toEqual({ ok: false, code: "invalid-operator-input" });
  });
});

import { describe, expect, test } from "bun:test";

import { planCleanupV1, planRecoveryV1, resolveWaitOutcomeV1 } from "../.pi/agent/personal/lib/operator/operator-control";

const SHA = "a".repeat(40);
const MERGE = "b".repeat(40);

const READY = {
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

describe("OPS-01 conservative cleanup and recovery", () => {
  test("timeout remains unknown and cannot claim completion", () => {
    expect(resolveWaitOutcomeV1({ kind: "timeout" })).toEqual({ ok: true, status: "unknown" });
  });

  test("partial pane launch plans inspection without execution", () => {
    expect(planRecoveryV1({ paneId: "w1:p2", worktreePath: null, agentStatus: "unknown" })).toMatchObject({
      ok: true,
      status: "cleanup-required",
    });
  });

  test("cleanup plan is ordered, immutable, and planner-only", () => {
    const result = planCleanupV1(READY) as any;
    expect(result.status).toBe("ready");
    expect(result.executes).toBe(false);
    expect(result.steps.map((step: any) => step.kind)).toEqual([
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

  test("dirty or leased worktree is blocked", () => {
    expect(planCleanupV1({ ...READY, clean: false })).toMatchObject({ ok: true, status: "blocked" });
    expect(planCleanupV1({ ...READY, writerLeaseActive: true })).toMatchObject({ ok: true, status: "blocked" });
  });
});

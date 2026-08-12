import { describe, expect, test } from "bun:test";

type Api = typeof import("../../agents-shared/.agents/adapters/pi/personal/lib/e2e/golden-workflow");
let api: Api;
try { api = await import("../../agents-shared/.agents/adapters/pi/personal/lib/e2e/golden-workflow"); }
catch { api = { evaluateGoldenWorkflowV1: () => { throw new Error("E2E01_GOLDEN_WORKFLOW_MISSING"); } } as unknown as Api; }

const fp = "a".repeat(64);
const base = () => ({
  schemaVersion: 1,
  storyId: "harmless-fixture",
  candidateFingerprint: fp,
  phases: ["discovery", "formulation", "causal-red", "covering-green", "verify"],
  roles: {
    designer: { roleId: "designer-1", contextId: "context-designer", worktree: "/tmp/e2e-designer" },
    implementer: { roleId: "implementer-1", contextId: "context-implementer", worktree: "/tmp/e2e-implementer" },
    reviewer: { roleId: "reviewer-1", contextId: "context-reviewer" },
  },
  red: { testId: "E2E01_HARMLESS_BEHAVIOR", failureSignature: "expected blocked, received ready" },
  green: { testId: "E2E01_HARMLESS_BEHAVIOR", coversRed: true },
  security: { status: "passed", fingerprint: fp, rawSecretPresent: false },
  budget: { status: "passed", fingerprint: fp, usage: "known", factsCurrent: true, hardExceeded: false, confirmationRequired: false, postConfirmationRefreshed: true },
  gates: ["bdd", "unit", "integration", "security", "trajectory", "decision", "budget"].map((gate) => ({ gate, status: "passed", fingerprint: fp, current: true })),
  trajectory: { status: "passed", fingerprint: fp, contiguous: true, antiPatternHits: [] },
  review: { status: "passed", fingerprint: fp, reviewerRoleId: "reviewer-1", blockerCount: 0, undispositionedCount: 0 },
  approval: { status: "approved", source: "human-tui", fingerprint: fp, action: "approve-exact-diff", risk: "project-file-mutation", effect: "ready-for-human-merge", paths: ["fixture/harmless.txt"], current: true },
  blockers: [],
  cleanup: { mergeStatus: "merged", remoteHeadAgrees: true, gatesCurrent: true, leaseReleased: true, liveOwnedProcess: false, resourcesOwned: true, executes: false },
  startup: { status: "available", advisoryOnly: false },
  requestedOperations: [],
});

const evaluate = (overrides: Record<string, unknown> = {}) => api.evaluateGoldenWorkflowV1({ ...base(), ...overrides });

describe("E2E-01 golden high-assurance workflow", () => {
  test("E2E01_GOLDEN_WORKFLOW_MISSING: complete story stops at human merge readiness", () => {
    const first = evaluate();
    const second = evaluate();
    expect(first).toEqual(second);
    expect(first).toMatchObject({ ok: true, status: "ready-for-human-merge", executes: false, candidateFingerprint: fp });
    expect(Object.isFrozen(first)).toBe(true);
  });

  test.each([
    ["blocker", { blockers: ["simulated-blocker"] }, "blocker-present"],
    ["phase order", { phases: ["discovery", "causal-red", "formulation", "covering-green", "verify"] }, "phase-order-invalid"],
    ["shared role", { roles: { ...base().roles, implementer: { roleId: "designer-1", contextId: "context-implementer", worktree: "/tmp/e2e-implementer" } } }, "role-isolation-invalid"],
    ["worktree collision", { roles: { ...base().roles, implementer: { roleId: "implementer-1", contextId: "context-implementer", worktree: "/tmp/e2e-designer" } } }, "worktree-isolation-invalid"],
    ["unrelated green", { green: { testId: "OTHER", coversRed: true } }, "covering-green-invalid"],
    ["secret", { security: { ...base().security, rawSecretPresent: true } }, "security-evidence-invalid"],
    ["unknown budget", { budget: { ...base().budget, usage: "unknown" } }, "budget-evidence-invalid"],
    ["stale budget refresh", { budget: { ...base().budget, confirmationRequired: true, postConfirmationRefreshed: false } }, "budget-evidence-invalid"],
    ["bad trajectory", { trajectory: { ...base().trajectory, contiguous: false } }, "trajectory-invalid"],
    ["review blocker", { review: { ...base().review, blockerCount: 1 } }, "review-evidence-invalid"],
    ["stale approval", { approval: { ...base().approval, current: false } }, "approval-evidence-invalid"],
    ["cleanup active lease", { cleanup: { ...base().cleanup, leaseReleased: false } }, "cleanup-refused"],
    ["startup unavailable", { startup: { status: "child-startup-unavailable", advisoryOnly: true } }, "child-startup-unavailable"],
    ["live operation", { requestedOperations: ["live-fleet"] }, "operator-approval-required"],
  ])("blocks %s", (_name, mutation, code) => {
    expect(evaluate(mutation as Record<string, unknown>)).toEqual({ ok: false, status: "blocked", code, executes: false });
  });

  test("mixed gate fingerprints fail closed", () => {
    const gates = base().gates.map((gate, index) => index === 2 ? { ...gate, fingerprint: "b".repeat(64) } : gate);
    expect(evaluate({ gates })).toEqual({ ok: false, status: "blocked", code: "candidate-fingerprint-mismatch", executes: false });
  });

  test("hostile objects are refused without invoking accessors", () => {
    let reads = 0;
    const input = base() as Record<string, unknown>;
    Object.defineProperty(input, "storyId", { enumerable: true, get() { reads += 1; return "harmless-fixture"; } });
    expect(api.evaluateGoldenWorkflowV1(input)).toEqual({ ok: false, status: "blocked", code: "fixture-invalid", executes: false });
    expect(reads).toBe(0);
    expect(api.evaluateGoldenWorkflowV1({ ...base(), unknown: true } as any)).toEqual({ ok: false, status: "blocked", code: "fixture-invalid", executes: false });
  });
});

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
  startup: { status: "available", advisoryOnly: false },
  requestedOperations: [],
});

const componentInputs = () => ({
  budget: { policy: { profile: "strict", costBudget: { maxTokens: 1000 }, maxChildren: 2, hardBudgetOnUnknown: true }, usage: { tokens: 10 }, childCount: 1 },
  security: { story: "harmless-fixture", observations: ["secret", "sast", "sca", "license"].map((slot) => ({ slot, status: "successful", executorKind: "argv", trustTier: "trusted", candidateSha: fp, inventoryFingerprint: fp })) },
  trajectory: { run: { version: 1, runId: "e2e-run", taskId: "e2e-task", goal: "golden", startedAt: "2026-08-12T00:00:00.000Z", outcome: "success", events: [
    { seq: 1, at: "t", kind: "phase_change", data: { phase: "red", testId: "E2E01_HARMLESS_BEHAVIOR", failureSignature: "expected blocked, received ready" } },
    { seq: 2, at: "t", kind: "tool_call", tool: "bdd_assert_red" },
    { seq: 3, at: "t", kind: "tool_call", tool: "edit" },
    { seq: 4, at: "t", kind: "tool_call", tool: "bdd_assert_green" },
  ] }, assertions: [{ id: "causal-red-green", description: "red before implementation and green", requiredTools: ["bdd_assert_red", "bdd_assert_green"], matchMode: "subset" }] },
  cleanup: {
    preMerge: { repository: "VerstandTech/dotfiles", worktreePath: "/workspace/e2e01", branch: "feat/e2e01", candidateSha: "a".repeat(40), observedCandidateSha: "a".repeat(40), mergeSha: null, merged: null, clean: true, writerLeaseActive: true, paneId: "w1:p1", paneCurrent: true },
    postMerge: { repository: "VerstandTech/dotfiles", worktreePath: "/workspace/e2e01", branch: "feat/e2e01", candidateSha: "a".repeat(40), observedCandidateSha: "a".repeat(40), mergeSha: "b".repeat(40), merged: true, clean: true, writerLeaseActive: false, paneId: "w1:p1", paneCurrent: true },
  },
});
const evaluate = (overrides: Record<string, unknown> = {}, inputOverrides: Record<string, unknown> = {}) => api.evaluateGoldenWorkflowV1({ fixture: { ...base(), ...overrides }, componentInputs: { ...componentInputs(), ...inputOverrides } });

describe("E2E-01 golden high-assurance workflow", () => {
  test("E2E01_INTERNAL_COMPOSITION: complete story stops at human merge readiness", async () => {
    const first = await evaluate();
    const second = await evaluate();
    expect(first).toEqual(second);
    expect(first).toMatchObject({ ok: true, status: "ready-for-human-merge", executes: false, candidateFingerprint: fp });
    expect(Object.isFrozen(first)).toBe(true);
    expect((first as any).componentEvidence).toEqual({ security: "RED-01", budget: "BUD-01", trajectory: "OBS-01", decision: "DEC-01", fitness: "FIT-01", approval: "APR-01", cleanup: "OPS-01" });
    expect(Object.isFrozen((first as any).componentEvidence)).toBe(true);
    expect((first as any).fitnessEvidence).toEqual({ internalAdapters: ["budget", "decision", "security", "trajectory"], resultsFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/) });
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
    ["unsafe approval path", { approval: { ...base().approval, paths: ["../victim"] } }, "approval-evidence-invalid"],

    ["undispositioned review", { review: { ...base().review, undispositionedCount: 1 } }, "review-evidence-invalid"],
    ["stale required gate", { gates: base().gates.map((gate) => gate.gate === "unit" ? { ...gate, current: false } : gate) }, "fitness-evidence-invalid"],

    ["startup unavailable", { startup: { status: "child-startup-unavailable", advisoryOnly: true } }, "child-startup-unavailable"],
    ["live operation", { requestedOperations: ["live-fleet"] }, "operator-approval-required"],
  ])("blocks %s", async (_name, mutation, code) => {
    expect(await evaluate(mutation as Record<string, unknown>)).toEqual({ ok: false, status: "blocked", code, executes: false });
  });

  test("gate duplicates cannot stand in for the complete required set", async () => {
    const gates = base().gates.map((gate) => gate.gate === "budget" ? { ...gate, gate: "bdd" } : gate);
    expect(await evaluate({ gates })).toEqual({ ok: false, status: "blocked", code: "fitness-evidence-invalid", executes: false });
  });

  test("approval fingerprint mismatch is classified as approval evidence", async () => {
    expect(await evaluate({ approval: { ...base().approval, fingerprint: "b".repeat(64) } })).toEqual({ ok: false, status: "blocked", code: "approval-evidence-invalid", executes: false });
  });

  test("red identity is bound to the actual OBS trajectory event", async () => {
    const trajectory = componentInputs().trajectory as any;
    const events = trajectory.run.events.map((event: any) => event.seq === 1 ? { ...event, data: { phase: "red", testId: "OTHER", failureSignature: "unrelated" } } : event);
    expect(await evaluate({}, { trajectory: { ...trajectory, run: { ...trajectory.run, events } } })).toEqual({ ok: false, status: "blocked", code: "causal-red-invalid", executes: false });
  });

  test("SEC-01 scanner evidence is explicit and missing slots do not pass", async () => {
    expect(await evaluate({}, { security: { story: "harmless-fixture", observations: [] } })).toEqual({ ok: false, status: "blocked", code: "security-evidence-invalid", executes: false });
  });

  test("SEC and FIT proofs bind the exact fixture candidate fingerprint", async () => {
    const security = componentInputs().security as any;
    const observations = security.observations.map((observation: any) => ({ ...observation, candidateSha: "b".repeat(64), inventoryFingerprint: "b".repeat(64) }));
    expect(await evaluate({}, { security: { ...security, observations } })).toEqual({ ok: false, status: "blocked", code: "candidate-fingerprint-mismatch", executes: false });
  });

  test("mixed gate fingerprints fail closed", async () => {
    const gates = base().gates.map((gate, index) => index === 2 ? { ...gate, fingerprint: "b".repeat(64) } : gate);
    expect(await evaluate({ gates })).toEqual({ ok: false, status: "blocked", code: "candidate-fingerprint-mismatch", executes: false });
  });

  test("hostile objects are refused without invoking accessors", async () => {
    let reads = 0;
    const input = base() as Record<string, unknown>;
    Object.defineProperty(input, "storyId", { enumerable: true, get() { reads += 1; return "harmless-fixture"; } });
    const inputs = componentInputs();
    expect(await api.evaluateGoldenWorkflowV1({ fixture: input, componentInputs: inputs })).toEqual({ ok: false, status: "blocked", code: "fixture-invalid", executes: false });
    expect(reads).toBe(0);
    expect(await api.evaluateGoldenWorkflowV1({ fixture: { ...base(), unknown: true }, componentInputs: inputs } as any)).toEqual({ ok: false, status: "blocked", code: "fixture-invalid", executes: false });
  });

  test("E2E01_APR_FIT_COMPOSITION: self-asserted component labels cannot substitute for actual component results", async () => {
    expect(await api.evaluateGoldenWorkflowV1({ fixture: { ...base(), cleanup: { executes: false } }, componentInputs: componentInputs() } as any)).toEqual({ ok: false, status: "blocked", code: "fixture-invalid", executes: false });
  });

  test("named component failures remain authoritative", async () => {
    expect(await evaluate({ approval: { ...base().approval, status: "denied" } })).toEqual({ ok: false, status: "blocked", code: "approval-evidence-invalid", executes: false });
    expect(await evaluate({ gates: base().gates.map((gate) => gate.gate === "unit" ? { ...gate, status: "failed" } : gate) })).toEqual({ ok: false, status: "blocked", code: "fitness-evidence-invalid", executes: false });
    expect(await evaluate({}, { budget: { ...componentInputs().budget, usage: {} } })).toEqual({ ok: false, status: "blocked", code: "budget-evidence-invalid", executes: false });
    expect(await evaluate({}, { security: { token: "[REDACTED]]" } })).toEqual({ ok: false, status: "blocked", code: "security-evidence-invalid", executes: false });
    expect(await evaluate({}, { trajectory: { ...componentInputs().trajectory, run: { ...componentInputs().trajectory.run, events: [{ seq: 1, at: "t", kind: "phase_change", data: { phase: "green" } }] } } })).toEqual({ ok: false, status: "blocked", code: "causal-red-invalid", executes: false });
    const cleanup = componentInputs().cleanup as any;
    expect(await evaluate({}, { cleanup: { ...cleanup, postMerge: { ...cleanup.postMerge, writerLeaseActive: true } } })).toEqual({ ok: false, status: "blocked", code: "cleanup-refused", executes: false });
  });
});

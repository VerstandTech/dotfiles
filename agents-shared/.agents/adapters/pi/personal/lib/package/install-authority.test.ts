import { describe, expect, test } from "bun:test";

import { normalizeApprovalRequestV1 } from "../approvals/validation";
import { planCanonicalInstallV1 } from "./canonical-plan";
import { createPackageDescriptorV1 } from "./package-descriptor";

type Api = typeof import("./install-authority");
let api: Api;
try { api = await import("./install-authority"); }
catch { api = { authorizeInstallPlanV1: async () => { throw new Error("PKG01_APR_INSTALL_AUTHORITY_MISSING"); } } as unknown as Api; }

const request = {
  schemaVersion: 1 as const,
  kind: "approval-request" as const,
  requestId: "pkg01-install-1",
  approvalKind: "risky-action" as const,
  action: "apply-pkg01-install-plan",
  risk: "home-link-mutation",
  effect: "authorize-exact-install-plan",
  paths: [".pi/agent/personal"],
  headSha: "a".repeat(40),
  planFingerprint: "1".repeat(64),
  actionFingerprint: "2".repeat(64),
  sessionId: "session-pkg01",
  generation: 1,
  createdAt: "2026-08-12T10:00:00.000Z",
  expiresAt: "2026-08-12T11:00:00.000Z",
};

function adapters(req = request) {
  const normalized = normalizeApprovalRequestV1(req).request;
  const record = {
    schemaVersion: 1,
    recordType: "approval-authority-record",
    request: normalized,
    scopeFingerprint: normalized.scopeFingerprint,
    decision: "approved",
    decidedAt: "2026-08-12T10:01:00.000Z",
    authority: { source: "human-tui", method: "pi-tui-confirm-select", sessionId: req.sessionId, generation: req.generation, machineLocal: true },
  };
  return {
    clock: () => "2026-08-12T10:02:00.000Z",
    lifecycle: { active: true, sessionId: req.sessionId, generation: req.generation },
    store: {
      read: async () => ({
        ok: true,
        revision: "revision-1",
        facts: {
          schemaVersion: 1,
          storePath: "/Users/operator/.pi/authority/approvals.json",
          storeRealPath: "/Users/operator/.pi/authority/approvals.json",
          projectRoot: "/workspace/project",
          projectRealPath: "/workspace/project",
          exists: true,
          mode: 0o600,
          regularFile: true,
          symbolicLink: false,
          hardLinkCount: 1,
          noFollow: true,
          atomicReplace: true,
          parentDirectorySafe: true,
          machineLocal: true,
        },
        value: { schemaVersion: 1, records: [record] },
      }),
      commit: async () => ({ ok: false }),
    },
  };
}

const descriptor = createPackageDescriptorV1({ manifestFingerprint: "3".repeat(64), resourceFingerprint: "4".repeat(64), targets: request.paths });
const plan = planCanonicalInstallV1({ descriptor, staged: { schemaVersion: 1, status: "verified", verifier: "verify-ai-resources-v1", host: "macos", stagingRoot: "/tmp/pkg01", manifestFingerprint: descriptor.manifestFingerprint, resourceFingerprint: descriptor.resourceFingerprint, targets: descriptor.targets }, targets: request.paths.map((path) => ({ path, state: "absent", resolvedWithinRoot: true, ancestorsWithinRoot: true, factsCurrent: true })) });
const boundRequest = { ...request, planFingerprint: plan.installPlanFingerprint };

describe("PKG-01 APR-bound install readiness", () => {
  test("PKG01_APR_INSTALL_AUTHORITY_MISSING: only current APR-01 approval authorizes exact plan", async () => {
    const approved = {
      schemaVersion: 1,
      authority: "apr-01",
      authorityScope: "approval-only",
      ok: true,
      outcome: "approved",
      code: "APR01_APPROVED",
      current: true,
      requestId: request.requestId,
      approvalKind: request.approvalKind,
      scopeFingerprint: "3".repeat(64),
      headSha: request.headSha,
      sessionId: request.sessionId,
      generation: request.generation,
      decidedAt: "2026-08-12T10:01:00.000Z",
      expiresAt: request.expiresAt,
    };
    expect(await api.authorizeInstallPlanV1({ request: boundRequest, plan }, adapters(boundRequest))).toMatchObject({ ok: true, status: "approved", authority: "apr-01", planFingerprint: plan.installPlanFingerprint });
  });

  test("approval semantics and exact paths must describe canonical install", async () => {
    const wrong = { ...request, action: "review-candidate", paths: ["docs/readme.md"] };
    expect(await api.authorizeInstallPlanV1({ request: wrong, plan }, adapters(wrong))).toEqual({ ok: false, status: "blocked", code: "plan-mismatch" });
  });

  test("model literals stale scope and mismatched plan never authorize", async () => {
    expect(await api.authorizeInstallPlanV1({ request: boundRequest, plan }, {})).toEqual({ ok: false, status: "blocked", code: "approval-required" });
    expect(await api.authorizeInstallPlanV1({ request, plan }, adapters())).toEqual({ ok: false, status: "blocked", code: "plan-mismatch" });
  });
});

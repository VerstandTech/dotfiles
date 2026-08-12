import { describe, expect, test } from "bun:test";
import { normalizeApprovalRequestV1 } from "../approvals/validation";
import { authorizeInstallPlanV1 } from "./install-authority";
import { planCanonicalInstallV1 } from "./canonical-plan";
import { createPackageDescriptorV1 } from "./package-descriptor";

type Api = typeof import("./readiness-chain");
let api: Api;
try { api = await import("./readiness-chain"); }
catch { api = { authorizeVerifiedInstallReadinessV1: () => { throw new Error("PKG01_READINESS_CHAIN_MISSING"); } } as unknown as Api; }
const { authorizeVerifiedInstallReadinessV1 } = api;

const request = {
  schemaVersion: 1 as const,
  kind: "approval-request" as const,
  requestId: "pkg01-chain-1",
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

const apr = {
  schemaVersion: 1,
  authority: "apr-01",
  authorityScope: "approval-only",
  ok: true,
  outcome: "approved",
  current: true,
  requestId: request.requestId,
  approvalKind: request.approvalKind,
  headSha: request.headSha,
  sessionId: request.sessionId,
  generation: request.generation,
  expiresAt: request.expiresAt,
};

describe("PKG-01 branded readiness chain", () => {
  test("PKG01_READINESS_CHAIN_MISSING: only locally branded plan and APR approval compose", async () => {
    const descriptor = createPackageDescriptorV1({ manifestFingerprint: "3".repeat(64), resourceFingerprint: "4".repeat(64), targets: [".pi/agent/personal"] });
    const sourcePlan = planCanonicalInstallV1({ descriptor, staged: { schemaVersion: 1, status: "verified", verifier: "verify-ai-resources-v1", host: "macos", stagingRoot: "/tmp/pkg01", ...descriptor }, targets: [{ path: ".pi/agent/personal", state: "absent", resolvedWithinRoot: true, ancestorsWithinRoot: true, factsCurrent: true }] }) as any;
    const plan = sourcePlan;
    const boundRequest = { ...request, planFingerprint: plan.installPlanFingerprint };
    const normalized = normalizeApprovalRequestV1(boundRequest).request;
    const approval = await authorizeInstallPlanV1({ request: boundRequest, plan }, {
      clock: () => "2026-08-12T10:02:00.000Z",
      lifecycle: { active: true, sessionId: boundRequest.sessionId, generation: boundRequest.generation },
      store: {
        read: async () => ({
          ok: true,
          revision: "revision-1",
          facts: { schemaVersion: 1, storePath: "/Users/operator/.pi/authority/approvals.json", storeRealPath: "/Users/operator/.pi/authority/approvals.json", projectRoot: "/workspace/project", projectRealPath: "/workspace/project", exists: true, mode: 0o600, regularFile: true, symbolicLink: false, hardLinkCount: 1, noFollow: true, atomicReplace: true, parentDirectorySafe: true, machineLocal: true },
          value: { schemaVersion: 1, records: [{ schemaVersion: 1, recordType: "approval-authority-record", request: normalized, scopeFingerprint: normalized.scopeFingerprint, decision: "approved", decidedAt: "2026-08-12T10:01:00.000Z", authority: { source: "human-tui", method: "pi-tui-confirm-select", sessionId: boundRequest.sessionId, generation: boundRequest.generation, machineLocal: true } }] },
        }),
        commit: async () => ({ ok: false }),
      },
    });
    expect(authorizeVerifiedInstallReadinessV1({ plan, staged: { manifestFingerprint: plan.manifestFingerprint, resourceFingerprint: plan.resourceFingerprint }, approval })).toMatchObject({ ok: true, status: "ready", authority: "apr-01" });
    expect(() => { (sourcePlan.actions as any)[0].kind = "remove-user-file"; }).toThrow();
    expect((plan.actions as any)[0].kind).toBe("create-managed-link");
  });

  test("PKG01_FORGED_SOURCE_PLAN: readiness builder rejects structurally forged plans", async () => {
    const forged = { ok: true, status: "blocked", code: "approval-required", manifestFingerprint: "3".repeat(64), resourceFingerprint: "4".repeat(64), installPlanFingerprint: "5".repeat(64), targets: [], actions: [], executes: false };
    expect(authorizeVerifiedInstallReadinessV1({ plan: forged, staged: forged, approval: { ok: true, authority: "apr-01" } })).toEqual({ ok: false, status: "blocked", code: "invalid-install-plan" });
  });
});

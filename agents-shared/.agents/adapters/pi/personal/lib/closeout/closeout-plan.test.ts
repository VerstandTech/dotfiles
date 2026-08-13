import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const repo = resolve(import.meta.dir, "../../../../../../..");
const handoffPath = resolve(repo, "docs/plans/work-packages/OPS-01-package-turn-handoff.md");

type Api = typeof import("./closeout-plan");
let api: Api;
try { api = await import("./closeout-plan"); }
catch { api = { planOpsEvidenceV1: () => { throw new Error("CLOSE01_OPS_EVIDENCE_MISSING"); }, planLivePackageAcceptanceV1: () => { throw new Error("CLOSE01_LIVE_PACKAGE_MISSING"); }, planReviewFleetV1: () => { throw new Error("CLOSE01_REVIEW_FLEET_MISSING"); } } as unknown as Api; }

describe("CLOSE-01 remaining closeout planners", () => {
  test("CLOSE01_OPS_EVIDENCE_MISSING: reconstructs OPS evidence without inventing red/green", () => {
    const result = api.planOpsEvidenceV1({
      packageId: "OPS-01",
      merged: true,
      rootGreen: true,
      historicalRedGreenAvailable: false,
      acceptanceRef: "docs/plans/work-packages/OPS-01.feature",
    });
    expect(result).toMatchObject({ ok: true, status: "recorded", red: "missing", green: "missing", historicalRedGreen: "unknown", acceptanceRef: "docs/plans/work-packages/OPS-01.feature" });
  });

  test("OPS01_HISTORICAL_RED_GREEN_UNINVENTABLE: caller flag cannot mint recorded red/green", () => {
    const result = api.planOpsEvidenceV1({
      packageId: "OPS-01",
      merged: true,
      rootGreen: true,
      historicalRedGreenAvailable: true,
      acceptanceRef: "docs/plans/work-packages/OPS-01.feature",
    });
    expect(result).toMatchObject({ ok: true, status: "recorded", red: "missing", green: "missing", historicalRedGreen: "unknown" });
    expect(result).not.toMatchObject({ red: "recorded" });
    expect(result).not.toMatchObject({ green: "recorded" });
  });

  test("OPS01_PACKAGE_TURN_HANDOFF_HONEST: reconstruction keeps lost red/green missing", () => {
    const handoff = readFileSync(handoffPath, "utf8");
    expect(handoff).toContain("- **Red:** _(missing)_");
    expect(handoff).toContain("- **Green:** _(missing)_");
    expect(handoff).toContain("Historical package-turn red/green remain missing");
    expect(handoff).not.toMatch(/\*\*Red:\*\* `[^`]+` → exit /);
    expect(handoff).not.toMatch(/\*\*Green:\*\* `[^`]+` → exit /);
  });

  test("CLOSE01_LIVE_PACKAGE_MISSING: live package actions stay blocked without a named approved target", () => {
    expect(api.planLivePackageAcceptanceV1({ operation: "second-machine-install" })).toEqual({ ok: false, status: "blocked", code: "operator-approval-required", executes: false });
    expect(api.planLivePackageAcceptanceV1({ operation: "product-repo-adoption" })).toEqual({ ok: false, status: "blocked", code: "operator-approval-required", executes: false });
  });

  test("CLOSE01_REVIEW_FLEET_MISSING: review fleet stays blocked without current approval and backend evidence", () => {
    expect(api.planReviewFleetV1({ operatorApproved: false, backendEvidenceCurrent: false })).toEqual({ ok: false, status: "blocked", code: "operator-approval-required", executes: false });
    expect(api.planReviewFleetV1({ operatorApproved: true, backendEvidenceCurrent: true })).toEqual({ ok: false, status: "blocked", code: "operator-approval-required", executes: false });
  });

  test("CLOSE01_NAMED_APPROVAL_REQUIRED: ready paths need explicit named target and approval id", () => {
    expect(api.planLivePackageAcceptanceV1({ operation: "second-machine-install", approvedTarget: "any-string" })).toEqual({ ok: false, status: "blocked", code: "operator-approval-required", executes: false });
    expect(api.planReviewFleetV1({ operatorApproved: true, backendEvidenceCurrent: true, approvalId: "apr-close01", backendEvidenceRef: "sec-01-current" })).toMatchObject({ ok: true, status: "ready", executes: false, lenses: ["architecture", "security", "operator"] });
    expect(api.planLivePackageAcceptanceV1({ operation: "second-machine-install", approvedTarget: "host:macos-spare", approvalId: "apr-close01-c4" })).toMatchObject({ ok: true, status: "ready", executes: false, target: "host:macos-spare" });
  });

  test("CLOSE01_AUTHORITY_REFUSAL: closeout refuses invented merge cleanup budget and lease claims", () => {
    expect(api.refuseInventedAuthorityV1({ claim: "merge" })).toMatchObject({ ok: false, status: "blocked", code: "authority-escalation-refused", executes: false });
    expect(api.refuseInventedAuthorityV1({ claim: "cleanup-execution" })).toMatchObject({ ok: false, status: "blocked", code: "authority-escalation-refused", executes: false });
    expect(api.refuseInventedAuthorityV1({ claim: "budget-increase" })).toMatchObject({ ok: false, status: "blocked", code: "authority-escalation-refused", executes: false });
    expect(api.refuseInventedAuthorityV1({ claim: "foreign-lease-release" })).toMatchObject({ ok: false, status: "blocked", code: "authority-escalation-refused", executes: false });
  });
});

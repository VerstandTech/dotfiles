import { describe, expect, test } from "bun:test";
import { createPackageDescriptorV1 } from "./package-descriptor";

type Api = typeof import("./canonical-plan");
let api: Api;
try { api = await import("./canonical-plan"); }
catch { api = { planCanonicalInstallV1: () => { throw new Error("PKG01_CANONICAL_PLAN_MISSING"); }, createInstalledTransactionFromReadyV1: () => { throw new Error("PKG01_CANONICAL_PLAN_MISSING"); } } as unknown as Api; }
const { planCanonicalInstallV1, createInstalledTransactionFromReadyV1 } = api;

const staged = { schemaVersion: 1, status: "verified", verifier: "verify-ai-resources-v1", host: "macos", stagingRoot: "/tmp/pkg01", manifestFingerprint: "1".repeat(64), resourceFingerprint: "2".repeat(64), targets: [".pi/agent/personal"] };

describe("PKG-01 canonical plan domain", () => {
  test("PKG01_CANONICAL_PLAN_MISSING: real descriptor stages and plans in one fingerprint domain", () => {
    const descriptor = createPackageDescriptorV1(staged);
    const plan = planCanonicalInstallV1({ descriptor, staged, targets: [{ path: ".pi/agent/personal", state: "absent", resolvedWithinRoot: true, ancestorsWithinRoot: true, factsCurrent: true }] });
    expect(plan).toMatchObject({ code: "approval-required", manifestFingerprint: staged.manifestFingerprint, resourceFingerprint: staged.resourceFingerprint });
    expect(() => { (plan.targets as any)[0].path = "other/path"; }).toThrow();
    expect((plan.targets as any)[0].path).toBe(".pi/agent/personal");
  });

  test("PKG01_TARGET_ACCESSOR_TOCTOU: accessor targets are refused without reads", () => {
    let reads = 0;
    const target: Record<string, unknown> = { state: "absent", resolvedWithinRoot: true, ancestorsWithinRoot: true, factsCurrent: true };
    Object.defineProperty(target, "path", { enumerable: true, get() { reads += 1; return reads === 1 ? ".pi/agent/personal" : "victim"; } });
    const descriptor = createPackageDescriptorV1(staged);
    expect(() => planCanonicalInstallV1({ descriptor, staged, targets: [target] })).toThrow("invalid-canonical-plan");
    expect(reads).toBe(0);
  });

  test("installed transaction can only mint from branded ready result", () => {
    expect(() => createInstalledTransactionFromReadyV1({ status: "ready" } as any, "tx-1")).toThrow("apply-evidence-required");
  });
});

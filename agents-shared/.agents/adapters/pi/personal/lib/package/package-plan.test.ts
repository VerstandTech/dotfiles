import { describe, expect, test } from "bun:test";
import * as api from "./package-plan";

const PINS = { "pi-subagents": "0.45.2", rulesync: "16.9.1" };
const RESOURCES = [
  { source: "agents-shared/.agents/adapters/pi/personal", target: ".pi/agent/personal", hash: "a".repeat(64) },
  { source: "pi/.pi/agent/settings.json", target: ".pi/agent/settings.json", hash: "b".repeat(64) },
];

function input(overrides: Record<string, unknown> = {}) {
  return { schemaVersion: 1, packageVersion: "0.7.3", approvedPins: PINS, observedPins: PINS, resources: RESOURCES, ...overrides };
}

describe("PKG-01 pure package descriptor", () => {
  test("exact pins and resources produce deterministic frozen descriptor", () => {
    const a = api.planPackageV1(input({ resources: [...RESOURCES].reverse() }));
    const b = api.planPackageV1(input());
    expect(a).toEqual(b);
    expect(a).toMatchObject({ ok: true, status: "valid", manifest: { schemaVersion: 1, packageVersion: "0.7.3" } });
    expect(Object.isFrozen(a)).toBe(true);
  });

  test("pin drift unsafe overlapping paths and oversized maps fail closed", () => {
    expect(api.planPackageV1(input({ observedPins: { ...PINS, extra: "1.0.0" } }))).toEqual({ ok: false, code: "pin-mismatch" });
    for (const target of [".", "a\\b", "a\u0000b"]) {
      expect(api.planPackageV1(input({ resources: [{ ...RESOURCES[0], target }] }))).toEqual({ ok: false, code: "invalid-package-input" });
    }
    expect(api.planPackageV1(input({ resources: [{ ...RESOURCES[0], target: ".pi" }, RESOURCES[1]] }))).toEqual({ ok: false, code: "invalid-package-input" });
  });

  test("hostile accessors and proxies do not escape", () => {
    let reads = 0;
    const hostile: Record<string, unknown> = {};
    Object.defineProperty(hostile, "schemaVersion", { enumerable: true, get() { reads += 1; return 1; } });
    expect(api.planPackageV1(hostile)).toEqual({ ok: false, code: "invalid-package-input" });
    expect(reads).toBe(0);
    const proxy = new Proxy({}, { ownKeys() { throw new Error("secret"); } });
    expect(() => api.planPackageV1(proxy)).not.toThrow();
    expect(api.planPackageV1(proxy)).toEqual({ ok: false, code: "invalid-package-input" });
  });

  test("PKG01_SPLIT_LIFECYCLE_API: legacy structural lifecycle planners are absent", () => {
    expect((api as any).planInstallV1).toBeUndefined();
    expect((api as any).planDisableV1).toBeUndefined();
    expect((api as any).planRollbackV1).toBeUndefined();
  });
});

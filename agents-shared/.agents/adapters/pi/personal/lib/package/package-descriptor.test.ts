import { describe, expect, test } from "bun:test";

type Api = typeof import("./package-descriptor");
let api: Api;
try { api = await import("./package-descriptor"); }
catch { api = { createPackageDescriptorV1: () => { throw new Error("PKG01_BRANDED_DESCRIPTOR_MISSING"); }, isPackageDescriptorV1: () => false } as unknown as Api; }

describe("PKG-01 branded canonical descriptor", () => {
  test("PKG01_BRANDED_DESCRIPTOR_MISSING: exact manifest package object mints local descriptor", () => {
    const value = { manifestFingerprint: "1".repeat(64), resourceFingerprint: "2".repeat(64), targets: [".pi/agent/personal"] };
    const descriptor = api.createPackageDescriptorV1(value);
    expect(api.isPackageDescriptorV1(descriptor)).toBe(true);
    expect(api.isPackageDescriptorV1(structuredClone(descriptor))).toBe(false);
  });

  test("PKG01_TARGET_COLLISION: control and filesystem-equivalent targets are rejected", () => {
    expect(() => api.createPackageDescriptorV1({ manifestFingerprint: "1".repeat(64), resourceFingerprint: "2".repeat(64), targets: ["a\u0000b", "c"] })).toThrow("invalid-package-descriptor");
    for (const targets of [["a/b", "a//b"], ["a/b", "a/./b"], ["a/b", "a/b"]]) {
      expect(() => api.createPackageDescriptorV1({ manifestFingerprint: "1".repeat(64), resourceFingerprint: "2".repeat(64), targets })).toThrow("invalid-package-descriptor");
    }
  });
});

import { describe, expect, test } from "bun:test";

type PackageApi = typeof import("./package-plan");
let api: PackageApi;
try {
  api = await import("./package-plan");
} catch {
  const missing = () => { throw new Error("PKG01_PACKAGE_PLAN_MISSING"); };
  api = { planPackageV1: missing, planInstallV1: missing, planDisableV1: missing, planRollbackV1: missing } as unknown as PackageApi;
}

const { planPackageV1, planInstallV1, planDisableV1, planRollbackV1 } = api;
const PINS = { "pi-subagents": "0.45.2", "rulesync": "7.5.1" };
const RESOURCES = [
  { source: "agents-shared/.agents/adapters/pi/personal", target: ".pi/agent/personal", hash: "a".repeat(64) },
  { source: "herdr/.config/herdr/config.toml", target: ".config/herdr/config.toml", hash: "b".repeat(64) },
];

function packageInput(overrides: Record<string, unknown> = {}) {
  return { schemaVersion: 1, packageVersion: "1.0.0", approvedPins: PINS, observedPins: PINS, resources: RESOURCES, ...overrides };
}

describe("PKG-01 reproducible package planning", () => {
  test("PKG01_PACKAGE_PLAN_MISSING: exact frozen pins produce deterministic manifest", () => {
    const a = planPackageV1(packageInput({ resources: [...RESOURCES].reverse() }));
    const b = planPackageV1(packageInput());
    expect(a).toEqual(b);
    expect(a).toMatchObject({ ok: true, status: "valid", manifest: { schemaVersion: 1, packageVersion: "1.0.0" } });
    expect(Object.isFrozen(a)).toBe(true);
    expect(Object.isFrozen((a as any).manifest.resources)).toBe(true);
  });

  test("PKG01_PIN_DRIFT: missing changed or extra pins block", () => {
    for (const observedPins of [
      { "pi-subagents": "0.45.1", rulesync: "7.5.1" },
      { "pi-subagents": "0.45.2" },
      { ...PINS, extra: "1.0.0" },
    ]) expect(planPackageV1(packageInput({ observedPins }))).toEqual({ ok: false, code: "pin-mismatch" });
  });

  test("PKG01_STAGING_REQUIRED: deployment cannot be ready without matching staged verification", () => {
    const manifest = (planPackageV1(packageInput()) as any).manifest;
    expect(planInstallV1({ manifest, staged: { verified: false }, targets: [] })).toMatchObject({ ok: true, status: "blocked", code: "staging-required" });
  });

  test("PKG01_DIRTY_PRESERVED: user files and foreign links require backup", () => {
    const manifest = (planPackageV1(packageInput()) as any).manifest;
    const result = planInstallV1({
      manifest,
      staged: { verified: true, fingerprint: manifest.fingerprint },
      targets: [
        { path: ".pi/agent/personal", state: "user-file" },
        { path: ".config/herdr/config.toml", state: "foreign-link" },
      ],
    }) as any;
    expect(result.status).toBe("ready");
    expect(result.executes).toBe(false);
    expect(result.actions.every((a: any) => a.kind === "backup-required")).toBe(true);
  });

  test("PKG01_UNSAFE_LINK: escaped staged targets are blocked", () => {
    const manifest = (planPackageV1(packageInput()) as any).manifest;
    expect(planInstallV1({
      manifest,
      staged: { verified: true, fingerprint: manifest.fingerprint },
      targets: [{ path: ".pi/agent/personal", state: "managed-link", resolvedWithinRoot: false }],
    })).toEqual({ ok: false, code: "unsafe-link" });
  });

  test("PKG01_DISABLE_SCOPED: disable removes managed links only", () => {
    expect(planDisableV1({ targets: [
      { path: ".pi/agent/personal", state: "managed-link" },
      { path: ".config/herdr/config.toml", state: "foreign-file" },
    ] })).toEqual({
      ok: true,
      status: "ready",
      executes: false,
      actions: [{ kind: "remove-managed-link", path: ".pi/agent/personal" }],
    });
  });

  test("PKG01_ROLLBACK_SCOPE: transaction mismatch blocks rollback", () => {
    expect(planRollbackV1({ expectedTransactionId: "tx-1", transactionId: "tx-2", paths: [] })).toEqual({ ok: true, status: "blocked", executes: false, actions: [] });
  });

  test("PKG01_HOSTILE: accessors are not invoked and refusal is non-echoing", () => {
    let reads = 0;
    const input: Record<string, unknown> = {};
    Object.defineProperty(input, "schemaVersion", { enumerable: true, get() { reads += 1; return 1; } });
    const result = planPackageV1(input);
    expect(reads).toBe(0);
    expect(result).toEqual({ ok: false, code: "invalid-package-input" });
  });
});

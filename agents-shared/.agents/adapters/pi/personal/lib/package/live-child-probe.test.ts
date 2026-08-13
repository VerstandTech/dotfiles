import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const repo = resolve(import.meta.dir, "../../../../../../..");
const pkg = JSON.parse(readFileSync(resolve(import.meta.dir, "../../package.json"), "utf8")) as { pi?: { extensions?: string[] } };

type Api = typeof import("./live-child-probe");
let api: Api;
try {
  api = await import("./live-child-probe");
} catch {
  api = {
    classifyLiveChildEvidenceV1: () => { throw new Error("ISSUE25_LIVE_CHILD_PROBE_MISSING"); },
    probeLiveChildDelegationV1: async () => { throw new Error("ISSUE25_LIVE_CHILD_PROBE_MISSING"); },
    isLoadedExtensionV1: () => { throw new Error("ISSUE25_LIVE_CHILD_PROBE_MISSING"); },
  } as unknown as Api;
}

describe("ISSUE-25 live child-delegation probe", () => {
  test("ISSUE25_TEST_EXTENSIONS_EXCLUDED: approval-seams tests are not loaded as extensions", async () => {
    const globs = pkg.pi?.extensions ?? [];
    expect(globs).toContain("./extensions/*.ts");
    expect(globs.some((glob) => glob.includes("!*.test.ts") || glob.includes("!**/*.test.ts"))).toBe(true);
    expect(api.isLoadedExtensionV1("extensions/agentic-fleet.ts", globs)).toBe(true);
    expect(api.isLoadedExtensionV1("extensions/approval-seams.test.ts", globs)).toBe(false);
    expect(existsSync(resolve(import.meta.dir, "../../extensions/approval-seams.test.ts"))).toBe(true);
  });

  test("ISSUE25_ADVISORY_PI_NE_NOT_CHILD: pi -ne advisory startup is child-startup-unavailable", () => {
    const result = api.classifyLiveChildEvidenceV1({
      command: ["pi", "-ne", "--offline", "--no-session", "--list-models"],
      status: 0,
      output: "gpt-4.1\n",
      loadedPersonalPackage: false,
      childIdentity: undefined,
    });
    expect(result).toMatchObject({
      ok: false,
      status: "blocked",
      code: "child-startup-unavailable",
      advisoryOnly: true,
      executes: false,
    });
    expect(result).not.toMatchObject({ code: "child-started" });
  });

  test("ISSUE25_UNDEFINED_PATH_NOT_SUCCESS: earlier agentic-fleet path failure stays unavailable", () => {
    const result = api.classifyLiveChildEvidenceV1({
      command: ["pi", "--offline", "--no-session", "--list-models"],
      status: 1,
      output: 'Failed to load extension agentic-fleet.ts: The "path" argument must be of type string. Received undefined',
      loadedPersonalPackage: true,
    });
    expect(result).toMatchObject({
      ok: false,
      status: "blocked",
      code: "child-startup-unavailable",
      advisoryOnly: false,
      executes: false,
    });
  });

  test("ISSUE25_PRODUCT_FLEET_BLOCKED: probe refuses a product fleet without claiming a child", () => {
    const result = api.classifyLiveChildEvidenceV1({
      requestedOperation: "product-fleet",
    });
    expect(result).toMatchObject({
      ok: false,
      status: "blocked",
      code: "operator-approval-required",
      executes: false,
    });
  });


  test("ISSUE25_LIST_MODELS_NOT_CHILD: packaged discovery cannot become child-started", () => {
    const result = api.classifyLiveChildEvidenceV1({
      command: ["pi", "--offline", "--no-session", "--list-models"],
      status: 0,
      output: "npm:pi-subagents@0.45.2\n./personal\n",
      loadedPersonalPackage: true,
      childIdentity: "pid:4242",
    });
    expect(result).toMatchObject({
      ok: false,
      status: "blocked",
      code: "child-startup-unavailable",
      advisoryOnly: false,
      executes: false,
    });
  });

  test("ISSUE25_CHILD_STARTED_REQUIRES_IDENTITY: loaded package plus child identity is child-started", () => {
    const result = api.classifyLiveChildEvidenceV1({
      transport: "pi-subagents",
      command: ["pi", "--offline", "--no-session"],
      status: 0,
      output: "npm:pi-subagents@0.45.2\n./personal\nchild-started\n",
      loadedPersonalPackage: true,
      childIdentity: "pid:4242",
    });
    expect(result).toMatchObject({
      ok: true,
      status: "started",
      code: "child-started",
      advisoryOnly: false,
      executes: false,
      loadedPersonalPackage: true,
      childIdentity: "pid:4242",
    });
  });

  test("ISSUE25_LIVE_CHILD_OR_UNAVAILABLE: probe starts one child or returns child-startup-unavailable", async () => {
    const result = await api.probeLiveChildDelegationV1({
      repo,
      raiseSpawnCaps: false,
      launchProductFleet: false,
    });
    expect(["child-started", "child-startup-unavailable"]).toContain(result.code);
    expect(result.executes).toBe(false);
    expect(result.spawnCapsRaised).toBe(false);
    expect(result.productFleetLaunched).toBe(false);
    expect(result.advisoryOnly).toBe(false);
    if (result.code === "child-started") {
      expect(result.ok).toBe(true);
      expect(result.status).toBe("started");
      expect(typeof result.childIdentity).toBe("string");
      expect(result.loadedPersonalPackage).toBe(true);
      expect(result.output ?? "").not.toContain('The "path" argument must be of type string');
      expect(result.output ?? "").not.toContain("Failed to load extension");
    } else {
      expect(result.ok).toBe(false);
      expect(result.status).toBe("blocked");
      expect(result.code).toBe("child-startup-unavailable");
    }
  }, 120_000);
});

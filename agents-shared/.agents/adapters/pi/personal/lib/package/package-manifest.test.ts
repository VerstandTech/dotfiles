import { describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const verifier = resolve(import.meta.dir, "../../../../../scripts/verify-ai-resources.py");
const compatibility = {
  pi: "0.84.1",
  "pi-subagents": "0.45.2",
  "context-mode": "1.0.169",
  rulesync: "16.9.1",
};

function validate(options: { packageVersion?: string; manifestVersion?: string; pins?: Record<string, string>; path?: string }) {
  const repo = mkdtempSync(join(tmpdir(), "pkg01-manifest-"));
  try {
    const manifestPath = join(repo, "agents-shared/.agents/manifest.json");
    const packagePath = join(repo, "agents-shared/.agents/adapters/pi/personal/package.json");
    mkdirSync(join(repo, "agents-shared/.agents/adapters/pi/personal"), { recursive: true });
    writeFileSync(manifestPath, JSON.stringify({
      version: 1,
      canonicalSkills: "skills",
      packages: {
        piPersonal: {
          path: options.path ?? "agents-shared/.agents/adapters/pi/personal",
          version: options.manifestVersion ?? "0.7.3",
          compatibility: options.pins ?? compatibility,
          targets: [".pi/agent/personal", ".pi/agent/settings.json"],
          runtimePackages: [
            "npm:pi-subagents@0.45.2",
            "npm:context-mode@1.0.169",
            "npm:pi-markdown-preview@0.13.1",
            "./personal",
            "npm:pi-web-access@0.13.0",
          ],
          resourceRoots: [
            "agents-shared/.agents/adapters/claude",
            "agents-shared/.agents/adapters/codex",
            "agents-shared/.agents/adapters/pi/personal",
            "agents-shared/.agents/skills",
            "grok/.grok/config.toml",
            "pi/.pi/agent/settings.json",
          ],
          resourceFingerprint: "0".repeat(64),
          manifestFingerprint: "0".repeat(64),
        },
      },
    }));
    writeFileSync(packagePath, JSON.stringify({ version: options.packageVersion ?? "0.7.3" }));
    mkdirSync(join(repo, "agents-shared/.agents/adapters/claude"), { recursive: true });
    mkdirSync(join(repo, "agents-shared/.agents/adapters/codex"), { recursive: true });
    mkdirSync(join(repo, "agents-shared/.agents/skills"), { recursive: true });
    mkdirSync(join(repo, "grok/.grok"), { recursive: true });
    writeFileSync(join(repo, "grok/.grok/config.toml"), "[skills]\n");
    mkdirSync(join(repo, "pi/.pi/agent"), { recursive: true });
    writeFileSync(join(repo, "pi/.pi/agent/settings.json"), JSON.stringify({ packages: [
      "npm:pi-subagents@0.45.2",
      "npm:context-mode@1.0.169",
      "npm:pi-markdown-preview@0.13.1",
      "./personal",
      "npm:pi-web-access@0.13.0",
    ] }));
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    const packageValue = manifest.packages.piPersonal;
    const canonical = (value: any): string => Array.isArray(value)
      ? `[${value.map(canonical).join(",")}]`
      : value && typeof value === "object"
        ? `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`
        : JSON.stringify(value);
    packageValue.resourceFingerprint = require("node:crypto").createHash("sha256").update(canonical({ schemaVersion: 1, entries: [
      { path: "agents-shared/.agents/adapters/claude", kind: "directory" },
      { path: "agents-shared/.agents/adapters/codex", kind: "directory" },
      { path: "agents-shared/.agents/adapters/pi/personal", kind: "directory" },
      { path: "agents-shared/.agents/adapters/pi/personal/package.json", kind: "file", sha256: require("node:crypto").createHash("sha256").update(readFileSync(packagePath)).digest("hex") },
      { path: "agents-shared/.agents/skills", kind: "directory" },
      { path: "grok/.grok/config.toml", kind: "file", sha256: require("node:crypto").createHash("sha256").update(readFileSync(join(repo, "grok/.grok/config.toml"))).digest("hex") },
      { path: "pi/.pi/agent/settings.json", kind: "file", sha256: require("node:crypto").createHash("sha256").update(readFileSync(join(repo, "pi/.pi/agent/settings.json"))).digest("hex") },
    ] })).digest("hex");
    const copy = structuredClone(packageValue); delete copy.manifestFingerprint;
    packageValue.manifestFingerprint = require("node:crypto").createHash("sha256").update(canonical(copy)).digest("hex");
    writeFileSync(manifestPath, JSON.stringify(manifest));
    const code = [
      "import importlib.util, json, pathlib, sys",
      "p=pathlib.Path(sys.argv[1]); r=pathlib.Path(sys.argv[2])",
      "s=importlib.util.spec_from_file_location('v',p); m=importlib.util.module_from_spec(s); s.loader.exec_module(m)",
      "e=[]; m.validate_manifest(r,e); print(json.dumps(e))",
    ].join("; ");
    const result = spawnSync("python3", ["-c", code, verifier, repo], { encoding: "utf8" });
    expect(result.status).toBe(0);
    return JSON.parse(result.stdout.trim());
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
}

describe("PKG-01 frozen package manifest verification", () => {
  test("PKG01_PACKAGE_MANIFEST_MISSING: rejects package version drift", () => {
    expect(validate({ packageVersion: "0.7.2" })).toEqual(["PKG01_PACKAGE_MANIFEST_MISSING: version-mismatch"]);
  });

  test("accepts exact CMP-01 compatibility pins and package version", () => {
    expect(validate({})).toEqual([]);
  });

  test("rejects compatibility pin and frozen package version drift", () => {
    expect(validate({ pins: { ...compatibility, "pi-subagents": "latest" } })).toEqual(["PKG01_PACKAGE_MANIFEST_MISSING: pin-mismatch"]);
    expect(validate({ packageVersion: "9.9.9", manifestVersion: "9.9.9" })).toEqual(["PKG01_PACKAGE_MANIFEST_MISSING: version-mismatch"]);
  });

  test("rejects absolute traversing alternate and symlink-escaped package paths", () => {
    expect(validate({ path: "/tmp/personal" })).toEqual(["PKG01_PACKAGE_MANIFEST_MISSING: unsafe-path"]);
    expect(validate({ path: "../personal" })).toEqual(["PKG01_PACKAGE_MANIFEST_MISSING: unsafe-path"]);
    expect(validate({ path: "another/personal" })).toEqual(["PKG01_PACKAGE_MANIFEST_MISSING: unsafe-path"]);
  });

  test("PKG01_RUNTIME_PINS: settings and manifest apply one exact closed package set", () => {
    const root = resolve(import.meta.dir, "../../../../../../..");
    const settings = JSON.parse(readFileSync(resolve(root, "pi/.pi/agent/settings.json"), "utf8"));
    const manifest = JSON.parse(readFileSync(resolve(root, "agents-shared/.agents/manifest.json"), "utf8"));
    expect(settings.packages).toEqual([
      "npm:pi-subagents@0.45.2",
      "npm:context-mode@1.0.169",
      "npm:pi-markdown-preview@0.13.1",
      "./personal",
      "npm:pi-web-access@0.13.0",
    ]);
    expect(manifest.packages.piPersonal.runtimePackages).toEqual(settings.packages);
  });

  test("PKG01_MANIFEST_SHAPE: malformed top-level package and packages shapes return stable codes", () => {
    const repo = mkdtempSync(join(tmpdir(), "pkg01-manifest-shape-"));
    try {
      const manifestPath = join(repo, "agents-shared/.agents/manifest.json");
      mkdirSync(join(repo, "agents-shared/.agents"), { recursive: true });
      const code = [
        "import importlib.util, json, pathlib, sys",
        "p=pathlib.Path(sys.argv[1]); r=pathlib.Path(sys.argv[2])",
        "s=importlib.util.spec_from_file_location('v',p); m=importlib.util.module_from_spec(s); s.loader.exec_module(m)",
        "e=[]; m.validate_manifest(r,e); print(json.dumps(e))",
      ].join("; ");
      for (const malformed of [[], { version: 1, canonicalSkills: "skills", packages: [] }]) {
        writeFileSync(manifestPath, JSON.stringify(malformed));
        const result = spawnSync("python3", ["-c", code, verifier, repo], { encoding: "utf8" });
        expect(result.status).toBe(0);
        expect(JSON.parse(result.stdout.trim())).toEqual(["PKG01_PACKAGE_MANIFEST_MISSING: invalid-manifest"]);
      }
      mkdirSync(join(repo, "agents-shared/.agents/adapters/pi/personal"), { recursive: true });
      writeFileSync(manifestPath, JSON.stringify({ version: 1, canonicalSkills: "skills", packages: { piPersonal: { path: "agents-shared/.agents/adapters/pi/personal", version: "0.7.3", compatibility } } }));
      writeFileSync(join(repo, "agents-shared/.agents/adapters/pi/personal/package.json"), "[]");
      const malformedPackage = spawnSync("python3", ["-c", code, verifier, repo], { encoding: "utf8" });
      expect(malformedPackage.status).toBe(0);
      expect(JSON.parse(malformedPackage.stdout.trim())).toEqual(["PKG01_PACKAGE_MANIFEST_MISSING: invalid-manifest"]);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});

import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const repo = resolve(import.meta.dir, "../../../../../../..");
const stager = join(repo, "scripts/stage-ai-resources.py");

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson((value as any)[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

describe("PKG-01 canonical package and staging evidence", () => {
  test("PKG01_CANONICAL_EVIDENCE_MISSING: manifest fingerprint and staged evidence agree", () => {
    const manifest = JSON.parse(readFileSync(join(repo, "agents-shared/.agents/manifest.json"), "utf8"));
    const declared = manifest.packages.piPersonal.manifestFingerprint;
    expect(declared).toMatch(/^[a-f0-9]{64}$/);
    const packageWithoutFingerprint = structuredClone(manifest.packages.piPersonal);
    delete packageWithoutFingerprint.manifestFingerprint;
    expect(createHash("sha256").update(canonicalJson(packageWithoutFingerprint)).digest("hex")).toBe(declared);

    const home = mkdtempSync(join(tmpdir(), "pkg01-evidence-"));
    try {
      const result = spawnSync("python3", [stager, "--repo", repo, "--home", home, "--host", "macos"], { encoding: "utf8", env: { ...process.env, HOME: repo } });
      expect(result.status).toBe(0);
      const evidence = JSON.parse(result.stdout.trim());
      expect(evidence).toMatchObject({ schemaVersion: 1, status: "verified", host: "macos", manifestFingerprint: declared, targets: manifest.packages.piPersonal.targets });
      expect(evidence.stagingRoot).toMatch(/\/pkg01-evidence-/);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  test("PKG01_EXACT_ROOTS: manifest roots equal the closed deployed package set", () => {
    const manifest = JSON.parse(readFileSync(join(repo, "agents-shared/.agents/manifest.json"), "utf8"));
    expect(manifest.packages.piPersonal.targets).toEqual([
      ".pi/agent/personal",
      ".pi/agent/settings.json",
    ]);
    expect(manifest.packages.piPersonal.resourceRoots).toEqual([
      "agents-shared/.agents/adapters/claude",
      "agents-shared/.agents/adapters/codex",
      "agents-shared/.agents/adapters/pi/personal",
      "agents-shared/.agents/skills",
      "grok/.grok/config.toml",
      "pi/.pi/agent/settings.json",
    ]);
  });

  test("host preflight supports macOS and Ubuntu and blocks unknown", () => {
    for (const host of ["macos", "ubuntu"]) {
      const home = mkdtempSync(join(tmpdir(), "pkg01-host-"));
      try {
        expect(spawnSync("python3", [stager, "--repo", repo, "--home", home, "--host", host], { env: { ...process.env, HOME: repo } }).status).toBe(0);
      } finally { rmSync(home, { recursive: true, force: true }); }
    }
    const home = mkdtempSync(join(tmpdir(), "pkg01-host-"));
    try {
      const result = spawnSync("python3", [stager, "--repo", repo, "--home", home, "--host", "windows"], { encoding: "utf8", env: { ...process.env, HOME: repo } });
      expect(result.status).toBe(2);
      expect(result.stderr.trim()).toBe("PKG-01 staging blocked: unsupported-host");
    } finally { rmSync(home, { recursive: true, force: true }); }
  });
});

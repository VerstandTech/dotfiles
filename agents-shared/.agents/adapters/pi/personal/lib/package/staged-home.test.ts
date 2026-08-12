import { afterEach, describe, expect, test } from "bun:test";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const repo = resolve(import.meta.dir, "../../../../../../..");
const stager = join(repo, "scripts/stage-ai-resources.py");
const verifier = join(repo, "agents-shared/.agents/scripts/verify-ai-resources.py");
const homes: string[] = [];

afterEach(() => {
  for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true });
});

function temporaryHome(): string {
  const home = mkdtempSync(join(tmpdir(), "pkg01-home-"));
  homes.push(home);
  return home;
}

function stage(home: string, sourceRepo = repo) {
  if (!existsSync(stager)) throw new Error("PKG01_TEMP_HOME_STAGER_MISSING");
  return spawnSync("python3", [stager, "--repo", sourceRepo, "--home", home, "--host", "macos"], { encoding: "utf8" });
}

describe("PKG-01 temporary-HOME staging acceptance", () => {
  test("PKG01_TEMP_HOME_STAGER_MISSING: stages a complete verifier-accepted HOME", () => {
    const home = temporaryHome();
    const staged = stage(home);
    expect(staged.status).toBe(0);
    expect(JSON.parse(staged.stdout.trim())).toMatchObject({ schemaVersion: 1, status: "verified", host: "macos" });

    const verified = spawnSync("python3", [verifier, "--repo", repo, "--home", home], { encoding: "utf8" });
    expect(verified.status).toBe(0);
    expect(verified.stdout).toContain("deployed home");
  });

  test("PKG01_MISSING_SOURCE: refuses missing package sources before any HOME mutation", () => {
    const fixture = temporaryHome();
    const home = temporaryHome();
    cpSync(join(repo, "agents-shared"), join(fixture, "agents-shared"), { recursive: true });
    cpSync(join(repo, "claude"), join(fixture, "claude"), { recursive: true });
    cpSync(join(repo, "codex"), join(fixture, "codex"), { recursive: true });
    cpSync(join(repo, "grok"), join(fixture, "grok"), { recursive: true });
    rmSync(join(fixture, "agents-shared/.agents/adapters/pi/personal"), { recursive: true, force: true });
    const result = stage(home, fixture);
    expect(result.status).toBe(2);
    expect(result.stderr.trim()).toBe("PKG-01 staging blocked: missing-resources");
    expect(existsSync(join(home, ".pi"))).toBe(false);
  });

  test("refuses a non-empty HOME and preserves exact dirty bytes", () => {
    const home = temporaryHome();
    const dirty = join(home, "keep.txt");
    writeFileSync(dirty, "user-owned\n", "utf8");

    const result = stage(home);
    expect(result.status).toBe(2);
    expect(result.stderr.trim()).toBe("PKG-01 staging blocked: home-not-empty");
    expect(readFileSync(dirty, "utf8")).toBe("user-owned\n");
  });

  test("refuses the process HOME even when explicitly supplied", () => {
    if (!process.env.HOME) return;
    const result = stage(process.env.HOME);
    expect(result.status).toBe(2);
    expect(result.stderr.trim()).toBe("PKG-01 staging blocked: real-home-refused");
  });

  test("PKG01_SKILL_ESCAPE: preflights root child and nested escapes before any HOME mutation", () => {
    for (const kind of ["root", "child", "nested"] as const) {
      const fixture = temporaryHome();
      const home = temporaryHome();
      const outside = temporaryHome();
      cpSync(join(repo, "agents-shared/.agents/adapters"), join(fixture, "agents-shared/.agents/adapters"), { recursive: true });
      cpSync(join(repo, "agents-shared/.agents/manifest.json"), join(fixture, "agents-shared/.agents/manifest.json"));
      cpSync(join(repo, "claude"), join(fixture, "claude"), { recursive: true });
      cpSync(join(repo, "codex"), join(fixture, "codex"), { recursive: true });
      cpSync(join(repo, "grok"), join(fixture, "grok"), { recursive: true });
      cpSync(join(repo, "pi"), join(fixture, "pi"), { recursive: true });
      const skills = join(fixture, "agents-shared/.agents/skills");
      mkdirSync(join(outside, "escaped"), { recursive: true });
      if (kind === "root") symlinkSync(outside, skills);
      else {
        mkdirSync(skills, { recursive: true });
        if (kind === "child") symlinkSync(outside, join(skills, "escaped"));
        else {
          mkdirSync(join(skills, "sample"), { recursive: true });
          writeFileSync(join(skills, "sample/SKILL.md"), "---\nname: sample\ndescription: Sample.\n---\n");
          symlinkSync(outside, join(skills, "sample/nested"));
        }
      }
      const result = stage(home, fixture);
      expect(result.status).toBe(2);
      expect(result.stderr.trim()).toBe("PKG-01 staging blocked: unsafe-source");
      expect(existsSync(join(home, ".pi"))).toBe(false);
      expect(existsSync(join(home, ".agents"))).toBe(false);
    }
  });
});

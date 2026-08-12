import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const repo = resolve(import.meta.dir, "../../../../../../..");
const extension = join(repo, "agents-shared/.agents/adapters/pi/personal/extensions/agentic-fleet.ts");
const stager = join(repo, "scripts/stage-ai-resources.py");

describe("PKG-01 packaged Pi startup", () => {
  test("PKG01_AGENTIC_FLEET_STARTUP: staged personal-package discovery loads without extension errors", () => {
    expect(existsSync(extension)).toBe(true);
    const home = mkdtempSync(join(tmpdir(), "pkg01-pi-home-"));
    try {
      const staged = spawnSync("python3", [stager, "--repo", repo, "--home", home, "--host", "macos"], {
        encoding: "utf8",
        env: { ...process.env, HOME: repo },
      });
      expect(staged.status).toBe(0);
      const listed = spawnSync("pi", ["list", "--no-approve"], {
        cwd: repo,
        encoding: "utf8",
        env: { ...process.env, HOME: home, PI_CODING_AGENT_DIR: join(home, ".pi/agent"), PI_OFFLINE: "1" },
        timeout: 60_000,
      });
      expect(listed.status).toBe(0);
      expect(listed.stdout).toContain("npm:pi-subagents@0.45.2");
      expect(listed.stdout).toContain("npm:context-mode@1.0.169");
      expect(listed.stdout).toContain("./personal");
      expect(listed.stdout).not.toContain("No packages installed");

      const result = spawnSync("pi", [
        "--offline",
        "--no-session",
        "--no-skills",
        "--no-prompt-templates",
        "--no-themes",
        "--no-context-files",
        "--no-tools",
        "--list-models",
      ], {
        cwd: repo,
        encoding: "utf8",
        env: { ...process.env, HOME: home, PI_CODING_AGENT_DIR: join(home, ".pi/agent"), PI_OFFLINE: "1" },
        timeout: 60_000,
      });
      const output = `${result.stdout}\n${result.stderr}`;
      expect(output).not.toContain('The "path" argument must be of type string');
      expect(output).not.toContain("Failed to load extension");
      expect(result.status).toBe(0);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
});

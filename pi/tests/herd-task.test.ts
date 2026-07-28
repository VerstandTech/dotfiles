// Acceptance: docs/pi-herdr-acceptance.md — Slice 2
// Traces: R3-E1, R3-E2, R7-E1 (docs/pi-herdr-example-map.md)
import { describe, expect, test } from "bun:test";
import { buildTaskLaunch, isValidAgentName } from "../.pi/agent/personal/extensions/herd/herd-task";

describe("isValidAgentName (R3-E2)", () => {
  test("accepts herdr-legal names", () => {
    expect(isValidAgentName("ok_name-1")).toBe(true);
    expect(isValidAgentName("story-123")).toBe(true);
  });

  test("rejects illegal names", () => {
    expect(isValidAgentName("Story X")).toBe(false);
    expect(isValidAgentName("-bad")).toBe(false);
    expect(isValidAgentName("x".repeat(33))).toBe(false);
    expect(isValidAgentName("")).toBe(false);
  });
});

describe("buildTaskLaunch", () => {
  test("R3-E1: wraps native `herdr worktree create` with branch, base, label", () => {
    const argv = buildTaskLaunch({ name: "story-123", cwd: "/x/repo", base: "develop" });
    expect(argv).toEqual([
      "herdr", "worktree", "create",
      "--cwd", "/x/repo",
      "--branch", "story-123",
      "--base", "develop",
      "--label", "story-123",
      "--no-focus",
      "--json",
    ]);
  });

  test("R3-E1: omitted base emits no --base flag (generic — herdr/git resolve the repo default branch)", () => {
    const argv = buildTaskLaunch({ name: "story-1", cwd: "/r" });
    expect(argv).not.toContain("--base");
    expect(argv).not.toContain("develop");
    expect(argv).not.toContain("main");
  });

  test("R3-E1: explicit base is passed through unchanged", () => {
    const argv = buildTaskLaunch({ name: "story-1", cwd: "/r", base: "release/2.x" });
    const i = argv.indexOf("--base");
    expect(argv[i + 1]).toBe("release/2.x");
  });

  test("R7-E1: detach-safe — always --no-focus and --json; IDs parsed, never derived", () => {
    const argv = buildTaskLaunch({ name: "story-1", cwd: "/r" });
    expect(argv).toContain("--no-focus");
    expect(argv).toContain("--json");
  });

  test("R3-E2: invalid name throws before any argv is produced", () => {
    expect(() => buildTaskLaunch({ name: "Bad Name", cwd: "/r" })).toThrow();
  });
});

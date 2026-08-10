// Acceptance: docs/pi-herdr-acceptance.md — Slice 4 (/herd-task handler)
// Traces: R3-E3, R3-E4, R3-E5, R6-E2 (docs/pi-herdr-example-map.md)
import { describe, expect, test } from "bun:test";
import { extractPaneId, runHerdTask } from "../.pi/agent/personal/extensions/herd/herd-task-handler";
import type { ExecFn } from "../.pi/agent/personal/extensions/herd/herd-source";

// Synthetic herdr 0.8 `herdr worktree create` envelope (schema: worktree_created).
// Public fields only; ids/paths are fixtures, not live session values.
const CREATE_OK = JSON.stringify({
  id: "cli:worktree:create",
  result: {
    type: "worktree_created",
    workspace: { id: "w2" },
    tab: { id: "w2:t1" },
    root_pane: { pane_id: "w1:p2" },
    worktree: { path: "/tmp/herdr-fixtures/repo-story-123", label: "story-123" },
  },
});

function scriptedExec(responses: Array<{ stdout: string } | Error>): { exec: ExecFn; calls: string[][] } {
  const calls: string[][] = [];
  const exec: ExecFn = async (argv) => {
    calls.push(argv);
    const next = responses[calls.length - 1];
    if (!next || next instanceof Error) throw next ?? new Error("unexpected exec");
    return { stdout: next.stdout, stderr: "" };
  };
  return { exec, calls };
}

describe("extractPaneId (tolerant envelope)", () => {
  test("R3-E4: precedence root_pane (schema field) → pane → worktree.pane", () => {
    expect(
      extractPaneId({ result: { type: "worktree_created", root_pane: { pane_id: "w1:p9" } } }),
    ).toBe("w1:p9");
    expect(extractPaneId({ result: { pane: { pane_id: "w1:p2" } } })).toBe("w1:p2");
    expect(extractPaneId({ result: { worktree: { pane_id: "w2:p1" } } })).toBe("w2:p1");
    expect(
      extractPaneId({ result: { pane: { pane_id: "a" }, root_pane: { pane_id: "b" } } }),
    ).toBe("b");
  });

  test("R3-E5: no pane id anywhere → null", () => {
    expect(extractPaneId(null)).toBeNull();
    expect(extractPaneId({})).toBeNull();
    expect(extractPaneId({ result: { pane: {} } })).toBeNull();
    expect(extractPaneId("w1:p2")).toBeNull();
  });
});

describe("runHerdTask", () => {
  test("R3-E3: invalid name fails before any exec", async () => {
    const { exec, calls } = scriptedExec([]);
    const res = await runHerdTask("Bad Name", { cwd: "/r", exec });
    expect(res.ok).toBe(false);
    expect(calls).toHaveLength(0);
    expect(res.message).toContain("⚠");
  });

  test("R3-E4: worktree create argv → pane id → agent start argv", async () => {
    const { exec, calls } = scriptedExec([{ stdout: CREATE_OK }, { stdout: "{}" }]);
    const res = await runHerdTask("story-123", { cwd: "/x/repo", exec });
    expect(res).toEqual({
      ok: true,
      paneId: "w1:p2",
      message: "✓ story-123 → w1:p2",
    });
    expect(calls[0]).toEqual([
      "herdr", "worktree", "create",
      "--cwd", "/x/repo",
      "--branch", "story-123",
      "--label", "story-123",
      "--no-focus",
    ]);
    expect(calls[1]).toEqual([
      "herdr", "agent", "start", "story-123", "--kind", "pi", "--pane", "w1:p2",
    ]);
  });

  test("R3-E4: base option flows into the create argv", async () => {
    const { exec, calls } = scriptedExec([{ stdout: CREATE_OK }, { stdout: "{}" }]);
    await runHerdTask("story-1", { cwd: "/r", exec, base: "develop" });
    const i = calls[0]!.indexOf("--base");
    expect(calls[0]![i + 1]).toBe("develop");
  });

  test("R3-E5: create exec failure → failure result, no agent start", async () => {
    const { exec, calls } = scriptedExec([new Error("boom")]);
    const res = await runHerdTask("story-1", { cwd: "/r", exec });
    expect(res.ok).toBe(false);
    expect(res.message).toContain("boom");
    expect(calls).toHaveLength(1);
  });

  test("R3-E5: envelope without pane id → failure result, no agent start", async () => {
    const { exec, calls } = scriptedExec([{ stdout: "{}" }]);
    const res = await runHerdTask("story-1", { cwd: "/r", exec });
    expect(res.ok).toBe(false);
    expect(calls).toHaveLength(1);
  });

  test("R6-E2: messages are plain text with icon, no ANSI", async () => {
    const { exec } = scriptedExec([{ stdout: CREATE_OK }, { stdout: "{}" }]);
    const res = await runHerdTask("story-123", { cwd: "/r", exec });
    // eslint-disable-next-line no-control-regex
    expect(res.message).not.toMatch(/\x1b\[/);
  });
});

// Acceptance: docs/pi-herdr-acceptance.md — Slice 1
// Traces: R5-E1, R5-E2, R1-E1, R6-E1 (docs/pi-herdr-example-map.md)
import { describe, expect, test } from "bun:test";
import {
  formatHerdRows,
  herdLines,
  sameLines,
  withoutSelf,
} from "../.pi/agent/personal/extensions/herd/herd-status";

// Real herdr 0.7.5 `herdr agent list` output: JSON CLI envelope by default (no
// --json flag). AgentInfo: agent_status (AgentStatus enum), name (from
// `agent rename`), display_agent, agent (kind), pane_id.
const payload = {
  id: "cli:agent:list",
  result: {
    type: "agent_list",
    agents: [
      { name: "web", agent: "pi", agent_status: "working", pane_id: "w1:p2" },
      { name: "api", agent: "pi", agent_status: "blocked", pane_id: "w1:p3" },
      { name: "docs", agent: "claude", agent_status: "done", pane_id: "w1:p4" },
      { name: "db", agent: "pi", agent_status: "working", pane_id: "w1:p5" },
    ],
  },
};

describe("formatHerdRows", () => {
  test("R5-E1: blocked sorts first, summary counts states and names blocked agents", () => {
    const out = formatHerdRows(payload);
    expect(out).not.toBeNull();
    expect(out!.rows[0]).toContain("api");
    expect(out!.summary).toBe("● 2 working  ⚠ 1 blocked (api)");
  });

  test("R5-E1: rows carry the DESIGN.md §7.7 icon per state", () => {
    const out = formatHerdRows(payload)!;
    const byName = (n: string) => out.rows.find((r) => r.includes(n))!;
    expect(byName("api")).toStartWith("⚠");
    expect(byName("web")).toStartWith("●");
    expect(byName("docs")).toStartWith("✓");
  });

  test("R5-E2: graceful absence — null/empty/garbage payloads return null", () => {
    expect(formatHerdRows(null)).toBeNull();
    expect(formatHerdRows({ agents: [] })).toBeNull();
    expect(
      formatHerdRows({ id: "cli:agent:list", result: { type: "agent_list", agents: [] } }),
    ).toBeNull();
    expect(formatHerdRows("not json")).toBeNull();
    expect(formatHerdRows({ result: { agents: [{ nope: true }] } })).toBeNull();
  });

  test("R1-E1: idle and unknown map to their own icon; unknown is never done", () => {
    const out = formatHerdRows({
      result: {
        agents: [
          { agent: "pi", agent_status: "idle", pane_id: "w1:p2" },
          { agent: "claude", agent_status: "unknown", pane_id: "w1:p3" },
        ],
      },
    })!;
    expect(out.rows.find((r) => r.includes("pi"))).toStartWith("○");
    expect(out.rows.find((r) => r.includes("claude"))).toStartWith("?");
    expect(out.rows.find((r) => r.includes("claude"))).not.toContain("✓");
  });

  test("R1-E1: an unrecognized agent_status maps to unknown — never blanks the widget", () => {
    const out = formatHerdRows({
      result: {
        agents: [
          { name: "web", agent_status: "working", pane_id: "w1:p2" },
          { name: "odd", agent_status: "rethinking", pane_id: "w1:p3" },
        ],
      },
    });
    expect(out).not.toBeNull();
    expect(out!.rows.find((r) => r.includes("odd"))).toStartWith("?");
    expect(out!.rows.find((r) => r.includes("web"))).toStartWith("●");
  });

  test("R5: display name falls back name → display_agent → agent → pane_id; meta is the pane id", () => {
    const out = formatHerdRows({
      result: {
        agents: [
          { name: "renamed", display_agent: "Pi 1", agent: "pi", agent_status: "working", pane_id: "w1:p2" },
          { display_agent: "Pi 2", agent: "pi", agent_status: "working", pane_id: "w1:p3" },
          { agent: "claude", agent_status: "working", pane_id: "w1:p4" },
          { agent_status: "working", pane_id: "w1:p5" },
        ],
      },
    })!;
    expect(out.rows.find((r) => r.includes("renamed"))).toContain("w1:p2");
    expect(out.rows.find((r) => r.includes("Pi 2"))).toBeDefined();
    expect(out.rows.find((r) => r.includes("claude"))).toBeDefined();
    expect(out.rows.find((r) => r.includes("w1:p5"))).toBeDefined();
    expect(out.summary).toBe("● 4 working");
  });

  test("R6-E1: state is recoverable without ANSI — rows are plain text with icon + name", () => {
    const out = formatHerdRows(payload)!;
    for (const row of out.rows) {
      expect(row).toMatch(/^[⚠●○✓?] [a-z]/);
      // eslint-disable-next-line no-control-regex
      expect(row).not.toMatch(/\x1b\[/);
    }
  });
});

describe("withoutSelf (R5-E6)", () => {
  test("removes only the caller's pane from the CLI envelope", () => {
    const out = withoutSelf(payload, "w1:p3") as {
      result: { agents: Array<{ pane_id: string }> };
    };
    expect(out.result.agents).toHaveLength(3);
    expect(out.result.agents.map((a) => a.pane_id)).not.toContain("w1:p3");
  });

  test("undefined pane id or garbage passes through unchanged", () => {
    expect(withoutSelf(payload, undefined)).toBe(payload);
    expect(withoutSelf("junk", "w1:p1")).toBe("junk");
    expect(withoutSelf({ nope: true }, "w1:p1")).toEqual({ nope: true });
  });

  test("bare {agents} shape is filtered too", () => {
    const out = withoutSelf(
      { agents: [{ pane_id: "w1:p1", agent_status: "idle" }] },
      "w1:p1",
    ) as { agents: unknown[] };
    expect(out.agents).toHaveLength(0);
  });
});

describe("herdLines + sameLines (R7-E2 publish-on-change)", () => {
  test("herdLines: [summary, ...rows], or null for a null view", () => {
    const view = formatHerdRows(payload)!;
    const lines = herdLines(view)!;
    expect(lines[0]).toBe(view.summary);
    expect(lines.slice(1)).toEqual(view.rows);
    expect(herdLines(null)).toBeNull();
  });

  test("idle collapse: all-idle herd renders summary only (quiet-by-default)", () => {
    const idle = formatHerdRows({
      result: {
        type: "agent_list",
        agents: [
          { name: "grok", agent: "pi", agent_status: "idle", pane_id: "wH:p1" },
          { name: "pi", agent: "pi", agent_status: "idle", pane_id: "wK:p1" },
        ],
      },
    })!;
    expect(idle.hot).toBe(false);
    const lines = herdLines(idle)!;
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("2 idle");
  });

  test("hot stays true while any agent works or blocks", () => {
    const view = formatHerdRows(payload)!;
    expect(view.hot).toBe(true);
  });

  test("sameLines: structural equality, null-safe", () => {
    expect(sameLines(null, null)).toBe(true);
    expect(sameLines(["a"], ["a"])).toBe(true);
    expect(sameLines(["a"], ["b"])).toBe(false);
    expect(sameLines(["a"], ["a", "b"])).toBe(false);
    expect(sameLines(["a"], null)).toBe(false);
    expect(sameLines(null, ["a"])).toBe(false);
  });
});

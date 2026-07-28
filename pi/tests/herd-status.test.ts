// Acceptance: docs/pi-herdr-acceptance.md — Slice 1
// Traces: R5-E1, R5-E2, R1-E1, R6-E1 (docs/pi-herdr-example-map.md)
import { describe, expect, test } from "bun:test";
import { formatHerdRows } from "../.pi/agent/personal/extensions/herd/herd-status";

const payload = {
  agents: [
    { name: "web", state: "working", meta: "story-9" },
    { name: "api", state: "blocked", meta: "story-123" },
    { name: "docs", state: "done", meta: "story-7" },
    { name: "db", state: "working", meta: "story-8" },
  ],
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
    expect(formatHerdRows("not json")).toBeNull();
    expect(formatHerdRows({ agents: [{ nope: true }] })).toBeNull();
  });

  test("R1-E1: idle and unknown map to their own icon; unknown is never done", () => {
    const out = formatHerdRows({
      agents: [
        { name: "a", state: "idle" },
        { name: "b", state: "unknown" },
      ],
    })!;
    expect(out.rows.find((r) => r.includes("a"))).toStartWith("○");
    expect(out.rows.find((r) => r.includes("b"))).toStartWith("?");
    expect(out.rows.find((r) => r.includes("b"))).not.toContain("✓");
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

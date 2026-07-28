// Acceptance: docs/pi-herd-acceptance.md — Slice 5 (herd footer)
// Traces: F-1, F-2, F-3, R6-E3 (docs/pi-herdr-example-map.md R6)
import { describe, expect, test } from "bun:test";
import { renderHerdFooter } from "../.pi/agent/personal/extensions/herd/herd-footer";
import { formatHerdRows } from "../.pi/agent/personal/extensions/herd/herd-status";

const herd = formatHerdRows({
  agents: [
    { name: "api", state: "blocked", meta: "story-123" },
    { name: "web", state: "working" },
  ],
});

const FULL = { model: "kimi-k3", thinking: "high", branch: "main", herd, width: 60 };

function visibleLength(s: string): number {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b\[[0-9;]*m/g, "").length;
}

describe("renderHerdFooter", () => {
  test("F-1: two lines; at ample width herd-left + full model-right", () => {
    const lines = renderHerdFooter({ ...FULL, width: 80 });
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain("enter send");
    expect(lines[1]).toContain("● 1 working");
    expect(lines[1]).toContain("⚠ 1 blocked (api)");
    expect(lines[1]).toContain("kimi-k3");
    expect(lines[1]).toContain("thinking high");
    expect(lines[1]).toContain("(main)");
    const herdIdx = lines[1]!.indexOf("⚠");
    const modelIdx = lines[1]!.indexOf("kimi-k3");
    expect(modelIdx).toBeGreaterThan(herdIdx); // right-aligned
  });

  test("F-1: tight width — model/thinking/branch survive; herd summary yields (DESIGN.md P4)", () => {
    const lines = renderHerdFooter(FULL); // width 60: 3 cols short of both full
    expect(lines[1]).toContain("kimi-k3");
    expect(lines[1]).toContain("thinking high");
    expect(lines[1]).toContain("(main)");
    expect(visibleLength(lines[1]!)).toBeLessThanOrEqual(60);
  });

  test("F-2: null herd and null branch are omitted without placeholders", () => {
    const lines = renderHerdFooter({ ...FULL, herd: null, branch: null });
    expect(lines).toHaveLength(2);
    expect(lines[1]).not.toContain("blocked");
    expect(lines[1]).not.toContain("(main)");
    expect(lines[1]).toContain("kimi-k3");
  });

  test("F-3: narrow width truncates, never overflows, never throws", () => {
    for (const width of [10, 20, 30]) {
      const lines = renderHerdFooter({ ...FULL, width });
      expect(lines).toHaveLength(2);
      expect(visibleLength(lines[0]!)).toBeLessThanOrEqual(width);
      expect(visibleLength(lines[1]!)).toBeLessThanOrEqual(width);
    }
  });

  test("R6-E3: thinking level is present as text, not only color", () => {
    const lines = renderHerdFooter({ ...FULL, thinking: "max" });
    expect(lines[1]).toContain("thinking max");
  });
});

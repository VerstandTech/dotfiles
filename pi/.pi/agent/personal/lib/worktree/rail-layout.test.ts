import { describe, expect, test } from "bun:test";
import { buildFullHeightRail, defaultRailOverlayOptions, padTruncate } from "./rail-layout.ts";

describe("padTruncate", () => {
	test("pads and truncates", () => {
		expect(padTruncate("ab", 5)).toBe("ab   ");
		expect(padTruncate("abcdef", 4).endsWith("…")).toBe(true);
	});
});

describe("buildFullHeightRail", () => {
	test("fills exact height top to bottom", () => {
		const lines = buildFullHeightRail({
			width: 30,
			height: 20,
			title: "Worktrees",
			selectedIndex: 0,
			cards: [
				{ id: "main", label: "develop", focused: true },
				{ id: "feat", label: "feat/x", dirty: true },
			],
		});
		expect(lines).toHaveLength(20);
		expect(lines[0]?.startsWith("╭")).toBe(true);
		expect(lines.at(-1)?.startsWith("╰")).toBe(true);
		expect(lines.some((l) => l.includes("main"))).toBe(true);
		// every line same outer width
		const w = lines[0]!.length;
		expect(lines.every((l) => l.length === w)).toBe(true);
	});

	test("marks selection with arrow", () => {
		const lines = buildFullHeightRail({
			width: 28,
			height: 12,
			selectedIndex: 1,
			cards: [
				{ id: "a", label: "A" },
				{ id: "b", label: "B" },
			],
		});
		expect(lines.join("\n")).toMatch(/→○ b|→● b|→ b/i);
	});
});

describe("defaultRailOverlayOptions", () => {
	test("docks full-height on the right", () => {
		const o = defaultRailOverlayOptions();
		expect(o.anchor).toBe("right-center");
		expect(o.maxHeight).toBe("100%");
		expect(o.margin.top).toBe(0);
		expect(o.margin.right).toBe(0);
		expect(o.margin.bottom).toBe(0);
	});
});

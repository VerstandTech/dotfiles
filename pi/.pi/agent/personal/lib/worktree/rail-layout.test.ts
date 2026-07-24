import { describe, expect, test } from "bun:test";
import {
	buildFullHeightRail,
	buildFullHeightRailLines,
	defaultRailOverlayOptions,
	padTruncate,
} from "./rail-layout.ts";

describe("padTruncate", () => {
	test("pads and truncates", () => {
		expect(padTruncate("ab", 5)).toBe("ab   ");
		expect(padTruncate("abcdef", 4).endsWith("…")).toBe(true);
	});
});

describe("buildFullHeightRail", () => {
	test("fills exact height without box borders", () => {
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
		const joined = lines.join("\n");
		expect(joined).not.toMatch(/[╭╮╰╯│├┤─]/);
		expect(joined).toContain("main");
		const w = lines[0]!.length;
		expect(lines.every((l) => l.length === w)).toBe(true);
	});

	test("marks selection with arrow and kinds", () => {
		const laid = buildFullHeightRailLines({
			width: 28,
			height: 12,
			selectedIndex: 1,
			cards: [
				{ id: "a", label: "A" },
				{ id: "b", label: "B" },
			],
		});
		expect(laid.some((l) => l.kind === "selected" && l.text.includes("b"))).toBe(true);
		expect(laid[0]?.kind).toBe("title");
	});
});

describe("defaultRailOverlayOptions", () => {
	test("docks full-height on the right", () => {
		const o = defaultRailOverlayOptions();
		expect(o.anchor).toBe("right-center");
		expect(o.maxHeight).toBe("100%");
		expect(o.margin.right).toBe(0);
	});
});

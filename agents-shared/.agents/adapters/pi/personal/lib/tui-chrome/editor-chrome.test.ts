import { describe, expect, test } from "bun:test";
import {
	applyPromptPrefix,
	boxLines,
	CARD_INDENT,
	cardBorderColor,
	clampVisible,
	isBorderLine,
	PROMPT,
	promptPreservesWidth,
	renderEditorCard,
	trimTrailingSpaces,
} from "./editor-chrome.ts";
import { visibleLength } from "./working-row.ts";

describe("editor-chrome", () => {
	test("applyPromptPrefix injects > on first content line", () => {
		const lines = ["────────", "  hello", "────────"];
		const out = applyPromptPrefix(lines);
		expect(out[0]).toBe(lines[0]);
		expect(out[2]).toBe(lines[2]);
		expect(out[1]).toContain(">");
		expect(out[1]).toContain("hello");
	});

	test("prompt replaces reserved padding without growing width", () => {
		const before = "  cursor-here";
		const after = applyPromptPrefix(["─", before, "─"])[1]!;
		expect(promptPreservesWidth(before, after)).toBe(true);
		expect(visibleLength(after)).toBe(visibleLength(before));
	});

	test("isBorderLine detects horizontal rules", () => {
		expect(isBorderLine("────────")).toBe(true);
		expect(isBorderLine("\x1b[38;2;90;90;90m────────\x1b[39m")).toBe(true);
		expect(isBorderLine("> hello")).toBe(false);
	});

	test("short lines still get a prompt", () => {
		const out = applyPromptPrefix(["─", "x", "─"]);
		expect(out[1]).toContain(">");
		expect(out[1]).toContain("x");
	});

	test("paddingX=0 empty-editor line: prepend does not grow width", () => {
		// Mirrors pi Editor with paddingX=0: cursor + right-fill, no leading pad.
		// Pi wipes paddingX after setEditorComponent (settings editorPaddingX default 0).
		const width = 104;
		const cursor = "\x1b[7m \x1b[0m";
		const before = cursor + " ".repeat(width - 1);
		expect(visibleLength(before)).toBe(width);

		const after = applyPromptPrefix(["─".repeat(width), before, "─".repeat(width)])[1]!;
		expect(after).toContain(">");
		expect(visibleLength(after)).toBe(width);
		expect(promptPreservesWidth(before, after)).toBe(true);
	});

	test("maxWidth hard-clamps even when no trailing spaces to steal", () => {
		const width = 12;
		const dense = "abcdefghijkl"; // 12 cols, no trailing space
		const out = applyPromptPrefix(["─".repeat(width), dense, "─".repeat(width)], {
			maxWidth: width,
		});
		expect(visibleLength(out[1]!)).toBeLessThanOrEqual(width);
		expect(out[1]).toContain(">");
	});

	test("trimTrailingSpaces removes only spaces from the end", () => {
		expect(trimTrailingSpaces("hi   ", 2)).toBe("hi ");
		expect(trimTrailingSpaces("hi", 2)).toBe("hi");
		expect(trimTrailingSpaces("  x  ", 2)).toBe("  x");
	});

	test("clampVisible keeps ANSI and respects max", () => {
		const s = "\x1b[38;2;1;2;3mhello\x1b[39m world";
		expect(visibleLength(clampVisible(s, 5))).toBe(5);
		expect(clampVisible(s, 5)).toContain("\x1b[38;2;1;2;3m");
	});

	test("PROMPT is two columns", () => {
		expect(PROMPT).toBe("> ");
		expect(PROMPT.length).toBe(2);
	});
});

describe("editor card", () => {
	test("renderEditorCard adds breathing room and inset", () => {
		const body = ["────", "> text", "────"];
		const out = renderEditorCard(body, 40);
		expect(out).toHaveLength(5); // blank + 3 + blank
		expect(out[0]!.trim()).toBe("");
		expect(out[4]!.trim()).toBe("");
		expect(out[1]!.startsWith(" ".repeat(CARD_INDENT))).toBe(true);
		expect(out[2]!).toContain("> text");
	});

	test("cardBorderColor: hairline idle, amber in bash mode", () => {
		const idle = cardBorderColor(false)("─");
		const bash = cardBorderColor(true)("─");
		expect(idle).toContain("56;56;56"); // #383838
		expect(bash).toContain("220;168;76"); // #dca84c
		expect(idle).not.toBe(bash);
	});
});

describe("boxLines", () => {
	const border = (s: string) => `[B]${s}[/B]`; // visible fake border coloring

	test("wraps editor output in a rounded box (+2 width)", () => {
		const lines = ["────────", "> hello ", "────────"];
		const out = boxLines(lines, border);
		expect(out[0]).toContain("╭");
		expect(out[0]).toContain("╮");
		expect(out[0]).not.toContain("╰");
		expect(out[2]).toContain("╰");
		expect(out[2]).toContain("╯");
		expect(out[1]).toContain("│");
		expect(out[1]).toContain("> hello");
		// visible width grows by exactly the two side borders
		expect(visibleLength(out[1]!.replace(/\[\/?B\]/g, ""))).toBe(10);
	});

	test("preserves scroll labels in corners", () => {
		const lines = ["─ ↑ 3 ────", "x       ", "─ ↓ 1 ────"];
		const out = boxLines(lines, (s) => s);
		expect(out[0]).toContain("↑ 3");
		expect(out[2]).toContain("↓ 1");
		expect(out[0]!.startsWith("╭")).toBe(true);
		expect(out[2]!.endsWith("╯")).toBe(true);
	});

	test("autocomplete lines move inside the box", () => {
		// Editor.render appends autocomplete AFTER the bottom border.
		const lines = ["────────", "> /hel  ", "────────", "/help   ", "/history"];
		const out = boxLines(lines, (s) => s);
		expect(out[0]).toBe("╭──────╮"); // 8-col fixture: corner + 6 rules + corner
		expect(out[out.length - 1]).toBe("╰──────╯");
		// autocomplete items are boxed, not dangling below the card
		expect(out.some((l) => l === "│/help   │")).toBe(true);
		expect(out.some((l) => l === "│/history│")).toBe(true);
	});

	test("pads short content lines to the box width", () => {
		const lines = ["────────", "> x", "────────"];
		const out = boxLines(lines, (s) => s);
		expect(out[1]).toBe("│> x     │");
	});

	test("non-editor input passes through untouched", () => {
		const lines = ["no borders here"];
		expect(boxLines(lines, border)).toEqual(lines);
	});
});

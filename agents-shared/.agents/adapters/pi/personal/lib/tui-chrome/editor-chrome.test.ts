import { describe, expect, test } from "bun:test";
import {
	applyPromptPrefix,
	clampVisible,
	isBorderLine,
	PROMPT,
	promptPreservesWidth,
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

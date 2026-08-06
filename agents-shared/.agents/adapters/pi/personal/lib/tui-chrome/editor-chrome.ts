/**
 * Editor chrome helpers — prompt prefix matching the target `> █` input box.
 * Operates on already-rendered editor lines (top border · content · bottom border).
 *
 * Important: Pi's setEditorComponent copies defaultEditor paddingX (settings
 * `editorPaddingX`, default 0) *after* the factory returns, wiping any padding
 * passed to CustomEditor's constructor. Callers must re-assert paddingX=2 via
 * setPaddingX override, and this helper must never grow visible width even when
 * padding was stolen (prepend + steal trailing spaces / clamp).
 */

import { fgHex } from "../ops-hud/chrome.ts";
import { visibleLength } from "./working-row.ts";

export const PROMPT = "> ";
export const PROMPT_COLS = 2;

/**
 * Inject a dim `> ` prompt into the first content line of a default Editor render.
 * Prefers replacing reserved leading spaces (paddingX >= 2). If those are missing,
 * prepends and removes an equal number of trailing spaces so width stays stable.
 * When `maxWidth` is set, hard-clamps every line to that visible width (SGR-aware
 * only for our own sequences; final safety net lives in the extension render).
 */
export function applyPromptPrefix(
	lines: string[],
	opts?: { color?: string; maxWidth?: number },
): string[] {
	if (lines.length < 3) return clampLines(lines, opts?.maxWidth);
	const color = opts?.color ?? "#888888";
	const out = lines.slice();
	const contentIdx = 1; // first content line after top border
	const line = out[contentIdx];
	if (line === undefined) return clampLines(lines, opts?.maxWidth);

	const colored = fgHex(color, PROMPT);
	const leading = line.match(/^[ ]*/)?.[0] ?? "";

	if (leading.length >= PROMPT_COLS) {
		// Reserved padding: swap leading spaces for the prompt (width-neutral).
		out[contentIdx] = colored + line.slice(PROMPT_COLS);
	} else {
		// Padding was wiped (common: Pi copies editorPaddingX=0 after factory).
		// Prepend prompt and steal trailing plain spaces to compensate.
		const growth = PROMPT_COLS - leading.length;
		out[contentIdx] = colored + trimTrailingSpaces(line, growth);
	}

	return clampLines(out, opts?.maxWidth);
}

/** Remove up to `count` trailing ASCII spaces (only when they are at the string end). */
export function trimTrailingSpaces(line: string, count: number): string {
	if (count <= 0) return line;
	let i = line.length;
	let left = count;
	while (left > 0 && i > 0 && line[i - 1] === " ") {
		i--;
		left--;
	}
	return line.slice(0, i);
}

/**
 * Soften full-width `─` borders to a quieter hairline feel by leaving them as-is
 * structurally (theme drives color via borderColor). Exposed for tests / future
 * rounded-corner experiments (`╭`/`╮` need side borders the stock Editor lacks).
 */
export function isBorderLine(line: string): boolean {
	const plain = line.replace(/\x1b\[[0-9;]*m/g, "");
	return plain.length > 0 && /^[─↑↓\d\s…]+$/.test(plain);
}

/** Sanity: prompt injection must not grow visible width when padding was reserved. */
export function promptPreservesWidth(before: string, after: string): boolean {
	return visibleLength(after) === visibleLength(before);
}

/** Clamp lines to maxWidth by dropping trailing plain characters (SGR-naive). */
function clampLines(lines: string[], maxWidth: number | undefined): string[] {
	if (maxWidth === undefined || maxWidth < 0) return lines;
	if (maxWidth === 0) return lines.map(() => "");
	return lines.map((line) => clampVisible(line, maxWidth));
}

/**
 * Truncate a line to `max` visible columns (counting only after stripping CSI SGR).
 * Drops from the end of the *plain* text by walking the string and keeping ANSI.
 * Good enough for editor chrome we author; extension layer should still use
 * pi-tui's truncateToWidth for grapheme/OSC correctness.
 */
export function clampVisible(line: string, max: number): string {
	if (max <= 0) return "";
	if (visibleLength(line) <= max) return line;

	let visible = 0;
	let out = "";
	let i = 0;
	while (i < line.length) {
		// CSI SGR: ESC [ ... m
		if (line[i] === "\x1b" && line[i + 1] === "[") {
			const end = line.indexOf("m", i + 2);
			if (end !== -1) {
				out += line.slice(i, end + 1);
				i = end + 1;
				continue;
			}
		}
		// APC / OSC-ish zero-width: ESC _ ... BEL or ESC ] ... BEL
		if (line[i] === "\x1b" && (line[i + 1] === "_" || line[i + 1] === "]")) {
			const end = line.indexOf("\x07", i + 2);
			if (end !== -1) {
				out += line.slice(i, end + 1);
				i = end + 1;
				continue;
			}
		}
		if (visible >= max) break;
		out += line[i];
		visible++;
		i++;
	}
	return out;
}

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
/** Left inset for the editor card (small, target-TUI-like margin). */
export const CARD_INDENT = 1;
/** Right column reserved for pi's chat scrollbar (box never covers it). */
export const RIGHT_MARGIN = 1;
/** Side borders added by boxLines (│ on each side). */
export const BOX_COLS = 2;
const HAIRLINE = "#383838";
const AMBER = "#dca84c";

/**
 * Card-ify rendered editor lines (target TUI): blank line above and below,
 * every line inset by CARD_INDENT columns. Caller is responsible for width
 * math: boxed lines at `width - RIGHT_MARGIN - CARD_INDENT` leave one free
 * column on the right for pi's scrollbar, so the result never exceeds
 * `width` and the margins read symmetric (1 left · 1 right + scrollbar).
 */
export function renderEditorCard(lines: string[], width: number): string[] {
	const indent = " ".repeat(CARD_INDENT);
	const blank = " ".repeat(Math.max(0, width));
	const body = lines.map((l) => indent + l);
	return [blank, ...body, blank];
}

/**
 * Border color policy for the card: quiet hairline by default, amber while
 * bash mode (`!` prefix) is armed. Pass the editor's current text.
 */
export function cardBorderColor(bashArmed: boolean): (s: string) => string {
	const color = bashArmed ? AMBER : HAIRLINE;
	return (s: string) => fgHex(color, s);
}

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

function stripAnsi(s: string): string {
	// eslint-disable-next-line no-control-regex
	return s.replace(/\x1b\[[0-9;]*m/g, "").replace(/\x1b[\]_][^\x07]*\x07/g, "");
}

function isBorderPlain(plain: string): boolean {
	return plain.length > 0 && /^[─↑↓\d\s…]+$/.test(plain);
}

/** Wrap a plain border rule in rounded corners (+2 width, matching the │ sides). */
function cornerize(plain: string, left: string, right: string): string {
	return left + plain + right;
}

/**
 * Wrap Editor output in a full rounded box:
 *   ╭────────╮
 *   │ > text │
 *   ╰────────╯
 *
 * Input contract: lines from Editor.render(contentWidth) — first line is the
 * top border rule, and the LAST border-like line is the bottom rule. Lines
 * after the bottom rule (autocomplete dropdown) are moved inside the box so
 * the card stays closed. Output width = contentWidth + 2.
 */
export function boxLines(lines: string[], border: (s: string) => string): string[] {
	if (lines.length < 3) return lines;
	const plains = lines.map(stripAnsi);
	if (!isBorderPlain(plains[0]!)) return lines;

	// Find the last border-like line = bottom rule.
	let bottomIdx = -1;
	for (let i = lines.length - 1; i >= 1; i--) {
		if (isBorderPlain(plains[i]!)) {
			bottomIdx = i;
			break;
		}
	}
	if (bottomIdx === -1) return lines;

	// Reorder so the bottom rule is last (pulls autocomplete inside the box).
	const content = [
		...lines.slice(1, bottomIdx),
		...lines.slice(bottomIdx + 1),
	];
	const top = border(cornerize(plains[0]!, "╭", "╮"));
	const bottom = border(cornerize(plains[bottomIdx]!, "╰", "╯"));
	const width = visibleLength(lines[0]!);
	const middle = content.map((l) => {
		const pad = Math.max(0, width - visibleLength(l));
		return border("│") + l + " ".repeat(pad) + border("│");
	});
	return [top, ...middle, bottom];
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

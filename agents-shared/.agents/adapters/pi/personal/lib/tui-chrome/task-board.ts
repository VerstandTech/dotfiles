/**
 * Task board (target TUI "Agent Swarm" section):
 *   001 [⣿⣿:.......] Better location? Chec…   12s
 *   005 [⣿⣿⣿:......] 4. The `Oracle` model…    3s
 * Numbered rows, green dotted mini-bar with a sweeping head, dim age.
 */

import { fgHex } from "../ops-hud/chrome.ts";
import { clampVisible } from "./editor-chrome.ts";
import { visibleLength } from "./working-row.ts";

const SKY = "#66a6f8";
const GREEN = "#60a670";
const GREEN_DIM = "#3a4a3e";
const INK = "#c8c8c8";
const FOG = "#707070";

export type BoardTask = {
	/** Stable id used for ordering; display index is assigned by position. */
	id: string;
	label: string;
	startedAt: number;
};

const CELLS = 10;

/** Mini dotted bar with a head sweeping left→right, phase-offset per row. */
export function miniBar(frame: number, offset = 0, cells = CELLS): string {
	const head = (frame + offset) % (cells + 2); // allow head to exit right edge
	let out = fgHex(FOG, "[");
	for (let i = 0; i < cells; i++) {
		const ch = i < head - 1 ? "⣿" : i === head - 1 || i === head ? ":" : "·";
		const color = ch === "⣿" ? GREEN : ch === ":" ? GREEN : GREEN_DIM;
		out += fgHex(color, ch);
	}
	return out + fgHex(FOG, "]");
}

function trunc(s: string, max: number): string {
	if (max <= 0) return "";
	if (s.length <= max) return s;
	return s.slice(0, Math.max(0, max - 1)) + "…";
}

/**
 * Render up to `maxRows` task rows. Index is the task's 1-based position in
 * `tasks` order (stable across frames so rows don't renumber while running).
 */
export function renderTaskBoard(
	tasks: BoardTask[],
	opts: { width: number; frame: number; now?: number; maxRows?: number },
): string[] {
	const width = Math.max(0, Math.floor(opts.width));
	if (width === 0 || tasks.length === 0) return [];
	const now = opts.now ?? Date.now();
	const maxRows = opts.maxRows ?? 6;

	const shown = tasks.slice(0, maxRows);
	const lines: string[] = [];
	for (let i = 0; i < shown.length; i++) {
		const t = shown[i]!;
		const idx = String(tasks.indexOf(t) + 1).padStart(3, "0");
		const age = Math.max(0, Math.floor((now - t.startedAt) / 1000));
		const leftPlain = `${idx} [${"·".repeat(CELLS)}] `;
		const rightPlain = `${age}s`;
		const labelBudget = width - leftPlain.length - rightPlain.length - 2;
		const label = trunc(t.label, Math.max(0, labelBudget));

		const line =
			fgHex(SKY, idx) +
			" " +
			miniBar(opts.frame, i * 3) +
			" " +
			fgHex(INK, label) +
			(label ? " " : "") +
			fgHex(FOG, rightPlain);
		lines.push(line);
	}
	if (tasks.length > maxRows) {
		lines.push(fgHex(FOG, `    +${tasks.length - maxRows} more`));
	}
	// Safety: never exceed width (ANSI-aware clamp on our own sequences).
	return lines.map((l) => (visibleLength(l) > width ? clampVisible(l, width) : l));
}

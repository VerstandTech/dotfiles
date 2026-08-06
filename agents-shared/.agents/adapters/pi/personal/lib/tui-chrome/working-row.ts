/**
 * Working-row component (target TUI):
 *   ◐ Working... ████████████████████
 * moon spinner + label + indeterminate progress bar filling the rest of the line.
 */

import { amberGradient, blendHex, fgHex } from "../ops-hud/chrome.ts";

const MOONS = ["◐", "◓", "◑", "◒"] as const;

export type WorkingRowInput = {
	width: number;
	frame: number;
	/** Default "Working..." — ops-hud may pass a richer label. */
	label?: string;
	/** Elapsed seconds (optional; appended dim when >= 1). */
	elapsedSec?: number;
};

/** Visible length ignoring CSI SGR sequences. */
export function visibleLength(s: string): number {
	// eslint-disable-next-line no-control-regex
	return s.replace(/\x1b\[[0-9;]*m/g, "").length;
}

/**
 * Solid sky progress bar (target TUI): a full `━` line with a soft gradient
 * that slowly travels across the bar — the bar is always "solid", only the
 * gradient animates.
 */
export function progressBar(width: number, frame: number): string {
	const w = Math.max(0, Math.floor(width));
	if (w === 0) return "";
	// Sky family loop; sampled per column, phase-shifted by frame.
	const stops = ["#5c94dd", "#66a6f8", "#7eb6fa", "#66a6f8", "#5c94dd"];
	const n = stops.length;
	let out = "";
	for (let i = 0; i < w; i++) {
		// Phase travels left→right over ~40 frames, then wraps.
		const phase = (i / w + frame / 40) % 1;
		const scaled = phase * (n - 1);
		const idx = Math.min(n - 2, Math.floor(scaled));
		out += fgHex(blendHex(stops[idx]!, stops[idx + 1]!, scaled - idx), "━");
	}
	return out;
}

/** Moon glyph with amber→gold gradient (screenshot spinner). */
export function moonFrame(frame: number): string {
	const moon = MOONS[((frame % MOONS.length) + MOONS.length) % MOONS.length]!;
	const colors = amberGradient(MOONS.length);
	return fgHex(colors[frame % colors.length]!, moon);
}

/**
 * Full working row. Always 1 line, never exceeds `width` visible columns.
 * Layout: `<moon> <label>[ elapsed] <bar…>`
 */
export function renderWorkingRow(input: WorkingRowInput): string {
	const width = Math.max(0, Math.floor(input.width));
	if (width === 0) return "";

	const moon = moonFrame(input.frame);
	const labelText = input.label?.trim() || "Working...";
	const label = fgHex("#66a6f8", labelText);

	let elapsed = "";
	if (input.elapsedSec !== undefined && input.elapsedSec >= 1) {
		elapsed = fgHex("#888888", ` ${input.elapsedSec}s`);
	}

	const prefix = `${moon} ${label}${elapsed} `;
	const prefixVis = visibleLength(prefix);
	const barWidth = Math.max(0, width - prefixVis);
	if (barWidth < 4) {
		// Tight: drop bar, truncate label side.
		const plain = `${MOONS[input.frame % MOONS.length]} ${labelText}${
			input.elapsedSec && input.elapsedSec >= 1 ? ` ${input.elapsedSec}s` : ""
		}`;
		return fgHex("#66a6f8", plain.slice(0, width));
	}
	return prefix + progressBar(barWidth, input.frame);
}

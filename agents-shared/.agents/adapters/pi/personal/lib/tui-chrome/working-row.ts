/**
 * Working-row component (target TUI):
 *   ◐ Working... ████████████████████
 * moon spinner + label + indeterminate progress bar filling the rest of the line.
 */

import { amberGradient, fgHex, skyTealGradient } from "../ops-hud/chrome.ts";

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

/** Build an indeterminate sky-blue progress bar that gently sweeps. */
export function progressBar(width: number, frame: number): string {
	const w = Math.max(0, Math.floor(width));
	if (w === 0) return "";
	const colors = skyTealGradient(Math.max(w, 8));
	// Sweep a bright head across a dimmer track.
	const head = ((frame * 2) % (w + 6)) - 3;
	let out = "";
	for (let i = 0; i < w; i++) {
		const dist = Math.abs(i - head);
		const ch = dist <= 1 ? "█" : dist <= 3 ? "▓" : dist <= 6 ? "▒" : "─";
		const color = colors[i % colors.length]!;
		// Head is brighter sky; track is deeper sky.
		const tone = dist <= 3 ? color : colors[Math.floor(colors.length * 0.25)]!;
		out += fgHex(tone, ch);
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

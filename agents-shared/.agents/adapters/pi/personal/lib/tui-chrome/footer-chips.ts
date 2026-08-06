/**
 * Mode-chip footer (target TUI):
 *   yolo swarm K3 thinking: high .../production-
 * Single line. Colored identity chips left, path dim right. No token dump.
 */

import { fgHex } from "../ops-hud/chrome.ts";
import { visibleLength } from "./working-row.ts";

// Local color constants match charcoal-ops chrome palette.
const AMBER = "#dca84c";
const TEAL = "#74bcbc";
const INK = "#e0e0e0";
const FOG = "#888888";
const SKY = "#66a6f8";

export type FooterChipsInput = {
	width: number;
	/** Amber mode chip — e.g. "bash", "plan", "yolo". */
	mode?: string | null;
	/** Teal secondary chip — e.g. "swarm", "herd", agent name. */
	agent?: string | null;
	/** Model short id (ink). */
	model?: string | null;
	/** Thinking level text without "thinking" prefix (e.g. "high"). */
	thinking?: string | null;
	/** Dim path / branch trailing segment. */
	path?: string | null;
	/** Optional herd summary fragment (working/blocked counts). */
	herd?: string | null;
};

export { visibleLength };

function trunc(s: string, max: number): string {
	if (max <= 0) return "";
	if (s.length <= max) return s;
	if (max <= 1) return "…";
	return `…${s.slice(-(max - 1))}`;
}

/** Map thinking level → ramp color (mirrors theme thinking* tokens). */
export function thinkingColor(level: string | null | undefined): string {
	switch ((level ?? "").toLowerCase()) {
		case "minimal":
			return FOG;
		case "low":
			return "#5c94dd";
		case "medium":
			return SKY;
		case "high":
			return TEAL;
		case "xhigh":
			return "#b0a0d0";
		case "max":
			return AMBER;
		default:
			return FOG;
	}
}

/**
 * Render one footer line of mode chips.
 * Priority when tight: mode+agent+thinking survive; path yields first, then model.
 */
export function renderFooterChips(input: FooterChipsInput): string {
	const width = Math.max(0, Math.floor(input.width));
	if (width === 0) return "";

	const parts: string[] = [];
	const plainParts: string[] = []; // parallel plain for budget math

	if (input.mode) {
		parts.push(fgHex(AMBER, input.mode));
		plainParts.push(input.mode);
	}
	if (input.agent) {
		parts.push(fgHex(TEAL, input.agent));
		plainParts.push(input.agent);
	}
	if (input.herd) {
		parts.push(fgHex(SKY, input.herd));
		plainParts.push(input.herd);
	}

	const midPlain: string[] = [];
	const midColor: string[] = [];
	if (input.model) {
		midPlain.push(input.model);
		midColor.push(fgHex(INK, input.model));
	}
	if (input.thinking) {
		const t = `thinking: ${input.thinking}`;
		midPlain.push(t);
		midColor.push(fgHex(thinkingColor(input.thinking), t));
	}

	const leftPlain = [...plainParts, ...midPlain].join(" ");
	const leftColor = [...parts, ...midColor].join(" ");

	const pathRaw = input.path?.trim() || "";
	let pathPlain = pathRaw;
	let gap = width - leftPlain.length - (pathPlain ? pathPlain.length : 0);

	if (pathPlain && gap < 2) {
		// Shrink path first.
		const budget = Math.max(0, width - leftPlain.length - 2);
		pathPlain = trunc(pathPlain, budget);
		gap = width - leftPlain.length - pathPlain.length;
	}
	if (gap < 1 && pathPlain) {
		// Drop path entirely.
		pathPlain = "";
		gap = width - leftPlain.length;
	}
	if (gap < 0) {
		// Last resort: plain truncate whole left.
		const plain = leftPlain.slice(0, width);
		return fgHex(INK, plain);
	}

	const pad = " ".repeat(Math.max(pathPlain ? gap : 0, pathPlain ? 2 : 0));
	// When no path, don't right-pad — left-aligned chips like the reference.
	if (!pathPlain) {
		// Ensure we don't exceed width via ANSI (plain already fits).
		return leftColor;
	}
	return leftColor + pad + fgHex(FOG, pathPlain);
}

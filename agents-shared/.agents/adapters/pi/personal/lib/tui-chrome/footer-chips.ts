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
 * Render one footer line of mode chips — all left-clustered like the target:
 *   yolo swarm K3 thinking: high  .../production-
 * Path trails the chips (dim, after two spaces) — never right-flushed.
 * Shrinking order when tight: path → model → herd → agent; mode+thinking last.
 */
export function renderFooterChips(input: FooterChipsInput): string {
	const width = Math.max(0, Math.floor(input.width));
	if (width === 0) return "";

	// Build chip list in display order with plain-text twins for budget math.
	type Chip = { color: string; plain: string; key: string };
	const chips: Chip[] = [];
	if (input.mode) chips.push({ key: "mode", color: AMBER, plain: input.mode });
	if (input.agent) chips.push({ key: "agent", color: TEAL, plain: input.agent });
	if (input.herd) chips.push({ key: "herd", color: SKY, plain: input.herd });
	if (input.model) chips.push({ key: "model", color: INK, plain: input.model });
	if (input.thinking) {
		chips.push({
			key: "thinking",
			color: thinkingColor(input.thinking),
			plain: `thinking: ${input.thinking}`,
		});
	}

	let path = input.path?.trim() || "";

	const paint = (list: Chip[], tail: string): string => {
		const left = list.map((c) => fgHex(c.color, c.plain)).join(" ");
		if (!tail) return left;
		return left + "  " + fgHex(FOG, tail);
	};
	const plainLen = (list: Chip[], tail: string) =>
		list.map((c) => c.plain).join(" ").length + (tail ? 2 + tail.length : 0);

	// 1. Shrink path to fit.
	if (path && plainLen(chips, path) > width) {
		const chipsLen = plainLen(chips, "");
		path = trunc(path, Math.max(0, width - chipsLen - 2));
	}
	// 2. Drop path if still over.
	if (path && plainLen(chips, path) > width) path = "";
	// 3. Drop lowest-priority chips until fit (mode + thinking survive longest).
	const droppable = ["model", "herd", "agent"];
	for (const key of droppable) {
		if (plainLen(chips, path) <= width) break;
		const idx = chips.findIndex((c) => c.key === key);
		if (idx >= 0) chips.splice(idx, 1);
	}
	// 4. Last resort: hard plain truncate.
	if (plainLen(chips, path) > width) {
		const plain =
			chips.map((c) => c.plain).join(" ") + (path ? `  ${path}` : "");
		return fgHex(INK, plain.slice(0, width));
	}
	return paint(chips, path);
}

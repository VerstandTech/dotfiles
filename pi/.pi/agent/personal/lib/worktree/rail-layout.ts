/**
 * Pure layout helpers for the full-height worktree rail overlay.
 */

export interface RailCardLine {
	id: string;
	label: string;
	detail?: string;
	focused?: boolean;
	busy?: boolean;
	dirty?: boolean;
}

export interface RailLayoutInput {
	width: number;
	height: number;
	title?: string;
	cards: RailCardLine[];
	selectedIndex: number;
	footerHints?: string[];
}

/** Visible width ignoring simple ANSI (layout uses plain strings). */
export function padTruncate(s: string, width: number): string {
	if (width <= 0) return "";
	const plain = s.replace(/\x1b\[[0-9;]*m/g, "");
	if (plain.length === width) return plain;
	if (plain.length < width) return plain + " ".repeat(width - plain.length);
	if (width <= 1) return "…".slice(0, width);
	return plain.slice(0, width - 1) + "…";
}

/**
 * Build a full-height bordered rail (plain text lines).
 * Caller applies theme colors when rendering in the TUI.
 */
export function buildFullHeightRail(input: RailLayoutInput): string[] {
	const w = Math.max(12, Math.floor(input.width));
	const h = Math.max(8, Math.floor(input.height));
	const inner = Math.max(1, w - 2);
	const title = input.title ?? "Worktrees";
	const hints = input.footerHints ?? ["↑↓ enter · esc"];

	const lines: string[] = [];
	lines.push(`╭${"─".repeat(inner)}╮`);
	lines.push(`│${padTruncate(` ${title}`, inner)}│`);
	lines.push(`├${"─".repeat(inner)}┤`);

	// Body: one line per card + optional detail; fill rest with blanks
	const bodyBudget = Math.max(1, h - 5 - hints.length); // borders+title+sep+footer seps
	const cardBlocks: string[][] = input.cards.map((c, i) => {
		const sel = i === input.selectedIndex;
		const mark = c.focused ? "●" : "○";
		const arrow = sel ? "→" : " ";
		const flags = `${c.dirty ? "*" : ""}${c.busy ? " busy" : ""}`;
		const main = `${arrow}${mark} ${c.id}  ${c.label}${flags}`;
		const block = [padTruncate(main, inner)];
		if (c.detail && bodyBudget >= input.cards.length * 2) {
			block.push(padTruncate(`  ${c.detail}`, inner));
		}
		return block;
	});

	const body: string[] = [];
	for (const b of cardBlocks) {
		for (const row of b) {
			if (body.length >= bodyBudget) break;
			body.push(row);
		}
		if (body.length >= bodyBudget) break;
	}
	while (body.length < bodyBudget) body.push(padTruncate("", inner));

	for (const row of body) {
		lines.push(`│${row}│`);
	}

	lines.push(`├${"─".repeat(inner)}┤`);
	for (const hint of hints) {
		lines.push(`│${padTruncate(` ${hint}`, inner)}│`);
	}
	lines.push(`╰${"─".repeat(inner)}╯`);

	// Exact height: pad or trim
	while (lines.length < h) {
		// insert blank body rows before footer separator
		const insertAt = lines.length - (2 + hints.length);
		lines.splice(Math.max(3, insertAt), 0, `│${padTruncate("", inner)}│`);
	}
	return lines.slice(0, h);
}

export function defaultRailOverlayOptions(): {
	anchor: "right-center";
	width: `${number}%`;
	minWidth: number;
	maxHeight: `${number}%`;
	margin: { top: number; right: number; bottom: number; left: number };
	visible: (termWidth: number) => boolean;
} {
	return {
		anchor: "right-center",
		width: "30%",
		minWidth: 32,
		maxHeight: "100%",
		margin: { top: 0, right: 0, bottom: 0, left: 1 },
		visible: (termWidth) => termWidth >= 80,
	};
}

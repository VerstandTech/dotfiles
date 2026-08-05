/**
 * Pure layout helpers for the full-height worktree rail overlay.
 * Borderless panel — caller applies a slight darker background per line.
 */

export interface RailCardLine {
	id: string;
	label: string;
	detail?: string;
	focused?: boolean;
	busy?: boolean;
	dirty?: boolean;
}

export type RailLineKind = "title" | "spacer" | "card" | "detail" | "hint" | "blank" | "selected";

export interface RailLaidOutLine {
	kind: RailLineKind;
	/** Plain text, already pad-truncated to width (no ANSI). */
	text: string;
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
 * Build a full-height borderless rail (plain text + kind tags).
 * No box-drawing characters — use background fill in the TUI for separation.
 */
export function buildFullHeightRailLines(input: RailLayoutInput): RailLaidOutLine[] {
	const w = Math.max(12, Math.floor(input.width));
	const h = Math.max(8, Math.floor(input.height));
	const title = input.title ?? "Worktrees";
	const hints = input.footerHints ?? ["↑↓ enter · esc"];

	const out: RailLaidOutLine[] = [];
	out.push({ kind: "title", text: padTruncate(` ${title}`, w) });
	out.push({ kind: "spacer", text: padTruncate("", w) });

	const footerBudget = hints.length + 1; // spacer + hints
	const bodyBudget = Math.max(1, h - 2 - footerBudget);

	const cardBlocks: RailLaidOutLine[][] = input.cards.map((c, i) => {
		const sel = i === input.selectedIndex;
		const mark = c.focused ? "●" : "○";
		const arrow = sel ? "→" : " ";
		const flags = `${c.dirty ? "*" : ""}${c.busy ? " busy" : ""}`;
		const main = `${arrow}${mark} ${c.id}  ${c.label}${flags}`;
		const block: RailLaidOutLine[] = [
			{
				kind: sel ? "selected" : "card",
				text: padTruncate(main, w),
			},
		];
		if (c.detail && bodyBudget >= input.cards.length * 2) {
			block.push({ kind: "detail", text: padTruncate(`  ${c.detail}`, w) });
		}
		return block;
	});

	const body: RailLaidOutLine[] = [];
	for (const b of cardBlocks) {
		for (const row of b) {
			if (body.length >= bodyBudget) break;
			body.push(row);
		}
		if (body.length >= bodyBudget) break;
	}
	while (body.length < bodyBudget) {
		body.push({ kind: "blank", text: padTruncate("", w) });
	}
	out.push(...body);

	out.push({ kind: "spacer", text: padTruncate("", w) });
	for (const hint of hints) {
		out.push({ kind: "hint", text: padTruncate(` ${hint}`, w) });
	}

	while (out.length < h) {
		// grow blank body before footer
		const insertAt = Math.max(2, out.length - footerBudget);
		out.splice(insertAt, 0, { kind: "blank", text: padTruncate("", w) });
	}
	return out.slice(0, h);
}

/** Plain strings only (tests / legacy). */
export function buildFullHeightRail(input: RailLayoutInput): string[] {
	return buildFullHeightRailLines(input).map((l) => l.text);
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

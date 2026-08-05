/**
 * Worktree board — mission-control for git worktrees.
 *
 * Commands: /wt list|status|new|focus|prune|run|open|acquire|release
 *           /wt-board — overlay picker
 * Shortcut: Ctrl+Alt+W — overlay picker
 * Footer status chip when a card is focused.
 *
 * Does NOT silently chdir the root session (D7).
 */

import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { matchesKey } from "@earendil-works/pi-tui";
import { discoverWorktrees } from "../lib/worktree/discover.ts";
import { loadRegistry, saveRegistry } from "../lib/worktree/io.ts";
import { addWorktree } from "../lib/worktree/new-worktree.ts";
import {
	buildFullHeightRailLines,
	defaultRailOverlayOptions,
	type RailCardLine,
} from "../lib/worktree/rail-layout.ts";
import {
	acquireWriter,
	boardToRegistry,
	formatBoardLines,
	formatBoardList,
	mergeBoard,
	pruneRegistry,
	registerCard,
	releaseWriter,
	resolveFocus,
	setFocused,
} from "../lib/worktree/registry.ts";
import { enrichCard } from "../lib/worktree/status.ts";
import type { WorktreeBoardState } from "../lib/worktree/types.ts";

const STATUS_KEY = "wt";
const WIDGET_KEY = "wt-board";

function repoRootOf(ctx: ExtensionContext): string {
	try {
		return execFileSync("git", ["rev-parse", "--show-toplevel"], {
			cwd: ctx.cwd,
			encoding: "utf8",
		}).trim();
	} catch {
		return resolve(ctx.cwd);
	}
}

function loadBoard(ctx: ExtensionContext): WorktreeBoardState {
	const repoRoot = repoRootOf(ctx);
	const discovery = discoverWorktrees({ repoRoot });
	const registry = loadRegistry(repoRoot);
	let board = mergeBoard({ repoRoot, discovery, registry });
	board = {
		...board,
		cards: board.cards.map((c) => {
			try {
				return enrichCard(c, { checkDirty: true });
			} catch {
				return c;
			}
		}),
	};
	return board;
}

function setFooter(ctx: ExtensionContext, board: WorktreeBoardState): void {
	if (!ctx.hasUI) return;
	const focused = board.cards.find((c) => c.id === board.focusedId);
	const busy = board.cards.filter((c) => c.busy === "busy").length;
	const theme = ctx.ui.theme;
	if (!focused && busy === 0) {
		ctx.ui.setStatus(STATUS_KEY, undefined);
		return;
	}
	const parts: string[] = [];
	if (focused) {
		parts.push(`wt:${focused.id}${focused.dirty ? "*" : ""}`);
	}
	if (busy > 0) parts.push(`busy×${busy}`);
	ctx.ui.setStatus(STATUS_KEY, theme.fg("accent", "●") + theme.fg("dim", ` ${parts.join(" ")}`));
}

/** Persistent board above the editor — does NOT append to chat transcript. */
function showBoardWidget(ctx: ExtensionContext, board: WorktreeBoardState): void {
	if (!ctx.hasUI) return;
	const theme = ctx.ui.theme;
	const lines = formatBoardLines(board, { includePaths: true, footer: true });
	ctx.ui.setWidget(
		WIDGET_KEY,
		lines.map((line, i) =>
			i === 0 || line.startsWith("Ctrl+")
				? theme.fg(i === 0 ? "accent" : "dim", line)
				: line.startsWith("  ")
					? theme.fg("dim", line)
					: theme.fg("muted", line),
		),
		{ placement: "aboveEditor" },
	);
	setFooter(ctx, board);
}

function clearBoardWidget(ctx: ExtensionContext): void {
	if (!ctx.hasUI) return;
	ctx.ui.setWidget(WIDGET_KEY, undefined);
}

function notify(
	ctx: ExtensionContext,
	text: string,
	kind: "info" | "warning" | "error" = "info",
): void {
	if (ctx.hasUI) ctx.ui.notify(text.slice(0, 400), kind);
}

async function openBoardOverlay(_pi: ExtensionAPI, ctx: ExtensionContext): Promise<void> {
	const board = loadBoard(ctx);
	if (board.cards.length === 0) {
		notify(ctx, "No worktrees discovered for this repo", "warning");
		return;
	}

	if (!ctx.hasUI) {
		return;
	}

	// Clear the above-editor strip so only the full-height rail is visible
	clearBoardWidget(ctx);

	const railCards: RailCardLine[] = board.cards.map((c) => ({
		id: c.id,
		label: c.branch ?? (c.detached ? "(detached)" : "?"),
		detail: c.path,
		focused: board.focusedId === c.id,
		busy: c.busy === "busy",
		dirty: Boolean(c.dirty),
	}));

	const initialIndex = Math.max(
		0,
		railCards.findIndex((c) => c.focused),
	);

	const selected = await ctx.ui.custom<string | null>(
		(tui, theme, _kb, done) => {
			let selectedIndex = initialIndex >= 0 ? initialIndex : 0;

			const paint = (width: number): string[] => {
				const rows = tui.terminal?.rows ?? process.stdout.rows ?? 24;
				const height = Math.max(10, rows);
				const laid = buildFullHeightRailLines({
					width,
					height,
					title: "Worktrees · no silent cd",
					cards: railCards,
					selectedIndex,
					footerHints: ["↑↓ move · enter focus · esc close"],
				});
				// Borderless panel: slight darker bg on every row
				const panel = (text: string) => theme.bg("customMessageBg", text);
				return laid.map((row) => {
					if (row.kind === "selected") {
						return theme.bg("selectedBg", theme.fg("accent", row.text));
					}
					let fg = row.text;
					if (row.kind === "title") fg = theme.fg("accent", theme.bold(row.text));
					else if (row.kind === "detail" || row.kind === "hint" || row.kind === "spacer" || row.kind === "blank")
						fg = theme.fg("dim", row.text);
					else if (row.kind === "card") fg = theme.fg("text", row.text);
					return panel(fg);
				});
			};

			return {
				render(width: number) {
					return paint(width);
				},
				invalidate() {},
				handleInput(data: string) {
					if (matchesKey(data, "escape") || matchesKey(data, "ctrl+c")) {
						done(null);
						return;
					}
					if (matchesKey(data, "up") || data === "k") {
						selectedIndex = Math.max(0, selectedIndex - 1);
						tui.requestRender();
						return;
					}
					if (matchesKey(data, "down") || data === "j") {
						selectedIndex = Math.min(railCards.length - 1, selectedIndex + 1);
						tui.requestRender();
						return;
					}
					if (matchesKey(data, "return") || matchesKey(data, "enter")) {
						const card = railCards[selectedIndex];
						done(card?.id ?? null);
					}
				},
			};
		},
		{
			overlay: true,
			overlayOptions: defaultRailOverlayOptions(),
		},
	);

	if (!selected) {
		// restore compact widget after dismiss if something was focused
		if (board.focusedId) showBoardWidget(ctx, board);
		return;
	}
	const reg = setFocused(boardToRegistry(board), selected);
	saveRegistry(board.repoRoot, reg);
	const next = { ...board, focusedId: selected };
	showBoardWidget(ctx, next);
	const card = next.cards.find((c) => c.id === selected);
	notify(
		ctx,
		`Focused ${selected}${card?.branch ? ` (${card.branch})` : ""} · cwd unchanged`,
		"info",
	);
}

export default function (pi: ExtensionAPI) {
	pi.registerShortcut("ctrl+alt+w", {
		description: "Worktree board overlay",
		handler: async (ctx) => {
			await openBoardOverlay(pi, ctx);
		},
	});

	pi.registerCommand("wt-board", {
		description: "Open worktree board overlay (Ctrl+Alt+W)",
		handler: async (_args, ctx) => {
			await openBoardOverlay(pi, ctx);
		},
	});

	pi.registerCommand("wt", {
		description:
			"Worktree board: list|status|new|focus|prune|run|open|acquire|release|board",
		getArgumentCompletions: (prefix) =>
			["list", "status", "new", "focus", "prune", "run", "open", "acquire", "release", "board"]
				.filter((o) => o.startsWith(prefix.trim()))
				.map((value) => ({ value, label: value })),
		handler: async (args, ctx) => {
			const parts = args.trim().split(/\s+/).filter(Boolean);
			const cmd = (parts[0] || "").toLowerCase();
			const rest = parts.slice(1);

			// Bare /wt or board/ui → left overlay picker (not chat)
			if (!cmd || cmd === "board" || cmd === "ui") {
				await openBoardOverlay(pi, ctx);
				return;
			}

			if (cmd === "list") {
				const dumpChat = rest.some((a) => a === "chat" || a === "--chat" || a === "dump");
				const hide = rest.some((a) => a === "hide" || a === "off" || a === "clear");
				const board = loadBoard(ctx);
				if (hide) {
					clearBoardWidget(ctx);
					notify(ctx, "Worktree board widget cleared", "info");
					return;
				}
				if (dumpChat) {
					// Explicit escape hatch only — avoids default chat pollution
					pi.sendMessage(
						{ customType: "wt-list", content: formatBoardList(board), display: true },
						{ triggerTurn: false },
					);
					notify(ctx, "Dumped board to chat (/wt list = widget only)", "info");
					return;
				}
				// Widget above editor — does not append to transcript
				showBoardWidget(ctx, board);
				notify(
					ctx,
					`Board above editor (${board.cards.length} trees). Ctrl+Alt+W to pick.`,
					"info",
				);
				return;
			}

			if (cmd === "status") {
				const board = loadBoard(ctx);
				const focused = board.cards.find((c) => c.id === board.focusedId);
				showBoardWidget(ctx, board);
				const summary = [
					focused
						? `focus ${focused.id} · ${focused.branch ?? "?"}${focused.dirty ? " dirty" : ""}`
						: "focus (none)",
					`session cwd ${ctx.cwd}`,
					`busy ${board.cards.filter((c) => c.busy === "busy").map((c) => c.id).join(",") || "—"}`,
					"(cwd unchanged on focus)",
				].join(" · ");
				notify(ctx, summary, "info");
				return;
			}

			if (cmd === "focus") {
				const q = rest.join(" ").trim();
				if (!q) {
					notify(ctx, "Usage: /wt focus <id|branch|path>", "warning");
					return;
				}
				const board = loadBoard(ctx);
				const id = resolveFocus(board, q);
				if (!id) {
					notify(ctx, `No worktree matches: ${q}`, "warning");
					return;
				}
				const reg = setFocused(boardToRegistry(board), id);
				saveRegistry(board.repoRoot, reg);
				const next = { ...board, focusedId: id };
				showBoardWidget(ctx, next);
				const card = board.cards.find((c) => c.id === id);
				notify(
					ctx,
					`Focused ${id}${card?.branch ? ` (${card.branch})` : ""} · cwd unchanged`,
					"info",
				);
				return;
			}

			if (cmd === "new") {
				const branch = rest[0];
				if (!branch) {
					notify(ctx, "Usage: /wt new <branch> [path]", "warning");
					return;
				}
				const pathArg = rest[1];
				const repoRoot = repoRootOf(ctx);
				try {
					const created = addWorktree({
						repoRoot,
						branch,
						path: pathArg,
						createBranch: true,
					});
					let reg = loadRegistry(repoRoot);
					const idGuess =
						created.path.split("/").pop()?.replace(/[^a-zA-Z0-9._-]+/g, "-") || "wt";
					reg = registerCard(reg, {
						path: created.path,
						label: branch,
						id: idGuess,
					});
					const discovery = discoverWorktrees({ repoRoot });
					reg = pruneRegistry(reg, discovery);
					reg = setFocused(reg, idGuess);
					saveRegistry(repoRoot, reg);
					const board = mergeBoard({ repoRoot, discovery, registry: reg });
					showBoardWidget(ctx, board);
					notify(ctx, `Created ${created.path} · ${branch}`, "info");
				} catch (err) {
					notify(ctx, err instanceof Error ? err.message : String(err), "error");
				}
				return;
			}

			if (cmd === "prune") {
				const repoRoot = repoRootOf(ctx);
				const discovery = discoverWorktrees({ repoRoot });
				const reg = pruneRegistry(loadRegistry(repoRoot), discovery);
				saveRegistry(repoRoot, reg);
				const board = mergeBoard({ repoRoot, discovery, registry: reg });
				showBoardWidget(ctx, board);
				notify(ctx, `Pruned registry → ${reg.entries?.length ?? 0} entries`, "info");
				return;
			}

			if (cmd === "acquire" || cmd === "release") {
				const idQ = rest[0];
				if (!idQ) {
					notify(ctx, `Usage: /wt ${cmd} <id>`, "warning");
					return;
				}
				const board = loadBoard(ctx);
				const id = resolveFocus(board, idQ) ?? idQ;
				if (cmd === "acquire") {
					const r = acquireWriter(board, id);
					if (!r.ok) {
						notify(ctx, r.reason ?? "acquire failed", "warning");
						return;
					}
					const next = {
						...board,
						cards: board.cards.map((c) =>
							c.id === id ? { ...c, busy: "busy" as const } : c,
						),
					};
					saveRegistry(board.repoRoot, boardToRegistry(next));
					showBoardWidget(ctx, next);
					notify(ctx, `Acquired writer on ${id}`, "info");
				} else {
					const next = releaseWriter(board, id);
					saveRegistry(board.repoRoot, boardToRegistry(next));
					showBoardWidget(ctx, next);
					notify(ctx, `Released writer on ${id}`, "info");
				}
				return;
			}

			if (cmd === "run") {
				const sub = (rest[0] || "").toLowerCase();
				const idQ = rest[1];
				if (!idQ || !["ship", "review"].includes(sub)) {
					notify(ctx, "Usage: /wt run ship|review <id>", "warning");
					return;
				}
				const board = loadBoard(ctx);
				const id = resolveFocus(board, idQ) ?? idQ;
				const card = board.cards.find((c) => c.id === id);
				if (!card) {
					notify(ctx, `Unknown card: ${idQ}`, "warning");
					return;
				}
				const acq = acquireWriter(board, card.id);
				if (!acq.ok) {
					notify(ctx, acq.reason ?? "cannot run", "warning");
					return;
				}
				const next = {
					...board,
					cards: board.cards.map((c) =>
						c.id === card.id ? { ...c, busy: "busy" as const } : c,
					),
					focusedId: card.id,
				};
				saveRegistry(board.repoRoot, boardToRegistry(next));
				showBoardWidget(ctx, next);
				const prompt =
					sub === "ship"
						? `Run skill **ship** targeting worktree **${card.path}** (branch ${card.branch ?? "?"}). ` +
							`Workspace is already a worktree (choice B). Do not chdir the root session; operate on that path. ` +
							`When done: tell user to run /wt release ${card.id}`
						: `Run fleet_dispatch kind=review scoped to worktree **${card.path}** (diff vs main/develop). ` +
							`Then fleet_collect + synthesis.md. When done: /wt release ${card.id}`;
				pi.sendMessage(
					{ customType: "wt-run", content: prompt, display: true },
					{ triggerTurn: true },
				);
				return;
			}

			if (cmd === "open") {
				const board = loadBoard(ctx);
				const q = rest.join(" ") || board.focusedId;
				if (!q) {
					notify(ctx, "Usage: /wt open <id>", "warning");
					return;
				}
				const id = resolveFocus(board, q);
				const card = board.cards.find((c) => c.id === id);
				if (!card) {
					notify(ctx, `Unknown: ${q}`, "warning");
					return;
				}
				try {
					// -c sets cwd without shell-interpolating the path
					execFileSync(
						"tmux",
						["new-window", "-c", card.path, "-n", card.id.slice(0, 20), "pi"],
						{ encoding: "utf8" },
					);
					notify(ctx, `Opened tmux window for ${card.id}`, "info");
				} catch {
					notify(ctx, `tmux unavailable — use: cd ${card.path} && pi`, "warning");
					pi.sendMessage(
						{
							customType: "wt-open",
							content: `cd ${card.path} && pi`,
							display: true,
						},
						{ triggerTurn: false },
					);
				}
				return;
			}

			notify(
				ctx,
				`Unknown /wt subcommand: ${cmd}. Try list|status|new|focus|prune|run|open|board`,
				"warning",
			);
		},
	});
}

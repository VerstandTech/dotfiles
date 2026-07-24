/**
 * Merge discovery + registry, caps, focus, prune, format.
 */

import { basename, resolve } from "node:path";
import type {
	AcquireWriterResult,
	BoardRegistryFile,
	DiscoveredWorktree,
	WorktreeBoardState,
	WorktreeCard,
} from "./types.ts";
import { DEFAULT_MAX_BUSY_WRITERS } from "./types.ts";

function nowIso(): string {
	return new Date().toISOString();
}

export function slugFromPath(path: string): string {
	const base = basename(resolve(path));
	return base.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "root";
}

export function mergeBoard(input: {
	repoRoot: string;
	discovery: DiscoveredWorktree[];
	registry: BoardRegistryFile;
	now?: string;
}): WorktreeBoardState {
	const at = input.now ?? nowIso();
	const byPath = new Map(
		(input.registry.entries ?? []).map((e) => [resolve(e.path), e] as const),
	);
	const cards: WorktreeCard[] = input.discovery.map((d) => {
		const path = resolve(d.path);
		const over = byPath.get(path);
		const id = over?.id ?? slugFromPath(path);
		return {
			id,
			path,
			branch: d.branch,
			head: d.head,
			detached: d.detached,
			bare: d.bare,
			label: over?.label,
			busy: over?.busy === "busy" ? "busy" : "idle",
			agentRunId: over?.agentRunId,
			sessionId: over?.sessionId,
			bddPhase: over?.bddPhase,
			updatedAt: at,
		};
	});

	// Prefer main worktree id "main" when path === repoRoot
	const root = resolve(input.repoRoot);
	for (const c of cards) {
		if (resolve(c.path) === root && !byPath.get(root)?.id) {
			c.id = "main";
		}
	}

	return {
		repoRoot: root,
		focusedId: input.registry.focusedId,
		maxBusyWriters: input.registry.maxBusyWriters ?? DEFAULT_MAX_BUSY_WRITERS,
		cards,
	};
}

export function acquireWriter(
	board: WorktreeBoardState,
	id: string,
): AcquireWriterResult {
	const trimmed = id.trim();
	if (!trimmed) {
		return { ok: false, reason: "Writer acquire requires an explicit card id" };
	}
	const card = board.cards.find((c) => c.id === trimmed);
	if (!card) {
		return { ok: false, reason: `Unknown card id: ${trimmed}` };
	}
	if (card.busy === "busy") {
		return { ok: true, card }; // already held
	}
	const busyCount = board.cards.filter((c) => c.busy === "busy").length;
	if (busyCount >= board.maxBusyWriters) {
		return {
			ok: false,
			reason: `maxBusyWriters=${board.maxBusyWriters} already busy; release a writer first`,
		};
	}
	return { ok: true, card: { ...card, busy: "busy", updatedAt: nowIso() } };
}

export function releaseWriter(
	board: WorktreeBoardState,
	id: string,
): WorktreeBoardState {
	return {
		...board,
		cards: board.cards.map((c) =>
			c.id === id ? { ...c, busy: "idle", agentRunId: undefined, updatedAt: nowIso() } : c,
		),
	};
}

export function pruneRegistry(
	registry: BoardRegistryFile,
	discovery: DiscoveredWorktree[],
): BoardRegistryFile {
	const live = new Set(discovery.map((d) => resolve(d.path)));
	return {
		...registry,
		entries: (registry.entries ?? []).filter((e) => live.has(resolve(e.path))),
	};
}

export function resolveFocus(board: WorktreeBoardState, query: string): string | undefined {
	const q = query.trim();
	if (!q) return undefined;
	const exactId = board.cards.find((c) => c.id === q);
	if (exactId) return exactId.id;
	const byBranch = board.cards.find((c) => c.branch === q);
	if (byBranch) return byBranch.id;
	const lower = q.toLowerCase();
	const byPath = board.cards.find(
		(c) => c.path.toLowerCase().includes(lower) || c.id.toLowerCase().includes(lower),
	);
	return byPath?.id;
}

export function registerCard(
	registry: BoardRegistryFile,
	entry: NonNullable<BoardRegistryFile["entries"]>[number],
): BoardRegistryFile {
	const path = resolve(entry.path);
	const rest = (registry.entries ?? []).filter((e) => resolve(e.path) !== path);
	return {
		...registry,
		version: 1,
		entries: [...rest, { ...entry, path }],
	};
}

export function setFocused(
	registry: BoardRegistryFile,
	focusedId: string | undefined,
): BoardRegistryFile {
	return { ...registry, version: 1, focusedId };
}

export function formatBoardList(board: WorktreeBoardState): string {
	const lines = board.cards.map((c) => {
		const focus = board.focusedId === c.id ? "●" : "○";
		const busy = c.busy === "busy" ? " busy" : "";
		const br = c.branch ?? (c.detached ? "(detached)" : "?");
		const label = c.label ? ` — ${c.label}` : "";
		return `${focus} ${c.id}  ${br}${busy}${label}\n    ${c.path}`;
	});
	const header = `Worktrees @ ${board.repoRoot} (busy cap ${board.maxBusyWriters})`;
	return [header, ...lines].join("\n");
}

export function boardToRegistry(board: WorktreeBoardState): BoardRegistryFile {
	return {
		version: 1,
		maxBusyWriters: board.maxBusyWriters,
		focusedId: board.focusedId,
		entries: board.cards.map((c) => ({
			path: c.path,
			id: c.id,
			label: c.label,
			busy: c.busy,
			agentRunId: c.agentRunId,
			sessionId: c.sessionId,
			bddPhase: c.bddPhase,
		})),
	};
}

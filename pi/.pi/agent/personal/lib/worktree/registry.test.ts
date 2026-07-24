import { describe, expect, test } from "bun:test";
import type { DiscoveredWorktree, BoardRegistryFile } from "./types.ts";
import {
	mergeBoard,
	acquireWriter,
	releaseWriter,
	pruneRegistry,
	resolveFocus,
	registerCard,
	formatBoardList,
	boardToRegistry,
	setFocused,
} from "./registry.ts";

const discovery: DiscoveredWorktree[] = [
	{ path: "/repo", branch: "main", head: "a" },
	{ path: "/repo/.worktrees/feat-a", branch: "feat/a", head: "b" },
	{ path: "/repo/.worktrees/feat-b", branch: "feat/b", head: "c" },
];

describe("mergeBoard (R5)", () => {
	test("R5-E1 merges registry label onto discovery", () => {
		const reg: BoardRegistryFile = {
			version: 1,
			entries: [{ path: "/repo/.worktrees/feat-a", label: "Billing fix", id: "feat-a" }],
		};
		const board = mergeBoard({ repoRoot: "/repo", discovery, registry: reg });
		expect(board.cards).toHaveLength(3);
		const card = board.cards.find((c) => c.path.endsWith("feat-a"));
		expect(card?.label).toBe("Billing fix");
		expect(card?.id).toBe("feat-a");
		expect(card?.branch).toBe("feat/a");
		expect(card?.busy).toBe("idle");
	});

	test("default maxBusyWriters is 2", () => {
		const board = mergeBoard({ repoRoot: "/repo", discovery, registry: { version: 1 } });
		expect(board.maxBusyWriters).toBe(2);
	});
});

describe("acquireWriter / releaseWriter (R2, R3)", () => {
	test("R3-E1 rejects empty id", () => {
		let board = mergeBoard({ repoRoot: "/repo", discovery, registry: { version: 1 } });
		const r = acquireWriter(board, "");
		expect(r.ok).toBe(false);
		expect(r.reason).toMatch(/id/i);
	});

	test("R2-E1 third acquire fails when max=2", () => {
		let board = mergeBoard({ repoRoot: "/repo", discovery, registry: { version: 1, maxBusyWriters: 2 } });
		const a = board.cards[1]!.id;
		const b = board.cards[2]!.id;
		const c = board.cards[0]!.id;
		expect(acquireWriter(board, a).ok).toBe(true);
		board = acquireWriter(board, a).card ? applyAcquire(board, a) : board;
		board = applyAcquire(board, b);
		const third = acquireWriter(board, c);
		expect(third.ok).toBe(false);
		expect(third.reason).toMatch(/max|busy|writer/i);
	});

	test("R2-E2 release then acquire succeeds", () => {
		let board = mergeBoard({ repoRoot: "/repo", discovery, registry: { version: 1, maxBusyWriters: 2 } });
		const a = board.cards[1]!.id;
		const b = board.cards[2]!.id;
		board = applyAcquire(board, a);
		board = applyAcquire(board, b);
		board = releaseWriter(board, a);
		const again = acquireWriter(board, a);
		expect(again.ok).toBe(true);
	});
});

describe("pruneRegistry (R4)", () => {
	test("R4-E1 drops stale paths", () => {
		const reg: BoardRegistryFile = {
			version: 1,
			entries: [
				{ path: "/repo/.worktrees/feat-a", label: "keep" },
				{ path: "/repo/.worktrees/gone", label: "stale" },
			],
		};
		const pruned = pruneRegistry(reg, discovery);
		expect(pruned.entries?.map((e) => e.path)).toEqual(["/repo/.worktrees/feat-a"]);
	});
});

describe("resolveFocus (R6)", () => {
	test("R6-E1 focus by branch name", () => {
		const board = mergeBoard({ repoRoot: "/repo", discovery, registry: { version: 1 } });
		const id = resolveFocus(board, "feat/a");
		expect(id).toBeTruthy();
		const card = board.cards.find((c) => c.id === id);
		expect(card?.branch).toBe("feat/a");
	});

	test("focus by path substring", () => {
		const board = mergeBoard({ repoRoot: "/repo", discovery, registry: { version: 1 } });
		const id = resolveFocus(board, "feat-b");
		expect(board.cards.find((c) => c.id === id)?.path).toContain("feat-b");
	});
});

describe("registerCard", () => {
	test("adds entry for new path metadata", () => {
		const reg = registerCard(
			{ version: 1, entries: [] },
			{ path: "/repo/.worktrees/feat-a", label: "A", id: "feat-a" },
		);
		expect(reg.entries).toHaveLength(1);
		expect(reg.entries![0]!.label).toBe("A");
	});
});

describe("formatBoardList", () => {
	test("renders lines with focus marker", () => {
		const board = mergeBoard({
			repoRoot: "/repo",
			discovery,
			registry: {
				version: 1,
				focusedId: "feat-a",
				entries: [
					{ path: "/repo/.worktrees/feat-a", id: "feat-a", busy: "busy" },
				],
			},
		});
		const text = formatBoardList(board);
		expect(text).toContain("busy cap 2");
		expect(text).toMatch(/● feat-a/);
		expect(text).toMatch(/busy/);
	});
});

describe("boardToRegistry round-trip", () => {
	test("preserves busy and focusedId", () => {
		let board = mergeBoard({
			repoRoot: "/repo",
			discovery,
			registry: { version: 1, entries: [{ path: "/repo/.worktrees/feat-a", id: "feat-a" }] },
		});
		const id = "feat-a";
		board = applyAcquire(board, id);
		const reg = setFocused(boardToRegistry(board), id);
		const again = mergeBoard({ repoRoot: "/repo", discovery, registry: reg });
		expect(again.focusedId).toBe(id);
		expect(again.cards.find((c) => c.id === id)?.busy).toBe("busy");
	});
});

describe("acquireWriter edges", () => {
	test("unknown id rejected", () => {
		const board = mergeBoard({ repoRoot: "/repo", discovery, registry: { version: 1 } });
		expect(acquireWriter(board, "nope").ok).toBe(false);
	});

	test("already busy is ok", () => {
		let board = mergeBoard({ repoRoot: "/repo", discovery, registry: { version: 1 } });
		const id = board.cards[1]!.id;
		board = applyAcquire(board, id);
		expect(acquireWriter(board, id).ok).toBe(true);
	});
});

function applyAcquire(
	board: ReturnType<typeof mergeBoard>,
	id: string,
): ReturnType<typeof mergeBoard> {
	const r = acquireWriter(board, id);
	if (!r.ok || !r.card) throw new Error(r.reason ?? "acquire failed");
	return {
		...board,
		cards: board.cards.map((c) => (c.id === id ? { ...c, busy: "busy" as const } : c)),
	};
}

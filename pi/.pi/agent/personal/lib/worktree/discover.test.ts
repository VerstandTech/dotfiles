import { describe, expect, test } from "bun:test";
import { parseWorktreePorcelain, filterToRepo, discoverWorktrees } from "./discover.ts";

/** R7-E1 fixture: standard porcelain */
const FIXTURE = `
worktree /repo
HEAD abc111
branch refs/heads/main

worktree /repo/.worktrees/feat-a
HEAD def222
branch refs/heads/feat/a

worktree /repo/.worktrees/detached-one
HEAD 999aaa
detached

worktree /other/foreign
HEAD fff000
branch refs/heads/main
`.trim();

describe("parseWorktreePorcelain (R7)", () => {
	test("R7-E1 parses paths, branches, detached", () => {
		const rows = parseWorktreePorcelain(FIXTURE);
		expect(rows.length).toBe(4);
		expect(rows[0]).toMatchObject({ path: "/repo", branch: "main", head: "abc111" });
		expect(rows[1]).toMatchObject({ path: "/repo/.worktrees/feat-a", branch: "feat/a" });
		expect(rows[2]).toMatchObject({ path: "/repo/.worktrees/detached-one", detached: true });
		expect(rows[2]?.branch).toBeUndefined();
	});

	test("handles bare and locked flags", () => {
		const rows = parseWorktreePorcelain(
			`worktree /repo\nbare\n\nworktree /repo/wt\nHEAD aaa\nbranch refs/heads/x\nlocked why\n`,
		);
		expect(rows[0]?.bare).toBe(true);
		expect(rows[1]?.locked).toBe(true);
	});
});

describe("filterToRepo (R1)", () => {
	test("R1-E1 keeps trees under repo root prefix", () => {
		const rows = parseWorktreePorcelain(FIXTURE);
		const scoped = filterToRepo(rows, "/repo");
		expect(scoped.map((r) => r.path)).toEqual([
			"/repo",
			"/repo/.worktrees/feat-a",
			"/repo/.worktrees/detached-one",
		]);
	});

	test("R1-E2 excludes foreign paths", () => {
		const rows = parseWorktreePorcelain(FIXTURE);
		const scoped = filterToRepo(rows, "/repo");
		expect(scoped.some((r) => r.path.startsWith("/other"))).toBe(false);
	});

	test("excludes sibling prefix /repo-evil", () => {
		const rows = [
			{ path: "/repo", branch: "main" },
			{ path: "/repo-evil/wt", branch: "x" },
		];
		expect(filterToRepo(rows, "/repo").map((r) => r.path)).toEqual(["/repo"]);
	});
});

describe("discoverWorktrees", () => {
	test("uses runner output and scopes to repoRoot", () => {
		const found = discoverWorktrees({
			repoRoot: "/repo",
			runPorcelain: () => FIXTURE,
		});
		expect(found).toHaveLength(3);
	});
});

import { describe, expect, test } from "bun:test";
import {
	addWorktree,
	assertPathUnderRepo,
	buildWorktreeAddArgs,
	defaultWorktreePath,
} from "./new-worktree.ts";

describe("defaultWorktreePath", () => {
	test("nests under .worktrees with slug", () => {
		expect(defaultWorktreePath("/repo", "feat/foo")).toBe("/repo/.worktrees/feat-foo");
	});

	test("rejects .. branch escape via slugify", () => {
		const p = defaultWorktreePath("/repo", "..");
		expect(p.startsWith("/repo/.worktrees/")).toBe(true);
		expect(p.includes("/..")).toBe(false);
	});
});

describe("buildWorktreeAddArgs", () => {
	test("creates branch with -b", () => {
		expect(buildWorktreeAddArgs({ path: "/repo/.worktrees/x", branch: "feat/x" })).toEqual([
			"worktree",
			"add",
			"-b",
			"feat/x",
			"/repo/.worktrees/x",
			"HEAD",
		]);
	});

	test("custom startPoint", () => {
		expect(
			buildWorktreeAddArgs({
				path: "/repo/.worktrees/x",
				branch: "feat/x",
				startPoint: "origin/main",
			}),
		).toEqual(["worktree", "add", "-b", "feat/x", "/repo/.worktrees/x", "origin/main"]);
	});

	test("existing branch mode", () => {
		expect(
			buildWorktreeAddArgs({
				path: "/repo/.worktrees/x",
				branch: "feat/x",
				createBranch: false,
			}),
		).toEqual(["worktree", "add", "/repo/.worktrees/x", "feat/x"]);
	});
});

describe("addWorktree", () => {
	test("invokes exec with args", () => {
		const calls: string[][] = [];
		const r = addWorktree({
			repoRoot: "/repo",
			branch: "feat/y",
			exec: (_cwd, args) => {
				calls.push(args);
			},
		});
		expect(r.path).toContain(".worktrees");
		expect(calls[0]?.[0]).toBe("worktree");
	});

	test("rejects path outside repo root", () => {
		expect(() =>
			addWorktree({
				repoRoot: "/repo",
				branch: "x",
				path: "/tmp/evil",
				exec: () => {},
			}),
		).toThrow(/under repo root/);
	});
});

describe("assertPathUnderRepo", () => {
	test("allows nested path", () => {
		expect(assertPathUnderRepo("/repo", "/repo/.worktrees/a")).toBe("/repo/.worktrees/a");
	});
});

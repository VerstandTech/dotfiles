/**
 * Create a git worktree (pure command builder + optional exec).
 */

import { execFileSync } from "node:child_process";
import { join, resolve } from "node:path";

export function slugifyBranch(branch: string): string {
	let slug = branch
		.replace(/^refs\/heads\//, "")
		.replace(/[^a-zA-Z0-9._/-]+/g, "-")
		.replace(/\//g, "-")
		.replace(/^\.+/, "")
		.replace(/\.+/g, ".")
		.replace(/^-+|-+$/g, "");
	if (!slug || slug === "." || slug === ".." || slug.includes("..")) {
		slug = "wt";
	}
	// final allowlist — no path separators
	slug = slug.replace(/[^a-zA-Z0-9._-]+/g, "-") || "wt";
	return slug;
}

export function defaultWorktreePath(repoRoot: string, branch: string): string {
	const slug = slugifyBranch(branch);
	const path = join(resolve(repoRoot), ".worktrees", slug);
	return assertPathUnderRepo(repoRoot, path);
}

export function buildWorktreeAddArgs(options: {
	path: string;
	branch: string;
	/** Create new branch (-b) vs checkout existing */
	createBranch?: boolean;
	startPoint?: string;
}): string[] {
	const args = ["worktree", "add"];
	if (options.createBranch !== false) {
		args.push("-b", options.branch);
	}
	args.push(options.path);
	if (options.createBranch !== false) {
		args.push(options.startPoint ?? "HEAD");
	} else {
		args.push(options.branch);
	}
	return args;
}

/** Ensure worktree path stays under repo root (no escape). */
export function assertPathUnderRepo(repoRoot: string, worktreePath: string): string {
	const root = resolve(repoRoot);
	const path = resolve(worktreePath);
	if (path !== root && !path.startsWith(root + "/")) {
		throw new Error(`Worktree path must be under repo root: ${path} not in ${root}`);
	}
	return path;
}

export function addWorktree(options: {
	repoRoot: string;
	branch: string;
	path?: string;
	createBranch?: boolean;
	startPoint?: string;
	exec?: (cwd: string, args: string[]) => void;
}): { path: string; branch: string } {
	const path = assertPathUnderRepo(
		options.repoRoot,
		options.path ?? defaultWorktreePath(options.repoRoot, options.branch),
	);
	const args = buildWorktreeAddArgs({
		path,
		branch: options.branch,
		createBranch: options.createBranch,
		startPoint: options.startPoint,
	});
	const exec =
		options.exec ??
		((cwd, a) => {
			execFileSync("git", a, { cwd, encoding: "utf8" });
		});
	exec(options.repoRoot, args);
	return { path, branch: options.branch };
}

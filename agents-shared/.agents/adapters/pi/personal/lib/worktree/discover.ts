/**
 * Parse `git worktree list --porcelain` and scope to a repo root.
 */

import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import type { DiscoveredWorktree } from "./types.ts";

export function parseWorktreePorcelain(text: string): DiscoveredWorktree[] {
	const rows: DiscoveredWorktree[] = [];
	let current: DiscoveredWorktree | null = null;

	const flush = () => {
		if (current?.path) rows.push(current);
		current = null;
	};

	for (const rawLine of text.split(/\r?\n/)) {
		const line = rawLine.trimEnd();
		if (!line) {
			flush();
			continue;
		}
		if (line.startsWith("worktree ")) {
			flush();
			current = { path: resolve(line.slice("worktree ".length).trim()) };
			continue;
		}
		if (!current) continue;
		if (line.startsWith("HEAD ")) {
			current.head = line.slice("HEAD ".length).trim();
		} else if (line.startsWith("branch ")) {
			const ref = line.slice("branch ".length).trim();
			current.branch = ref.replace(/^refs\/heads\//, "");
		} else if (line === "detached") {
			current.detached = true;
		} else if (line === "bare") {
			current.bare = true;
		} else if (line.startsWith("locked")) {
			current.locked = true;
		} else if (line.startsWith("prunable")) {
			current.prunable = true;
		}
	}
	flush();
	return rows;
}

/** Keep worktrees whose path is the repo root or nested under it. */
export function filterToRepo(
	rows: DiscoveredWorktree[],
	repoRoot: string,
): DiscoveredWorktree[] {
	const root = resolve(repoRoot);
	return rows.filter((r) => {
		const p = resolve(r.path);
		return p === root || p.startsWith(root + "/");
	});
}

export function discoverWorktrees(options: {
	repoRoot: string;
	/** Inject for tests */
	runPorcelain?: () => string;
}): DiscoveredWorktree[] {
	const run =
		options.runPorcelain ??
		(() =>
			execFileSync("git", ["worktree", "list", "--porcelain"], {
				cwd: options.repoRoot,
				encoding: "utf8",
			}));
	const rows = parseWorktreePorcelain(run());
	return filterToRepo(rows, options.repoRoot);
}

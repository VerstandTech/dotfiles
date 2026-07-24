/**
 * Enrich cards with dirty flag and optional BDD phase from worktree cwd.
 */

import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import type { WorktreeCard } from "./types.ts";

export function isWorktreeDirty(
	cwd: string,
	run?: (cwd: string) => string,
): boolean {
	const out =
		run?.(cwd) ??
		execFileSync("git", ["status", "--porcelain"], { cwd, encoding: "utf8" });
	return out.trim().length > 0;
}

export function readBddPhase(
	cwd: string,
	io: { exists?: (p: string) => boolean; read?: (p: string) => string } = {},
): string | undefined {
	const exists = io.exists ?? existsSync;
	const read = io.read ?? ((p: string) => readFileSync(p, "utf8"));
	// Session state may live under ~/.pi — project may have .pi/bdd.json only.
	// Prefer a small stamp file if present: .pi/bdd-phase (optional future)
	const stamp = join(cwd, ".pi", "bdd-phase");
	if (exists(stamp)) {
		return read(stamp).trim() || undefined;
	}
	return undefined;
}

export function enrichCard(
	card: WorktreeCard,
	opts: {
		dirty?: boolean;
		bddPhase?: string;
		checkDirty?: boolean;
	} = {},
): WorktreeCard {
	const dirty =
		opts.dirty ??
		(opts.checkDirty ? isWorktreeDirty(card.path) : card.dirty);
	const bddPhase = opts.bddPhase ?? card.bddPhase ?? readBddPhase(card.path);
	return {
		...card,
		dirty,
		bddPhase,
		updatedAt: new Date().toISOString(),
	};
}

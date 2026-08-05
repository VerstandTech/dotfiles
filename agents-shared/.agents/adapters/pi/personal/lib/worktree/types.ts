/**
 * Worktree board domain types (P0 contracts).
 */

export type WorktreeBusyState = "idle" | "busy";

export interface DiscoveredWorktree {
	/** Absolute path to the worktree */
	path: string;
	/** HEAD commit sha if present */
	head?: string;
	/** Branch short name without refs/heads/; undefined if detached */
	branch?: string;
	detached?: boolean;
	bare?: boolean;
	locked?: boolean;
	prunable?: boolean;
}

export interface WorktreeCard {
	/** Stable id: slug from path basename or explicit */
	id: string;
	path: string;
	branch?: string;
	head?: string;
	detached?: boolean;
	bare?: boolean;
	/** Registry / operator label */
	label?: string;
	busy: WorktreeBusyState;
	/** Optional agent/run linkage */
	agentRunId?: string;
	sessionId?: string;
	bddPhase?: string;
	dirty?: boolean;
	updatedAt: string;
}

export interface WorktreeBoardState {
	/** Absolute repo root (main worktree path) used as scope */
	repoRoot: string;
	focusedId?: string;
	maxBusyWriters: number;
	cards: WorktreeCard[];
}

export interface AcquireWriterResult {
	ok: boolean;
	reason?: string;
	card?: WorktreeCard;
}

export interface BoardRegistryFile {
	version: 1;
	maxBusyWriters?: number;
	focusedId?: string;
	/** Sparse overrides keyed by absolute path */
	entries?: Array<{
		path: string;
		id?: string;
		label?: string;
		busy?: WorktreeBusyState;
		agentRunId?: string;
		sessionId?: string;
		bddPhase?: string;
	}>;
}

export const DEFAULT_MAX_BUSY_WRITERS = 2;

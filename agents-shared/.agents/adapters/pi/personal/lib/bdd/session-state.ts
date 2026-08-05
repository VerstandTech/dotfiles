/**
 * Read BDD session snapshot from Pi session branch (for cross-extension gates).
 */

import type { BddState } from "./types.ts";

export const BDD_STATE_CUSTOM_TYPE = "bdd-mode-state";

export interface SessionBranchEntry {
	type?: string;
	customType?: string;
	data?: unknown;
}

/** Last bdd-mode-state custom entry on the branch, if any. */
export function readBddStateFromBranch(branch: SessionBranchEntry[]): BddState | undefined {
	let restored: BddState | undefined;
	for (const entry of branch) {
		if (entry.type === "custom" && entry.customType === BDD_STATE_CUSTOM_TYPE) {
			restored = entry.data as BddState;
		}
	}
	return restored;
}

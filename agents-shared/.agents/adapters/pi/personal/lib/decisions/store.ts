/**
 * Pure decision-store helpers: upsert, query, supersede, pre-action gates.
 */

export * from "./evidence.ts";

import type {
	DecisionGateResult,
	DecisionQuery,
	DecisionRecord,
	DecisionStatus,
	DecisionStore,
	DecisionKind,
} from "./types.ts";

export function emptyDecisionStore(project?: string): DecisionStore {
	return { version: 1, project, decisions: [] };
}

export function upsertDecision(store: DecisionStore, record: DecisionRecord): DecisionStore {
	const rest = store.decisions.filter((d) => d.id !== record.id);
	return {
		...store,
		version: 1,
		decisions: [...rest, { ...record, updatedAt: record.updatedAt || record.createdAt }],
	};
}

export function getDecision(store: DecisionStore, id: string): DecisionRecord | undefined {
	return store.decisions.find((d) => d.id === id);
}

function asArray<T>(value: T | T[] | undefined): T[] {
	if (value == null) return [];
	return Array.isArray(value) ? value : [value];
}

export function queryDecisions(store: DecisionStore, query: DecisionQuery = {}): DecisionRecord[] {
	const statuses = asArray(query.status);
	const kinds = asArray(query.kind);
	const text = query.text?.toLowerCase().trim();
	const tag = query.tag?.toLowerCase();
	const path = query.path;

	return store.decisions.filter((d) => {
		if (statuses.length && !statuses.includes(d.status)) return false;
		if (kinds.length && !kinds.includes(d.kind)) return false;
		if (query.humanApprovedOnly && d.humanReview !== "approved") return false;
		if (tag && !(d.tags ?? []).some((t) => t.toLowerCase() === tag)) return false;
		if (path && d.scopePaths?.length) {
			const ok = d.scopePaths.some(
				(p) => path === p || path.startsWith(p.replace(/\*\*$/, "")) || path.includes(p),
			);
			if (!ok) return false;
		}
		if (text) {
			const blob = `${d.title} ${d.context} ${d.decision} ${d.consequences ?? ""}`.toLowerCase();
			if (!blob.includes(text)) return false;
		}
		return true;
	});
}

export function acceptedDecisions(store: DecisionStore): DecisionRecord[] {
	return queryDecisions(store, { status: "accepted" });
}

/**
 * Supersede an existing decision: mark old superseded, insert/update new as accepted.
 */
export function supersedeDecision(
	store: DecisionStore,
	oldId: string,
	next: DecisionRecord,
	now?: string,
): DecisionStore {
	const at = now ?? new Date().toISOString();
	const old = getDecision(store, oldId);
	let nextStore = store;
	if (old) {
		nextStore = upsertDecision(nextStore, {
			...old,
			status: "superseded",
			updatedAt: at,
		});
	}
	return upsertDecision(nextStore, {
		...next,
		supersedes: oldId,
		status: next.status ?? "accepted",
		updatedAt: at,
	});
}

/**
 * Pre-action governance gate: check proposed action text/paths against accepted constraints.
 * Heuristic keyword match — projects can layer stricter oracles later.
 */
export function checkDecisionGate(input: {
	store: DecisionStore;
	/** Natural language description of intended action */
	action: string;
	/** Paths that would be touched */
	paths?: string[];
}): DecisionGateResult {
	const accepted = acceptedDecisions(input.store);
	const action = input.action.toLowerCase();
	const paths = input.paths ?? [];
	const blockers: string[] = [];
	const warnings: string[] = [];
	const matchedIds: string[] = [];

	for (const d of accepted) {
		const inScope =
			!d.scopePaths?.length ||
			paths.some((p) =>
				d.scopePaths!.some((s) => p === s || p.startsWith(s) || p.includes(s.replace("/**", ""))),
			);
		if (d.scopePaths?.length && paths.length && !inScope) continue;

		// Constraint / non-goal contradiction heuristics
		if (d.kind === "constraint" || d.kind === "non-goal" || d.kind === "policy") {
			const decisionText = d.decision.toLowerCase();
			// "must not X" / "never X" / "do not X"
			const forbidMatch = decisionText.match(
				/\b(?:must not|must never|never|do not|don't|forbid(?:den)?)\b(.{0,80})/i,
			);
			if (forbidMatch) {
				const fragment = forbidMatch[1]?.toLowerCase() ?? "";
				const keywords = fragment
					.split(/[^a-z0-9]+/)
					.filter((w) => w.length > 3)
					.slice(0, 6);
				const hit = keywords.filter((k) => action.includes(k));
				if (hit.length >= 2 || (hit.length === 1 && fragment.includes(hit[0]!))) {
					matchedIds.push(d.id);
					blockers.push(`${d.id} (${d.title}): action may violate “${d.decision.slice(0, 120)}”`);
				}
			}
		}

		// Soft: architecture decisions that mention a preferred pattern
		if (d.kind === "architecture" && d.tags?.includes("preferred-stack")) {
			matchedIds.push(d.id);
			warnings.push(`${d.id}: review preferred architecture — ${d.title}`);
		}
	}

	// Warn on previously rejected approaches when action echoes rejected decision title
	for (const d of queryDecisions(input.store, { status: "rejected" })) {
		const titleWords = d.title
			.toLowerCase()
			.split(/[^a-z0-9]+/)
			.filter((w) => w.length > 4);
		if (titleWords.length && titleWords.every((w) => action.includes(w))) {
			matchedIds.push(d.id);
			warnings.push(`${d.id}: echoes a rejected decision “${d.title}”`);
		}
	}

	return {
		ok: blockers.length === 0,
		blockers,
		warnings,
		matchedIds: [...new Set(matchedIds)],
	};
}

export function formatDecisionStore(store: DecisionStore): string {
	const lines = [
		`# Decision store${store.project ? ` · ${store.project}` : ""}`,
		``,
		`- count: ${store.decisions.length}`,
		`- accepted: ${acceptedDecisions(store).length}`,
		``,
	];
	const sorted = [...store.decisions].sort((a, b) => a.id.localeCompare(b.id));
	for (const d of sorted) {
		lines.push(`- **${d.id}** [${d.status}/${d.kind}] ${d.title}`);
	}
	return lines.join("\n");
}

export function nextDecisionId(store: DecisionStore, prefix = "DEC"): string {
	const re = new RegExp(`^${prefix}-(\\d+)$`, "i");
	let max = 0;
	for (const d of store.decisions) {
		const m = d.id.match(re);
		if (m) max = Math.max(max, Number(m[1]));
	}
	return `${prefix}-${String(max + 1).padStart(3, "0")}`;
}

export function createDecision(input: {
	store: DecisionStore;
	kind: DecisionKind;
	title: string;
	context: string;
	decision: string;
	status?: DecisionStatus;
	consequences?: string;
	alternatives?: string[];
	tags?: string[];
	scopePaths?: string[];
	author?: string;
	now?: string;
	prefix?: string;
}): { store: DecisionStore; record: DecisionRecord } {
	const at = input.now ?? new Date().toISOString();
	const record: DecisionRecord = {
		id: nextDecisionId(input.store, input.prefix ?? "DEC"),
		kind: input.kind,
		status: input.status ?? "proposed",
		title: input.title,
		context: input.context,
		decision: input.decision,
		consequences: input.consequences,
		alternatives: input.alternatives,
		tags: input.tags,
		scopePaths: input.scopePaths,
		createdAt: at,
		updatedAt: at,
		author: input.author,
		humanReview: input.status === "accepted" ? "pending" : "pending",
	};
	return { store: upsertDecision(input.store, record), record };
}

/**
 * Requirements-as-Code / decision store types.
 * Inspired by AsDecided / RAC-core style: durable, queryable decisions
 * that agents must respect (Memory-as-Governance).
 */

export const DECISION_STATUSES = [
	"proposed",
	"accepted",
	"superseded",
	"deprecated",
	"rejected",
] as const;

export type DecisionStatus = (typeof DECISION_STATUSES)[number];

export const DECISION_KINDS = [
	"requirement",
	"constraint",
	"architecture",
	"policy",
	"gate-threshold",
	"adr",
	"risk",
	"non-goal",
] as const;

export type DecisionKind = (typeof DECISION_KINDS)[number];

/** Deterministic V1 enforcement. Prose is never executable policy. */
export interface DecisionEnforcementV1 {
	effect: "forbid";
	actionIds: string[];
}

export interface DecisionRecord {
	/** Stable id, e.g. DEC-001 or ADR-012 */
	id: string;
	kind: DecisionKind;
	status: DecisionStatus;
	/** Short title */
	title: string;
	/** Context / problem statement */
	context: string;
	/** The decision itself */
	decision: string;
	/** Consequences / trade-offs */
	consequences?: string;
	/** Alternatives considered */
	alternatives?: string[];
	/** Tags for retrieval */
	tags?: string[];
	/** Paths or modules this decision governs */
	scopePaths?: string[];
	/** Related decision ids */
	relatedIds?: string[];
	/** Supersedes this id when status is superseded */
	supersedes?: string;
	/** Confidence 0–1 when agent-authored */
	confidence?: number;
	/** Human review status */
	humanReview?: "pending" | "approved" | "rejected";
	/** Optional structured policy consumed only by trusted DEC-01 evidence. */
	enforcement?: DecisionEnforcementV1;
	createdAt: string;
	updatedAt: string;
	/** Author: human handle or agent role */
	author?: string;
}

export interface DecisionStore {
	version: 1;
	/** Project or package label */
	project?: string;
	decisions: DecisionRecord[];
}

export interface DecisionQuery {
	status?: DecisionStatus | DecisionStatus[];
	kind?: DecisionKind | DecisionKind[];
	tag?: string;
	/** Substring match on title/decision/context */
	text?: string;
	/** Path prefix governed by scopePaths */
	path?: string;
	/** Only human-approved */
	humanApprovedOnly?: boolean;
}

export interface DecisionGateResult {
	ok: boolean;
	/** Blocking conflicts (e.g. action contradicts accepted constraint) */
	blockers: string[];
	/** Soft warnings */
	warnings: string[];
	/** Matched governing decisions */
	matchedIds: string[];
}

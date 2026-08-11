/**
 * CON-01 published V1 bounds — closed structural limits.
 */

export const SCHEMA_VERSION_V1 = 1 as const;

export const CONTRACT_LIMITS_V1 = {
	maxSerializedBytes: 65_536,
	maxNestingDepth: 16,
	maxStringLength: 4_096,
	maxPathLength: 512,
	maxCommandLength: 2_048,
	maxCommandSummaryLength: 512,
	maxArrayLength: 256,
	maxRenderedMarkdownBytes: 32_768,
	maxIssues: 64,
	/** Own enumerable data keys per plain object before clone/walk (DoS bound). */
	maxObjectKeys: 256,
} as const;

export type ContractLimitsV1 = typeof CONTRACT_LIMITS_V1;

export const CONTRACT_KINDS_V1 = [
	"role-request",
	"role-result",
	"approval-request",
	"approval-decision",
	"validation-contract",
] as const;

export type ContractKindV1 = (typeof CONTRACT_KINDS_V1)[number];

export const ASSURANCE_ROLES_V1 = [
	"specifier",
	"test-designer",
	"implementer",
	"breaker",
	"fitness-guardian",
	"refactorer",
	"qa",
] as const;

export type AssuranceRoleV1 = (typeof ASSURANCE_ROLES_V1)[number];
export type WriteScopeV1 = "none" | "tests" | "production";
export type RoleStatusV1 = "completed" | "blocked" | "failed" | "unknown";
export type MatchModeV1 = "identity" | "signature";
export type ApprovalDecisionKindV1 = "approved" | "rejected";

/** Closed issue codes used by V1 validators/preflight/pair bind. */
export type ContractIssueCode =
	| "unknown_field"
	| "bound_exceeded"
	| "unsafe_path"
	| "invalid_type"
	| "required"
	| "empty"
	| "invalid_time"
	| "invalid_sha"
	| "invalid_role"
	| "invalid_tool"
	| "invalid_match_mode"
	| "invalid_green_relation"
	| "invalid_field"
	| "unknown_kind"
	| "unsupported_version"
	| "path_overlap"
	| "scope_mismatch"
	| "phase_not_allowed"
	| "status_contradiction"
	| "bind_mismatch"
	| "expired"
	| "unsafe_type"
	| "unsafe_key"
	| "unsafe_accessor"
	| "unsafe_cycle"
	| "unsafe_prototype"
	| "unsafe_sparse"
	| "unsafe_reflect"
	| "invalid";

export type ContractIssue = {
	code: ContractIssueCode;
	path: string;
	message: string;
};

export type ParseOk<T> = { ok: true; value: T };
export type ParseErr = { ok: false; issues: ContractIssue[] };
export type ParseResult<T> = ParseOk<T> | ParseErr;

// ─── Nested supporting types ────────────────────────────────────────────────

export type BudgetV1 = {
	maxTokens: number;
	maxCostUsd: number;
	maxDurationMs: number;
};

export type ArtifactRefV1 = {
	path: string;
	mediaType: string;
};

export type CommandClaimV1 = {
	command: string;
	exitCode: number;
	summary: string;
};

export type RedCauseV1 = {
	expectedTestId: string;
	matchMode: MatchModeV1;
	expectedFailureSignature?: string;
	reasonCode?: string;
	cause?: string;
};

export type UsageV1 =
	| "unknown"
	| {
			inputTokens: number;
			outputTokens: number;
	  };

export type HumanProvenanceV1 = {
	actorId: string;
	method: string;
	evidenceRef?: string;
};

export type CoveringGreenV1 = {
	relation: "exact-focused" | "superset-focused" | "broader-suite";
	command: string;
};

export type SensitivityV1 = {
	description: string;
	weakenChecks?: string[];
};

// ─── Closed V1 envelopes ────────────────────────────────────────────────────

export type RoleRequestV1 = {
	schemaVersion: 1;
	kind: "role-request";
	taskId: string;
	role: AssuranceRoleV1;
	phase: string;
	goal: string;
	writeScope: WriteScopeV1;
	ownedPaths: string[];
	forbiddenPaths: string[];
	tools: string[];
	model: string;
	thinking: string;
	budget: BudgetV1;
	artifacts: ArtifactRefV1[];
};

export type RoleResultV1 = {
	schemaVersion: 1;
	kind: "role-result";
	taskId: string;
	role: AssuranceRoleV1;
	status: RoleStatusV1;
	headSha: string;
	dirty: boolean;
	changedPaths: string[];
	commands: CommandClaimV1[];
	evidenceRefs: string[];
	artifactRefs: string[];
	blockers: string[];
	residualRisks: string[];
	usage: UsageV1;
	redCause?: RedCauseV1;
};

export type ApprovalRequestV1 = {
	schemaVersion: 1;
	kind: "approval-request";
	requestId: string;
	action: string;
	risk: string;
	scopedPaths: string[];
	candidateSha: string;
	fingerprint: string;
	requestedAt: string;
	expiresAt: string;
};

export type ApprovalDecisionV1 = {
	schemaVersion: 1;
	kind: "approval-decision";
	requestId: string;
	decision: ApprovalDecisionKindV1;
	action: string;
	risk: string;
	scopedPaths: string[];
	candidateSha: string;
	fingerprint: string;
	decidedAt: string;
	humanProvenance?: HumanProvenanceV1;
};

export type ValidationContractV1 = {
	schemaVersion: 1;
	kind: "validation-contract";
	packageId: string;
	focusedCommand: string;
	expectedTestId: string;
	expectedFailureSignature?: string;
	matchMode: MatchModeV1;
	coveringGreen: CoveringGreenV1;
	forbiddenProductionPathsBeforeRed: string[];
	sensitivity: SensitivityV1;
};

export type ContractEnvelopeV1 =
	| RoleRequestV1
	| RoleResultV1
	| ApprovalRequestV1
	| ApprovalDecisionV1
	| ValidationContractV1;

export const APPROVAL_AUTHORITY_NOTICE =
	"Structural bind only — APR-01 must establish actual machine-local authority; model-emitted fields never grant approval." as const;

/** Role → write-scope / phase / tools matrix (structural mirror of assurance-cycle). */
export const ROLE_WRITE_SCOPE_MATRIX: Record<
	AssuranceRoleV1,
	{ writeScope: WriteScopeV1; allowedPhases: readonly string[]; tools: readonly string[] }
> = {
	specifier: {
		writeScope: "none",
		allowedPhases: ["discovery"],
		tools: ["read", "grep", "find", "ls"],
	},
	"test-designer": {
		writeScope: "tests",
		allowedPhases: ["formulation", "red"],
		tools: ["read", "grep", "find", "ls", "edit", "write", "bash"],
	},
	implementer: {
		writeScope: "production",
		allowedPhases: ["green"],
		tools: ["read", "grep", "find", "ls", "edit", "write", "bash"],
	},
	breaker: {
		writeScope: "none",
		allowedPhases: ["verify"],
		tools: ["read", "grep", "find", "ls"],
	},
	"fitness-guardian": {
		writeScope: "none",
		allowedPhases: ["verify"],
		tools: ["read", "grep", "find", "ls", "bash"],
	},
	refactorer: {
		writeScope: "production",
		allowedPhases: ["refactor"],
		tools: ["read", "grep", "find", "ls", "edit", "write", "bash"],
	},
	qa: {
		writeScope: "none",
		allowedPhases: ["verify"],
		tools: ["read", "grep", "find", "ls"],
	},
};

export const GREEN_RELATIONS_V1 = ["exact-focused", "superset-focused", "broader-suite"] as const;

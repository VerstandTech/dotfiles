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

export type ContractIssue = {
	code: string;
	path: string;
	message: string;
};

export type ParseOk<T> = { ok: true; value: T };
export type ParseErr = { ok: false; issues: ContractIssue[] };
export type ParseResult<T> = ParseOk<T> | ParseErr;

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
		tools: ["read", "grep", "find", "ls", "bash"],
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
		tools: ["read", "grep", "find", "ls", "bash"],
	},
};

export const GREEN_RELATIONS_V1 = ["exact-focused", "superset-focused", "broader-suite"] as const;

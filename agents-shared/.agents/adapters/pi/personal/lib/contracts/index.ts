/**
 * CON-01 — Versioned contracts and schema enforcement (V1).
 *
 * Pure TypeScript / JSON-Schema-compatible closed library.
 * Owns structural validation, bounds, path policy, canonicalization,
 * validated-only Markdown, legacy labeling, and BDD field bridge.
 *
 * Does NOT: classify BDD failures, redact secrets, grant approval authority,
 * acquire writer leases, persist trajectories, spawn agents, or write handoffs.
 */

export {
	APPROVAL_AUTHORITY_NOTICE,
	ASSURANCE_ROLES_V1,
	CONTRACT_KINDS_V1,
	CONTRACT_LIMITS_V1,
	GREEN_RELATIONS_V1,
	ROLE_WRITE_SCOPE_MATRIX,
	SCHEMA_VERSION_V1,
	type AssuranceRoleV1,
	type ContractIssue,
	type ContractKindV1,
	type ContractLimitsV1,
	type MatchModeV1,
	type ParseErr,
	type ParseOk,
	type ParseResult,
	type RoleStatusV1,
	type WriteScopeV1,
} from "./limits.ts";

export { CONTRACT_DESCRIPTORS_V1 } from "./descriptors.ts";

export {
	assertSafeRepoRelativePath,
	isSafeRepoRelativePath,
} from "./path.ts";

export {
	parseApprovalDecisionV1,
	parseApprovalRequestV1,
	parseContractV1,
	parseRoleRequestV1,
	parseRoleResultV1,
	parseValidationContractV1,
} from "./validate.ts";

export { canonicalizeContractV1 } from "./canonicalize.ts";

export {
	renderApprovalMarkdownV1,
	renderContractMarkdownV1,
	renderRoleResultMarkdownV1,
} from "./render.ts";

export { checkApprovalPairV1 } from "./approval.ts";

export { toExpectedRedContract, type ExpectedRedBridge } from "./bridge.ts";

export { parseLegacyMarkdownHandoff, type LegacyMarkdownHandoff } from "./legacy.ts";

/**
 * CON-01 JSON-Schema-compatible closed descriptors (no runtime schema package).
 * Field-for-field aligned with validators: closed nested objects, enums, required, unions.
 */

import { ASSURANCE_ROLES_V1, GREEN_RELATIONS_V1 } from "./limits.ts";

const ROLE_ENUM = {
	type: "string",
	enum: [...ASSURANCE_ROLES_V1],
} as const;

const WRITE_SCOPE_ENUM = {
	type: "string",
	enum: ["none", "tests", "production"],
} as const;

const STATUS_ENUM = {
	type: "string",
	enum: ["completed", "blocked", "failed", "unknown"],
} as const;

const MATCH_MODE_ENUM = {
	type: "string",
	enum: ["identity", "signature"],
} as const;

const DECISION_ENUM = {
	type: "string",
	enum: ["approved", "rejected"],
} as const;

const BUDGET_SCHEMA = {
	type: "object",
	additionalProperties: false,
	required: ["maxTokens", "maxCostUsd", "maxDurationMs"],
	properties: {
		maxTokens: { type: "number" },
		maxCostUsd: { type: "number" },
		maxDurationMs: { type: "number" },
	},
} as const;

const ARTIFACT_ITEM_SCHEMA = {
	type: "object",
	additionalProperties: false,
	required: ["path", "mediaType"],
	properties: {
		path: { type: "string" },
		mediaType: { type: "string" },
	},
} as const;

const COMMAND_ITEM_SCHEMA = {
	type: "object",
	additionalProperties: false,
	required: ["command", "exitCode", "summary"],
	properties: {
		command: { type: "string" },
		exitCode: { type: "number" },
		summary: { type: "string" },
	},
} as const;

const RED_CAUSE_SCHEMA = {
	type: "object",
	additionalProperties: false,
	required: ["expectedTestId", "matchMode"],
	properties: {
		expectedTestId: { type: "string", minLength: 1 },
		expectedFailureSignature: { type: "string", minLength: 1 },
		matchMode: MATCH_MODE_ENUM,
		reasonCode: { type: "string" },
		cause: { type: "string" },
	},
} as const;

const USAGE_SCHEMA = {
	oneOf: [
		{ const: "unknown" },
		{
			type: "object",
			additionalProperties: false,
			required: ["inputTokens", "outputTokens"],
			properties: {
				inputTokens: { type: "number" },
				outputTokens: { type: "number" },
			},
		},
	],
} as const;

const HUMAN_PROVENANCE_SCHEMA = {
	type: "object",
	additionalProperties: false,
	required: ["actorId", "method"],
	properties: {
		actorId: { type: "string", minLength: 1 },
		method: { type: "string", minLength: 1 },
		evidenceRef: { type: "string" },
	},
} as const;

const COVERING_GREEN_SCHEMA = {
	type: "object",
	additionalProperties: false,
	required: ["relation", "command"],
	properties: {
		relation: { type: "string", enum: [...GREEN_RELATIONS_V1] },
		command: { type: "string", minLength: 1 },
	},
} as const;

const SENSITIVITY_SCHEMA = {
	type: "object",
	additionalProperties: false,
	required: ["description"],
	properties: {
		description: { type: "string", minLength: 1 },
		weakenChecks: { type: "array", items: { type: "string" } },
	},
} as const;

export const CONTRACT_DESCRIPTORS_V1: Record<string, unknown> = {
	"role-request": {
		$schema: "https://json-schema.org/draft/2020-12/schema",
		type: "object",
		additionalProperties: false,
		required: [
			"schemaVersion",
			"kind",
			"taskId",
			"role",
			"phase",
			"goal",
			"writeScope",
			"ownedPaths",
			"forbiddenPaths",
			"tools",
			"model",
			"thinking",
			"budget",
			"artifacts",
		],
		properties: {
			schemaVersion: { const: 1 },
			kind: { const: "role-request" },
			taskId: { type: "string", minLength: 1 },
			role: ROLE_ENUM,
			phase: { type: "string", minLength: 1 },
			goal: { type: "string", minLength: 1 },
			writeScope: WRITE_SCOPE_ENUM,
			ownedPaths: { type: "array", items: { type: "string" } },
			forbiddenPaths: { type: "array", items: { type: "string" } },
			tools: { type: "array", items: { type: "string" } },
			model: { type: "string" },
			thinking: { type: "string" },
			budget: BUDGET_SCHEMA,
			artifacts: {
				type: "array",
				items: ARTIFACT_ITEM_SCHEMA,
			},
		},
	},
	"role-result": {
		$schema: "https://json-schema.org/draft/2020-12/schema",
		type: "object",
		additionalProperties: false,
		required: [
			"schemaVersion",
			"kind",
			"taskId",
			"role",
			"status",
			"headSha",
			"dirty",
			"changedPaths",
			"commands",
			"evidenceRefs",
			"artifactRefs",
			"blockers",
			"residualRisks",
		],
		properties: {
			schemaVersion: { const: 1 },
			kind: { const: "role-result" },
			taskId: { type: "string" },
			role: ROLE_ENUM,
			status: STATUS_ENUM,
			headSha: { type: "string" },
			dirty: { type: "boolean" },
			changedPaths: { type: "array", items: { type: "string" } },
			commands: {
				type: "array",
				items: COMMAND_ITEM_SCHEMA,
			},
			evidenceRefs: { type: "array", items: { type: "string" } },
			artifactRefs: { type: "array", items: { type: "string" } },
			blockers: { type: "array", items: { type: "string" } },
			residualRisks: { type: "array", items: { type: "string" } },
			usage: USAGE_SCHEMA,
			redCause: RED_CAUSE_SCHEMA,
		},
	},
	"approval-request": {
		$schema: "https://json-schema.org/draft/2020-12/schema",
		type: "object",
		additionalProperties: false,
		required: [
			"schemaVersion",
			"kind",
			"requestId",
			"action",
			"risk",
			"scopedPaths",
			"candidateSha",
			"fingerprint",
			"requestedAt",
			"expiresAt",
		],
		properties: {
			schemaVersion: { const: 1 },
			kind: { const: "approval-request" },
			requestId: { type: "string" },
			action: { type: "string" },
			risk: { type: "string" },
			scopedPaths: { type: "array", items: { type: "string" } },
			candidateSha: { type: "string" },
			fingerprint: { type: "string" },
			requestedAt: { type: "string" },
			expiresAt: { type: "string" },
		},
	},
	"approval-decision": {
		$schema: "https://json-schema.org/draft/2020-12/schema",
		type: "object",
		additionalProperties: false,
		required: [
			"schemaVersion",
			"kind",
			"requestId",
			"decision",
			"action",
			"risk",
			"scopedPaths",
			"candidateSha",
			"fingerprint",
			"decidedAt",
		],
		properties: {
			schemaVersion: { const: 1 },
			kind: { const: "approval-decision" },
			requestId: { type: "string" },
			decision: DECISION_ENUM,
			action: { type: "string" },
			risk: { type: "string" },
			scopedPaths: { type: "array", items: { type: "string" } },
			candidateSha: { type: "string" },
			fingerprint: { type: "string" },
			decidedAt: { type: "string" },
			humanProvenance: HUMAN_PROVENANCE_SCHEMA,
		},
	},
	"validation-contract": {
		$schema: "https://json-schema.org/draft/2020-12/schema",
		type: "object",
		additionalProperties: false,
		required: [
			"schemaVersion",
			"kind",
			"packageId",
			"focusedCommand",
			"expectedTestId",
			"matchMode",
			"coveringGreen",
			"forbiddenProductionPathsBeforeRed",
			"sensitivity",
		],
		properties: {
			schemaVersion: { const: 1 },
			kind: { const: "validation-contract" },
			packageId: { type: "string" },
			focusedCommand: { type: "string" },
			expectedTestId: { type: "string" },
			expectedFailureSignature: { type: "string" },
			matchMode: MATCH_MODE_ENUM,
			coveringGreen: COVERING_GREEN_SCHEMA,
			forbiddenProductionPathsBeforeRed: { type: "array", items: { type: "string" } },
			sensitivity: SENSITIVITY_SCHEMA,
		},
	},
};

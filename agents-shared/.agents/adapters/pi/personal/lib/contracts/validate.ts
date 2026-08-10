/**
 * CON-01 closed V1 envelope validators.
 */

import {
	ASSURANCE_ROLES_V1,
	CONTRACT_KINDS_V1,
	CONTRACT_LIMITS_V1,
	GREEN_RELATIONS_V1,
	ROLE_WRITE_SCOPE_MATRIX,
	type AssuranceRoleV1,
	type ContractKindV1,
	type MatchModeV1,
	type ParseResult,
	type RoleStatusV1,
	type WriteScopeV1,
} from "./limits.ts";
import {
	IssueSink,
	exactKeys,
	isExactSchemaVersion1,
	isHexSha,
	isIsoTimestamp,
	isPlainObject,
	requireBoolean,
	requireFiniteNumber,
	requireString,
} from "./issues.ts";
import { isSafeRepoRelativePath } from "./path.ts";
import { preflightUntrustedGraph } from "./preflight.ts";

function checkSerializedSize(value: unknown, sink: IssueSink): void {
	let ser: string;
	try {
		ser = JSON.stringify(value);
	} catch {
		sink.add("unsafe_cycle", "$", "value is not JSON-serializable");
		return;
	}
	if (ser.length > CONTRACT_LIMITS_V1.maxSerializedBytes) {
		sink.addBound(
			"$",
			`serialized bytes ${ser.length} exceed maxSerializedBytes ${CONTRACT_LIMITS_V1.maxSerializedBytes}`,
		);
	}
}

function requireSafePath(
	value: unknown,
	path: string,
	sink: IssueSink,
	label = "path",
): string | undefined {
	if (typeof value !== "string") {
		sink.add("invalid_type", path, `expected string ${label}`);
		return undefined;
	}
	if (value.length > CONTRACT_LIMITS_V1.maxPathLength) {
		sink.addBound(path, `path length ${value.length} exceeds maxPathLength`);
		return undefined;
	}
	if (!isSafeRepoRelativePath(value)) {
		sink.add("unsafe_path", path, `unsafe repository-relative ${label}: ${JSON.stringify(value)}`);
		return undefined;
	}
	return value;
}

function requireStringArray(
	obj: Record<string, unknown>,
	key: string,
	path: string,
	sink: IssueSink,
	opts?: { safePaths?: boolean; maxItem?: number },
): string[] | undefined {
	const p = path ? `${path}.${key}` : key;
	if (!(key in obj)) {
		sink.add("required", p, `missing required field "${key}"`);
		return undefined;
	}
	const v = obj[key];
	if (!Array.isArray(v)) {
		sink.add("invalid_type", p, `expected array for "${key}"`);
		return undefined;
	}
	if (v.length > CONTRACT_LIMITS_V1.maxArrayLength) {
		sink.addBound(p, `array length ${v.length} exceeds maxArrayLength`);
		return undefined;
	}
	const out: string[] = [];
	for (let i = 0; i < v.length; i++) {
		const el = v[i];
		const ep = `${p}[${i}]`;
		if (typeof el !== "string") {
			sink.add("invalid_type", ep, "expected string element");
			continue;
		}
		const maxItem = opts?.maxItem ?? CONTRACT_LIMITS_V1.maxStringLength;
		if (el.length > maxItem) {
			sink.addBound(ep, `string length ${el.length} exceeds max ${maxItem}`);
			continue;
		}
		if (opts?.safePaths) {
			const sp = requireSafePath(el, ep, sink);
			if (sp !== undefined) out.push(sp);
		} else {
			out.push(el);
		}
	}
	return out;
}

function parseBudget(raw: unknown, path: string, sink: IssueSink): Record<string, number> | undefined {
	if (!isPlainObject(raw)) {
		sink.add("invalid_type", path, "budget must be object");
		return undefined;
	}
	exactKeys(raw, ["maxTokens", "maxCostUsd", "maxDurationMs"], path, sink);
	const maxTokens = requireFiniteNumber(raw, "maxTokens", path, sink);
	const maxCostUsd = requireFiniteNumber(raw, "maxCostUsd", path, sink);
	const maxDurationMs = requireFiniteNumber(raw, "maxDurationMs", path, sink);
	if (maxTokens === undefined || maxCostUsd === undefined || maxDurationMs === undefined) return undefined;
	return { maxTokens, maxCostUsd, maxDurationMs };
}

function parseArtifacts(
	raw: unknown,
	path: string,
	sink: IssueSink,
): Array<{ path: string; mediaType: string }> | undefined {
	if (!Array.isArray(raw)) {
		sink.add("invalid_type", path, "artifacts must be array");
		return undefined;
	}
	if (raw.length > CONTRACT_LIMITS_V1.maxArrayLength) {
		sink.addBound(path, `artifacts length exceeds maxArrayLength`);
		return undefined;
	}
	const out: Array<{ path: string; mediaType: string }> = [];
	for (let i = 0; i < raw.length; i++) {
		const el = raw[i];
		const ep = `${path}[${i}]`;
		if (!isPlainObject(el)) {
			sink.add("invalid_type", ep, "artifact must be object");
			continue;
		}
		exactKeys(el, ["path", "mediaType"], ep, sink);
		const ap = requireSafePath(el.path, `${ep}.path`, sink, "artifact path");
		const mt = requireString(el, "mediaType", ep, sink, { nonEmpty: true });
		if (ap !== undefined && mt !== undefined) out.push({ path: ap, mediaType: mt });
	}
	return out;
}

function isRole(v: unknown): v is AssuranceRoleV1 {
	return typeof v === "string" && (ASSURANCE_ROLES_V1 as readonly string[]).includes(v);
}

function parseRoleRequest(obj: Record<string, unknown>, sink: IssueSink): Record<string, unknown> | undefined {
	exactKeys(
		obj,
		[
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
		"",
		sink,
	);

	if (!isExactSchemaVersion1(obj.schemaVersion)) {
		if (!("schemaVersion" in obj)) sink.add("required", "schemaVersion", "missing schemaVersion");
		else sink.add("unsupported_version", "schemaVersion", "schemaVersion must be exact integer 1");
	}
	if (obj.kind !== "role-request") {
		sink.add("unknown_kind", "kind", `expected kind role-request, got ${String(obj.kind)}`);
	}

	const taskId = requireString(obj, "taskId", "", sink, { nonEmpty: true });
	const goal = requireString(obj, "goal", "", sink, { nonEmpty: true });
	const model = requireString(obj, "model", "", sink, { nonEmpty: true });
	const thinking = requireString(obj, "thinking", "", sink, { nonEmpty: true });

	let role: AssuranceRoleV1 | undefined;
	if (!("role" in obj)) sink.add("required", "role", "missing role");
	else if (!isRole(obj.role)) sink.add("invalid_role", "role", `unknown role ${String(obj.role)}`);
	else role = obj.role;

	const phase = requireString(obj, "phase", "", sink, { nonEmpty: true });

	let writeScope: WriteScopeV1 | undefined;
	if (!("writeScope" in obj)) sink.add("required", "writeScope", "missing writeScope");
	else if (obj.writeScope !== "none" && obj.writeScope !== "tests" && obj.writeScope !== "production") {
		sink.add("invalid_type", "writeScope", `invalid writeScope ${String(obj.writeScope)}`);
	} else writeScope = obj.writeScope;

	if (role && phase && writeScope) {
		const matrix = ROLE_WRITE_SCOPE_MATRIX[role];
		if (writeScope !== matrix.writeScope) {
			sink.add(
				"scope_mismatch",
				"writeScope",
				`writeScope ${writeScope} does not match role ${role} (expected ${matrix.writeScope})`,
			);
		}
		if (!matrix.allowedPhases.includes(phase)) {
			sink.add(
				"phase_not_allowed",
				"phase",
				`phase ${phase} not allowed for role ${role}`,
			);
		}
	}

	const ownedPaths = requireStringArray(obj, "ownedPaths", "", sink, { safePaths: true });
	const forbiddenPaths = requireStringArray(obj, "forbiddenPaths", "", sink, { safePaths: true });
	if (ownedPaths && forbiddenPaths) {
		const forb = new Set(forbiddenPaths);
		for (const p of ownedPaths) {
			if (forb.has(p)) {
				sink.add("path_overlap", "ownedPaths", `owned/forbidden path overlap: ${p}`);
			}
		}
	}

	let tools: string[] | undefined;
	if (!("tools" in obj)) sink.add("required", "tools", "missing tools");
	else if (!Array.isArray(obj.tools)) sink.add("invalid_type", "tools", "tools must be array");
	else if (obj.tools.length > CONTRACT_LIMITS_V1.maxArrayLength) {
		sink.addBound("tools", "tools array exceeds maxArrayLength");
	} else {
		tools = [];
		const allowed = role ? new Set(ROLE_WRITE_SCOPE_MATRIX[role].tools) : null;
		for (let i = 0; i < obj.tools.length; i++) {
			const t = obj.tools[i];
			if (typeof t !== "string") {
				sink.add("invalid_type", `tools[${i}]`, "tool must be string");
				continue;
			}
			if (t !== t.toLowerCase() || t !== t.trim() || t.length === 0) {
				sink.add("invalid_tool", `tools[${i}]`, `noncanonical tool name ${JSON.stringify(t)}`);
				continue;
			}
			if (allowed && !allowed.has(t)) {
				sink.add("invalid_tool", `tools[${i}]`, `tool ${t} not allowed for role`);
				continue;
			}
			tools.push(t);
		}
	}

	const budget = parseBudget(obj.budget, "budget", sink);
	const artifacts = parseArtifacts(obj.artifacts, "artifacts", sink);

	if (sink.issues.length > 0) return undefined;
	return {
		schemaVersion: 1,
		kind: "role-request",
		taskId,
		role,
		phase,
		goal,
		writeScope,
		ownedPaths,
		forbiddenPaths,
		tools,
		model,
		thinking,
		budget,
		artifacts,
	};
}

function parseRedCause(raw: unknown, path: string, sink: IssueSink): Record<string, unknown> | undefined {
	if (!isPlainObject(raw)) {
		sink.add("invalid_type", path, "redCause must be object");
		return undefined;
	}
	exactKeys(
		raw,
		["expectedTestId", "expectedFailureSignature", "matchMode", "reasonCode", "cause"],
		path,
		sink,
	);
	const expectedTestId = requireString(raw, "expectedTestId", path, sink, { nonEmpty: true });
	let matchMode: MatchModeV1 | undefined;
	if (!("matchMode" in raw)) sink.add("required", `${path}.matchMode`, "missing matchMode");
	else if (raw.matchMode === "legacy") {
		sink.add("invalid_match_mode", `${path}.matchMode`, "legacy matchMode forbidden");
	} else if (raw.matchMode !== "identity" && raw.matchMode !== "signature") {
		sink.add("invalid_match_mode", `${path}.matchMode`, `invalid matchMode ${String(raw.matchMode)}`);
	} else matchMode = raw.matchMode;

	let expectedFailureSignature: string | undefined;
	if ("expectedFailureSignature" in raw) {
		expectedFailureSignature = requireString(raw, "expectedFailureSignature", path, sink, {
			nonEmpty: true,
		});
	}
	if (matchMode === "signature" && !("expectedFailureSignature" in raw)) {
		sink.add(
			"required",
			`${path}.expectedFailureSignature`,
			"signature mode requires expectedFailureSignature",
		);
	}

	let reasonCode: string | undefined;
	let cause: string | undefined;
	if ("reasonCode" in raw) reasonCode = requireString(raw, "reasonCode", path, sink);
	if ("cause" in raw) cause = requireString(raw, "cause", path, sink);

	if (sink.issues.length > 0) return undefined;
	const out: Record<string, unknown> = { expectedTestId, matchMode };
	if (expectedFailureSignature !== undefined) out.expectedFailureSignature = expectedFailureSignature;
	if (reasonCode !== undefined) out.reasonCode = reasonCode;
	if (cause !== undefined) out.cause = cause;
	return out;
}

function parseCommands(
	raw: unknown,
	path: string,
	sink: IssueSink,
): Array<{ command: string; exitCode: number; summary: string }> | undefined {
	if (!Array.isArray(raw)) {
		sink.add("invalid_type", path, "commands must be array");
		return undefined;
	}
	if (raw.length > CONTRACT_LIMITS_V1.maxArrayLength) {
		sink.addBound(path, "commands exceed maxArrayLength");
		return undefined;
	}
	const out: Array<{ command: string; exitCode: number; summary: string }> = [];
	for (let i = 0; i < raw.length; i++) {
		const el = raw[i];
		const ep = `${path}[${i}]`;
		if (!isPlainObject(el)) {
			sink.add("invalid_type", ep, "command entry must be object");
			continue;
		}
		exactKeys(el, ["command", "exitCode", "summary"], ep, sink);
		const command = requireString(el, "command", ep, sink, {
			nonEmpty: true,
			max: CONTRACT_LIMITS_V1.maxCommandLength,
		});
		const summary = requireString(el, "summary", ep, sink, {
			max: CONTRACT_LIMITS_V1.maxCommandSummaryLength,
		});
		const exitCode = requireFiniteNumber(el, "exitCode", ep, sink);
		if (command !== undefined && summary !== undefined && exitCode !== undefined) {
			if (!Number.isInteger(exitCode)) {
				sink.add("invalid_type", `${ep}.exitCode`, "exitCode must be integer");
			} else {
				out.push({ command, exitCode, summary });
			}
		}
	}
	return out;
}

function parseUsage(
	raw: unknown,
	path: string,
	sink: IssueSink,
): "unknown" | { inputTokens: number; outputTokens: number } | undefined {
	if (raw === "unknown") return "unknown";
	if (!isPlainObject(raw)) {
		sink.add("invalid_type", path, "usage must be object or \"unknown\"");
		return undefined;
	}
	exactKeys(raw, ["inputTokens", "outputTokens"], path, sink);
	const inputTokens = requireFiniteNumber(raw, "inputTokens", path, sink);
	const outputTokens = requireFiniteNumber(raw, "outputTokens", path, sink);
	if (inputTokens === undefined || outputTokens === undefined) return undefined;
	return { inputTokens, outputTokens };
}

function parseRoleResult(obj: Record<string, unknown>, sink: IssueSink): Record<string, unknown> | undefined {
	exactKeys(
		obj,
		[
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
			"usage",
			"redCause",
		],
		"",
		sink,
	);

	if (!isExactSchemaVersion1(obj.schemaVersion)) {
		if (!("schemaVersion" in obj)) sink.add("required", "schemaVersion", "missing schemaVersion");
		else sink.add("unsupported_version", "schemaVersion", "schemaVersion must be exact integer 1");
	}
	if (obj.kind !== "role-result") {
		sink.add("unknown_kind", "kind", `expected kind role-result`);
	}

	const taskId = requireString(obj, "taskId", "", sink, { nonEmpty: true });
	let role: AssuranceRoleV1 | undefined;
	if (!("role" in obj)) sink.add("required", "role", "missing role");
	else if (!isRole(obj.role)) sink.add("invalid_role", "role", `unknown role`);
	else role = obj.role;

	let status: RoleStatusV1 | undefined;
	if (!("status" in obj)) sink.add("required", "status", "missing status");
	else if (
		obj.status !== "completed" &&
		obj.status !== "blocked" &&
		obj.status !== "failed" &&
		obj.status !== "unknown"
	) {
		sink.add("invalid_type", "status", `invalid status ${String(obj.status)}`);
	} else status = obj.status;

	const headSha = requireString(obj, "headSha", "", sink, { nonEmpty: true });
	if (headSha !== undefined && !isHexSha(headSha)) {
		sink.add("invalid_sha", "headSha", "headSha must be 40- or 64-char hex");
	}

	const dirty = requireBoolean(obj, "dirty", "", sink);
	const changedPaths = requireStringArray(obj, "changedPaths", "", sink, { safePaths: true });
	const evidenceRefs = requireStringArray(obj, "evidenceRefs", "", sink, { safePaths: true });
	const artifactRefs = requireStringArray(obj, "artifactRefs", "", sink, { safePaths: true });
	const blockers = requireStringArray(obj, "blockers", "", sink);
	const residualRisks = requireStringArray(obj, "residualRisks", "", sink);
	const commands = parseCommands(obj.commands, "commands", sink);

	let usage: "unknown" | { inputTokens: number; outputTokens: number } | undefined;
	if ("usage" in obj) {
		usage = parseUsage(obj.usage, "usage", sink);
	} else {
		usage = "unknown";
	}

	let redCause: Record<string, unknown> | undefined;
	if ("redCause" in obj) {
		redCause = parseRedCause(obj.redCause, "redCause", sink);
	}

	if (status === "completed" && blockers && blockers.length > 0) {
		sink.add(
			"status_contradiction",
			"blockers",
			"completed status cannot include blockers",
		);
	}

	if (sink.issues.length > 0) return undefined;
	const out: Record<string, unknown> = {
		schemaVersion: 1,
		kind: "role-result",
		taskId,
		role,
		status,
		headSha,
		dirty,
		changedPaths,
		commands,
		evidenceRefs,
		artifactRefs,
		blockers,
		residualRisks,
		usage,
	};
	if (redCause !== undefined) out.redCause = redCause;
	return out;
}

function parseHumanProvenance(
	raw: unknown,
	path: string,
	sink: IssueSink,
	required: boolean,
): Record<string, string> | undefined {
	if (raw === undefined || raw === null) {
		if (required) sink.add("required", path, "human provenance required for approved decisions");
		return undefined;
	}
	if (!isPlainObject(raw)) {
		sink.add("invalid_type", path, "humanProvenance must be object");
		return undefined;
	}
	exactKeys(raw, ["actorId", "method", "evidenceRef"], path, sink);
	const actorId = requireString(raw, "actorId", path, sink, { nonEmpty: true });
	const method = requireString(raw, "method", path, sink, { nonEmpty: true });
	let evidenceRef: string | undefined;
	if ("evidenceRef" in raw) {
		evidenceRef = requireSafePath(raw.evidenceRef, `${path}.evidenceRef`, sink) ?? undefined;
	}
	if (actorId === undefined || method === undefined) return undefined;
	const out: Record<string, string> = { actorId, method };
	if (evidenceRef !== undefined) out.evidenceRef = evidenceRef;
	return out;
}

function parseApprovalRequest(obj: Record<string, unknown>, sink: IssueSink): Record<string, unknown> | undefined {
	exactKeys(
		obj,
		[
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
		"",
		sink,
	);
	if (!isExactSchemaVersion1(obj.schemaVersion)) {
		if (!("schemaVersion" in obj)) sink.add("required", "schemaVersion", "missing schemaVersion");
		else sink.add("unsupported_version", "schemaVersion", "schemaVersion must be exact integer 1");
	}
	if (obj.kind !== "approval-request") {
		sink.add("unknown_kind", "kind", "expected approval-request");
	}
	const requestId = requireString(obj, "requestId", "", sink, { nonEmpty: true });
	const action = requireString(obj, "action", "", sink, { nonEmpty: true });
	const risk = requireString(obj, "risk", "", sink, { nonEmpty: true });
	const fingerprint = requireString(obj, "fingerprint", "", sink, { nonEmpty: true });
	const requestedAt = requireString(obj, "requestedAt", "", sink, { nonEmpty: true });
	const expiresAt = requireString(obj, "expiresAt", "", sink, { nonEmpty: true });
	if (requestedAt !== undefined && !isIsoTimestamp(requestedAt)) {
		sink.add("invalid_time", "requestedAt", "invalid timestamp");
	}
	if (expiresAt !== undefined && !isIsoTimestamp(expiresAt)) {
		sink.add("invalid_time", "expiresAt", "invalid timestamp");
	}
	const candidateSha = requireString(obj, "candidateSha", "", sink, { nonEmpty: true });
	if (candidateSha !== undefined && !isHexSha(candidateSha)) {
		sink.add("invalid_sha", "candidateSha", "candidateSha must be 40- or 64-char hex");
	}
	const scopedPaths = requireStringArray(obj, "scopedPaths", "", sink, { safePaths: true });
	if (sink.issues.length > 0) return undefined;
	return {
		schemaVersion: 1,
		kind: "approval-request",
		requestId,
		action,
		risk,
		scopedPaths,
		candidateSha,
		fingerprint,
		requestedAt,
		expiresAt,
	};
}

function parseApprovalDecision(obj: Record<string, unknown>, sink: IssueSink): Record<string, unknown> | undefined {
	exactKeys(
		obj,
		[
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
			"humanProvenance",
		],
		"",
		sink,
	);
	if (!isExactSchemaVersion1(obj.schemaVersion)) {
		if (!("schemaVersion" in obj)) sink.add("required", "schemaVersion", "missing schemaVersion");
		else sink.add("unsupported_version", "schemaVersion", "schemaVersion must be exact integer 1");
	}
	if (obj.kind !== "approval-decision") {
		sink.add("unknown_kind", "kind", "expected approval-decision");
	}
	const requestId = requireString(obj, "requestId", "", sink, { nonEmpty: true });
	const action = requireString(obj, "action", "", sink, { nonEmpty: true });
	const risk = requireString(obj, "risk", "", sink, { nonEmpty: true });
	const fingerprint = requireString(obj, "fingerprint", "", sink, { nonEmpty: true });
	const decidedAt = requireString(obj, "decidedAt", "", sink, { nonEmpty: true });
	if (decidedAt !== undefined && !isIsoTimestamp(decidedAt)) {
		sink.add("invalid_time", "decidedAt", "invalid timestamp");
	}
	const candidateSha = requireString(obj, "candidateSha", "", sink, { nonEmpty: true });
	if (candidateSha !== undefined && !isHexSha(candidateSha)) {
		sink.add("invalid_sha", "candidateSha", "invalid sha");
	}
	const scopedPaths = requireStringArray(obj, "scopedPaths", "", sink, { safePaths: true });

	let decision: "approved" | "rejected" | undefined;
	if (!("decision" in obj)) sink.add("required", "decision", "missing decision");
	else if (obj.decision !== "approved" && obj.decision !== "rejected") {
		sink.add("invalid_type", "decision", `invalid decision ${String(obj.decision)}`);
	} else decision = obj.decision;

	let humanProvenance: Record<string, string> | undefined;
	if (decision === "approved") {
		if (!("humanProvenance" in obj)) {
			sink.add("required", "humanProvenance", "approved decision requires human provenance");
		} else {
			humanProvenance = parseHumanProvenance(obj.humanProvenance, "humanProvenance", sink, true);
		}
	} else if ("humanProvenance" in obj) {
		humanProvenance = parseHumanProvenance(obj.humanProvenance, "humanProvenance", sink, false);
	}

	if (sink.issues.length > 0) return undefined;
	const out: Record<string, unknown> = {
		schemaVersion: 1,
		kind: "approval-decision",
		requestId,
		decision,
		action,
		risk,
		scopedPaths,
		candidateSha,
		fingerprint,
		decidedAt,
	};
	if (humanProvenance !== undefined) out.humanProvenance = humanProvenance;
	return out;
}

function parseSensitivity(raw: unknown, path: string, sink: IssueSink): Record<string, unknown> | undefined {
	if (!isPlainObject(raw)) {
		sink.add("invalid_type", path, "sensitivity must be object");
		return undefined;
	}
	exactKeys(raw, ["description", "weakenChecks"], path, sink);
	const description = requireString(raw, "description", path, sink, { nonEmpty: true });
	let weakenChecks: string[] | undefined;
	if ("weakenChecks" in raw) {
		weakenChecks = requireStringArray(raw as Record<string, unknown>, "weakenChecks", path, sink);
	}
	if (description === undefined) return undefined;
	const out: Record<string, unknown> = { description };
	if (weakenChecks !== undefined) out.weakenChecks = weakenChecks;
	return out;
}

function parseCoveringGreen(raw: unknown, path: string, sink: IssueSink): Record<string, unknown> | undefined {
	if (!isPlainObject(raw)) {
		sink.add("invalid_type", path, "coveringGreen must be object");
		return undefined;
	}
	exactKeys(raw, ["relation", "command"], path, sink);
	const relation = requireString(raw, "relation", path, sink, { nonEmpty: true });
	const command = requireString(raw, "command", path, sink, {
		nonEmpty: true,
		max: CONTRACT_LIMITS_V1.maxCommandLength,
	});
	if (relation !== undefined && !(GREEN_RELATIONS_V1 as readonly string[]).includes(relation)) {
		sink.add("invalid_green_relation", `${path}.relation`, `invalid covering green relation ${relation}`);
	}
	if (relation === undefined || command === undefined) return undefined;
	if (!(GREEN_RELATIONS_V1 as readonly string[]).includes(relation)) return undefined;
	return { relation, command };
}

function parseValidationContract(
	obj: Record<string, unknown>,
	sink: IssueSink,
): Record<string, unknown> | undefined {
	exactKeys(
		obj,
		[
			"schemaVersion",
			"kind",
			"packageId",
			"focusedCommand",
			"expectedTestId",
			"expectedFailureSignature",
			"matchMode",
			"coveringGreen",
			"forbiddenProductionPathsBeforeRed",
			"sensitivity",
		],
		"",
		sink,
	);
	if (!isExactSchemaVersion1(obj.schemaVersion)) {
		if (!("schemaVersion" in obj)) sink.add("required", "schemaVersion", "missing schemaVersion");
		else sink.add("unsupported_version", "schemaVersion", "schemaVersion must be exact integer 1");
	}
	if (obj.kind !== "validation-contract") {
		sink.add("unknown_kind", "kind", "expected validation-contract");
	}
	const packageId = requireString(obj, "packageId", "", sink, { nonEmpty: true });
	const focusedCommand = requireString(obj, "focusedCommand", "", sink, {
		nonEmpty: true,
		max: CONTRACT_LIMITS_V1.maxCommandLength,
	});
	const expectedTestId = requireString(obj, "expectedTestId", "", sink, { nonEmpty: true });

	let matchMode: MatchModeV1 | undefined;
	if (!("matchMode" in obj)) sink.add("required", "matchMode", "missing matchMode");
	else if (obj.matchMode === "legacy") {
		sink.add("invalid_match_mode", "matchMode", "legacy matchMode forbidden on ValidationContractV1");
	} else if (obj.matchMode !== "identity" && obj.matchMode !== "signature") {
		sink.add("invalid_match_mode", "matchMode", `invalid matchMode ${String(obj.matchMode)}`);
	} else matchMode = obj.matchMode;

	let expectedFailureSignature: string | undefined;
	if ("expectedFailureSignature" in obj) {
		expectedFailureSignature = requireString(obj, "expectedFailureSignature", "", sink, {
			nonEmpty: true,
		});
	}
	if (matchMode === "signature" && !("expectedFailureSignature" in obj)) {
		sink.add(
			"required",
			"expectedFailureSignature",
			"signature mode requires expectedFailureSignature",
		);
	}

	if (!("sensitivity" in obj)) {
		sink.add("required", "sensitivity", "missing required sensitivity");
	}
	const sensitivity = "sensitivity" in obj ? parseSensitivity(obj.sensitivity, "sensitivity", sink) : undefined;
	const coveringGreen =
		"coveringGreen" in obj ? parseCoveringGreen(obj.coveringGreen, "coveringGreen", sink) : undefined;
	if (!("coveringGreen" in obj)) sink.add("required", "coveringGreen", "missing coveringGreen");

	const forbiddenProductionPathsBeforeRed = requireStringArray(
		obj,
		"forbiddenProductionPathsBeforeRed",
		"",
		sink,
		{ safePaths: true },
	);

	if (sink.issues.length > 0) return undefined;
	const out: Record<string, unknown> = {
		schemaVersion: 1,
		kind: "validation-contract",
		packageId,
		focusedCommand,
		expectedTestId,
		matchMode,
		coveringGreen,
		forbiddenProductionPathsBeforeRed,
		sensitivity,
	};
	if (expectedFailureSignature !== undefined) out.expectedFailureSignature = expectedFailureSignature;
	return out;
}

/** When kind is unusable, still harvest per-field issues so maxIssues caps are observable. */
function harvestClosedIssues(obj: Record<string, unknown>, sink: IssueSink): void {
	for (const key of Object.keys(obj)) {
		const v = obj[key];
		const t = v === null ? "null" : Array.isArray(v) ? "array" : typeof v;
		sink.add("invalid_field", key, `invalid or closed-envelope field "${key}" (type ${t})`);
		if (sink.full) return;
	}
}

function parseByKind(obj: Record<string, unknown>, sink: IssueSink): unknown {
	const kind = obj.kind;
	if (typeof kind !== "string") {
		sink.add("invalid_type", "kind", "kind must be string");
		harvestClosedIssues(obj, sink);
		return undefined;
	}
	if (!(CONTRACT_KINDS_V1 as readonly string[]).includes(kind)) {
		sink.add("unknown_kind", "kind", `unknown kind ${kind}`);
		harvestClosedIssues(obj, sink);
		return undefined;
	}
	switch (kind as ContractKindV1) {
		case "role-request":
			return parseRoleRequest(obj, sink);
		case "role-result":
			return parseRoleResult(obj, sink);
		case "approval-request":
			return parseApprovalRequest(obj, sink);
		case "approval-decision":
			return parseApprovalDecision(obj, sink);
		case "validation-contract":
			return parseValidationContract(obj, sink);
	}
}

/**
 * Full untrusted → validated V1 parse path.
 */
export function parseContractV1(input: unknown): ParseResult<unknown> {
	const sink = new IssueSink();

	// Fast root rejects
	if (input === null) {
		sink.add("invalid_type", "$", "null root rejected");
		return sink.err();
	}
	if (typeof input !== "object" || Array.isArray(input)) {
		sink.add("invalid_type", "$", `root must be object, got ${Array.isArray(input) ? "array" : typeof input}`);
		return sink.err();
	}

	// Preflight: no getters, cycles, dangerous keys, etc.
	const pre = preflightUntrustedGraph(input);
	if (!pre.ok) return pre;

	const plain = pre.value;
	if (!isPlainObject(plain)) {
		sink.add("invalid_type", "$", "root must be plain object after preflight");
		return sink.err();
	}

	// Serialized size on the preflight clone (stable JSON)
	checkSerializedSize(plain, sink);
	if (sink.issues.length > 0) return sink.err();

	const value = parseByKind(plain, sink);
	if (sink.issues.length > 0 || value === undefined) return sink.err();
	return sink.ok(value);
}

export function parseRoleRequestV1(input: unknown): ParseResult<unknown> {
	const r = parseContractV1(input);
	if (!r.ok) return r;
	const v = r.value as Record<string, unknown>;
	if (v.kind !== "role-request") {
		return {
			ok: false,
			issues: [{ code: "unknown_kind", path: "kind", message: "expected role-request" }],
		};
	}
	return r;
}

export function parseRoleResultV1(input: unknown): ParseResult<unknown> {
	const r = parseContractV1(input);
	if (!r.ok) return r;
	const v = r.value as Record<string, unknown>;
	if (v.kind !== "role-result") {
		return {
			ok: false,
			issues: [{ code: "unknown_kind", path: "kind", message: "expected role-result" }],
		};
	}
	return r;
}

export function parseApprovalRequestV1(input: unknown): ParseResult<unknown> {
	const r = parseContractV1(input);
	if (!r.ok) return r;
	const v = r.value as Record<string, unknown>;
	if (v.kind !== "approval-request") {
		return {
			ok: false,
			issues: [{ code: "unknown_kind", path: "kind", message: "expected approval-request" }],
		};
	}
	return r;
}

export function parseApprovalDecisionV1(input: unknown): ParseResult<unknown> {
	const r = parseContractV1(input);
	if (!r.ok) return r;
	const v = r.value as Record<string, unknown>;
	if (v.kind !== "approval-decision") {
		return {
			ok: false,
			issues: [{ code: "unknown_kind", path: "kind", message: "expected approval-decision" }],
		};
	}
	return r;
}

export function parseValidationContractV1(input: unknown): ParseResult<unknown> {
	const r = parseContractV1(input);
	if (!r.ok) return r;
	const v = r.value as Record<string, unknown>;
	if (v.kind !== "validation-contract") {
		return {
			ok: false,
			issues: [{ code: "unknown_kind", path: "kind", message: "expected validation-contract" }],
		};
	}
	return r;
}

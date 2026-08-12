import {
	ASSURANCE_ROLES_V1,
	isSafeRepoRelativePath,
	parseRoleResultV1,
} from "../contracts/index.ts";
import { redactForPersistence } from "../security/redact.ts";
import {
	exactKeys,
	isPlainRecord,
	pathOwned,
	publicError,
	result,
	safeAdapterRecord,
	safeInput,
	sameStrings,
	validAbsolutePath,
	validFingerprint,
	validSha,
	validStableId,
	validVersion,
	type PlainRecord,
} from "./internal.ts";
import { validatePlan } from "./plan.ts";

const PRIMITIVE = "assurance_record_handoff" as const;
const ENTRY_TYPE = "assurance:handoff:v1";

type AppendAdapter = Readonly<{
	appendEntry: (customType: string, data: unknown) => unknown;
}>;

function validateCurrent(value: unknown): PlainRecord | undefined {
	if (!isPlainRecord(value) || !exactKeys(value, [
		"planId", "taskId", "role", "worktreePath", "headSha", "expectedFingerprint",
		"currentFingerprint", "evidenceRefs", "handoffPath",
	])) return undefined;
	if (
		!validStableId(value.planId) || !validStableId(value.taskId) ||
		typeof value.role !== "string" || !(ASSURANCE_ROLES_V1 as readonly string[]).includes(value.role) ||
		!validAbsolutePath(value.worktreePath) || !validSha(value.headSha) ||
		!validFingerprint(value.expectedFingerprint) || !validFingerprint(value.currentFingerprint) ||
		!Array.isArray(value.evidenceRefs) || value.evidenceRefs.some((ref) => typeof ref !== "string" || !isSafeRepoRelativePath(ref)) ||
		typeof value.handoffPath !== "string" || !isSafeRepoRelativePath(value.handoffPath)
	) return undefined;
	return value;
}

function appendAdapter(value: unknown): value is AppendAdapter {
	return Boolean(value && typeof value === "object" && typeof (value as Record<string, unknown>).appendEntry === "function");
}

export async function recordHandoff(input: unknown, adapter: unknown) {
	const normalized = safeInput(input);
	if (!normalized.ok) return publicError(PRIMITIVE, normalized.code);
	const value = normalized.value;
	if (!exactKeys(value, ["schemaVersion", "plan", "result", "current"])) return publicError(PRIMITIVE, "ORC01_INVALID_INPUT");
	if (!validVersion(value.schemaVersion)) return publicError(PRIMITIVE, "ORC01_UNSUPPORTED_VERSION");
	const plan = validatePlan(value.plan);
	if (!plan) return publicError(PRIMITIVE, "ORC01_PLAN_INVALID");
	const parsed = parseRoleResultV1(value.result);
	if (!parsed.ok) return publicError(PRIMITIVE, "ORC01_ROLE_RESULT_INVALID");
	const current = validateCurrent(value.current);
	if (!current) return publicError(PRIMITIVE, "ORC01_INVALID_INPUT");
	const roleResult = parsed.value;
	if (
		current.planId !== plan.planId || current.taskId !== plan.request.taskId || current.role !== plan.request.role ||
		current.worktreePath !== plan.assignment.path || roleResult.taskId !== current.taskId || roleResult.role !== current.role ||
		roleResult.headSha !== current.headSha || current.currentFingerprint !== current.expectedFingerprint
	) return publicError(PRIMITIVE, "ORC01_HANDOFF_STALE");
	if (
		(current.evidenceRefs as unknown[]).length === 0 || roleResult.evidenceRefs.length === 0 ||
		!sameStrings(current.evidenceRefs, roleResult.evidenceRefs)
	) return publicError(PRIMITIVE, "ORC01_HANDOFF_EVIDENCE_REQUIRED");
	if (
		roleResult.status === "completed" &&
		(
			(plan.request.writeScope === "none" && roleResult.changedPaths.length > 0) ||
			(plan.request.writeScope !== "none" && roleResult.changedPaths.some((path) => !pathOwned(path, plan.request.ownedPaths)))
		)
	) return publicError(PRIMITIVE, "ORC01_HANDOFF_SCOPE_VIOLATION");
	if (!appendAdapter(adapter)) return publicError(PRIMITIVE, "ORC01_APPEND_UNAVAILABLE", "unavailable");

	const projection = {
		schemaVersion: 1,
		kind: "role-handoff",
		planId: plan.planId,
		taskId: roleResult.taskId,
		role: roleResult.role,
		status: roleResult.status,
		headSha: roleResult.headSha,
		dirty: roleResult.dirty,
		changedPaths: roleResult.changedPaths,
		commands: roleResult.commands,
		evidenceRefs: roleResult.evidenceRefs,
		artifactRefs: roleResult.artifactRefs,
		blockers: roleResult.blockers,
		residualRisks: roleResult.residualRisks,
		usage: roleResult.usage,
		fingerprint: current.currentFingerprint,
		handoffPath: current.handoffPath,
	};
	const redacted = redactForPersistence(projection);
	if (!redacted.ok) return publicError(PRIMITIVE, "ORC01_REDACTION_REQUIRED", "blocked");
	let rawAppend: unknown;
	try {
		rawAppend = await adapter.appendEntry(ENTRY_TYPE, {
			schemaVersion: 1,
			authority: false,
			payload: redacted.value,
		});
	} catch {
		return publicError(PRIMITIVE, "ORC01_APPEND_UNKNOWN", "unknown");
	}
	const appended = safeAdapterRecord(rawAppend);
	if (!appended) return publicError(PRIMITIVE, "ORC01_APPEND_UNKNOWN", "unknown");
	if (appended.ok !== true) return publicError(PRIMITIVE, "ORC01_APPEND_REFUSED", "blocked");
	if (!exactKeys(appended, ["ok", "entryId"]) || !validStableId(appended.entryId)) {
		return publicError(PRIMITIVE, "ORC01_APPEND_UNKNOWN", "unknown");
	}
	const extra = { recorded: true, entryId: appended.entryId };
	if (roleResult.status === "completed" && !roleResult.dirty) {
		return result(PRIMITIVE, true, "recorded", "ORC01_HANDOFF_RECORDED", extra);
	}
	if (roleResult.status === "unknown") {
		return result(PRIMITIVE, false, "unknown", "ORC01_ROLE_UNKNOWN", extra);
	}
	return result(PRIMITIVE, false, "blocked", roleResult.dirty ? "ORC01_HANDOFF_DIRTY" : "ORC01_ROLE_BLOCKED", extra);
}

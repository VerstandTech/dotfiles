import {
	ASSURANCE_ROLES_V1,
	isSafeRepoRelativePath,
	parseRoleResultV1,
} from "../contracts/index.ts";
import {
	callAdapter,
	deepFreeze,
	exactKeys,
	isPlainRecord,
	publicError,
	result,
	safeInput,
	validAbsolutePath,
	validInteger,
	validStableId,
	validVersion,
	type PlainRecord,
} from "./internal.ts";

const PRIMITIVE = "assurance_wait_role" as const;
const STATES = new Set(["done", "blocked", "working", "unknown", "timeout"]);

type WaitAdapters = Readonly<{
	wait: (request: Readonly<PlainRecord>) => unknown;
	get: (request: Readonly<PlainRecord>) => unknown;
	read: (request: Readonly<PlainRecord>) => unknown;
}>;

function validateRoleRef(value: unknown): PlainRecord | undefined {
	if (!isPlainRecord(value) || !exactKeys(value, ["planId", "taskId", "role", "agentId", "paneId", "worktreePath"])) return undefined;
	if (
		!validStableId(value.planId) || !validStableId(value.taskId) || !validStableId(value.agentId) || !validStableId(value.paneId) ||
		typeof value.role !== "string" || !(ASSURANCE_ROLES_V1 as readonly string[]).includes(value.role) ||
		!validAbsolutePath(value.worktreePath)
	) return undefined;
	return value;
}

function validateBounds(value: unknown): PlainRecord | undefined {
	if (!isPlainRecord(value) || !exactKeys(value, ["maxAttempts", "maxDurationMs"])) return undefined;
	if (!validInteger(value.maxAttempts, 1, 16) || !validInteger(value.maxDurationMs, 1, 300_000)) return undefined;
	return value;
}

function adaptersAvailable(value: unknown): value is WaitAdapters {
	return Boolean(
		value && typeof value === "object" &&
		typeof (value as Record<string, unknown>).wait === "function" &&
		typeof (value as Record<string, unknown>).get === "function" &&
		typeof (value as Record<string, unknown>).read === "function",
	);
}

function waitState(value: PlainRecord | undefined, bounds: PlainRecord): string | undefined {
	if (!value || value.ok !== true || typeof value.state !== "string" || !STATES.has(value.state)) return undefined;
	if (!validInteger(value.attemptsUsed, 1, 16) || !validInteger(value.durationMs, 0, 300_000)) return undefined;
	if ((value.attemptsUsed as number) > (bounds.maxAttempts as number) || (value.durationMs as number) > (bounds.maxDurationMs as number)) {
		return "bounds-violated";
	}
	return value.state;
}

function uncertain(state: string) {
	if (state === "timeout") return publicError(PRIMITIVE, "ORC01_WAIT_TIMEOUT", "unknown");
	if (state === "blocked") return publicError(PRIMITIVE, "ORC01_ROLE_BLOCKED", "blocked");
	if (state === "working") return publicError(PRIMITIVE, "ORC01_ROLE_STILL_WORKING", "unknown");
	return publicError(PRIMITIVE, "ORC01_ROLE_UNKNOWN", "unknown");
}

export async function waitRole(input: unknown, adapters: unknown) {
	const normalized = safeInput(input);
	if (!normalized.ok) return publicError(PRIMITIVE, normalized.code);
	const value = normalized.value;
	if (!exactKeys(value, ["schemaVersion", "roleRef", "bounds"])) return publicError(PRIMITIVE, "ORC01_INVALID_INPUT");
	if (!validVersion(value.schemaVersion)) return publicError(PRIMITIVE, "ORC01_UNSUPPORTED_VERSION");
	const roleRef = validateRoleRef(value.roleRef);
	const bounds = validateBounds(value.bounds);
	if (!roleRef || !bounds) return publicError(PRIMITIVE, "ORC01_INVALID_INPUT");
	if (!adaptersAvailable(adapters)) return publicError(PRIMITIVE, "ORC01_WAIT_ADAPTER_UNAVAILABLE", "unavailable");
	const context = deepFreeze({ roleRef, bounds });
	const waited = await callAdapter(adapters.wait, context);
	const state = waitState(waited, bounds);
	if (!state) return publicError(PRIMITIVE, "ORC01_WAIT_ADAPTER_UNAVAILABLE", "unknown");
	if (state === "bounds-violated") return publicError(PRIMITIVE, "ORC01_WAIT_BOUNDS_VIOLATED", "unknown");
	if (state !== "done") return uncertain(state);

	const observed = await callAdapter(adapters.get, deepFreeze({ roleRef }));
	if (
		!observed || observed.ok !== true || observed.state !== "done" ||
		observed.agentId !== roleRef.agentId || observed.paneId !== roleRef.paneId
	) {
		if (observed?.state === "blocked") return publicError(PRIMITIVE, "ORC01_ROLE_BLOCKED", "blocked");
		if (observed?.state === "working") return publicError(PRIMITIVE, "ORC01_ROLE_STILL_WORKING", "unknown");
		return publicError(PRIMITIVE, "ORC01_ROLE_UNKNOWN", "unknown");
	}
	const read = await callAdapter(adapters.read, deepFreeze({ roleRef }));
	if (!read || read.ok !== true || typeof read.artifactRef !== "string" || !isSafeRepoRelativePath(read.artifactRef)) {
		return publicError(PRIMITIVE, "ORC01_ROLE_RESULT_INVALID", "blocked");
	}
	const parsed = parseRoleResultV1(read.result);
	if (!parsed.ok || parsed.value.taskId !== roleRef.taskId || parsed.value.role !== roleRef.role) {
		return publicError(PRIMITIVE, "ORC01_ROLE_RESULT_INVALID", "blocked");
	}
	const roleResult = parsed.value;
	if (roleResult.status === "completed" && !roleResult.dirty) {
		return result(PRIMITIVE, true, "completed", "ORC01_ROLE_COMPLETED", {
			artifactRef: read.artifactRef,
			result: roleResult,
		});
	}
	if (roleResult.status === "completed") {
		return result(PRIMITIVE, false, "blocked", "ORC01_ROLE_DIRTY", {
			artifactRef: read.artifactRef,
			result: roleResult,
		});
	}
	if (roleResult.status === "unknown") {
		return result(PRIMITIVE, false, "unknown", "ORC01_ROLE_UNKNOWN", {
			artifactRef: read.artifactRef,
			result: roleResult,
		});
	}
	return result(PRIMITIVE, false, "blocked", "ORC01_ROLE_BLOCKED", {
		artifactRef: read.artifactRef,
		result: roleResult,
	});
}

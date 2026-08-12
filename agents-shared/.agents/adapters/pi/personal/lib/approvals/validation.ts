import { createHash } from "node:crypto";

import { isIsoTimestamp } from "../contracts/issues.ts";
import { isSafeRepoRelativePath } from "../contracts/path.ts";
import { isSecretLeafBasenameV1 } from "../security/secret-leaf.ts";
import {
	APPROVAL_KINDS_V1,
	type ApprovalAuthorityRecordV1,
	type ApprovalLifecycleFactsV1,
	type ApprovalStoreEnvelopeV1,
	type ApprovalStoreFactsV1,
	type NormalizedApprovalRequestV1,
} from "./types.ts";

const MAX_DEPTH = 10;
const MAX_TOTAL_KEYS = 1024;
const MAX_ARRAY = 128;
const MAX_STRING = 512;
const MAX_BYTES = 65_536;
export const MAX_APPROVAL_RECORDS_V1 = 128;

const REQUEST_KEYS = [
	"schemaVersion",
	"kind",
	"requestId",
	"approvalKind",
	"action",
	"risk",
	"effect",
	"paths",
	"headSha",
	"planFingerprint",
	"actionFingerprint",
	"sessionId",
	"generation",
	"createdAt",
	"expiresAt",
] as const;

const NORMALIZED_REQUEST_KEYS = [...REQUEST_KEYS, "scopeFingerprint"] as const;
const STORE_FACT_KEYS = [
	"schemaVersion",
	"storePath",
	"storeRealPath",
	"projectRoot",
	"projectRealPath",
	"exists",
	"mode",
	"regularFile",
	"symbolicLink",
	"hardLinkCount",
	"noFollow",
	"atomicReplace",
	"parentDirectorySafe",
	"machineLocal",
] as const;

export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
export type PlainRecord = { [key: string]: JsonValue };

type SnapshotState = { keys: number };

export function deepFreeze<T>(value: T, seen = new Set<object>()): T {
	if (!value || typeof value !== "object") return value;
	const object = value as object;
	if (seen.has(object)) return value;
	seen.add(object);
	for (const key of Reflect.ownKeys(object)) {
		const descriptor = Object.getOwnPropertyDescriptor(object, key);
		if (descriptor && "value" in descriptor) deepFreeze(descriptor.value, seen);
	}
	return Object.freeze(value);
}

function cloneJson(value: unknown, depth: number, state: SnapshotState): JsonValue {
	if (depth > MAX_DEPTH) throw new Error("bounds");
	if (value === null || typeof value === "boolean") return value;
	if (typeof value === "string") {
		if (value.length > MAX_STRING) throw new Error("bounds");
		return value;
	}
	if (typeof value === "number") {
		if (!Number.isFinite(value)) throw new Error("invalid");
		return value;
	}
	if (typeof value !== "object") throw new Error("invalid");

	const proto = Object.getPrototypeOf(value);
	if (Array.isArray(value)) {
		if (proto !== Array.prototype || value.length > MAX_ARRAY) throw new Error("invalid");
		const keys = Reflect.ownKeys(value);
		for (const key of keys) {
			if (key === "length") continue;
			if (typeof key !== "string" || !/^(0|[1-9][0-9]*)$/.test(key)) throw new Error("invalid");
		}
		const result: JsonValue[] = [];
		for (let index = 0; index < value.length; index += 1) {
			const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
			if (!descriptor || !("value" in descriptor) || descriptor.get || descriptor.set) throw new Error("invalid");
			state.keys += 1;
			if (state.keys > MAX_TOTAL_KEYS) throw new Error("bounds");
			result.push(cloneJson(descriptor.value, depth + 1, state));
		}
		return result;
	}

	if (proto !== Object.prototype && proto !== null) throw new Error("invalid");
	const result: PlainRecord = Object.create(null) as PlainRecord;
	const keys = Reflect.ownKeys(value);
	if (keys.length > MAX_ARRAY) throw new Error("bounds");
	for (const key of keys) {
		if (typeof key !== "string" || key === "__proto__" || key === "prototype" || key === "constructor") {
			throw new Error("invalid");
		}
		const descriptor = Object.getOwnPropertyDescriptor(value, key);
		if (!descriptor || !("value" in descriptor) || descriptor.get || descriptor.set) throw new Error("invalid");
		state.keys += 1;
		if (state.keys > MAX_TOTAL_KEYS) throw new Error("bounds");
		result[key] = cloneJson(descriptor.value, depth + 1, state);
	}
	return result;
}

export function safeSnapshot(input: unknown): JsonValue | undefined {
	try {
		const value = cloneJson(input, 0, { keys: 0 });
		const json = JSON.stringify(value);
		if (new TextEncoder().encode(json).byteLength > MAX_BYTES) return undefined;
		return value;
	} catch {
		return undefined;
	}
}

export function isRecord(value: unknown): value is PlainRecord {
	return !!value && typeof value === "object" && !Array.isArray(value) &&
		(Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

function hasExactKeys(value: PlainRecord, expected: readonly string[]): boolean {
	const keys = Object.keys(value).sort();
	const wanted = [...expected].sort();
	return keys.length === wanted.length && keys.every((key, index) => key === wanted[index]);
}

function safeId(value: unknown, max = 128): value is string {
	return typeof value === "string" && value.length > 0 && value.length <= max &&
		/^[A-Za-z0-9](?:[A-Za-z0-9._:-]*[A-Za-z0-9])?$/.test(value);
}

/** CON-compatible semantic strings: non-empty, bounded, no controls; spaces allowed. */
function boundedSemanticString(value: unknown, max = 512): value is string {
	return typeof value === "string" && value.length > 0 && value.length <= max &&
		!/[\u0000-\u001f\u007f]/.test(value);
}

/** Canonicalize CON whole-second or millisecond Z timestamps to strict ms form. */
export function canonicalizeTimestampV1(value: unknown): string | undefined {
	if (typeof value !== "string" || !isIsoTimestamp(value)) return undefined;
	if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value)) return `${value.slice(0, -1)}.000Z`;
	return value;
}

export function timestampMs(value: unknown): number | undefined {
	const canonical = canonicalizeTimestampV1(value);
	return canonical === undefined ? undefined : Date.parse(canonical);
}

function hex(value: unknown, lengths: readonly number[]): value is string {
	return typeof value === "string" && lengths.includes(value.length) && /^[a-fA-F0-9]+$/.test(value);
}

/** Preserve 64-hex fingerprints; hash any other bounded CON fingerprint deterministically. */
export function canonicalizeFingerprintV1(value: unknown): string | undefined {
	if (!boundedSemanticString(value, MAX_STRING)) return undefined;
	if (/^[a-fA-F0-9]{64}$/.test(value)) return value.toLowerCase();
	return createHash("sha256").update(value, "utf8").digest("hex");
}

type PathNormalizeResult =
	| { ok: true; path: string }
	| { ok: false; code: "APR01_CREDENTIAL_LEAF" | "APR01_INVALID_REQUEST" };

function normalizeRepoPath(value: unknown): PathNormalizeResult {
	if (typeof value !== "string" || value.length === 0 || value.length > 240) {
		return { ok: false, code: "APR01_INVALID_REQUEST" };
	}
	const leaf = value.split("/").at(-1) ?? value;
	if (isSecretLeafBasenameV1(leaf)) return { ok: false, code: "APR01_CREDENTIAL_LEAF" };
	if (!isSafeRepoRelativePath(value)) return { ok: false, code: "APR01_INVALID_REQUEST" };
	return { ok: true, path: value };
}

function scopeHash(request: Omit<NormalizedApprovalRequestV1, "scopeFingerprint">): string {
	return createHash("sha256").update(JSON.stringify({
		requestId: request.requestId,
		approvalKind: request.approvalKind,
		action: request.action,
		risk: request.risk,
		effect: request.effect,
		paths: request.paths,
		headSha: request.headSha,
		planFingerprint: request.planFingerprint,
		actionFingerprint: request.actionFingerprint,
		sessionId: request.sessionId,
		generation: request.generation,
		createdAt: request.createdAt,
		expiresAt: request.expiresAt,
	})).digest("hex");
}

function invalid(code = "APR01_INVALID_REQUEST") {
	return deepFreeze({
		schemaVersion: 1,
		ok: false,
		outcome: "blocked",
		code,
	});
}

export function normalizeApprovalRequestV1(input: unknown): any {
	const snapshot = safeSnapshot(input);
	if (!isRecord(snapshot) || !hasExactKeys(snapshot, REQUEST_KEYS)) return invalid();
	if (snapshot.schemaVersion !== 1 || snapshot.kind !== "approval-request") return invalid();
	if (!safeId(snapshot.requestId, 120) || !safeId(snapshot.sessionId, 160)) return invalid();
	if (!APPROVAL_KINDS_V1.includes(snapshot.approvalKind as never)) return invalid();
	if (!boundedSemanticString(snapshot.action) || !boundedSemanticString(snapshot.risk) ||
		!boundedSemanticString(snapshot.effect)) return invalid();
	const planFingerprint = canonicalizeFingerprintV1(snapshot.planFingerprint);
	const actionFingerprint = canonicalizeFingerprintV1(snapshot.actionFingerprint);
	if (!planFingerprint || !actionFingerprint) return invalid();
	if (!Number.isSafeInteger(snapshot.generation) || snapshot.generation < 1 || snapshot.generation > 1_000_000_000) return invalid();
	const createdAt = canonicalizeTimestampV1(snapshot.createdAt);
	const expiresAt = canonicalizeTimestampV1(snapshot.expiresAt);
	if (!createdAt || !expiresAt) return invalid();
	if (!(Date.parse(createdAt) < Date.parse(expiresAt))) return invalid();
	if (!Array.isArray(snapshot.paths) || snapshot.paths.length > 64) return invalid();
	const paths: string[] = [];
	for (const path of snapshot.paths) {
		const normalized = normalizeRepoPath(path);
		if (!normalized.ok) return invalid(normalized.code);
		paths.push(normalized.path);
	}
	const normalizedPaths = [...new Set(paths)].sort();
	if ((snapshot.approvalKind === "diff" || snapshot.approvalKind === "risky-action") && !hex(snapshot.headSha, [40, 64])) {
		return invalid();
	}
	if (snapshot.headSha !== null && !hex(snapshot.headSha, [40, 64])) return invalid();

	const request = {
		schemaVersion: 1 as const,
		kind: "approval-request" as const,
		requestId: snapshot.requestId,
		approvalKind: snapshot.approvalKind,
		action: snapshot.action,
		risk: snapshot.risk,
		effect: snapshot.effect,
		paths: normalizedPaths,
		headSha: snapshot.headSha === null ? null : snapshot.headSha.toLowerCase(),
		planFingerprint,
		actionFingerprint,
		sessionId: snapshot.sessionId,
		generation: snapshot.generation,
		createdAt,
		expiresAt,
	};
	const normalized: NormalizedApprovalRequestV1 = {
		...request,
		scopeFingerprint: scopeHash(request as Omit<NormalizedApprovalRequestV1, "scopeFingerprint">),
	};
	return deepFreeze({ schemaVersion: 1, ok: true, request: normalized });
}

function absolutePath(value: unknown): value is string {
	if (typeof value !== "string" || value.length < 2 || value.length > 1024 || !value.startsWith("/")) return false;
	if (value.includes("\\") || value.includes("\0") || value.includes("//") || (value.length > 1 && value.endsWith("/"))) return false;
	const parts = value.slice(1).split("/");
	return parts.every((part) => part.length > 0 && part !== "." && part !== "..");
}

function contained(path: string, root: string): boolean {
	return path === root || path.startsWith(`${root}/`);
}

export function validateApprovalStoreFactsV1(input: unknown): any {
	const snapshot = safeSnapshot(input);
	if (!isRecord(snapshot) || !hasExactKeys(snapshot, STORE_FACT_KEYS)) return invalid("APR01_STORE_UNSAFE");
	if (snapshot.schemaVersion !== 1 || !absolutePath(snapshot.storePath) || !absolutePath(snapshot.storeRealPath) ||
		!absolutePath(snapshot.projectRoot) || !absolutePath(snapshot.projectRealPath)) return invalid("APR01_STORE_UNSAFE");
	if (contained(snapshot.storePath, snapshot.projectRoot) || contained(snapshot.storeRealPath, snapshot.projectRealPath)) {
		return invalid("APR01_STORE_UNSAFE");
	}
	for (const key of ["exists", "regularFile", "symbolicLink", "noFollow", "atomicReplace", "parentDirectorySafe", "machineLocal"] as const) {
		if (typeof snapshot[key] !== "boolean") return invalid("APR01_STORE_UNSAFE");
	}
	if (snapshot.mode !== 0o600 || snapshot.noFollow !== true || snapshot.atomicReplace !== true ||
		snapshot.parentDirectorySafe !== true || snapshot.machineLocal !== true || snapshot.symbolicLink !== false) {
		return invalid("APR01_STORE_UNSAFE");
	}
	if (!Number.isSafeInteger(snapshot.hardLinkCount)) return invalid("APR01_STORE_UNSAFE");
	if (snapshot.exists === true) {
		if (snapshot.regularFile !== true || snapshot.hardLinkCount !== 1) return invalid("APR01_STORE_UNSAFE");
	} else if (snapshot.regularFile !== false || snapshot.hardLinkCount !== 0) return invalid("APR01_STORE_UNSAFE");
	return deepFreeze({ schemaVersion: 1, ok: true, facts: snapshot as unknown as ApprovalStoreFactsV1 });
}

export function validateLifecycleV1(input: unknown, request: NormalizedApprovalRequestV1): ApprovalLifecycleFactsV1 | undefined {
	const snapshot = safeSnapshot(input);
	if (!isRecord(snapshot) || !hasExactKeys(snapshot, ["active", "sessionId", "generation"])) return undefined;
	if (snapshot.active !== true || snapshot.sessionId !== request.sessionId || snapshot.generation !== request.generation) return undefined;
	return deepFreeze({ active: true, sessionId: request.sessionId, generation: request.generation });
}

function normalizedRequestFromStored(input: unknown): NormalizedApprovalRequestV1 | undefined {
	const snapshot = safeSnapshot(input);
	if (!isRecord(snapshot) || !hasExactKeys(snapshot, NORMALIZED_REQUEST_KEYS) || !hex(snapshot.scopeFingerprint, [64])) return undefined;
	const candidate: PlainRecord = Object.create(null) as PlainRecord;
	for (const key of REQUEST_KEYS) candidate[key] = snapshot[key];
	const parsed = normalizeApprovalRequestV1(candidate);
	if (parsed.ok !== true || parsed.request.scopeFingerprint !== snapshot.scopeFingerprint) return undefined;
	if (JSON.stringify(parsed.request) !== JSON.stringify(snapshot)) return undefined;
	return parsed.request;
}

function parseRecord(input: unknown): ApprovalAuthorityRecordV1 | undefined {
	const snapshot = safeSnapshot(input);
	if (!isRecord(snapshot) || !hasExactKeys(snapshot, [
		"schemaVersion", "recordType", "request", "scopeFingerprint", "decision", "decidedAt", "authority",
	])) return undefined;
	if (snapshot.schemaVersion !== 1 || snapshot.recordType !== "approval-authority-record") return undefined;
	const request = normalizedRequestFromStored(snapshot.request);
	if (!request || snapshot.scopeFingerprint !== request.scopeFingerprint) return undefined;
	if (snapshot.decision !== "approved" && snapshot.decision !== "denied") return undefined;
	const decidedAt = canonicalizeTimestampV1(snapshot.decidedAt);
	if (!decidedAt) return undefined;
	const decided = Date.parse(decidedAt);
	if (!(Date.parse(request.createdAt) <= decided && decided < Date.parse(request.expiresAt))) return undefined;
	if (!isRecord(snapshot.authority) || !hasExactKeys(snapshot.authority, [
		"source", "method", "sessionId", "generation", "machineLocal",
	])) return undefined;
	if (snapshot.authority.source !== "human-tui" || snapshot.authority.method !== "pi-tui-confirm-select" ||
		snapshot.authority.sessionId !== request.sessionId || snapshot.authority.generation !== request.generation ||
		snapshot.authority.machineLocal !== true) return undefined;
	return deepFreeze({
		schemaVersion: 1,
		recordType: "approval-authority-record",
		request,
		scopeFingerprint: request.scopeFingerprint,
		decision: snapshot.decision,
		decidedAt,
		authority: {
			source: "human-tui",
			method: "pi-tui-confirm-select",
			sessionId: request.sessionId,
			generation: request.generation,
			machineLocal: true,
		},
	});
}

export function parseApprovalStoreEnvelopeV1(input: unknown): ApprovalStoreEnvelopeV1 | undefined {
	const snapshot = safeSnapshot(input);
	if (!isRecord(snapshot) || !hasExactKeys(snapshot, ["schemaVersion", "records"]) || snapshot.schemaVersion !== 1 ||
		!Array.isArray(snapshot.records) || snapshot.records.length > MAX_APPROVAL_RECORDS_V1) return undefined;
	const records: ApprovalAuthorityRecordV1[] = [];
	const ids = new Set<string>();
	for (const candidate of snapshot.records) {
		const record = parseRecord(candidate);
		if (!record || ids.has(record.request.requestId)) return undefined;
		ids.add(record.request.requestId);
		records.push(record);
	}
	records.sort((left, right) => left.request.requestId.localeCompare(right.request.requestId));
	return deepFreeze({ schemaVersion: 1, records });
}

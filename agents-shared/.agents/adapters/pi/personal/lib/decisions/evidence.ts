import { createHash } from "node:crypto";

import { CONTRACT_LIMITS_V1 } from "../contracts/limits.ts";
import {
	isSafeRepoRelativePath,
	isSafeValidationGlobPath,
} from "../contracts/path.ts";
import {
	DECISION_KINDS,
	DECISION_STATUSES,
	type DecisionEnforcementV1,
	type DecisionKind,
	type DecisionRecord,
	type DecisionStatus,
	type DecisionStore,
} from "./types.ts";

export const DECISION_EVIDENCE_LIMITS_V1 = Object.freeze({
	maxSerializedBytes: CONTRACT_LIMITS_V1.maxSerializedBytes,
	maxNestingDepth: CONTRACT_LIMITS_V1.maxNestingDepth,
	maxStringLength: CONTRACT_LIMITS_V1.maxStringLength,
	maxArrayLength: CONTRACT_LIMITS_V1.maxArrayLength,
	maxObjectKeys: CONTRACT_LIMITS_V1.maxObjectKeys,
	maxActionIdLength: 128,
});

export type DecisionSnapshotRefusalCodeV1 =
	| "bounds"
	| "duplicate-id"
	| "invalid-authority"
	| "invalid-store"
	| "unsafe-scope-path"
	| "unsafe-source-path";

export type DecisionActionRefusalCodeV1 =
	| "bounds"
	| "invalid-action"
	| "invalid-action-evidence"
	| "invalid-snapshot"
	| "unsafe-action-path";

export type DecisionApprovalStatusV1 =
	| "current"
	| "missing"
	| "stale"
	| "agent-mutation-detected";

export type DecisionReasonCodeV1 =
	| "agent-mutation-detected"
	| "constraint-conflict"
	| "decision-review-required"
	| "duplicate-action"
	| "human-review-required"
	| "pre-action-failed"
	| "stale-action-evidence"
	| "stale-approval"
	| "stale-store-fingerprint";

export interface NormalizedDecisionRecordV1 extends Omit<DecisionRecord, "enforcement"> {
	enforcement?: DecisionEnforcementV1;
}

export interface NormalizedDecisionStoreV1 extends Omit<DecisionStore, "decisions"> {
	decisions: NormalizedDecisionRecordV1[];
}

export type DecisionStoreSnapshotV1 = Readonly<{
	version: 1;
	sourcePath: string;
	writableByAgent: boolean;
	approvalStatus: DecisionApprovalStatusV1;
	approvedFingerprint: string | null;
	fingerprint: string;
	canonicalJson: string;
	store: Readonly<NormalizedDecisionStoreV1>;
}>;

export type DecisionStoreSnapshotResultV1 =
	| Readonly<{ ok: true; snapshot: DecisionStoreSnapshotV1 }>
	| Readonly<{ ok: false; code: DecisionSnapshotRefusalCodeV1 }>;

export type DecisionPreActionEvidenceV1 = Readonly<{
	version: 1;
	executorKind: "internal";
	trustTier: "trusted";
	required: true;
	status: "passed" | "failed";
	storeFingerprint: string;
	approvalFingerprint: string | null;
	actionId: string;
	paths: readonly string[];
	reasonCodes: readonly DecisionReasonCodeV1[];
	matchedIds: readonly string[];
	inactiveIds: readonly string[];
	advisoryIds: readonly string[];
}>;

export type DecisionPreActionResultV1 =
	| Readonly<{ ok: true; evidence: DecisionPreActionEvidenceV1 }>
	| Readonly<{ ok: false; code: DecisionActionRefusalCodeV1 }>;

export type DecisionHandoffEvidenceV1 = Readonly<{
	version: 1;
	executorKind: "internal";
	trustTier: "trusted";
	required: true;
	status: "passed" | "failed";
	storeFingerprint: string;
	approvalFingerprint: string | null;
	actionIds: readonly string[];
	reasonCodes: readonly DecisionReasonCodeV1[];
}>;

export type DecisionHandoffResultV1 =
	| Readonly<{ ok: true; evidence: DecisionHandoffEvidenceV1 }>
	| Readonly<{ ok: false; code: DecisionActionRefusalCodeV1 }>;

class DecisionEvidenceRefusal extends Error {
	readonly code: DecisionSnapshotRefusalCodeV1 | DecisionActionRefusalCodeV1;

	constructor(code: DecisionSnapshotRefusalCodeV1 | DecisionActionRefusalCodeV1) {
		super(code);
		this.code = code;
	}
}

type JsonValue =
	| null
	| boolean
	| number
	| string
	| JsonValue[]
	| { [key: string]: JsonValue };

type PlainRecord = { [key: string]: JsonValue };

const STORE_KEYS = new Set(["version", "project", "decisions"]);
const DECISION_KEYS = new Set([
	"id",
	"kind",
	"status",
	"title",
	"context",
	"decision",
	"consequences",
	"alternatives",
	"tags",
	"scopePaths",
	"relatedIds",
	"supersedes",
	"confidence",
	"humanReview",
	"createdAt",
	"updatedAt",
	"author",
	"enforcement",
]);
const ENFORCEMENT_KEYS = new Set(["effect", "actionIds"]);
const REQUEST_KEYS = new Set(["snapshot", "actionId", "paths"]);
const HANDOFF_REQUEST_KEYS = new Set(["snapshot", "expectedFingerprint", "actions"]);
const PRE_ACTION_EVIDENCE_KEYS = new Set([
	"version",
	"executorKind",
	"trustTier",
	"required",
	"status",
	"storeFingerprint",
	"approvalFingerprint",
	"actionId",
	"paths",
	"reasonCodes",
	"matchedIds",
	"inactiveIds",
	"advisoryIds",
]);
const AUTHORITY_KEYS = new Set(["sourcePath", "writableByAgent", "approvedFingerprint"]);
const UNSAFE_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const DECISION_ID_RE = /^[A-Z][A-Z0-9]{1,15}-[A-Z0-9][A-Z0-9._-]{0,63}$/;
const ACTION_ID_RE = /^[a-z][a-z0-9]*(?:[._:-][a-z0-9]+)*$/;
const SHA256_RE = /^[0-9a-f]{64}$/;
const UTC_TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const HUMAN_REVIEWS = new Set(["pending", "approved", "rejected"]);
const STATUS_SET = new Set<string>(DECISION_STATUSES);
const KIND_SET = new Set<string>(DECISION_KINDS);
const INACTIVE_STATUSES = new Set<DecisionStatus>([
	"rejected",
	"superseded",
	"deprecated",
	"proposed",
]);
const REASON_PRIORITY: readonly DecisionReasonCodeV1[] = [
	"agent-mutation-detected",
	"human-review-required",
	"stale-approval",
	"decision-review-required",
	"constraint-conflict",
	"stale-store-fingerprint",
	"stale-action-evidence",
	"pre-action-failed",
	"duplicate-action",
];
const REASON_SET = new Set<string>(REASON_PRIORITY);
const knownSnapshots = new WeakSet<object>();
const knownPreActionEvidence = new WeakSet<object>();

function refusal<T extends DecisionSnapshotRefusalCodeV1 | DecisionActionRefusalCodeV1>(
	code: T,
): Readonly<{ ok: false; code: T }> {
	return Object.freeze({ ok: false, code });
}

function throwRefusal(code: DecisionSnapshotRefusalCodeV1 | DecisionActionRefusalCodeV1): never {
	throw new DecisionEvidenceRefusal(code);
}

function compareText(left: string, right: string): number {
	return left < right ? -1 : left > right ? 1 : 0;
}

function byteLength(text: string): number {
	return new TextEncoder().encode(text).byteLength;
}

function cloneJson(value: unknown, depth = 0, active = new WeakSet<object>()): JsonValue {
	if (depth > DECISION_EVIDENCE_LIMITS_V1.maxNestingDepth) throwRefusal("bounds");
	if (value === null) return null;
	if (typeof value === "string") {
		if (value.length > DECISION_EVIDENCE_LIMITS_V1.maxStringLength) throwRefusal("bounds");
		return value;
	}
	if (typeof value === "boolean") return value;
	if (typeof value === "number") {
		if (!Number.isFinite(value)) throwRefusal("invalid-store");
		return value;
	}
	if (typeof value !== "object") throwRefusal("invalid-store");
	if (active.has(value)) throwRefusal("invalid-store");
	active.add(value);
	try {
		let prototype: object | null;
		let keys: (string | symbol)[];
		try {
			prototype = Object.getPrototypeOf(value);
			keys = Reflect.ownKeys(value);
		} catch {
			throwRefusal("invalid-store");
		}
		if (Array.isArray(value)) {
			if (prototype !== Array.prototype) throwRefusal("invalid-store");
			if (value.length > DECISION_EVIDENCE_LIMITS_V1.maxArrayLength) throwRefusal("bounds");
			if (keys.some((key) => typeof key === "symbol")) throwRefusal("invalid-store");
			const allowed = new Set(["length"]);
			for (let index = 0; index < value.length; index += 1) allowed.add(String(index));
			if (keys.some((key) => typeof key !== "string" || !allowed.has(key))) {
				throwRefusal("invalid-store");
			}
			const output: JsonValue[] = [];
			for (let index = 0; index < value.length; index += 1) {
				let descriptor: PropertyDescriptor | undefined;
				try {
					descriptor = Object.getOwnPropertyDescriptor(value, String(index));
				} catch {
					throwRefusal("invalid-store");
				}
				if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
					throwRefusal("invalid-store");
				}
				output.push(cloneJson(descriptor.value, depth + 1, active));
			}
			return output;
		}
		if (prototype !== Object.prototype && prototype !== null) throwRefusal("invalid-store");
		if (keys.length > DECISION_EVIDENCE_LIMITS_V1.maxObjectKeys) throwRefusal("bounds");
		if (keys.some((key) => typeof key === "symbol")) throwRefusal("invalid-store");
		const output: PlainRecord = {};
		for (const key of keys as string[]) {
			if (UNSAFE_KEYS.has(key)) throwRefusal("invalid-store");
			if (key.length > DECISION_EVIDENCE_LIMITS_V1.maxStringLength) throwRefusal("bounds");
			let descriptor: PropertyDescriptor | undefined;
			try {
				descriptor = Object.getOwnPropertyDescriptor(value, key);
			} catch {
				throwRefusal("invalid-store");
			}
			if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
				throwRefusal("invalid-store");
			}
			output[key] = cloneJson(descriptor.value, depth + 1, active);
		}
		return output;
	} finally {
		active.delete(value);
	}
}

function cloneBounded(value: unknown): JsonValue {
	const cloned = cloneJson(value);
	let serialized: string;
	try {
		serialized = JSON.stringify(cloned);
	} catch {
		throwRefusal("invalid-store");
	}
	if (byteLength(serialized) > DECISION_EVIDENCE_LIMITS_V1.maxSerializedBytes) {
		throwRefusal("bounds");
	}
	return cloned;
}

function isRecord(value: JsonValue): value is PlainRecord {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(record: PlainRecord, allowed: ReadonlySet<string>): void {
	if (Object.keys(record).some((key) => !allowed.has(key))) throwRefusal("invalid-store");
}

function requiredString(record: PlainRecord, key: string): string {
	const value = record[key];
	if (typeof value !== "string" || value.length === 0) throwRefusal("invalid-store");
	return value;
}

function optionalString(record: PlainRecord, key: string): string | undefined {
	const value = record[key];
	if (value === undefined) return undefined;
	if (typeof value !== "string" || value.length === 0) throwRefusal("invalid-store");
	return value;
}

function stringArray(
	record: PlainRecord,
	key: string,
	options: { required?: boolean; nonEmpty?: boolean } = {},
): string[] | undefined {
	const value = record[key];
	if (value === undefined && !options.required) return undefined;
	if (!Array.isArray(value)) throwRefusal("invalid-store");
	if (options.nonEmpty && value.length === 0) throwRefusal("invalid-store");
	const output: string[] = [];
	for (const item of value) {
		if (typeof item !== "string" || item.length === 0) throwRefusal("invalid-store");
		output.push(item);
	}
	return output;
}

function sortedSet(values: readonly string[] | undefined): string[] | undefined {
	if (!values) return undefined;
	return [...new Set(values)].sort(compareText);
}

function validDecisionId(value: string): boolean {
	return DECISION_ID_RE.test(value);
}

function validActionId(value: string): boolean {
	return (
		value.length <= DECISION_EVIDENCE_LIMITS_V1.maxActionIdLength && ACTION_ID_RE.test(value)
	);
}

function validScopePath(path: string): boolean {
	if (path === "**") return true;
	if (path.endsWith("/**")) return isSafeValidationGlobPath(path);
	return isSafeRepoRelativePath(path);
}

function normalizeEnforcement(value: JsonValue | undefined): DecisionEnforcementV1 | undefined {
	if (value === undefined) return undefined;
	if (!isRecord(value)) throwRefusal("invalid-store");
	exactKeys(value, ENFORCEMENT_KEYS);
	if (value.effect !== "forbid") throwRefusal("invalid-store");
	const actionIds = stringArray(value, "actionIds", { required: true, nonEmpty: true })!;
	if (actionIds.some((actionId) => !validActionId(actionId))) throwRefusal("invalid-store");
	return { effect: "forbid", actionIds: sortedSet(actionIds)! };
}

function normalizeDecision(value: JsonValue): NormalizedDecisionRecordV1 {
	if (!isRecord(value)) throwRefusal("invalid-store");
	exactKeys(value, DECISION_KEYS);
	const id = requiredString(value, "id");
	const kind = requiredString(value, "kind");
	const status = requiredString(value, "status");
	const title = requiredString(value, "title");
	const context = requiredString(value, "context");
	const decision = requiredString(value, "decision");
	const createdAt = requiredString(value, "createdAt");
	const updatedAt = requiredString(value, "updatedAt");
	if (!validDecisionId(id) || !KIND_SET.has(kind) || !STATUS_SET.has(status)) {
		throwRefusal("invalid-store");
	}
	if (!UTC_TIMESTAMP_RE.test(createdAt) || !UTC_TIMESTAMP_RE.test(updatedAt)) {
		throwRefusal("invalid-store");
	}
	const consequences = optionalString(value, "consequences");
	const alternatives = stringArray(value, "alternatives");
	const tags = sortedSet(stringArray(value, "tags"));
	const scopePaths = sortedSet(stringArray(value, "scopePaths"));
	if (scopePaths?.length === 0) throwRefusal("invalid-store");
	const relatedIds = sortedSet(stringArray(value, "relatedIds"));
	const supersedes = optionalString(value, "supersedes");
	const author = optionalString(value, "author");
	const humanReview = optionalString(value, "humanReview");
	if (humanReview !== undefined && !HUMAN_REVIEWS.has(humanReview)) {
		throwRefusal("invalid-store");
	}
	if (supersedes !== undefined && !validDecisionId(supersedes)) throwRefusal("invalid-store");
	if (relatedIds?.some((relatedId) => !validDecisionId(relatedId))) {
		throwRefusal("invalid-store");
	}
	if (scopePaths?.some((scopePath) => !validScopePath(scopePath))) {
		throwRefusal("unsafe-scope-path");
	}
	const confidence = value.confidence;
	if (
		confidence !== undefined &&
		(typeof confidence !== "number" || confidence < 0 || confidence > 1)
	) {
		throwRefusal("invalid-store");
	}
	const enforcement = normalizeEnforcement(value.enforcement);
	const normalized: NormalizedDecisionRecordV1 = {
		id,
		kind: kind as DecisionKind,
		status: status as DecisionStatus,
		title,
		context,
		decision,
		createdAt,
		updatedAt,
	};
	if (consequences !== undefined) normalized.consequences = consequences;
	if (alternatives !== undefined) normalized.alternatives = alternatives;
	if (tags !== undefined) normalized.tags = tags;
	if (scopePaths !== undefined) normalized.scopePaths = scopePaths;
	if (relatedIds !== undefined) normalized.relatedIds = relatedIds;
	if (supersedes !== undefined) normalized.supersedes = supersedes;
	if (confidence !== undefined) normalized.confidence = confidence;
	if (humanReview !== undefined) {
		normalized.humanReview = humanReview as "pending" | "approved" | "rejected";
	}
	if (author !== undefined) normalized.author = author;
	if (enforcement !== undefined) normalized.enforcement = enforcement;
	return normalized;
}

function normalizeStore(value: JsonValue): NormalizedDecisionStoreV1 {
	if (!isRecord(value)) throwRefusal("invalid-store");
	exactKeys(value, STORE_KEYS);
	if (value.version !== 1 || !Array.isArray(value.decisions)) throwRefusal("invalid-store");
	const project = optionalString(value, "project");
	const decisions = value.decisions.map(normalizeDecision).sort((left, right) =>
		compareText(left.id, right.id),
	);
	for (let index = 1; index < decisions.length; index += 1) {
		if (decisions[index - 1]!.id === decisions[index]!.id) throwRefusal("duplicate-id");
	}
	const output: NormalizedDecisionStoreV1 = { version: 1, decisions };
	if (project !== undefined) output.project = project;
	return output;
}

function canonicalize(value: JsonValue): JsonValue {
	if (value === null || typeof value !== "object") return value;
	if (Array.isArray(value)) return value.map(canonicalize);
	const output: PlainRecord = {};
	for (const key of Object.keys(value).sort(compareText)) output[key] = canonicalize(value[key]!);
	return output;
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
	if (value !== null && typeof value === "object" && !seen.has(value)) {
		seen.add(value);
		for (const child of Object.values(value)) deepFreeze(child, seen);
		Object.freeze(value);
	}
	return value;
}

function normalizeAuthority(value: unknown): {
	sourcePath: string;
	writableByAgent: boolean;
	approvedFingerprint: string | null;
} {
	let cloned: JsonValue;
	try {
		cloned = cloneBounded(value);
	} catch {
		throwRefusal("invalid-authority");
	}
	if (!isRecord(cloned)) throwRefusal("invalid-authority");
	if (Object.keys(cloned).some((key) => !AUTHORITY_KEYS.has(key))) {
		throwRefusal("invalid-authority");
	}
	if (typeof cloned.sourcePath !== "string" || typeof cloned.writableByAgent !== "boolean") {
		throwRefusal("invalid-authority");
	}
	if (!isSafeRepoRelativePath(cloned.sourcePath)) throwRefusal("unsafe-source-path");
	const approved = cloned.approvedFingerprint;
	if (approved !== undefined && (typeof approved !== "string" || !SHA256_RE.test(approved))) {
		throwRefusal("invalid-authority");
	}
	return {
		sourcePath: cloned.sourcePath,
		writableByAgent: cloned.writableByAgent,
		approvedFingerprint: typeof approved === "string" ? approved : null,
	};
}

function approvalStatus(
	fingerprint: string,
	authority: { writableByAgent: boolean; approvedFingerprint: string | null },
): DecisionApprovalStatusV1 {
	if (authority.approvedFingerprint === null) return "missing";
	if (authority.approvedFingerprint === fingerprint) return "current";
	return authority.writableByAgent ? "agent-mutation-detected" : "stale";
}

export function loadDecisionStoreSnapshotV1(
	input: unknown,
	authorityInput: unknown,
): DecisionStoreSnapshotResultV1 {
	try {
		const cloned = cloneBounded(input);
		const normalized = normalizeStore(cloned);
		const canonicalStore = canonicalize(
			normalized as unknown as JsonValue,
		) as unknown as NormalizedDecisionStoreV1;
		const canonicalJson = JSON.stringify(canonicalStore);
		if (byteLength(canonicalJson) > DECISION_EVIDENCE_LIMITS_V1.maxSerializedBytes) {
			throwRefusal("bounds");
		}
		const fingerprint = createHash("sha256").update(canonicalJson, "utf8").digest("hex");
		const authority = normalizeAuthority(authorityInput);
		const snapshot: DecisionStoreSnapshotV1 = {
			version: 1,
			sourcePath: authority.sourcePath,
			writableByAgent: authority.writableByAgent,
			approvalStatus: approvalStatus(fingerprint, authority),
			approvedFingerprint: authority.approvedFingerprint,
			fingerprint,
			canonicalJson,
			store: canonicalStore,
		};
		deepFreeze(snapshot);
		knownSnapshots.add(snapshot);
		return deepFreeze({ ok: true as const, snapshot });
	} catch (error) {
		const code =
			error instanceof DecisionEvidenceRefusal
				? (error.code as DecisionSnapshotRefusalCodeV1)
				: "invalid-store";
		return refusal(code);
	}
}

function ownDataRecord(
	value: unknown,
	allowed: ReadonlySet<string>,
	code: DecisionActionRefusalCodeV1,
): Record<string, unknown> {
	if (value === null || typeof value !== "object" || Array.isArray(value)) throwRefusal(code);
	let prototype: object | null;
	let keys: (string | symbol)[];
	try {
		prototype = Object.getPrototypeOf(value);
		keys = Reflect.ownKeys(value);
	} catch {
		throwRefusal(code);
	}
	if (prototype !== Object.prototype && prototype !== null) throwRefusal(code);
	if (keys.some((key) => typeof key !== "string" || !allowed.has(key))) throwRefusal(code);
	const output: Record<string, unknown> = {};
	for (const key of keys as string[]) {
		let descriptor: PropertyDescriptor | undefined;
		try {
			descriptor = Object.getOwnPropertyDescriptor(value, key);
		} catch {
			throwRefusal(code);
		}
		if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) throwRefusal(code);
		output[key] = descriptor.value;
	}
	return output;
}

function normalizeActionPaths(value: unknown): string[] {
	if (!Array.isArray(value)) throwRefusal("invalid-action");
	let prototype: object | null;
	let keys: (string | symbol)[];
	try {
		prototype = Object.getPrototypeOf(value);
		keys = Reflect.ownKeys(value);
	} catch {
		throwRefusal("invalid-action");
	}
	if (prototype !== Array.prototype || keys.some((key) => typeof key === "symbol")) {
		throwRefusal("invalid-action");
	}
	if (value.length > DECISION_EVIDENCE_LIMITS_V1.maxArrayLength) throwRefusal("bounds");
	const allowed = new Set(["length"]);
	for (let index = 0; index < value.length; index += 1) allowed.add(String(index));
	if (keys.some((key) => typeof key !== "string" || !allowed.has(key))) {
		throwRefusal("invalid-action");
	}
	const paths: string[] = [];
	for (let index = 0; index < value.length; index += 1) {
		let descriptor: PropertyDescriptor | undefined;
		try {
			descriptor = Object.getOwnPropertyDescriptor(value, String(index));
		} catch {
			throwRefusal("invalid-action");
		}
		if (
			!descriptor ||
			!("value" in descriptor) ||
			!descriptor.enumerable ||
			typeof descriptor.value !== "string"
		) {
			throwRefusal("invalid-action");
		}
		if (!isSafeRepoRelativePath(descriptor.value)) throwRefusal("unsafe-action-path");
		paths.push(descriptor.value);
	}
	return [...new Set(paths)].sort(compareText);
}

function scopeMatches(scopes: readonly string[] | undefined, paths: readonly string[]): boolean {
	if (!scopes || scopes.length === 0) return true;
	for (const scope of scopes) {
		if (scope === "**") return true;
		if (paths.length === 0) continue;
		const prefix = scope.endsWith("/**") ? scope.slice(0, -3) : scope;
		for (const path of paths) {
			if (path === prefix || path.startsWith(`${prefix}/`)) return true;
		}
	}
	return false;
}

function reasonOrder(codes: Iterable<DecisionReasonCodeV1>): DecisionReasonCodeV1[] {
	const unique = new Set(codes);
	return REASON_PRIORITY.filter((code) => unique.has(code));
}

function approvalReasons(snapshot: DecisionStoreSnapshotV1): DecisionReasonCodeV1[] {
	switch (snapshot.approvalStatus) {
		case "current":
			return [];
		case "agent-mutation-detected":
			return ["agent-mutation-detected", "human-review-required"];
		case "stale":
			return ["human-review-required", "stale-approval"];
		case "missing":
			return ["human-review-required"];
	}
}

function makePreActionEvidence(input: {
	snapshot: DecisionStoreSnapshotV1;
	actionId: string;
	paths: string[];
	status: "passed" | "failed";
	reasonCodes: DecisionReasonCodeV1[];
	matchedIds?: string[];
	inactiveIds?: string[];
	advisoryIds?: string[];
}): DecisionPreActionResultV1 {
	const evidence: DecisionPreActionEvidenceV1 = {
		version: 1,
		executorKind: "internal",
		trustTier: "trusted",
		required: true,
		status: input.status,
		storeFingerprint: input.snapshot.fingerprint,
		approvalFingerprint: input.snapshot.approvedFingerprint,
		actionId: input.actionId,
		paths: input.paths,
		reasonCodes: reasonOrder(input.reasonCodes),
		matchedIds: [...(input.matchedIds ?? [])].sort(compareText),
		inactiveIds: [...(input.inactiveIds ?? [])].sort(compareText),
		advisoryIds: [...(input.advisoryIds ?? [])].sort(compareText),
	};
	const result = deepFreeze({ ok: true as const, evidence });
	knownPreActionEvidence.add(evidence);
	return result;
}

export function evaluateDecisionPreActionV1(input: unknown): DecisionPreActionResultV1 {
	try {
		const request = ownDataRecord(input, REQUEST_KEYS, "invalid-action");
		const snapshot = request.snapshot;
		if (
			snapshot === null ||
			typeof snapshot !== "object" ||
			!knownSnapshots.has(snapshot as object)
		) {
			throwRefusal("invalid-snapshot");
		}
		const typedSnapshot = snapshot as DecisionStoreSnapshotV1;
		const actionId = request.actionId;
		if (typeof actionId !== "string" || !validActionId(actionId)) {
			throwRefusal("invalid-action");
		}
		const paths = normalizeActionPaths(request.paths ?? []);
		const trustReasons = approvalReasons(typedSnapshot);
		if (trustReasons.length > 0) {
			return makePreActionEvidence({
				snapshot: typedSnapshot,
				actionId,
				paths,
				status: "failed",
				reasonCodes: trustReasons,
			});
		}
		const matchedIds: string[] = [];
		const inactiveIds: string[] = [];
		const advisoryIds: string[] = [];
		const reasons: DecisionReasonCodeV1[] = [];
		for (const record of typedSnapshot.store.decisions) {
			const inScope = scopeMatches(record.scopePaths, paths);
			const actionMatches = record.enforcement?.actionIds.includes(actionId) === true;
			if (INACTIVE_STATUSES.has(record.status) && inScope && actionMatches) {
				inactiveIds.push(record.id);
				continue;
			}
			if (record.status !== "accepted" || !inScope) continue;
			if (!record.enforcement) {
				advisoryIds.push(record.id);
				continue;
			}
			if (!actionMatches) continue;
			if (record.humanReview !== "approved") {
				reasons.push("decision-review-required");
				continue;
			}
			matchedIds.push(record.id);
			if (record.enforcement.effect === "forbid") reasons.push("constraint-conflict");
		}
		return makePreActionEvidence({
			snapshot: typedSnapshot,
			actionId,
			paths,
			status: reasons.length === 0 ? "passed" : "failed",
			reasonCodes: reasons,
			matchedIds,
			inactiveIds,
			advisoryIds,
		});
	} catch (error) {
		const code =
			error instanceof DecisionEvidenceRefusal
				? (error.code as DecisionActionRefusalCodeV1)
				: "invalid-action";
		return refusal(code);
	}
}

function validStringList(
	value: unknown,
	validator: (item: string) => boolean,
): value is readonly string[] {
	return (
		Array.isArray(value) &&
		value.length <= DECISION_EVIDENCE_LIMITS_V1.maxArrayLength &&
		value.every((item) => typeof item === "string" && validator(item))
	);
}

function validatePreActionEvidence(value: unknown): DecisionPreActionEvidenceV1 {
	if (value === null || typeof value !== "object" || !knownPreActionEvidence.has(value)) {
		throwRefusal("invalid-action-evidence");
	}
	const record = ownDataRecord(value, PRE_ACTION_EVIDENCE_KEYS, "invalid-action-evidence");
	if (
		record.version !== 1 ||
		record.executorKind !== "internal" ||
		record.trustTier !== "trusted" ||
		record.required !== true ||
		(record.status !== "passed" && record.status !== "failed") ||
		typeof record.storeFingerprint !== "string" ||
		!SHA256_RE.test(record.storeFingerprint) ||
		!validActionId(typeof record.actionId === "string" ? record.actionId : "") ||
		!validStringList(record.paths, isSafeRepoRelativePath) ||
		!validStringList(record.reasonCodes, (item) => REASON_SET.has(item)) ||
		!validStringList(record.matchedIds, validDecisionId) ||
		!validStringList(record.inactiveIds, validDecisionId) ||
		!validStringList(record.advisoryIds, validDecisionId)
	) {
		throwRefusal("invalid-action-evidence");
	}
	if (
		record.approvalFingerprint !== null &&
		(typeof record.approvalFingerprint !== "string" || !SHA256_RE.test(record.approvalFingerprint))
	) {
		throwRefusal("invalid-action-evidence");
	}
	return record as unknown as DecisionPreActionEvidenceV1;
}

function strictActionEvidenceArray(value: unknown): unknown[] {
	if (!Array.isArray(value)) throwRefusal("invalid-action-evidence");
	let prototype: object | null;
	let keys: (string | symbol)[];
	try {
		prototype = Object.getPrototypeOf(value);
		keys = Reflect.ownKeys(value);
	} catch {
		throwRefusal("invalid-action-evidence");
	}
	if (prototype !== Array.prototype || keys.some((key) => typeof key === "symbol")) {
		throwRefusal("invalid-action-evidence");
	}
	if (value.length > DECISION_EVIDENCE_LIMITS_V1.maxArrayLength) throwRefusal("bounds");
	const allowed = new Set(["length"]);
	for (let index = 0; index < value.length; index += 1) allowed.add(String(index));
	if (keys.some((key) => typeof key !== "string" || !allowed.has(key))) {
		throwRefusal("invalid-action-evidence");
	}
	const output: unknown[] = [];
	for (let index = 0; index < value.length; index += 1) {
		let descriptor: PropertyDescriptor | undefined;
		try {
			descriptor = Object.getOwnPropertyDescriptor(value, String(index));
		} catch {
			throwRefusal("invalid-action-evidence");
		}
		if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
			throwRefusal("invalid-action-evidence");
		}
		output.push(descriptor.value);
	}
	return output;
}

function makeHandoffEvidence(input: {
	snapshot: DecisionStoreSnapshotV1;
	actionIds: string[];
	reasonCodes: DecisionReasonCodeV1[];
}): DecisionHandoffResultV1 {
	const evidence: DecisionHandoffEvidenceV1 = {
		version: 1,
		executorKind: "internal",
		trustTier: "trusted",
		required: true,
		status: input.reasonCodes.length === 0 ? "passed" : "failed",
		storeFingerprint: input.snapshot.fingerprint,
		approvalFingerprint: input.snapshot.approvedFingerprint,
		actionIds: [...input.actionIds].sort(compareText),
		reasonCodes: reasonOrder(input.reasonCodes),
	};
	return deepFreeze({ ok: true as const, evidence });
}

export function evaluateDecisionHandoffV1(input: unknown): DecisionHandoffResultV1 {
	try {
		const request = ownDataRecord(input, HANDOFF_REQUEST_KEYS, "invalid-action-evidence");
		const snapshot = request.snapshot;
		if (
			snapshot === null ||
			typeof snapshot !== "object" ||
			!knownSnapshots.has(snapshot as object)
		) {
			throwRefusal("invalid-snapshot");
		}
		const typedSnapshot = snapshot as DecisionStoreSnapshotV1;
		const expectedFingerprint = request.expectedFingerprint;
		if (typeof expectedFingerprint !== "string" || !SHA256_RE.test(expectedFingerprint)) {
			throwRefusal("invalid-action-evidence");
		}
		const actionInputs = strictActionEvidenceArray(request.actions);
		const actions = actionInputs.map(validatePreActionEvidence);
		const actionIds = actions.map((action) => action.actionId);
		if (expectedFingerprint !== typedSnapshot.fingerprint) {
			return makeHandoffEvidence({
				snapshot: typedSnapshot,
				actionIds,
				reasonCodes: ["stale-store-fingerprint"],
			});
		}
		if (typedSnapshot.approvalStatus !== "current") {
			return makeHandoffEvidence({
				snapshot: typedSnapshot,
				actionIds,
				reasonCodes: ["human-review-required"],
			});
		}
		if (actions.length === 0) {
			return makeHandoffEvidence({
				snapshot: typedSnapshot,
				actionIds,
				reasonCodes: ["pre-action-failed"],
			});
		}
		if (new Set(actionIds).size !== actionIds.length) {
			return makeHandoffEvidence({
				snapshot: typedSnapshot,
				actionIds,
				reasonCodes: ["duplicate-action"],
			});
		}
		if (actions.some((action) => action.storeFingerprint !== typedSnapshot.fingerprint)) {
			return makeHandoffEvidence({
				snapshot: typedSnapshot,
				actionIds,
				reasonCodes: ["stale-action-evidence"],
			});
		}
		if (actions.some((action) => action.status !== "passed")) {
			return makeHandoffEvidence({
				snapshot: typedSnapshot,
				actionIds,
				reasonCodes: ["pre-action-failed"],
			});
		}
		return makeHandoffEvidence({ snapshot: typedSnapshot, actionIds, reasonCodes: [] });
	} catch (error) {
		const code =
			error instanceof DecisionEvidenceRefusal
				? (error.code as DecisionActionRefusalCodeV1)
				: "invalid-action-evidence";
		return refusal(code);
	}
}

import type {
	ApprovalAuthorityRecordV1,
	ApprovalCoreAdaptersV1,
	ApprovalDecisionV1,
	ApprovalStoreEnvelopeV1,
	ApprovalTrajectoryMetadataV1,
	NormalizedApprovalRequestV1,
	SafeApprovalStoreV1,
} from "./types.ts";
import {
	deepFreeze,
	isRecord,
	MAX_APPROVAL_RECORDS_V1,
	normalizeApprovalRequestV1,
	parseApprovalStoreEnvelopeV1,
	safeSnapshot,
	timestampMs,
	validateApprovalStoreFactsV1,
	validateLifecycleV1,
} from "./validation.ts";

type LoadedAuthority = Readonly<{
	request: NormalizedApprovalRequestV1;
	now: string;
	nowMs: number;
	store: SafeApprovalStoreV1;
	revision: string;
	envelope: ApprovalStoreEnvelopeV1;
}>;

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
	const keys = Object.keys(value).sort();
	const wanted = [...expected].sort();
	return keys.length === wanted.length && keys.every((key, index) => key === wanted[index]);
}

function revision(value: unknown): value is string {
	return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(value);
}

function baseFailure(code: string, outcome: "blocked" | "denied" | "expired" | "stale" | "unavailable" = "unavailable") {
	return deepFreeze({
		schemaVersion: 1,
		authority: "apr-01",
		authorityScope: "approval-only",
		ok: false,
		outcome,
		code,
	});
}

function scopedResult(
	request: NormalizedApprovalRequestV1,
	decision: ApprovalDecisionV1,
	decidedAt: string,
	recorded: boolean,
) {
	const approved = decision === "approved";
	return deepFreeze({
		schemaVersion: 1,
		authority: "apr-01",
		authorityScope: "approval-only",
		ok: approved,
		outcome: approved ? "approved" : "denied",
		code: approved ? "APR01_APPROVED" : "APR01_DENIED",
		current: approved,
		recorded,
		requestId: request.requestId,
		approvalKind: request.approvalKind,
		scopeFingerprint: request.scopeFingerprint,
		headSha: request.headSha,
		sessionId: request.sessionId,
		generation: request.generation,
		decidedAt,
		expiresAt: request.expiresAt,
	});
}

function scopedFailure(
	request: NormalizedApprovalRequestV1,
	code: string,
	outcome: "blocked" | "expired" | "stale" | "unavailable",
	recorded = false,
) {
	return deepFreeze({
		schemaVersion: 1,
		authority: "apr-01",
		authorityScope: "approval-only",
		ok: false,
		outcome,
		code,
		current: false,
		recorded,
		requestId: request.requestId,
		approvalKind: request.approvalKind,
		scopeFingerprint: request.scopeFingerprint,
		headSha: request.headSha,
		sessionId: request.sessionId,
		generation: request.generation,
		expiresAt: request.expiresAt,
	});
}

async function loadAuthority(input: unknown, adapters: ApprovalCoreAdaptersV1): Promise<LoadedAuthority | any> {
	const parsed = normalizeApprovalRequestV1(input);
	if (parsed.ok !== true) return parsed;
	const request: NormalizedApprovalRequestV1 = parsed.request;
	if (!validateLifecycleV1(adapters.lifecycle, request)) {
		return scopedFailure(request, "APR01_APPROVAL_AUTHORITY_MISSING", "unavailable");
	}
	if (typeof adapters.clock !== "function" || !adapters.store || typeof adapters.store.read !== "function" ||
		typeof adapters.store.commit !== "function") {
		return scopedFailure(request, "APR01_APPROVAL_AUTHORITY_MISSING", "unavailable");
	}

	let now: unknown;
	try {
		now = adapters.clock();
	} catch {
		return scopedFailure(request, "APR01_TIME_INVALID", "blocked");
	}
	const nowMs = timestampMs(now);
	const createdMs = timestampMs(request.createdAt)!;
	if (nowMs === undefined || nowMs < createdMs) return scopedFailure(request, "APR01_TIME_INVALID", "blocked");

	let rawRead: unknown;
	try {
		rawRead = await adapters.store.read();
	} catch {
		return scopedFailure(request, "APR01_STORE_UNAVAILABLE", "unavailable");
	}
	const read = safeSnapshot(rawRead);
	if (!isRecord(read) || !exactKeys(read, ["ok", "revision", "facts", "value"]) || read.ok !== true || !revision(read.revision)) {
		return scopedFailure(request, "APR01_STORE_UNAVAILABLE", "unavailable");
	}
	const facts = validateApprovalStoreFactsV1(read.facts);
	if (facts.ok !== true) return scopedFailure(request, "APR01_STORE_UNSAFE", "unavailable");
	const envelope = parseApprovalStoreEnvelopeV1(read.value);
	if (!envelope) return scopedFailure(request, "APR01_STORE_UNAVAILABLE", "unavailable");
	return Object.freeze({ request, now: now as string, nowMs, store: adapters.store, revision: read.revision, envelope });
}

function evaluateLoaded(loaded: LoadedAuthority): any {
	const record = loaded.envelope.records.find((candidate) => candidate.request.requestId === loaded.request.requestId);
	if (!record) return scopedFailure(loaded.request, "APR01_APPROVAL_AUTHORITY_MISSING", "unavailable");
	if (record.scopeFingerprint !== loaded.request.scopeFingerprint) {
		return scopedFailure(loaded.request, "APR01_SCOPE_STALE", "stale");
	}
	if (record.decision === "denied") return scopedResult(loaded.request, "denied", record.decidedAt, false);
	if (loaded.nowMs >= timestampMs(loaded.request.expiresAt)!) {
		return scopedFailure(loaded.request, "APR01_APPROVAL_EXPIRED", "expired");
	}
	return scopedResult(loaded.request, "approved", record.decidedAt, false);
}

function isLoaded(value: unknown): value is LoadedAuthority {
	return !!value && typeof value === "object" && "envelope" in value && "request" in value && "store" in value;
}

export async function checkApprovalAuthorityV1(input: unknown, adapters: ApprovalCoreAdaptersV1): Promise<any> {
	const loaded = await loadAuthority(input, adapters);
	if (!isLoaded(loaded)) return loaded;
	return evaluateLoaded(loaded);
}

function parseUiDecision(input: unknown): { decision: ApprovalDecisionV1 | "cancelled" } | undefined {
	const snapshot = safeSnapshot(input);
	if (!isRecord(snapshot)) return undefined;
	if (snapshot.decision === "cancelled") {
		if (!exactKeys(snapshot, ["decision", "method"]) || snapshot.method !== "pi-tui-confirm-select") return undefined;
		return { decision: "cancelled" };
	}
	if (!exactKeys(snapshot, ["decision", "method"]) ||
		(snapshot.decision !== "approved" && snapshot.decision !== "denied") ||
		snapshot.method !== "pi-tui-confirm-select") return undefined;
	return { decision: snapshot.decision };
}

function newRecord(
	request: NormalizedApprovalRequestV1,
	decision: ApprovalDecisionV1,
	decidedAt: string,
): ApprovalAuthorityRecordV1 {
	return deepFreeze({
		schemaVersion: 1,
		recordType: "approval-authority-record",
		request,
		scopeFingerprint: request.scopeFingerprint,
		decision,
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

function trajectoryMetadata(
	request: NormalizedApprovalRequestV1,
	decision: ApprovalDecisionV1,
	decidedAt: string,
): ApprovalTrajectoryMetadataV1 {
	return deepFreeze({
		schemaVersion: 1,
		event: "approval-decision",
		requestId: request.requestId,
		approvalKind: request.approvalKind,
		decision,
		scopeFingerprint: request.scopeFingerprint,
		headSha: request.headSha,
		sessionId: request.sessionId,
		generation: request.generation,
		decidedAt,
		expiresAt: request.expiresAt,
		code: decision === "approved" ? "APR01_APPROVED" : "APR01_DENIED",
	});
}

export async function requestApprovalV1(input: unknown, adapters: ApprovalCoreAdaptersV1): Promise<any> {
	const loaded = await loadAuthority(input, adapters);
	if (!isLoaded(loaded)) return loaded;
	const existing = evaluateLoaded(loaded);
	if (existing.code !== "APR01_APPROVAL_AUTHORITY_MISSING") return existing;
	if (!adapters.ui || typeof adapters.ui.decide !== "function") {
		return scopedFailure(loaded.request, "APR01_APPROVAL_AUTHORITY_MISSING", "unavailable");
	}

	const uiMetadata = deepFreeze({
		schemaVersion: 1 as const,
		requestId: loaded.request.requestId,
		approvalKind: loaded.request.approvalKind,
		scopeFingerprint: loaded.request.scopeFingerprint,
		headSha: loaded.request.headSha,
		pathCount: loaded.request.paths.length,
		planFingerprint: loaded.request.planFingerprint,
		actionFingerprint: loaded.request.actionFingerprint,
		expiresAt: loaded.request.expiresAt,
	});
	let rawDecision: unknown;
	try {
		rawDecision = await adapters.ui.decide(uiMetadata);
	} catch {
		return scopedFailure(loaded.request, "APR01_UI_UNAVAILABLE", "unavailable");
	}
	const selected = parseUiDecision(rawDecision);
	if (!selected) return scopedFailure(loaded.request, "APR01_UI_UNAVAILABLE", "unavailable");
	if (selected.decision === "cancelled") return scopedFailure(loaded.request, "APR01_UI_CANCELLED", "blocked");

	if (!validateLifecycleV1(adapters.lifecycle, loaded.request)) {
		return scopedFailure(loaded.request, "APR01_SESSION_INACTIVE", "unavailable");
	}
	let decidedAt: unknown;
	try {
		decidedAt = adapters.clock!();
	} catch {
		return scopedFailure(loaded.request, "APR01_TIME_INVALID", "blocked");
	}
	const decidedMs = timestampMs(decidedAt);
	if (decidedMs === undefined || decidedMs < timestampMs(loaded.request.createdAt)! ||
		decidedMs >= timestampMs(loaded.request.expiresAt)!) {
		return scopedFailure(loaded.request, "APR01_APPROVAL_EXPIRED", "expired");
	}
	if (loaded.envelope.records.length >= MAX_APPROVAL_RECORDS_V1) {
		return scopedFailure(loaded.request, "APR01_STORE_CAPACITY", "unavailable");
	}

	const stillCurrent = (): boolean => {
		if (typeof adapters.isCurrent !== "function") return true;
		try {
			return adapters.isCurrent() === true;
		} catch {
			return false;
		}
	};
	if (!stillCurrent() || !validateLifecycleV1(adapters.lifecycle, loaded.request)) {
		return scopedFailure(loaded.request, "APR01_SESSION_INACTIVE", "unavailable");
	}

	const record = newRecord(loaded.request, selected.decision, decidedAt as string);
	const value: ApprovalStoreEnvelopeV1 = deepFreeze({
		schemaVersion: 1,
		records: [...loaded.envelope.records, record]
			.sort((left, right) => left.request.requestId.localeCompare(right.request.requestId)),
	});
	const commitInput = deepFreeze({
		expectedRevision: loaded.revision,
		value,
		requirements: {
			mode: 0o600 as const,
			noFollow: true as const,
			atomicReplace: true as const,
			regularFile: true as const,
			hardLinkCount: 1 as const,
		},
	});
	if (!stillCurrent()) {
		return scopedFailure(loaded.request, "APR01_SESSION_INACTIVE", "unavailable");
	}
	let rawCommit: unknown;
	try {
		rawCommit = await loaded.store.commit(commitInput);
	} catch {
		return scopedFailure(loaded.request, "APR01_STORE_UNAVAILABLE", "unavailable");
	}
	if (!stillCurrent()) {
		return scopedFailure(loaded.request, "APR01_SESSION_INACTIVE", "unavailable");
	}
	const commit = safeSnapshot(rawCommit);
	if (isRecord(commit) && commit.ok === false && commit.code === "APR01_STORE_CLOSED") {
		return scopedFailure(loaded.request, "APR01_STORE_CLOSED", "unavailable");
	}
	if (!isRecord(commit) || !exactKeys(commit, ["ok", "revision", "facts"]) || commit.ok !== true || !revision(commit.revision)) {
		return scopedFailure(loaded.request, "APR01_STORE_UNAVAILABLE", "unavailable");
	}
	const postFacts = validateApprovalStoreFactsV1(commit.facts);
	if (postFacts.ok !== true || postFacts.facts.exists !== true) {
		return scopedFailure(loaded.request, "APR01_STORE_UNSAFE", "unavailable");
	}

	if (typeof adapters.trajectory === "function") {
		try {
			await adapters.trajectory(trajectoryMetadata(loaded.request, selected.decision, decidedAt as string));
		} catch {
			return scopedFailure(loaded.request, "APR01_TRAJECTORY_UNAVAILABLE", "unavailable", true);
		}
	}
	return scopedResult(loaded.request, selected.decision, decidedAt as string, true);
}

export function approvalFailureV1(code: string): any {
	return baseFailure(code);
}

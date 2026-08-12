import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import {
	approvalFailureV1,
	deepFreeze,
	normalizeApprovalRequestV1,
	requestApprovalV1,
	type ApprovalKindV1,
	type ApprovalTrajectoryMetadataV1,
	type SafeApprovalStoreV1,
} from "../lib/approvals/index.ts";
import { parseApprovalRequestV1 } from "../lib/contracts/index.ts";

const MIRROR_ENTRY = "assurance:approval:mirror:v1";
const APPROVE_OPTION = "Approve exact scope";
const DENY_OPTION = "Deny exact scope";

type PlainRecord = Record<string, unknown>;
type ApprovalContext = {
	mode?: unknown;
	hasUI?: unknown;
	cwd?: unknown;
	sessionManager?: { getSessionId?: () => unknown };
	ui?: {
		select?: (title: string, options: string[]) => unknown | Promise<unknown>;
		confirm?: (title: string, message: string) => unknown | Promise<unknown>;
	};
};
type PiLike = {
	on: (event: string, handler: (event: unknown, context?: ApprovalContext) => unknown) => unknown;
	appendEntry?: (customType: string, data?: unknown) => void;
};

export type ApprovalSeamsExtensionOptionsV1 = Readonly<{
	clock?: () => unknown;
	openStore?: (facts: Readonly<{
		schemaVersion: 1;
		projectRoot: string;
		sessionId: string;
		generation: number;
	}>) => SafeApprovalStoreV1 | undefined | Promise<SafeApprovalStoreV1 | undefined>;
	trajectory?: (metadata: ApprovalTrajectoryMetadataV1) => unknown | Promise<unknown>;
}>;

export type InjectedSafeApprovalStoreOperationsV1 = Readonly<{
	inspect: () => unknown | Promise<unknown>;
	readValue: () => unknown | Promise<unknown>;
	compareAndCommit: (input: unknown) => unknown | Promise<unknown>;
	close?: () => unknown | Promise<unknown>;
}>;

function asRecord(value: unknown): PlainRecord | undefined {
	return value && typeof value === "object" && !Array.isArray(value) ? value as PlainRecord : undefined;
}

/**
 * Effect adapter for an explicitly supplied safe persistence implementation.
 * It performs no filesystem operation itself: inspect/read/compare-and-commit
 * must be injected by the machine-local owner and are revalidated by the core.
 */
export function createInjectedSafeApprovalStoreV1(
	operations: InjectedSafeApprovalStoreOperationsV1,
): SafeApprovalStoreV1 {
	let closed = false;
	return Object.freeze({
		read: async () => {
			const facts = await operations.inspect();
			const payload = asRecord(await operations.readValue());
			if (!payload) return { ok: false };
			return {
				ok: true,
				revision: payload.revision,
				facts,
				value: payload.value,
			};
		},
		commit: async (input: unknown) => {
			const committed = asRecord(await operations.compareAndCommit(input));
			if (!committed) return { ok: false };
			const facts = await operations.inspect();
			return { ok: true, revision: committed.revision, facts };
		},
		close: async () => {
			if (closed) return;
			closed = true;
			if (typeof operations.close === "function") await operations.close();
		},
	});
}

function approvalKindFromAction(action: string): { kind: ApprovalKindV1; action: string } | undefined {
	const match = /^(plan|findings|risky-action|diff):([A-Za-z0-9](?:[A-Za-z0-9._:-]*[A-Za-z0-9])?)$/.exec(action);
	if (!match) return undefined;
	return { kind: match[1] as ApprovalKindV1, action: match[2]! };
}

function unavailable(code: string): any {
	return approvalFailureV1(code);
}

function isTuiAuthority(context: ApprovalContext | undefined): boolean {
	return context?.mode === "tui" && context.hasUI === true &&
		typeof context.ui?.select === "function" && typeof context.ui?.confirm === "function";
}

function mirrorFromResult(result: PlainRecord): PlainRecord | undefined {
	if (result.recorded !== true || (result.outcome !== "approved" && result.outcome !== "denied")) return undefined;
	return deepFreeze({
		schemaVersion: 1,
		event: "approval-decision",
		authority: false,
		authorityScope: "approval-only",
		requestId: result.requestId,
		approvalKind: result.approvalKind,
		decision: result.outcome,
		scopeFingerprint: result.scopeFingerprint,
		headSha: result.headSha,
		sessionId: result.sessionId,
		generation: result.generation,
		decidedAt: result.decidedAt,
		expiresAt: result.expiresAt,
		code: result.code,
	});
}

export function createApprovalSeamsRuntimeV1(options: ApprovalSeamsExtensionOptionsV1 = {}) {
	let active = false;
	let generation = 0;
	let context: ApprovalContext | undefined;
	let store: SafeApprovalStoreV1 | undefined;
	let piRef: PiLike | undefined;

	const dispose = async (): Promise<void> => {
		active = false;
		context = undefined;
		const currentStore = store;
		store = undefined;
		if (currentStore && typeof currentStore.close === "function") {
			try { await currentStore.close(); } catch { /* authority remains inactive */ }
		}
	};

	const extension = (pi: PiLike): void => {
		piRef = pi;
		pi.on("session_start", async (_event, nextContext) => {
			await dispose();
			generation += 1;
			const currentGeneration = generation;
			let sessionId: unknown;
			let projectRoot: unknown;
			try {
				sessionId = nextContext?.sessionManager?.getSessionId?.();
				projectRoot = nextContext?.cwd;
			} catch {
				sessionId = undefined;
				projectRoot = undefined;
			}
			context = nextContext;
			active = true;
			if (typeof options.openStore !== "function" || typeof sessionId !== "string" || typeof projectRoot !== "string") return;
			try {
				const opened = await options.openStore(deepFreeze({
					schemaVersion: 1,
					projectRoot,
					sessionId,
					generation: currentGeneration,
				}));
				if (active && generation === currentGeneration && context === nextContext && opened &&
					typeof opened.read === "function" && typeof opened.commit === "function") {
					store = opened;
				} else if (opened && typeof opened.close === "function") {
					try { await opened.close(); } catch { /* unsupported store stays unavailable */ }
				}
			} catch {
				store = undefined;
			}
		});
		pi.on("session_shutdown", async () => {
			await dispose();
		});
	};

	const approvalGateway = async (input: unknown): Promise<any> => {
		if (!active || !context) return unavailable("APR01_SESSION_INACTIVE");
		const currentContext = context;
		const currentGeneration = generation;
		if (!isTuiAuthority(currentContext)) return unavailable("APR01_UI_UNAVAILABLE");
		if (!store || typeof options.clock !== "function") return unavailable("APR01_APPROVAL_AUTHORITY_MISSING");

		const parsed = parseApprovalRequestV1(input);
		if (!parsed.ok) return unavailable("APR01_INVALID_ORC_REQUEST");
		const kindAction = approvalKindFromAction(parsed.value.action);
		if (!kindAction) return unavailable("APR01_INVALID_ORC_REQUEST");
		let sessionId: unknown;
		try { sessionId = currentContext.sessionManager?.getSessionId?.(); } catch { sessionId = undefined; }
		if (typeof sessionId !== "string") return unavailable("APR01_APPROVAL_AUTHORITY_MISSING");

		const aprRequest = {
			schemaVersion: 1,
			kind: "approval-request",
			requestId: parsed.value.requestId,
			approvalKind: kindAction.kind,
			action: kindAction.action,
			risk: parsed.value.risk,
			effect: "authorize-review-only",
			paths: parsed.value.scopedPaths,
			headSha: parsed.value.candidateSha,
			planFingerprint: parsed.value.fingerprint,
			actionFingerprint: parsed.value.fingerprint,
			sessionId,
			generation: currentGeneration,
			createdAt: parsed.value.requestedAt,
			expiresAt: parsed.value.expiresAt,
		};
		const normalized = normalizeApprovalRequestV1(aprRequest);
		if (normalized.ok !== true || JSON.stringify(normalized.request.paths) !== JSON.stringify(parsed.value.scopedPaths)) {
			return unavailable("APR01_INVALID_ORC_REQUEST");
		}

		const isCurrent = () => active && generation === currentGeneration && context === currentContext;
		const ui = {
			decide: async (metadata: any) => {
				if (!isCurrent()) throw new Error("inactive");
				const title = `APR-01 ${metadata.approvalKind} approval`;
				const selection = await currentContext.ui!.select!(
					`${title} • ${metadata.pathCount} path(s)`,
					[APPROVE_OPTION, DENY_OPTION],
				);
				if (!isCurrent()) throw new Error("inactive");
				if (selection !== APPROVE_OPTION && selection !== DENY_OPTION) {
					return deepFreeze({ decision: "cancelled", method: "pi-tui-confirm-select" });
				}
				const confirmed = await currentContext.ui!.confirm!(
					title,
					`Confirm ${selection === APPROVE_OPTION ? "approval" : "denial"} for request ${metadata.requestId} through ${metadata.expiresAt}.`,
				);
				if (!isCurrent()) throw new Error("inactive");
				if (confirmed !== true) return deepFreeze({ decision: "cancelled", method: "pi-tui-confirm-select" });
				return deepFreeze({
					decision: selection === APPROVE_OPTION ? "approved" : "denied",
					method: "pi-tui-confirm-select",
				});
			},
		};
		const result = await requestApprovalV1(aprRequest, {
			clock: options.clock,
			lifecycle: { active: true, sessionId, generation: currentGeneration },
			store,
			ui,
			trajectory: options.trajectory,
		});
		if (!isCurrent()) return unavailable("APR01_SESSION_INACTIVE");

		const resultRecord = asRecord(result);
		if (!resultRecord) return unavailable("APR01_INTERNAL_UNAVAILABLE");
		const mirror = mirrorFromResult(resultRecord);
		if (mirror && typeof piRef?.appendEntry === "function") {
			try { piRef.appendEntry(MIRROR_ENTRY, mirror); } catch { /* mirrors are observational only */ }
		}
		if (resultRecord.outcome !== "approved" && resultRecord.outcome !== "denied") return result;

		const decision: PlainRecord = {
			schemaVersion: 1,
			kind: "approval-decision",
			requestId: parsed.value.requestId,
			decision: resultRecord.outcome === "approved" ? "approved" : "rejected",
			action: parsed.value.action,
			risk: parsed.value.risk,
			scopedPaths: [...parsed.value.scopedPaths],
			candidateSha: parsed.value.candidateSha,
			fingerprint: parsed.value.fingerprint,
			decidedAt: resultRecord.decidedAt,
		};
		if (resultRecord.outcome === "approved") {
			decision.humanProvenance = {
				actorId: "machine-local-human",
				method: "pi-tui-confirm-select",
			};
		}
		return deepFreeze({ ok: true, authority: "apr-01", durable: true, decision });
	};

	return Object.freeze({ extension, approvalGateway });
}

const defaultRuntime = createApprovalSeamsRuntimeV1();
export const approvalGateway = defaultRuntime.approvalGateway;
export const approvalSeamsExtension = defaultRuntime.extension;
export default approvalSeamsExtension as (pi: ExtensionAPI) => void;

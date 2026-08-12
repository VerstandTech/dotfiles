export const APPROVAL_KINDS_V1 = ["plan", "findings", "risky-action", "diff"] as const;
export type ApprovalKindV1 = (typeof APPROVAL_KINDS_V1)[number];
export type ApprovalDecisionV1 = "approved" | "denied";

export type ApprovalRequestInputV1 = Readonly<{
	schemaVersion: 1;
	kind: "approval-request";
	requestId: string;
	approvalKind: ApprovalKindV1;
	action: string;
	risk: string;
	effect: string;
	paths: readonly string[];
	headSha: string | null;
	planFingerprint: string;
	actionFingerprint: string;
	sessionId: string;
	generation: number;
	createdAt: string;
	expiresAt: string;
}>;

export type NormalizedApprovalRequestV1 = Readonly<ApprovalRequestInputV1 & {
	paths: readonly string[];
	scopeFingerprint: string;
}>;

export type ApprovalAuthorityRecordV1 = Readonly<{
	schemaVersion: 1;
	recordType: "approval-authority-record";
	request: NormalizedApprovalRequestV1;
	scopeFingerprint: string;
	decision: ApprovalDecisionV1;
	decidedAt: string;
	authority: Readonly<{
		source: "human-tui";
		method: "pi-tui-confirm-select";
		sessionId: string;
		generation: number;
		machineLocal: true;
	}>;
}>;

export type ApprovalStoreEnvelopeV1 = Readonly<{
	schemaVersion: 1;
	records: readonly ApprovalAuthorityRecordV1[];
}>;

export type ApprovalStoreFactsV1 = Readonly<{
	schemaVersion: 1;
	storePath: string;
	storeRealPath: string;
	projectRoot: string;
	projectRealPath: string;
	exists: boolean;
	mode: number;
	regularFile: boolean;
	symbolicLink: boolean;
	hardLinkCount: number;
	noFollow: boolean;
	atomicReplace: boolean;
	parentDirectorySafe: boolean;
	machineLocal: boolean;
}>;

export type ApprovalStoreCommitV1 = Readonly<{
	expectedRevision: string;
	value: ApprovalStoreEnvelopeV1;
	requirements: Readonly<{
		mode: 384;
		noFollow: true;
		atomicReplace: true;
		regularFile: true;
		hardLinkCount: 1;
	}>;
}>;

export type SafeApprovalStoreV1 = Readonly<{
	read: () => unknown | Promise<unknown>;
	commit: (input: ApprovalStoreCommitV1) => unknown | Promise<unknown>;
	close?: () => unknown | Promise<unknown>;
}>;

export type ApprovalLifecycleFactsV1 = Readonly<{
	active: boolean;
	sessionId: string;
	generation: number;
}>;

export type ApprovalUiDecisionV1 = Readonly<{
	decision: ApprovalDecisionV1 | "cancelled";
	method?: "pi-tui-confirm-select";
}>;

export type ApprovalUiV1 = Readonly<{
	decide: (metadata: Readonly<{
		schemaVersion: 1;
		requestId: string;
		approvalKind: ApprovalKindV1;
		scopeFingerprint: string;
		headSha: string | null;
		pathCount: number;
		planFingerprint: string;
		actionFingerprint: string;
		expiresAt: string;
	}>) => unknown | Promise<unknown>;
}>;

export type ApprovalTrajectoryMetadataV1 = Readonly<{
	schemaVersion: 1;
	event: "approval-decision";
	requestId: string;
	approvalKind: ApprovalKindV1;
	decision: ApprovalDecisionV1;
	scopeFingerprint: string;
	headSha: string | null;
	sessionId: string;
	generation: number;
	decidedAt: string;
	expiresAt: string;
	code: "APR01_APPROVED" | "APR01_DENIED";
}>;

export type ApprovalCoreAdaptersV1 = Readonly<{
	clock?: () => unknown;
	lifecycle?: unknown;
	store?: SafeApprovalStoreV1;
	ui?: ApprovalUiV1;
	trajectory?: (metadata: ApprovalTrajectoryMetadataV1) => unknown | Promise<unknown>;
}>;

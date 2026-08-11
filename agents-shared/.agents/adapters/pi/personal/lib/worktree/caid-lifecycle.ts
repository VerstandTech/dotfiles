/**
 * ISO-01 CAID lifecycle pure helpers.
 *
 * Causal red stub: production green is intentionally not implemented yet.
 * Tests import this module and require the V1 API surface below.
 */

const MISSING = "ISO01_LIFECYCLE_MISSING";

function missing(): never {
	throw new Error(MISSING);
}

/** @internal causal-red marker — green must replace this module body. */
export const ISO01_LIFECYCLE_STUB = true as const;

export function planCaidLifecycleV1(..._args: unknown[]): never {
	return missing();
}

export function evaluatePathCollisionV1(..._args: unknown[]): never {
	return missing();
}

export function evaluateHeartbeatV1(..._args: unknown[]): never {
	return missing();
}

export function evaluateCleanupReadinessV1(..._args: unknown[]): never {
	return missing();
}

export function acquireLifecycleWriterV1(..._args: unknown[]): never {
	return missing();
}

export function releaseLifecycleWriterV1(..._args: unknown[]): never {
	return missing();
}

export function evaluateBoardCaidAgreementV1(..._args: unknown[]): never {
	return missing();
}

export function validateBoardV1(..._args: unknown[]): never {
	return missing();
}

export function saveBoardAtomicV1(..._args: unknown[]): never {
	return missing();
}

export function appendAssignmentHistoryV1(..._args: unknown[]): never {
	return missing();
}

export function formatLifecycleHandoffV1(..._args: unknown[]): never {
	return missing();
}

/**
 * CON-01 structural approval pair binding (no authority claim).
 */

import { APPROVAL_AUTHORITY_NOTICE, type ParseResult } from "./limits.ts";
import { isIsoTimestamp } from "./issues.ts";
import { parseApprovalDecisionV1, parseApprovalRequestV1 } from "./validate.ts";

function pathsEqual(a: unknown, b: unknown): boolean {
	if (!Array.isArray(a) || !Array.isArray(b)) return false;
	if (a.length !== b.length) return false;
	for (let i = 0; i < a.length; i++) {
		if (a[i] !== b[i]) return false;
	}
	return true;
}

/**
 * Structural request/decision binding + expiry check.
 * Does NOT grant authority — APR-01 owns machine-local non-forgeable approval.
 */
export function checkApprovalPairV1(
	request: unknown,
	decision: unknown,
): ParseResult<{ bound: true; authority: "apr-01-required"; notice: string }> {
	const reqR = parseApprovalRequestV1(request);
	if (!reqR.ok) return reqR;
	const decR = parseApprovalDecisionV1(decision);
	if (!decR.ok) return decR;

	const req = reqR.value as Record<string, unknown>;
	const dec = decR.value as Record<string, unknown>;
	const issues: Array<{ code: string; path: string; message: string }> = [];

	const bind = (field: string, a: unknown, b: unknown) => {
		if (a !== b) {
			issues.push({
				code: "bind_mismatch",
				path: field,
				message: `${field} drift between request and decision`,
			});
		}
	};

	bind("requestId", req.requestId, dec.requestId);
	bind("action", req.action, dec.action);
	bind("risk", req.risk, dec.risk);
	bind("candidateSha", req.candidateSha, dec.candidateSha);
	bind("fingerprint", req.fingerprint, dec.fingerprint);
	if (!pathsEqual(req.scopedPaths, dec.scopedPaths)) {
		issues.push({
			code: "bind_mismatch",
			path: "scopedPaths",
			message: "scopedPaths drift between request and decision",
		});
	}

	const expiresAt = String(req.expiresAt ?? "");
	const decidedAt = String(dec.decidedAt ?? "");
	if (!isIsoTimestamp(expiresAt) || !isIsoTimestamp(decidedAt)) {
		issues.push({
			code: "invalid_time",
			path: "expiresAt",
			message: "malformed expiry or decided timestamp",
		});
	} else {
		const exp = Date.parse(expiresAt);
		const decT = Date.parse(decidedAt);
		// decidedAt must be strictly before expiresAt
		if (!(decT < exp)) {
			issues.push({
				code: "expired",
				path: "decidedAt",
				message: "decidedAt must be strictly before expiresAt",
			});
		}
	}

	if (issues.length > 0) return { ok: false, issues };

	return {
		ok: true,
		value: {
			bound: true,
			authority: "apr-01-required",
			notice: APPROVAL_AUTHORITY_NOTICE,
		},
	};
}

/**
 * CON-01 validated-only deterministic Markdown renderers (non-authoritative).
 */

import { APPROVAL_AUTHORITY_NOTICE, CONTRACT_LIMITS_V1 } from "./limits.ts";
import { isPlainObject } from "./issues.ts";
import { parseContractV1 } from "./validate.ts";

/**
 * Flatten and escape untrusted text for derived Markdown.
 * Uses visible ASCII markers only (no invisible/ZWSP characters) so injected
 * headings, fences, and authority-shaped tokens cannot satisfy forge oracles.
 */
function escapeUntrusted(s: string): string {
	const flat = s.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/\n/g, " ");
	return flat
		.replace(/\\/g, "\\\\")
		.replace(/`/g, "'")
		.replace(/#/g, "\\#")
		.replace(/\|/g, "\\|")
		// Break forge-sensitive identifiers with a visible suffix before any :/= trail.
		.replace(/assuranceEligible/gi, "assuranceEligible[untrusted]")
		.replace(/\bstatus(?=\s*:\s*completed\b)/gi, "status[untrusted]")
		.replace(/\bApproval(?=\s*:\s*approved\b)/gi, "Approval[untrusted]");
}

function renderRoleResult(v: Record<string, unknown>): string {
	const status = String(v.status ?? "unknown");
	const lines: string[] = [
		"Contract: role-result (derived, non-authoritative)",
		`Task: ${escapeUntrusted(String(v.taskId ?? ""))}`,
		`Role: ${escapeUntrusted(String(v.role ?? ""))}`,
		// Authoritative status is emitted by the renderer from validated enum only.
		`Status: ${status}`,
		`Dirty: ${v.dirty === true ? "true" : "false"}`,
		`HeadSha: ${escapeUntrusted(String(v.headSha ?? ""))}`,
	];
	const blockers = Array.isArray(v.blockers) ? (v.blockers as unknown[]) : [];
	if (blockers.length > 0) {
		lines.push("Blockers:");
		for (const b of blockers) lines.push(`- ${escapeUntrusted(String(b))}`);
	}
	const risks = Array.isArray(v.residualRisks) ? (v.residualRisks as unknown[]) : [];
	if (risks.length > 0) {
		lines.push("ResidualRisks:");
		for (const r of risks) lines.push(`- ${escapeUntrusted(String(r))}`);
	}
	const cmds = Array.isArray(v.commands) ? (v.commands as unknown[]) : [];
	if (cmds.length > 0) {
		lines.push("Commands:");
		for (const c of cmds) {
			if (isPlainObject(c)) {
				lines.push(
					`- exit ${String(c.exitCode)} :: ${escapeUntrusted(String(c.command ?? ""))} :: ${escapeUntrusted(String(c.summary ?? ""))}`,
				);
			}
		}
	}
	lines.push("Note: Markdown is derived display only and never source of truth.");
	return lines.join("\n");
}

function renderApproval(v: Record<string, unknown>): string {
	const lines: string[] = [
		"Contract: approval (derived, non-authoritative)",
		`Kind: ${escapeUntrusted(String(v.kind ?? ""))}`,
		`RequestId: ${escapeUntrusted(String(v.requestId ?? ""))}`,
	];
	if (v.kind === "approval-decision") {
		lines.push(`Decision: ${escapeUntrusted(String(v.decision ?? ""))}`);
	} else {
		lines.push(`Action: ${escapeUntrusted(String(v.action ?? ""))}`);
		lines.push(`Risk: ${escapeUntrusted(String(v.risk ?? ""))}`);
	}
	lines.push(`Notice: ${APPROVAL_AUTHORITY_NOTICE}`);
	lines.push("APR-01 must establish actual authority; this render is not authoritative approval.");
	return lines.join("\n");
}

function renderGeneric(v: Record<string, unknown>): string {
	const kind = String(v.kind ?? "unknown");
	const lines: string[] = [
		`Contract: ${escapeUntrusted(kind)} (derived, non-authoritative)`,
		"SchemaVersion: 1",
	];
	for (const k of Object.keys(v).sort()) {
		if (k === "kind" || k === "schemaVersion") continue;
		const val = v[k];
		if (typeof val === "string" || typeof val === "number" || typeof val === "boolean") {
			lines.push(`${escapeUntrusted(k)}: ${escapeUntrusted(String(val))}`);
		} else if (Array.isArray(val)) {
			lines.push(`${escapeUntrusted(k)}:`);
			for (const el of val) {
				if (typeof el === "string") lines.push(`- ${escapeUntrusted(el)}`);
				else lines.push(`- ${escapeUntrusted(JSON.stringify(el))}`);
			}
		} else if (isPlainObject(val)) {
			lines.push(`${escapeUntrusted(k)}: ${escapeUntrusted(JSON.stringify(val))}`);
		}
	}
	lines.push("Note: Markdown is derived display only and never source of truth.");
	return lines.join("\n");
}

function renderValidated(value: Record<string, unknown>): string {
	const kind = value.kind;
	if (kind === "role-result") return renderRoleResult(value);
	if (kind === "approval-request" || kind === "approval-decision") return renderApproval(value);
	return renderGeneric(value);
}

function enforceRenderBound(md: string): string {
	if (md.length > CONTRACT_LIMITS_V1.maxRenderedMarkdownBytes) {
		throw new Error(
			`render bound_exceeded: markdown ${md.length} exceeds maxRenderedMarkdownBytes ${CONTRACT_LIMITS_V1.maxRenderedMarkdownBytes}`,
		);
	}
	return md;
}

/**
 * Render validated V1 contract as bounded deterministic Markdown.
 * Dual-entry: raw shapes that parse are accepted iff equal to parse→render.
 * Invalid values throw.
 */
export function renderContractMarkdownV1(value: unknown): string {
	const parsed = parseContractV1(value);
	if (!parsed.ok) {
		throw new Error("renderContractMarkdownV1: invalid or unvalidated value refused");
	}
	return enforceRenderBound(renderValidated(parsed.value as Record<string, unknown>));
}

export function renderRoleResultMarkdownV1(value: unknown): string {
	const parsed = parseContractV1(value);
	if (!parsed.ok) throw new Error("renderRoleResultMarkdownV1: invalid value refused");
	const v = parsed.value as Record<string, unknown>;
	if (v.kind !== "role-result") throw new Error("renderRoleResultMarkdownV1: expected role-result");
	return enforceRenderBound(renderRoleResult(v));
}

export function renderApprovalMarkdownV1(value: unknown): string {
	const parsed = parseContractV1(value);
	if (!parsed.ok) throw new Error("renderApprovalMarkdownV1: invalid value refused");
	const v = parsed.value as Record<string, unknown>;
	if (v.kind !== "approval-request" && v.kind !== "approval-decision") {
		throw new Error("renderApprovalMarkdownV1: expected approval envelope");
	}
	return enforceRenderBound(renderApproval(v));
}

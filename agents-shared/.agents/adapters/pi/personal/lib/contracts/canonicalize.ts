/**
 * CON-01 deterministic canonical JSON for validated V1 contracts.
 */

import { CONTRACT_LIMITS_V1 } from "./limits.ts";
import { isPlainObject } from "./issues.ts";
import { parseContractV1 } from "./validate.ts";

/** Recursively sort object keys; preserve array order; reject non-JSON. */
function sortKeys(value: unknown): unknown {
	if (value === null) return null;
	const t = typeof value;
	if (t === "string" || t === "boolean") return value;
	if (t === "number") {
		if (!Number.isFinite(value as number)) {
			throw new Error("non-finite number in canonicalization");
		}
		return value;
	}
	if (t !== "object") {
		throw new Error(`cannot canonicalize type ${t}`);
	}
	if (Array.isArray(value)) {
		return value.map(sortKeys);
	}
	const obj = value as Record<string, unknown>;
	const keys = Object.keys(obj).sort();
	const out: Record<string, unknown> = {};
	for (const k of keys) {
		const v = obj[k];
		if (v === undefined) continue;
		out[k] = sortKeys(v);
	}
	return out;
}

function looksLikeValidatedContract(value: unknown): boolean {
	if (!isPlainObject(value)) return false;
	if (value.schemaVersion !== 1) return false;
	if (typeof value.kind !== "string") return false;
	return true;
}

/**
 * Canonicalize a validated V1 contract to deterministic JSON text.
 * Dual-entry: raw shapes that parse successfully are accepted and equal validated canon.
 * Invalid values throw (refused).
 */
export function canonicalizeContractV1(value: unknown): string {
	// Prefer validated path: re-parse to ensure closed validity
	const parsed = parseContractV1(value);
	if (!parsed.ok) {
		// Also refuse values that look nothing like contracts
		if (!looksLikeValidatedContract(value)) {
			throw new Error("canonicalizeContractV1: invalid or unvalidated value refused");
		}
		throw new Error("canonicalizeContractV1: invalid contract refused");
	}

	const sorted = sortKeys(parsed.value);
	const text = JSON.stringify(sorted);
	if (text.length > CONTRACT_LIMITS_V1.maxSerializedBytes) {
		throw new Error("canonicalizeContractV1: canonical bytes exceed maxSerializedBytes");
	}
	return text;
}

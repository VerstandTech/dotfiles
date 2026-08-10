/**
 * Bounded issue accumulator for closed V1 validation.
 */

import {
	CONTRACT_LIMITS_V1,
	type ContractIssue,
	type ContractIssueCode,
	type ParseErr,
	type ParseOk,
} from "./limits.ts";

function hasBoundSignal(issues: readonly ContractIssue[]): boolean {
	return issues.some((i) => /bound|cap|issues|maxIssues|too many/i.test(`${i.code} ${i.message}`));
}

function capIssue(): ContractIssue {
	return {
		code: "bound_exceeded",
		path: "$",
		message: `too many issues; maxIssues=${CONTRACT_LIMITS_V1.maxIssues} cap`,
	};
}

export class IssueSink {
	readonly issues: ContractIssue[] = [];
	private overflow = false;

	get full(): boolean {
		return this.issues.length >= CONTRACT_LIMITS_V1.maxIssues;
	}

	add(code: ContractIssueCode, path: string, message: string): void {
		if (this.issues.length < CONTRACT_LIMITS_V1.maxIssues) {
			this.issues.push({ code, path, message });
			return;
		}
		// Over-production: keep length === maxIssues and ensure a bound/cap signal.
		this.overflow = true;
		if (!hasBoundSignal(this.issues)) {
			this.issues[this.issues.length - 1] = capIssue();
		}
	}

	addBound(path: string, message: string): void {
		this.add("bound_exceeded", path, message);
	}

	ok<T>(value: T): ParseOk<T> {
		return { ok: true, value };
	}

	err(): ParseErr {
		if (this.issues.length === 0) {
			this.add("invalid", "$", "validation failed");
		}
		if ((this.overflow || this.full) && !hasBoundSignal(this.issues) && this.issues.length > 0) {
			this.issues[this.issues.length - 1] = capIssue();
		}
		return {
			ok: false,
			issues: this.issues.slice(0, CONTRACT_LIMITS_V1.maxIssues),
		};
	}
}

export function isPlainObject(v: unknown): v is Record<string, unknown> {
	return v !== null && typeof v === "object" && !Array.isArray(v);
}

export function exactKeys(
	obj: Record<string, unknown>,
	allowed: readonly string[],
	path: string,
	sink: IssueSink,
): void {
	const allow = new Set(allowed);
	for (const k of Object.keys(obj)) {
		if (!allow.has(k)) {
			sink.add("unknown_field", path ? `${path}.${k}` : k, `unknown field "${k}" (closed envelope)`);
		}
	}
}

export function requireString(
	obj: Record<string, unknown>,
	key: string,
	path: string,
	sink: IssueSink,
	opts?: { nonEmpty?: boolean; max?: number },
): string | undefined {
	const p = path ? `${path}.${key}` : key;
	if (!(key in obj)) {
		sink.add("required", p, `missing required field "${key}"`);
		return undefined;
	}
	const v = obj[key];
	if (typeof v !== "string") {
		sink.add("invalid_type", p, `expected string, got ${v === null ? "null" : typeof v}`);
		return undefined;
	}
	if (opts?.nonEmpty && v.length === 0) {
		sink.add("empty", p, `empty string not allowed for "${key}"`);
		return undefined;
	}
	const max = opts?.max ?? CONTRACT_LIMITS_V1.maxStringLength;
	if (v.length > max) {
		sink.addBound(p, `string length ${v.length} exceeds max ${max}`);
		return undefined;
	}
	return v;
}

export function requireBoolean(
	obj: Record<string, unknown>,
	key: string,
	path: string,
	sink: IssueSink,
): boolean | undefined {
	const p = path ? `${path}.${key}` : key;
	if (!(key in obj)) {
		sink.add("required", p, `missing required field "${key}"`);
		return undefined;
	}
	const v = obj[key];
	if (typeof v !== "boolean") {
		sink.add("invalid_type", p, `expected boolean, got ${v === null ? "null" : typeof v}`);
		return undefined;
	}
	return v;
}

export function requireFiniteNumber(
	obj: Record<string, unknown>,
	key: string,
	path: string,
	sink: IssueSink,
): number | undefined {
	const p = path ? `${path}.${key}` : key;
	if (!(key in obj)) {
		sink.add("required", p, `missing required field "${key}"`);
		return undefined;
	}
	const v = obj[key];
	if (typeof v !== "number" || !Number.isFinite(v)) {
		sink.add("invalid_type", p, `expected finite number, got ${typeof v}`);
		return undefined;
	}
	return v;
}

export function isExactSchemaVersion1(v: unknown): boolean {
	// Exact integer 1 only — reject boxed Number (typeof object), floats, strings, etc.
	return typeof v === "number" && Number.isInteger(v) && v === 1;
}

export function isHexSha(s: string): boolean {
	return (s.length === 40 || s.length === 64) && /^[0-9a-fA-F]+$/.test(s);
}

/**
 * Strict V1 UTC RFC3339 profile:
 * - whole seconds: YYYY-MM-DDTHH:mm:ssZ
 * - milliseconds: YYYY-MM-DDTHH:mm:ss.sssZ
 * - Z-only (no offsets)
 * - real calendar round-trip (rejects Feb 30, month 13, Date.parse NaN forms, locale strings)
 */
const STRICT_RFC3339_Z_RE =
	/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{3}))?Z$/;

export function isIsoTimestamp(s: string): boolean {
	if (typeof s !== "string" || s.length === 0) return false;
	const m = STRICT_RFC3339_Z_RE.exec(s);
	if (!m) return false;

	const year = Number(m[1]);
	const month = Number(m[2]);
	const day = Number(m[3]);
	const hour = Number(m[4]);
	const minute = Number(m[5]);
	const second = Number(m[6]);
	const ms = m[7] !== undefined ? Number(m[7]) : 0;

	if (month < 1 || month > 12) return false;
	if (day < 1 || day > 31) return false;
	if (hour > 23 || minute > 59 || second > 59) return false;
	if (!Number.isInteger(ms) || ms < 0 || ms > 999) return false;

	// Real calendar round-trip via UTC Date components.
	const dt = new Date(Date.UTC(year, month - 1, day, hour, minute, second, ms));
	if (!Number.isFinite(dt.getTime())) return false;
	if (
		dt.getUTCFullYear() !== year ||
		dt.getUTCMonth() !== month - 1 ||
		dt.getUTCDate() !== day ||
		dt.getUTCHours() !== hour ||
		dt.getUTCMinutes() !== minute ||
		dt.getUTCSeconds() !== second ||
		dt.getUTCMilliseconds() !== ms
	) {
		return false;
	}

	// Also require Date.parse of the exact string is finite (rejects odd engines).
	const parsed = Date.parse(s);
	if (!Number.isFinite(parsed)) return false;
	// Parsed instant must match constructed UTC instant.
	if (parsed !== dt.getTime()) return false;

	return true;
}

/** Epoch millis for a validated strict Z timestamp, or NaN if invalid. */
export function parseStrictRfc3339ZMs(s: string): number {
	if (!isIsoTimestamp(s)) return Number.NaN;
	return Date.parse(s);
}

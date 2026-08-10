/**
 * Bounded issue accumulator for closed V1 validation.
 */

import { CONTRACT_LIMITS_V1, type ContractIssue, type ParseErr, type ParseOk } from "./limits.ts";

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

	add(code: string, path: string, message: string): void {
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

export function isIsoTimestamp(s: string): boolean {
	if (typeof s !== "string" || s.length < 10) return false;
	const t = Date.parse(s);
	return Number.isFinite(t);
}

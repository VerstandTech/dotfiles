/**
 * CON-01 untrusted graph preflight — reject executable/pathological object graphs
 * without invoking getters or mutating Object.prototype.
 */

import {
	CONTRACT_LIMITS_V1,
	type ContractIssue,
	type ParseErr,
	type ParseResult,
} from "./limits.ts";

const DANGEROUS_KEYS = new Set(["__proto__", "prototype", "constructor"]);

export type PreflightOk = {
	ok: true;
	/** Deep-cloned plain JSON value (data properties only). */
	value: unknown;
	depth: number;
};

function issue(code: string, path: string, message: string): ContractIssue {
	return { code, path, message };
}

function err(issues: ContractIssue[]): ParseErr {
	const capped = issues.slice(0, CONTRACT_LIMITS_V1.maxIssues);
	if (issues.length > CONTRACT_LIMITS_V1.maxIssues) {
		// Ensure a bound/cap signal is present
		const hasBound = capped.some((i) => /bound|cap|issues|maxIssues/i.test(`${i.code} ${i.message}`));
		if (!hasBound && capped.length > 0) {
			capped[capped.length - 1] = issue(
				"bound_exceeded",
				"$",
				`maxIssues cap exceeded (potential ${issues.length} > ${CONTRACT_LIMITS_V1.maxIssues})`,
			);
		} else if (!hasBound) {
			capped.push(
				issue(
					"bound_exceeded",
					"$",
					`maxIssues cap exceeded (potential ${issues.length} > ${CONTRACT_LIMITS_V1.maxIssues})`,
				),
			);
		}
	}
	return { ok: false, issues: capped };
}

/**
 * Walk untrusted input without invoking accessors.
 * Returns a plain data clone or a bounded issue list.
 */
export function preflightUntrustedGraph(input: unknown): ParseResult<unknown> & { depth?: number } {
	const seen = new WeakSet<object>();
	const issues: ContractIssue[] = [];

	const push = (i: ContractIssue) => {
		if (issues.length < CONTRACT_LIMITS_V1.maxIssues) {
			issues.push(i);
		} else if (issues.length === CONTRACT_LIMITS_V1.maxIssues) {
			// Replace last with cap signal if needed; keep length === maxIssues
			const hasBound = issues.some((x) => /bound|cap|issues|maxIssues/i.test(`${x.code} ${x.message}`));
			if (!hasBound) {
				issues[issues.length - 1] = issue(
					"bound_exceeded",
					"$",
					`too many issues; maxIssues=${CONTRACT_LIMITS_V1.maxIssues}`,
				);
			}
		}
	};

	function walk(node: unknown, path: string, depth: number): unknown {
		if (issues.length >= CONTRACT_LIMITS_V1.maxIssues) return null;

		if (node === null) return null;

		const t = typeof node;
		if (t === "string" || t === "boolean") return node;
		if (t === "number") {
			if (!Number.isFinite(node as number)) {
				push(issue("unsafe_type", path, "non-finite number rejected"));
				return null;
			}
			return node;
		}
		if (t === "bigint") {
			push(issue("unsafe_type", path, "bigint rejected"));
			return null;
		}
		if (t === "symbol") {
			push(issue("unsafe_type", path, "symbol rejected"));
			return null;
		}
		if (t === "function") {
			push(issue("unsafe_type", path, "function rejected"));
			return null;
		}
		if (t === "undefined") {
			push(issue("unsafe_type", path, "undefined rejected"));
			return null;
		}
		if (t !== "object") {
			push(issue("unsafe_type", path, `unsupported type ${t}`));
			return null;
		}

		// Nesting bound applies to objects/arrays only (root depth = 1).
		if (depth > CONTRACT_LIMITS_V1.maxNestingDepth) {
			push(
				issue(
					"bound_exceeded",
					path,
					`maxNestingDepth exceeded (${depth} > ${CONTRACT_LIMITS_V1.maxNestingDepth})`,
				),
			);
			return null;
		}

		const obj = node as object;
		if (seen.has(obj)) {
			push(issue("unsafe_cycle", path, "cyclic object graph rejected"));
			return null;
		}
		seen.add(obj);

		if (Array.isArray(obj)) {
			// Sparse detection: holes have no own index
			const len = obj.length;
			if (len > CONTRACT_LIMITS_V1.maxArrayLength) {
				push(
					issue(
						"bound_exceeded",
						path,
						`array length ${len} exceeds maxArrayLength ${CONTRACT_LIMITS_V1.maxArrayLength}`,
					),
				);
				return null;
			}
			const out: unknown[] = [];
			for (let i = 0; i < len; i++) {
				if (!Object.prototype.hasOwnProperty.call(obj, i)) {
					push(issue("unsafe_sparse", `${path}[${i}]`, "sparse array hole rejected"));
					return null;
				}
				const desc = Object.getOwnPropertyDescriptor(obj, i);
				if (!desc || "get" in desc || "set" in desc) {
					// Accessor on array index — do not invoke
					if (desc && ("get" in desc || "set" in desc)) {
						push(issue("unsafe_accessor", `${path}[${i}]`, "accessor property rejected"));
						return null;
					}
					push(issue("unsafe_sparse", `${path}[${i}]`, "sparse array hole rejected"));
					return null;
				}
				out.push(walk(desc.value, `${path}[${i}]`, depth + 1));
				if (issues.length >= CONTRACT_LIMITS_V1.maxIssues) return null;
			}
			return out;
		}

		// Plain object only — reject custom prototypes
		const proto = Object.getPrototypeOf(obj);
		if (proto !== Object.prototype && proto !== null) {
			push(issue("unsafe_prototype", path, "non-plain object / custom class rejected"));
			return null;
		}

		// Enumerate own keys without invoking getters
		const names = Object.getOwnPropertyNames(obj);
		const out: Record<string, unknown> = {};
		for (const key of names) {
			if (DANGEROUS_KEYS.has(key)) {
				push(
					issue(
						"unsafe_key",
						path === "$" ? key : `${path}.${key}`,
						`dangerous own key "${key}" rejected`,
					),
				);
				return null;
			}
			const desc = Object.getOwnPropertyDescriptor(obj, key);
			if (!desc) continue;
			if (typeof desc.get === "function" || typeof desc.set === "function") {
				push(
					issue(
						"unsafe_accessor",
						path === "$" ? key : `${path}.${key}`,
						"accessor property rejected without invocation",
					),
				);
				return null;
			}
			if (!("value" in desc)) {
				push(
					issue(
						"unsafe_accessor",
						path === "$" ? key : `${path}.${key}`,
						"non-data property rejected",
					),
				);
				return null;
			}
			// Skip non-enumerable (symbol keys already excluded via getOwnPropertyNames only for strings)
			if (!desc.enumerable) continue;
			const childPath = path === "$" ? key : `${path}.${key}`;
			out[key] = walk(desc.value, childPath, depth + 1);
			if (issues.length >= CONTRACT_LIMITS_V1.maxIssues) return null;
		}

		// Own symbol keys are not JSON — reject if any enumerable symbols present
		const syms = Object.getOwnPropertySymbols(obj);
		for (const s of syms) {
			const desc = Object.getOwnPropertyDescriptor(obj, s);
			if (desc?.enumerable) {
				push(issue("unsafe_type", path, "symbol key rejected"));
				return null;
			}
		}

		return out;
	}

	// Root primitives that are not objects — still walk for type checks
	if (input === undefined) {
		return err([issue("invalid_type", "$", "undefined root rejected")]);
	}

	const cloned = walk(input, "$", 1);
	if (issues.length > 0) return err(issues);
	return { ok: true, value: cloned };
}

/**
 * Measure nesting depth of a plain JSON value (root depth = 1 for objects/arrays).
 */
export function measureDepth(value: unknown): number {
	if (value === null || typeof value !== "object") return 1;
	let max = 1;
	const walk = (n: unknown, d: number) => {
		if (d > max) max = d;
		if (n === null || typeof n !== "object") return;
		if (Array.isArray(n)) {
			for (const el of n) walk(el, d + 1);
			return;
		}
		for (const k of Object.keys(n as object)) {
			walk((n as Record<string, unknown>)[k], d + 1);
		}
	};
	walk(value, 1);
	return max;
}

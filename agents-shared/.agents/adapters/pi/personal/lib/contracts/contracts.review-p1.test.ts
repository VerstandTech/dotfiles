/**
 * CON-01 independent-review P1 regressions (test-only).
 * Locks the six accepted blockers from CON-01-review-test-designer-contract.md.
 * Must fail on production HEAD until Implementer remediates — no production edits here.
 *
 * Critic remediation: statement-local type oracles, descriptor subset parity,
 * direct preflight maxObjectKeys floor/ceiling + plain-key cardinality.
 */
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
	ASSURANCE_ROLES_V1,
	CONTRACTS_DIR,
	loadContractsModule,
	minimalApprovalDecision,
	minimalApprovalRequest,
	minimalRoleRequest,
	minimalRoleResult,
	minimalValidationContract,
	allMinimalFixtures,
	requireContracts,
	requireExport,
	requireFn,
	type ContractsModule,
	type ParseResult,
} from "./contracts.shared.test.ts";

/** Locked review-regression failure signature (matchMode: signature). */
export const CON01_REVIEW_P1_FAILURE_SIGNATURE =
	"review regression accepted unsafe glob, permissive timestamp, unbounded object, or drifted descriptor/type contract" as const;

export const CON01_REVIEW_P1_PRIMARY_TEST_ID =
	"CON-01 review P1 > separates concrete references from validation-only trailing globs" as const;

/** Sane published range for maxObjectKeys (DoS bound, not tiny/unlimited). */
const MAX_OBJECT_KEYS_FLOOR = 32;
const MAX_OBJECT_KEYS_CEILING = 4_096;

function sig(detail: string): string {
	return `${CON01_REVIEW_P1_FAILURE_SIGNATURE}: ${detail}`;
}

function issueBlob(result: ParseResult<unknown>): string {
	if (result.ok) return "(accepted)";
	return result.issues.map((i) => `${i.code} ${i.path} ${i.message}`).join(" | ");
}

function expectReject(
	result: ParseResult<unknown>,
	detail: string,
	hint?: RegExp,
): void {
	expect(result.ok, sig(`${detail}: expected rejection, got accept`)).toBe(false);
	if (result.ok) return;
	expect(
		Array.isArray(result.issues) && result.issues.length > 0,
		sig(`${detail}: empty issues`),
	).toBe(true);
	if (hint) {
		const blob = issueBlob(result);
		expect(hint.test(blob), sig(`${detail}: expected ${hint}, got ${blob}`)).toBe(true);
	}
}

function expectAccept(result: ParseResult<unknown>, detail: string): void {
	if (!result.ok) {
		expect(false, sig(`${detail}: expected accept, got ${issueBlob(result)}`)).toBe(true);
	}
}

/** Resolve the separate validation-only glob export (name locked for Implementer). */
function requireValidationGlobFn(mod: ContractsModule): (path: unknown) => boolean {
	const record = mod as Record<string, unknown>;
	const fn = record.isSafeValidationGlobPath;
	expect(
		typeof fn === "function",
		sig(
			"missing exported isSafeValidationGlobPath (validation-only trailing /**; concrete refs must stay glob-free)",
		),
	).toBe(true);
	return fn as (path: unknown) => boolean;
}

/** Require direct preflight export (cardinality oracle must not go only through parsers). */
function requirePreflight(mod: ContractsModule): (input: unknown) => ParseResult<unknown> {
	const record = mod as Record<string, unknown>;
	const pre = record.preflightUntrustedGraph;
	expect(
		typeof pre === "function",
		sig("missing exported preflightUntrustedGraph (maxObjectKeys must run before clone)"),
	).toBe(true);
	return pre as (input: unknown) => ParseResult<unknown>;
}

// ─── Test-only bounded JSON-Schema subset checker (descriptor parity) ───────
//
// Promised subset only: type, const, enum, required, properties,
// additionalProperties (false | schema), items, minLength, oneOf, anyOf.
// No $ref, if/then, patternProperties, unevaluated*, full draft semantics.

type Schema = Record<string, unknown>;

const SCHEMA_CHECK_MAX_NODES = 4_096;

function schemaIssues(
	schema: unknown,
	value: unknown,
	path: string,
	acc: string[],
	nodes: { n: number },
): void {
	if (acc.length >= 32 || nodes.n >= SCHEMA_CHECK_MAX_NODES) return;
	nodes.n++;
	if (!schema || typeof schema !== "object" || Array.isArray(schema)) {
		acc.push(`${path}: invalid schema node`);
		return;
	}
	const s = schema as Schema;

	// oneOf / anyOf — first matching branch wins for anyOf; exactly one for oneOf (soft).
	if (Array.isArray(s.oneOf) || Array.isArray(s.anyOf)) {
		const branches = (Array.isArray(s.oneOf) ? s.oneOf : s.anyOf) as unknown[];
		const branchHits: number[] = [];
		for (let i = 0; i < branches.length; i++) {
			const branchAcc: string[] = [];
			schemaIssues(branches[i], value, path, branchAcc, nodes);
			if (branchAcc.length === 0) branchHits.push(i);
		}
		if (Array.isArray(s.oneOf)) {
			if (branchHits.length !== 1) {
				acc.push(`${path}: oneOf matched ${branchHits.length} branches`);
			}
		} else if (branchHits.length === 0) {
			acc.push(`${path}: anyOf matched 0 branches`);
		}
		return;
	}

	if ("const" in s) {
		if (value !== s.const) acc.push(`${path}: const mismatch`);
		return;
	}
	if (Array.isArray(s.enum)) {
		if (!s.enum.includes(value as never)) acc.push(`${path}: enum mismatch`);
		return;
	}

	const t = s.type;
	if (Array.isArray(t)) {
		// Multi-type: accept if any listed primitive/object/array type matches.
		const tryTypes = t as string[];
		const ok = tryTypes.some((tt) => {
			if (tt === "string") return typeof value === "string";
			if (tt === "number") return typeof value === "number" && Number.isFinite(value);
			if (tt === "boolean") return typeof value === "boolean";
			if (tt === "null") return value === null;
			if (tt === "array") return Array.isArray(value);
			if (tt === "object") {
				return value !== null && typeof value === "object" && !Array.isArray(value);
			}
			return false;
		});
		if (!ok) acc.push(`${path}: type union mismatch`);
		// If object branch possible, still walk properties when present.
		if (
			value !== null &&
			typeof value === "object" &&
			!Array.isArray(value) &&
			(s.properties || s.required || "additionalProperties" in s)
		) {
			// fall through to object handling below by not returning early only when object
		} else if (Array.isArray(value) && s.items) {
			for (let i = 0; i < value.length; i++) {
				schemaIssues(s.items, value[i], `${path}[${i}]`, acc, nodes);
			}
			return;
		} else {
			return;
		}
	}

	if (t === "string") {
		if (typeof value !== "string") acc.push(`${path}: expected string`);
		else if (typeof s.minLength === "number" && value.length < s.minLength) {
			acc.push(`${path}: minLength`);
		}
		return;
	}
	if (t === "number" || t === "integer") {
		if (typeof value !== "number" || !Number.isFinite(value)) acc.push(`${path}: expected number`);
		else if (t === "integer" && !Number.isInteger(value)) acc.push(`${path}: expected integer`);
		return;
	}
	if (t === "boolean") {
		if (typeof value !== "boolean") acc.push(`${path}: expected boolean`);
		return;
	}
	if (t === "array") {
		if (!Array.isArray(value)) {
			acc.push(`${path}: expected array`);
			return;
		}
		if (s.items) {
			for (let i = 0; i < value.length; i++) {
				schemaIssues(s.items, value[i], `${path}[${i}]`, acc, nodes);
			}
		}
		return;
	}
	if (
		t === "object" ||
		s.properties ||
		s.required ||
		"additionalProperties" in s ||
		Array.isArray(t)
	) {
		if (value === null || typeof value !== "object" || Array.isArray(value)) {
			// Multi-type may already have accepted non-object; only error if object was required.
			if (t === "object" || (!Array.isArray(t) && (s.properties || s.required))) {
				acc.push(`${path}: expected object`);
			}
			return;
		}
		const obj = value as Record<string, unknown>;
		const props = (s.properties ?? {}) as Record<string, unknown>;
		const required = Array.isArray(s.required) ? (s.required as string[]) : [];
		for (const r of required) {
			if (!(r in obj)) acc.push(`${path}.${r}: missing required`);
		}
		for (const key of Object.keys(obj)) {
			if (key in props) {
				schemaIssues(props[key], obj[key], path ? `${path}.${key}` : key, acc, nodes);
			} else if (s.additionalProperties === false) {
				acc.push(`${path}.${key}: additionalProperties false`);
			} else if (s.additionalProperties && typeof s.additionalProperties === "object") {
				schemaIssues(
					s.additionalProperties,
					obj[key],
					path ? `${path}.${key}` : key,
					acc,
					nodes,
				);
			}
		}
	}
}

function validateAgainstDescriptor(schema: unknown, value: unknown): string[] {
	const acc: string[] = [];
	schemaIssues(schema, value, "$", acc, { n: 0 });
	return acc;
}

/** Nested object schemas that validators close must be closed + property-complete. */
function assertDescriptorObjectClosed(
	schema: unknown,
	label: string,
	requiredProps: readonly string[],
	opts?: { allPropsRequired?: boolean },
): void {
	expect(
		schema !== null && typeof schema === "object" && !Array.isArray(schema),
		sig(`descriptor ${label} missing object schema`),
	).toBe(true);
	const s = schema as Schema;
	expect(
		s.additionalProperties === false,
		sig(`descriptor ${label} must set additionalProperties:false (closed nested object)`),
	).toBe(true);
	expect(
		s.properties !== null && typeof s.properties === "object" && !Array.isArray(s.properties),
		sig(`descriptor ${label} must declare properties`),
	).toBe(true);
	const props = s.properties as Record<string, unknown>;
	for (const p of requiredProps) {
		expect(
			p in props,
			sig(`descriptor ${label} missing property "${p}" (validator/descriptor drift)`),
		).toBe(true);
	}
	if (opts?.allPropsRequired !== false) {
		expect(Array.isArray(s.required), sig(`descriptor ${label} must list required[]`)).toBe(
			true,
		);
		for (const r of requiredProps) {
			expect(
				(s.required as string[]).includes(r),
				sig(`descriptor ${label} required[] missing "${r}"`),
			).toBe(true);
		}
	}
}

function assertEnumEquals(
	schema: unknown,
	label: string,
	expected: readonly string[],
): void {
	expect(
		schema !== null && typeof schema === "object",
		sig(`descriptor ${label} missing`),
	).toBe(true);
	const s = schema as Schema;
	expect(Array.isArray(s.enum), sig(`descriptor ${label} must be enum`)).toBe(true);
	const got = [...(s.enum as string[])].sort();
	const exp = [...expected].sort();
	expect(got, sig(`descriptor ${label} enum drift: got ${JSON.stringify(got)}`)).toEqual(exp);
}

// ─── Bounded declaration-block extractor (typed public surface) ─────────────

/** Strip // and /* *\/ comments and string/template literals so name hits are code-only. */
function stripCommentsAndStrings(src: string): string {
	let out = "";
	let i = 0;
	while (i < src.length) {
		const c = src[i]!;
		const n = src[i + 1];
		// line comment
		if (c === "/" && n === "/") {
			i += 2;
			while (i < src.length && src[i] !== "\n") i++;
			out += " ";
			continue;
		}
		// block comment
		if (c === "/" && n === "*") {
			i += 2;
			while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) i++;
			i = Math.min(src.length, i + 2);
			out += " ";
			continue;
		}
		// strings
		if (c === '"' || c === "'" || c === "`") {
			const quote = c;
			i++;
			while (i < src.length) {
				if (src[i] === "\\") {
					i += 2;
					continue;
				}
				if (src[i] === quote) {
					i++;
					break;
				}
				i++;
			}
			out += '""';
			continue;
		}
		out += c;
		i++;
	}
	return out;
}

/**
 * Extract a single top-level export type/interface/function declaration statement.
 * Stops at the matching `;` for type aliases, or balanced `{...}` block for interfaces/functions.
 * Does NOT greedily span later unions/types (statement-local).
 */
function extractDeclaration(src: string, kind: "type" | "interface" | "function", name: string): string | null {
	const code = stripCommentsAndStrings(src);
	const re =
		kind === "function"
			? new RegExp(String.raw`export\s+(?:async\s+)?function\s+${name}\b`)
			: new RegExp(String.raw`export\s+${kind}\s+${name}\b`);
	const m = re.exec(code);
	if (!m || m.index === undefined) return null;
	const start = m.index;
	let i = start + m[0].length;

	if (kind === "type") {
		// Find '=' then consume until top-level ';' (track <> () [] depth, not braces from mapped types carefully).
		while (i < code.length && code[i] !== "=") i++;
		if (code[i] !== "=") return null;
		i++;
		let angle = 0;
		let paren = 0;
		let bracket = 0;
		let brace = 0;
		const bodyStart = i;
		for (; i < code.length; i++) {
			const ch = code[i]!;
			if (ch === "<") angle++;
			else if (ch === ">") angle = Math.max(0, angle - 1);
			else if (ch === "(") paren++;
			else if (ch === ")") paren = Math.max(0, paren - 1);
			else if (ch === "[") bracket++;
			else if (ch === "]") bracket = Math.max(0, bracket - 1);
			else if (ch === "{") brace++;
			else if (ch === "}") brace = Math.max(0, brace - 1);
			else if (ch === ";" && angle === 0 && paren === 0 && bracket === 0 && brace === 0) {
				return code.slice(start, i + 1);
			}
		}
		// Fallback: no semicolon (interface-style type) — return through next export/EOF
		return code.slice(start, bodyStart + 2_000);
	}

	// interface or function: find first `{` or `;` (overload) and balance braces
	while (i < code.length && code[i] !== "{" && code[i] !== ";") i++;
	if (code[i] === ";") return code.slice(start, i + 1);
	if (code[i] !== "{") return null;
	let depth = 0;
	for (; i < code.length; i++) {
		if (code[i] === "{") depth++;
		else if (code[i] === "}") {
			depth--;
			if (depth === 0) return code.slice(start, i + 1);
		}
	}
	return null;
}

/** Collect export type/interface names and type-only re-exports from index-like code. */
function exportedTypeNames(code: string): Set<string> {
	const stripped = stripCommentsAndStrings(code);
	const names = new Set<string>();
	const declRe = /export\s+(?:type|interface)\s+([A-Za-z_][A-Za-z0-9_]*)/g;
	let m: RegExpExecArray | null;
	while ((m = declRe.exec(stripped))) names.add(m[1]!);
	// export { type Foo, Bar } from "..."
	const groupRe = /export\s*\{([^}]+)\}/g;
	while ((m = groupRe.exec(stripped))) {
		const body = m[1]!;
		for (const part of body.split(",")) {
			const bit = part.trim();
			if (!bit) continue;
			const typePref = /^type\s+([A-Za-z_][A-Za-z0-9_]*)/.exec(bit);
			if (typePref) {
				names.add(typePref[1]!);
				continue;
			}
			const plain = /^([A-Za-z_][A-Za-z0-9_]*)/.exec(bit);
			if (plain) names.add(plain[1]!);
		}
	}
	return names;
}

function readProductionSources(): { name: string; src: string }[] {
	const names = readdirSync(CONTRACTS_DIR).filter(
		(n) => n.endsWith(".ts") && !n.endsWith(".test.ts"),
	);
	return names.map((name) => ({
		name,
		src: readFileSync(join(CONTRACTS_DIR, name), "utf8"),
	}));
}

function combinedProductionSource(): string {
	return readProductionSources()
		.map((f) => `// ---- ${f.name} ----\n${f.src}`)
		.join("\n");
}

function findDeclAcrossSources(
	kind: "type" | "interface" | "function",
	name: string,
): string | null {
	for (const f of readProductionSources()) {
		const d = extractDeclaration(f.src, kind, name);
		if (d) return d;
	}
	// Also try combined (re-exports won't define bodies).
	return extractDeclaration(combinedProductionSource(), kind, name);
}

/** Normalize a type-alias RHS for literal-union analysis (leading |, one paren wrap). */
function normalizeTypeAliasBody(raw: string): string {
	let body = raw.replace(/\s+/g, " ").trim();
	// Idiomatic leading union bar: type X = | "a" | "b"
	if (body.startsWith("|")) body = body.slice(1).trim();
	// One wrapping parenthesis pair only: type X = ("a" | "b")
	if (body.startsWith("(") && body.endsWith(")")) {
		const inner = body.slice(1, -1).trim();
		// Only unwrap when balanced as a single outer pair (no extra trailing junk).
		let depth = 0;
		let ok = true;
		for (let i = 0; i < body.length; i++) {
			if (body[i] === "(") depth++;
			else if (body[i] === ")") {
				depth--;
				if (depth < 0) {
					ok = false;
					break;
				}
				if (depth === 0 && i !== body.length - 1) {
					ok = false;
					break;
				}
			}
		}
		if (ok && depth === 0) body = inner;
	}
	// Drop a second leading | after unwrap.
	if (body.startsWith("|")) body = body.slice(1).trim();
	return body;
}

/** Split a statement-local union body on top-level `|` (no nested generics needed for lit unions). */
function splitUnionParts(body: string): string[] {
	return body
		.split("|")
		.map((p) => p.trim())
		.filter((p) => p.length > 0);
}

const WIDE_TYPE_ALIASES = new Set([
	"string",
	"number",
	"boolean",
	"bigint",
	"symbol",
	"object",
	"any",
	"unknown",
	"never",
	"void",
	"null",
	"undefined",
]);

function hasForbiddenOpenTypeShapes(decl: string): boolean {
	if (/\bany\b/.test(decl)) return true;
	if (/(?<![A-Za-z_])unknown(?![A-Za-z0-9_])/.test(decl)) return true;
	if (/Record\s*</.test(decl)) return true;
	if (/\[\s*[A-Za-z_][A-Za-z0-9_]*\s*:\s*string\s*\]/.test(decl)) return true;
	return false;
}

/** Extract `export type Name = RHS;` body or null. */
function typeAliasRhs(decl: string, name: string): string | null {
	const m = new RegExp(
		String.raw`^export\s+type\s+${name}\s*=\s*([\s\S]*);\s*$`,
	).exec(decl.trim());
	return m ? m[1]!.trim() : null;
}

/** True if decl is an object-shaped type/interface with at least one property field. */
function objectShapeFieldNames(decl: string): string[] {
	// Interface or type { ... }
	const brace = decl.indexOf("{");
	if (brace < 0) return [];
	const end = decl.lastIndexOf("}");
	if (end <= brace) return [];
	const body = decl.slice(brace + 1, end);
	const fields: string[] = [];
	// property:  name?: type  /  readonly name: type
	const re = /(?:(?:readonly|public|private|protected)\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*[?]?:\s*/g;
	let m: RegExpExecArray | null;
	while ((m = re.exec(body))) {
		// Skip method-ish if followed immediately by (
		const after = body.slice(m.index + m[0].length);
		if (after.trimStart().startsWith("(")) continue;
		fields.push(m[1]!);
	}
	return fields;
}

function isOpaqueOrEmptyShape(decl: string, name: string): boolean {
	const rhs = typeAliasRhs(decl, name);
	if (rhs !== null) {
		const norm = normalizeTypeAliasBody(rhs);
		// Empty object
		if (/^\{\s*\}$/.test(norm)) return true;
		// Bare object / wide primitives
		if (WIDE_TYPE_ALIASES.has(norm)) return true;
		// Alias-only to another name (no structural fields, no literal union)
		if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(norm)) return true;
		// object & {} / {} & Foo
		if (/\bobject\b/.test(norm) && !norm.includes("{")) return true;
	}
	// Interface with empty body
	if (/export\s+interface\s+/.test(decl)) {
		const fields = objectShapeFieldNames(decl);
		if (fields.length === 0 && !/\bextends\b/.test(decl)) return true;
	}
	return false;
}

/**
 * Authoritative envelope: structural object with schemaVersion + kind;
 * reject open escapes and opaque aliases (object, {}, OtherName-only).
 */
function envelopeDeclProblems(decl: string, name: string): string[] {
	const problems: string[] = [];
	if (!decl || decl.length === 0) return ["empty"];
	if (hasForbiddenOpenTypeShapes(decl)) problems.push("open-any-unknown-Record-index");

	const rhs = typeAliasRhs(decl, name);
	if (rhs !== null) {
		const norm = normalizeTypeAliasBody(rhs);
		if (WIDE_TYPE_ALIASES.has(norm)) problems.push(`opaque:${norm}`);
		if (/^\{\s*\}$/.test(norm)) problems.push("opaque:empty-object");
		// Alias-only name with no structure
		if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(norm)) problems.push(`opaque-alias:${norm}`);
		// Must be object-typed (contains `{` ... `}`) — not a bare alias/union of names only
		if (!norm.includes("{")) problems.push("not-structural-object");
	}

	const fields = objectShapeFieldNames(decl);
	if (!fields.includes("schemaVersion")) problems.push("missing-field:schemaVersion");
	if (!fields.includes("kind")) problems.push("missing-field:kind");
	if (fields.length < 2) problems.push("too-few-fields");

	if (isOpaqueOrEmptyShape(decl, name)) problems.push("opaque-or-empty");
	return problems;
}

/**
 * Supporting types: reject open/opaque/empty; require >=1 declared field OR closed literal union.
 */
function supportingDeclProblems(decl: string, name: string): string[] {
	const problems: string[] = [];
	if (!decl || decl.length === 0) return ["empty"];
	if (hasForbiddenOpenTypeShapes(decl)) problems.push("open-any-unknown-Record-index");

	const rhs = typeAliasRhs(decl, name);
	if (rhs !== null) {
		const norm = normalizeTypeAliasBody(rhs);
		if (WIDE_TYPE_ALIASES.has(norm)) problems.push(`opaque:${norm}`);
		if (/^\{\s*\}$/.test(norm)) problems.push("opaque:empty-object");
		if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(norm)) problems.push(`opaque-alias:${norm}`);

		// Closed literal union path
		const parts = splitUnionParts(norm);
		const allStringLits = parts.length > 0 && parts.every((p) => /^"[A-Za-z0-9_\-]+"$/.test(p));
		if (allStringLits && parts.length >= 1) {
			// OK as closed literal union (e.g. UsageV1 may be "unknown" | {...} — mixed handled below)
			return problems;
		}

		// Mixed union (e.g. "unknown" | { inputTokens: number; ... }) — require at least one object arm or lit
		const hasLit = parts.some((p) => /^"[A-Za-z0-9_\-]+"$/.test(p));
		const hasObj = parts.some((p) => p.includes("{")) || norm.includes("{");
		if (hasLit || hasObj) {
			// Still forbid empty object-only
			if (hasObj) {
				const fields = objectShapeFieldNames(`export type ${name} = ${norm};`);
				// For multi-arm, field scan may still find props inside braces
				if (!hasLit && fields.length === 0 && !/\{[\s\S]*[A-Za-z_][A-Za-z0-9_]*\s*[?]?:/.test(norm)) {
					problems.push("no-fields-or-literal-union");
				}
			}
			return problems;
		}

		const fields = objectShapeFieldNames(decl);
		if (fields.length === 0) problems.push("no-fields-or-literal-union");
	} else {
		// interface
		const fields = objectShapeFieldNames(decl);
		if (fields.length === 0) problems.push("no-fields-or-literal-union");
	}

	if (isOpaqueOrEmptyShape(decl, name)) problems.push("opaque-or-empty");
	return problems;
}

/**
 * ContractIssueCode: statement-local string-literal union after normalizing leading |
 * and one wrapping paren pair. >=2 codes, includes a known stable code, no wide aliases.
 */
function analyzeContractIssueCode(decl: string): { ok: boolean; reason: string } {
	const bodyMatch = /^export\s+type\s+ContractIssueCode\s*=\s*([\s\S]*);$/.exec(decl.trim());
	if (!bodyMatch) return { ok: false, reason: "not-type-alias" };
	const norm = normalizeTypeAliasBody(bodyMatch[1]!);
	const parts = splitUnionParts(norm);
	if (parts.length < 2) return { ok: false, reason: `need>=2-parts got ${parts.length}` };

	const lits: string[] = [];
	for (const p of parts) {
		// Reject wide aliases and non-literal arms
		if (WIDE_TYPE_ALIASES.has(p)) return { ok: false, reason: `wide:${p}` };
		if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(p)) return { ok: false, reason: `alias-arm:${p}` };
		const lit = /^"([A-Za-z0-9_]+)"$/.exec(p);
		if (!lit) return { ok: false, reason: `non-literal:${p}` };
		lits.push(lit[1]!);
	}
	if (lits.length < 2) return { ok: false, reason: "need>=2-string-lits" };
	const known = ["unknown_field", "bound_exceeded", "unsafe_path", "invalid_type", "required"];
	if (!lits.some((c) => known.includes(c))) {
		return { ok: false, reason: `missing-known-stable among ${lits.join(",")}` };
	}
	return { ok: true, reason: "ok" };
}

// ─── 1. Concrete path vs validation-only trailing glob ──────────────────────

describe("CON-01 review P1", () => {
	test("separates concrete references from validation-only trailing globs", async () => {
		const mod = requireContracts(await loadContractsModule());
		const isSafe = requireFn(mod, "isSafeRepoRelativePath", "isSafeRepoRelativePath");
		const parse = requireFn(mod, "parseContractV1", "parseContractV1");
		const parseRole = requireFn(mod, "parseRoleRequestV1", "parseRoleRequestV1");
		const parseResult = requireFn(mod, "parseRoleResultV1", "parseRoleResultV1");
		const parseApproval = requireFn(mod, "parseApprovalRequestV1", "parseApprovalRequestV1");
		const parseValidation = requireFn(
			mod,
			"parseValidationContractV1",
			"parseValidationContractV1",
		);

		const concreteGlobs = [
			"**",
			"docs/**",
			"lib/contracts/**",
			"*",
			"docs/*",
			"a?",
			"docs/a?",
			"docs/[a-z].ts",
			"**/secrets",
			"docs/**/x",
			"docs/**/**",
		] as const;

		const concreteGlobLeaks = concreteGlobs.filter((g) => isSafe(g));

		const fieldProbes: Array<{ label: string; result: ParseResult<unknown> }> = [
			{
				label: "artifact",
				result: parseRole({
					...minimalRoleRequest(),
					artifacts: [{ path: "docs/**", mediaType: "text/plain" }],
				}),
			},
			{
				label: "ownedPaths",
				result: parseRole({
					...minimalRoleRequest(),
					ownedPaths: ["lib/contracts/**"],
					forbiddenPaths: [],
				}),
			},
			{
				label: "role.forbiddenPaths",
				result: parseRole({
					...minimalRoleRequest(),
					ownedPaths: ["docs/a.ts"],
					forbiddenPaths: ["lib/bdd/**"],
				}),
			},
			{
				label: "changedPaths",
				result: parseResult({
					...minimalRoleResult(),
					changedPaths: ["agents-shared/**"],
				}),
			},
			{
				label: "evidenceRefs",
				result: (() => {
					const blocked = minimalRoleResult({
						status: "blocked",
						blockers: ["x"],
						evidenceRefs: ["docs/**"],
						artifactRefs: [],
					});
					delete blocked.redCause;
					return parseResult(blocked);
				})(),
			},
			{
				label: "scopedPaths",
				result: parseApproval({
					...minimalApprovalRequest(),
					scopedPaths: ["lib/**"],
				}),
			},
		];
		const fieldLeaks = fieldProbes.filter((p) => p.result.ok).map((p) => p.label);

		const globExportPresent =
			typeof (mod as Record<string, unknown>).isSafeValidationGlobPath === "function";

		expect(
			{
				concreteGlobLeaks,
				fieldLeaks,
				globExportPresent,
			},
			sig(
				`concrete refs must deny globs and export isSafeValidationGlobPath; concreteGlobLeaks=${JSON.stringify(concreteGlobLeaks)} fieldLeaks=${JSON.stringify(fieldLeaks)} globExportPresent=${globExportPresent}`,
			),
		).toEqual({
			concreteGlobLeaks: [],
			fieldLeaks: [],
			globExportPresent: true,
		});

		const isGlob = requireValidationGlobFn(mod);

		expect(
			isGlob("agents-shared/.agents/adapters/pi/personal/lib/contracts/**"),
			sig("validation glob must allow single non-bare trailing /**"),
		).toBe(true);
		expect(isGlob("docs/**"), sig("validation glob allows docs/**")).toBe(true);
		expect(isGlob("lib/bdd/**"), sig("validation glob allows lib/bdd/**")).toBe(true);

		for (const bad of [
			"**",
			"**/x",
			"docs/**/x",
			"docs/**/**",
			"docs/*",
			"*",
			"a?",
			"docs/[a-z]",
			"../x/**",
			"/tmp/**",
			"C:/x/**",
		] as const) {
			expect(
				isGlob(bad),
				sig(`validation glob must reject ${JSON.stringify(bad)}`),
			).toBe(false);
		}

		const vc = minimalValidationContract({
			forbiddenProductionPathsBeforeRed: [
				"agents-shared/.agents/adapters/pi/personal/lib/contracts/**",
				"agents-shared/.agents/adapters/pi/personal/lib/bdd/**",
			],
		});
		expectAccept(
			parseValidation(vc),
			"ValidationContractV1 must accept single trailing /** on forbiddenProductionPathsBeforeRed",
		);
		expectAccept(parse(vc), "parseContractV1 validation-contract trailing globs");

		expectReject(
			parseValidation(
				minimalValidationContract({
					forbiddenProductionPathsBeforeRed: ["**"],
				}),
			),
			"forbiddenProductionPathsBeforeRed rejects bare **",
			/unsafe_path|glob|path/i,
		);
		expectReject(
			parseValidation(
				minimalValidationContract({
					forbiddenProductionPathsBeforeRed: ["docs/**/nested"],
				}),
			),
			"forbiddenProductionPathsBeforeRed rejects non-trailing **",
			/unsafe_path|glob|path/i,
		);
		expectReject(
			parseValidation(
				minimalValidationContract({
					forbiddenProductionPathsBeforeRed: ["docs/*"],
				}),
			),
			"forbiddenProductionPathsBeforeRed rejects single-star wildcards",
			/unsafe_path|glob|path/i,
		);
	});

	// ─── 2. Auth-path positive controls + secret leaf negatives ────────────

	test("accepts auth-path positives and denies secret-bearing leaves", async () => {
		const mod = requireContracts(await loadContractsModule());
		const isSafe = requireFn(mod, "isSafeRepoRelativePath", "isSafeRepoRelativePath");
		const parse = requireFn(mod, "parseRoleRequestV1", "parseRoleRequestV1");

		const positives = [
			"lib/auth/index.ts",
			"lib/xai-web-search/auth.ts",
			"docs/auth-model.md",
			"docs/secrets/readme.md",
		] as const;
		const secretLeaves = [
			".envrc",
			".env.local",
			".npmrc",
			"auth.json",
			"auth.json.bak",
			"credentials.json.enc",
			"service-account.json",
			"id_rsa",
			"private.pem",
			"private.pem.bak",
			"docs/.envrc",
			"config/auth.json.bak",
			"keys/private.pem.bak",
			"ops/credentials.json.enc",
		] as const;

		const overDenied = positives.filter((p) => !isSafe(p));
		const underDenied = secretLeaves.filter((p) => isSafe(p));
		expect(
			{ overDenied, underDenied },
			sig(
				`auth-path positive / secret-leaf negative matrix; overDenied=${JSON.stringify(overDenied)} underDenied=${JSON.stringify(underDenied)}`,
			),
		).toEqual({ overDenied: [], underDenied: [] });

		for (const p of positives) {
			if (!isSafe(p)) continue;
			expectAccept(
				parse({
					...minimalRoleRequest(),
					ownedPaths: [p],
					forbiddenPaths: [],
					artifacts: [{ path: p, mediaType: "text/plain" }],
				}),
				`envelope accepts legitimate path ${p}`,
			);
		}
		for (const p of secretLeaves) {
			expectReject(
				parse({
					...minimalRoleRequest(),
					artifacts: [{ path: p, mediaType: "text/plain" }],
				}),
				`artifact secret leaf ${p}`,
				/unsafe_path|secret|path/i,
			);
		}
	});

	// ─── 3. Strict Z-only RFC3339 + pair ordering ──────────────────────────

	test("enforces strict Z RFC3339 timestamps and requestedAt<=decidedAt<expiresAt", async () => {
		const mod = requireContracts(await loadContractsModule());
		const parseReq = requireFn(mod, "parseApprovalRequestV1", "parseApprovalRequestV1");
		const parseDec = requireFn(mod, "parseApprovalDecisionV1", "parseApprovalDecisionV1");
		const checkPair = requireFn(mod, "checkApprovalPairV1", "checkApprovalPairV1");

		expectAccept(
			parseReq(
				minimalApprovalRequest({
					requestedAt: "2099-01-01T12:00:00.000Z",
					expiresAt: "2099-01-01T18:00:00.000Z",
				}),
			),
			"Z millisecond timestamp accept",
		);
		expectAccept(
			parseReq(
				minimalApprovalRequest({
					requestedAt: "2099-01-01T12:00:00Z",
					expiresAt: "2099-01-01T18:00:00Z",
				}),
			),
			"Z whole-second timestamp accept",
		);

		const permissive = [
			"2099-01-01",
			"2099-01-01T12:00:00+00:00",
			"2099-01-01T12:00:00-05:00",
			"2099-01-01T12:00:00.123456789Z",
			"Jan 1, 2099",
			"01/01/2099",
			"2099-01-01 12:00:00Z",
			"2099-02-30T12:00:00.000Z",
			"2099-13-01T12:00:00.000Z",
			"not-a-timestamp",
			"",
		] as const;

		const acceptedPermissive: string[] = [];
		for (const bad of permissive) {
			const reqR = parseReq(
				minimalApprovalRequest({
					requestedAt: bad,
					expiresAt: "2099-01-01T18:00:00.000Z",
				}),
			);
			if (reqR.ok) acceptedPermissive.push(`requestedAt=${JSON.stringify(bad)}`);
			const decR = parseDec(
				minimalApprovalDecision({
					decidedAt: bad,
				}),
			);
			if (decR.ok) acceptedPermissive.push(`decidedAt=${JSON.stringify(bad)}`);
		}

		const req = minimalApprovalRequest({
			requestedAt: "2099-01-01T12:00:00.000Z",
			expiresAt: "2099-01-01T18:00:00.000Z",
		});
		const pairLeaks: string[] = [];
		if (
			checkPair(
				req,
				minimalApprovalDecision({ decidedAt: "2099-01-01T11:00:00.000Z" }),
			).ok
		) {
			pairLeaks.push("decidedAt<requestedAt accepted");
		}
		if (
			checkPair(
				req,
				minimalApprovalDecision({ decidedAt: "2099-01-01T18:00:00.000Z" }),
			).ok
		) {
			pairLeaks.push("decidedAt==expiresAt accepted");
		}
		if (
			checkPair(
				req,
				minimalApprovalDecision({ decidedAt: "2099-01-01T19:00:00.000Z" }),
			).ok
		) {
			pairLeaks.push("decidedAt>expiresAt accepted");
		}

		expect(
			{ acceptedPermissive, pairLeaks },
			sig(
				`strict Z RFC3339 + pair order requestedAt<=decidedAt<expiresAt; acceptedPermissive=${JSON.stringify(acceptedPermissive)} pairLeaks=${JSON.stringify(pairLeaks)}`,
			),
		).toEqual({ acceptedPermissive: [], pairLeaks: [] });

		expectReject(
			parseReq(
				minimalApprovalRequest({
					requestedAt: "2099-01-01",
					expiresAt: "2099-01-01T18:00:00.000Z",
				}),
			),
			"date-only requestedAt issue class",
			/invalid_time|timestamp|time|rfc|format/i,
		);

		expectAccept(
			checkPair(
				req,
				minimalApprovalDecision({
					decidedAt: "2099-01-01T12:00:00.000Z",
				}),
			),
			"requestedAt == decidedAt < expiresAt accept",
		);
		expectAccept(
			checkPair(
				req,
				minimalApprovalDecision({
					decidedAt: "2099-01-01T15:00:00.000Z",
				}),
			),
			"requestedAt < decidedAt < expiresAt accept",
		);
	});

	// ─── 4. Preflight maxObjectKeys + ownKeys proxy ────────────────────────

	test("enforces maxObjectKeys before clone and returns issues on ownKeys failure", async () => {
		const mod = requireContracts(await loadContractsModule());
		const limits = requireExport(mod, "CONTRACT_LIMITS_V1", "CONTRACT_LIMITS_V1") as Record<
			string,
			number
		>;
		const parseRole = requireFn(mod, "parseRoleRequestV1", "parseRoleRequestV1");

		// Direct preflight export required for cardinality oracle.
		const preflightPresent =
			typeof (mod as Record<string, unknown>).preflightUntrustedGraph === "function";

		const maxRaw = limits.maxObjectKeys;
		const maxKeysPublished =
			typeof maxRaw === "number" && Number.isInteger(maxRaw) && maxRaw > 0;
		const maxKeysInRange =
			maxKeysPublished &&
			maxRaw >= MAX_OBJECT_KEYS_FLOOR &&
			maxRaw <= MAX_OBJECT_KEYS_CEILING;

		// ownKeys proxy (via preflight when present, else parse surface).
		const run =
			preflightPresent
				? requirePreflight(mod)
				: (input: unknown) => {
						const parse = requireFn(mod, "parseContractV1", "parseContractV1");
						return parse(input);
					};

		const ownKeysProxy = new Proxy(
			{},
			{
				ownKeys() {
					throw new Error("ownKeys boom");
				},
				getOwnPropertyDescriptor() {
					return { enumerable: true, configurable: true, value: 1 };
				},
				get() {
					return 1;
				},
			},
		);
		let ownKeysThrew: unknown = undefined;
		let proxyResult: ParseResult<unknown> | undefined;
		try {
			proxyResult = run(ownKeysProxy);
		} catch (e) {
			ownKeysThrew = e;
		}

		let plainAtLimitAccepted = false;
		let plainPlusOneBound = false;
		if (maxKeysPublished && preflightPresent) {
			const preflight = requirePreflight(mod);
			const maxKeys = maxRaw;

			// Exactly maxObjectKeys plain data keys — preflight must accept (ok:true).
			const atLimit: Record<string, unknown> = {};
			for (let i = 0; i < maxKeys; i++) {
				atLimit[`k${i}`] = i;
			}
			expect(Object.keys(atLimit).length).toBe(maxKeys);
			const atResult = preflight(atLimit);
			plainAtLimitAccepted = atResult.ok === true;

			// +1 keys → bound_exceeded, not throw.
			const over: Record<string, unknown> = { ...atLimit, extra: true };
			expect(Object.keys(over).length).toBe(maxKeys + 1);
			const overResult = preflight(over);
			plainPlusOneBound =
				overResult.ok === false && /bound_exceeded/i.test(issueBlob(overResult));
		}

		// Minimal valid role request must remain accepted (cardinality must not break envelopes).
		const minimalOk = parseRole(minimalRoleRequest()).ok === true;

		expect(
			{
				preflightPresent,
				maxKeysPublished,
				maxKeysInRange,
				plainAtLimitAccepted,
				plainPlusOneBound,
				minimalOk,
				ownKeysThrew: ownKeysThrew !== undefined,
				ownKeysIssue:
					proxyResult !== undefined &&
					!proxyResult.ok &&
					proxyResult.issues.length > 0,
			},
			sig(
				`maxObjectKeys floor/ceiling + direct preflight plain keys + ownKeys; preflightPresent=${preflightPresent} maxKeysPublished=${maxKeysPublished} maxKeysInRange=${maxKeysInRange} plainAtLimitAccepted=${plainAtLimitAccepted} plainPlusOneBound=${plainPlusOneBound} ownKeysThrew=${ownKeysThrew !== undefined}`,
			),
		).toEqual({
			preflightPresent: true,
			maxKeysPublished: true,
			maxKeysInRange: true,
			plainAtLimitAccepted: true,
			plainPlusOneBound: true,
			minimalOk: true,
			ownKeysThrew: false,
			ownKeysIssue: true,
		});

		if (maxKeysPublished && preflightPresent) {
			const preflight = requirePreflight(mod);
			const over: Record<string, unknown> = {};
			for (let i = 0; i < maxRaw + 1; i++) over[`k${i}`] = true;
			expectReject(
				preflight(over),
				"maxObjectKeys+1 plain object bound_exceeded",
				/bound_exceeded|maxObjectKeys|object keys/i,
			);
		}
		if (proxyResult && ownKeysThrew === undefined) {
			expectReject(
				proxyResult,
				"ownKeys proxy failure returns validation issue",
				/unsafe|ownKeys|proxy|enumerat|object/i,
			);
		}
	});

	// ─── 5. Descriptor / validator parity ──────────────────────────────────

	test("keeps descriptors closed and field-aligned with validators", async () => {
		const mod = requireContracts(await loadContractsModule());
		const descriptors = requireExport(
			mod,
			"CONTRACT_DESCRIPTORS_V1",
			"CONTRACT_DESCRIPTORS_V1",
		) as Record<string, unknown>;
		const parse = requireFn(mod, "parseContractV1", "parseContractV1");

		const kinds = [
			"role-request",
			"role-result",
			"approval-request",
			"approval-decision",
			"validation-contract",
		] as const;

		// Root closed + required present for every kind.
		const rootGaps: string[] = [];
		for (const kind of kinds) {
			if (!(kind in descriptors)) {
				rootGaps.push(`${kind}:missing`);
				continue;
			}
			const d = descriptors[kind] as Schema;
			if (d.additionalProperties !== false) rootGaps.push(`${kind}:open`);
			if (!Array.isArray(d.required) || d.required.length === 0) {
				rootGaps.push(`${kind}:no-required`);
			}
		}
		expect(rootGaps, sig(`root descriptor gaps: ${rootGaps.join(",")}`)).toEqual([]);

		// ── role-request nested ──
		const roleReq = descriptors["role-request"] as Schema;
		const roleReqProps = (roleReq.properties ?? {}) as Record<string, Schema>;
		assertEnumEquals(roleReqProps.role, "role-request.role", ASSURANCE_ROLES_V1);
		assertDescriptorObjectClosed(roleReqProps.budget, "role-request.budget", [
			"maxTokens",
			"maxCostUsd",
			"maxDurationMs",
		]);
		const artifactsSchema = roleReqProps.artifacts as Schema;
		expect(artifactsSchema?.type === "array", sig("artifacts must be array schema")).toBe(true);
		assertDescriptorObjectClosed(artifactsSchema?.items, "role-request.artifacts.items", [
			"path",
			"mediaType",
		]);

		// ── role-result: role enum, closed commands items, redCause, usage union ──
		const roleRes = descriptors["role-result"] as Schema;
		const roleResProps = (roleRes.properties ?? {}) as Record<string, Schema>;
		assertEnumEquals(roleResProps.role, "role-result.role", ASSURANCE_ROLES_V1);
		assertEnumEquals(roleResProps.status, "role-result.status", [
			"completed",
			"blocked",
			"failed",
			"unknown",
		]);

		const commandsSchema = roleResProps.commands as Schema;
		expect(commandsSchema?.type === "array", sig("role-result.commands must be array")).toBe(
			true,
		);
		assertDescriptorObjectClosed(commandsSchema?.items, "role-result.commands.items", [
			"command",
			"exitCode",
			"summary",
		]);

		// redCause: closed with declared properties (expectedTestId required at minimum).
		assertDescriptorObjectClosed(
			roleResProps.redCause,
			"role-result.redCause",
			["expectedTestId", "matchMode"],
			{ allPropsRequired: false },
		);
		const redCauseProps = ((roleResProps.redCause as Schema)?.properties ?? {}) as Record<
			string,
			Schema
		>;
		for (const p of [
			"expectedTestId",
			"expectedFailureSignature",
			"matchMode",
			"reasonCode",
			"cause",
		] as const) {
			expect(
				p in redCauseProps,
				sig(`role-result.redCause.properties missing "${p}"`),
			).toBe(true);
		}

		// usage: union of const "unknown" | closed {inputTokens,outputTokens} via oneOf/anyOf
		// (promised subset). Empty {} is forbidden drift.
		const usageSchema = roleResProps.usage as Schema | undefined;
		expect(
			usageSchema !== undefined &&
				usageSchema !== null &&
				typeof usageSchema === "object" &&
				Object.keys(usageSchema).length > 0,
			sig("role-result.usage must not be empty schema {}"),
		).toBe(true);
		const usageBranches = (usageSchema?.oneOf ?? usageSchema?.anyOf) as unknown[] | undefined;
		expect(
			Array.isArray(usageBranches) && usageBranches.length >= 2,
			sig("role-result.usage must be oneOf/anyOf union (unknown | token object)"),
		).toBe(true);
		const usageHasUnknown = (usageBranches ?? []).some((b) => {
			const s = b as Schema;
			return s.const === "unknown" || (Array.isArray(s.enum) && s.enum.includes("unknown"));
		});
		const usageHasObject = (usageBranches ?? []).some((b) => {
			const s = b as Schema;
			const props = s.properties as Record<string, unknown> | undefined;
			return (
				(s.type === "object" || props !== undefined) &&
				s.additionalProperties === false &&
				props !== undefined &&
				"inputTokens" in props &&
				"outputTokens" in props
			);
		});
		expect(
			usageHasUnknown && usageHasObject,
			sig("usage union must cover const unknown and closed token object"),
		).toBe(true);

		// ── approval-decision humanProvenance closed ──
		const approvalDec = descriptors["approval-decision"] as Schema;
		const approvalDecProps = (approvalDec.properties ?? {}) as Record<string, Schema>;
		assertDescriptorObjectClosed(
			approvalDecProps.humanProvenance,
			"approval-decision.humanProvenance",
			["actorId", "method"],
			{ allPropsRequired: false },
		);
		assertEnumEquals(approvalDecProps.decision, "approval-decision.decision", [
			"approved",
			"rejected",
		]);

		// ── validation-contract nested closed ──
		const vc = descriptors["validation-contract"] as Schema;
		const vcProps = (vc.properties ?? {}) as Record<string, Schema>;
		assertDescriptorObjectClosed(vcProps.coveringGreen, "validation-contract.coveringGreen", [
			"relation",
			"command",
		]);
		assertDescriptorObjectClosed(vcProps.sensitivity, "validation-contract.sensitivity", [
			"description",
		]);
		assertEnumEquals(vcProps.matchMode, "validation-contract.matchMode", [
			"identity",
			"signature",
		]);

		// Required-field parity: every key on minimal fixtures that validators require
		// must appear in descriptor.required (root).
		const fixtures = allMinimalFixtures();
		const requiredParityGaps: string[] = [];
		for (const kind of kinds) {
			const d = descriptors[kind] as Schema;
			const req = new Set(Array.isArray(d.required) ? (d.required as string[]) : []);
			// Core identity fields always required on V1 envelopes.
			for (const core of ["schemaVersion", "kind"] as const) {
				if (!req.has(core)) requiredParityGaps.push(`${kind}.required missing ${core}`);
			}
			// Fixture keys that are always present in minimal valid forms should be required
			// unless optional by design (usage default, redCause optional, humanProvenance optional on reject,
			// expectedFailureSignature optional on identity mode).
			const optionalByDesign = new Set([
				"usage",
				"redCause",
				"humanProvenance",
				"expectedFailureSignature",
			]);
			const fixture = fixtures[kind]!;
			for (const key of Object.keys(fixture)) {
				if (optionalByDesign.has(key)) continue;
				if (!req.has(key)) {
					requiredParityGaps.push(`${kind}.required missing fixture key ${key}`);
				}
			}
		}
		expect(
			requiredParityGaps,
			sig(`required-field parity gaps: ${requiredParityGaps.join("; ")}`),
		).toEqual([]);

		// Minimal fixtures: validator accept + descriptor accept (subset checker).
		for (const kind of kinds) {
			const fixture = fixtures[kind]!;
			const parsed = parse(fixture);
			expectAccept(parsed, `validator accepts minimal ${kind}`);
			const descIssues = validateAgainstDescriptor(descriptors[kind], fixture);
			expect(
				descIssues,
				sig(
					`minimal ${kind} must validate against descriptor; drift: ${descIssues.join("; ")}`,
				),
			).toEqual([]);
		}

		// Representative unknown / nested-invalid fixtures fail validator AND descriptor.
		const unknownRoot = { ...minimalRoleRequest(), unexpectedSmuggle: true };
		expectReject(parse(unknownRoot), "unknown root field", /unknown_field/i);
		const unknownDesc = validateAgainstDescriptor(descriptors["role-request"], unknownRoot);
		expect(
			unknownDesc.some((x) => /additionalProperties|unexpectedSmuggle/i.test(x)),
			sig(`descriptor must reject unknown field, got ${unknownDesc.join("; ")}`),
		).toBe(true);

		const nestedBudget = {
			...minimalRoleRequest(),
			budget: { maxTokens: 1, maxCostUsd: 1, maxDurationMs: 1, extraBudget: 9 },
		};
		expectReject(parse(nestedBudget), "unknown nested budget field", /unknown_field|budget/i);
		const nestedBudgetDesc = validateAgainstDescriptor(
			descriptors["role-request"],
			nestedBudget,
		);
		expect(
			nestedBudgetDesc.some((x) => /budget|additionalProperties|extraBudget/i.test(x)),
			sig(`descriptor must reject nested budget unknown, got ${nestedBudgetDesc.join("; ")}`),
		).toBe(true);

		// Nested-invalid command item.
		const badCommand = minimalRoleResult({
			commands: [{ command: "x", exitCode: 0, summary: "ok", extra: true }],
		});
		expectReject(parse(badCommand), "unknown command item field", /unknown_field|command/i);
		const badCmdDesc = validateAgainstDescriptor(descriptors["role-result"], badCommand);
		expect(
			badCmdDesc.some((x) => /command|additionalProperties|extra/i.test(x)),
			sig(`descriptor must reject command item unknown, got ${badCmdDesc.join("; ")}`),
		).toBe(true);

		// Nested-invalid coveringGreen.
		const badGreen = minimalValidationContract({
			coveringGreen: {
				relation: "exact-focused",
				command: "bun test",
				extraGreen: true,
			},
		});
		expectReject(parse(badGreen), "unknown coveringGreen field", /unknown_field|coveringGreen/i);
		const badGreenDesc = validateAgainstDescriptor(
			descriptors["validation-contract"],
			badGreen,
		);
		expect(
			badGreenDesc.some((x) => /coveringGreen|additionalProperties|extraGreen/i.test(x)),
			sig(`descriptor must reject coveringGreen unknown, got ${badGreenDesc.join("; ")}`),
		).toBe(true);
	});

	// ─── 6. Typed public surface via statement-local declaration extractor ─

	test("exports closed V1 interfaces, ContractIssueCode, and typed parser signatures", async () => {
		requireContracts(await loadContractsModule());

		const indexSrc = readFileSync(join(CONTRACTS_DIR, "index.ts"), "utf8");
		const indexExports = exportedTypeNames(indexSrc);

		const envelopes = [
			"RoleRequestV1",
			"RoleResultV1",
			"ApprovalRequestV1",
			"ApprovalDecisionV1",
			"ValidationContractV1",
		] as const;

		const supporting = [
			"ArtifactRefV1",
			"BudgetV1",
			"CommandClaimV1",
			"RedCauseV1",
			"UsageV1",
			"HumanProvenanceV1",
			"CoveringGreenV1",
			"SensitivityV1",
		] as const;

		// (1) Authoritative envelopes: structural schemaVersion+kind; reject opaque aliases.
		const missingEnvelopes: string[] = [];
		const openEnvelopes: string[] = [];
		const envelopeProblems: Record<string, string[]> = {};
		for (const name of envelopes) {
			const decl =
				findDeclAcrossSources("type", name) ?? findDeclAcrossSources("interface", name);
			if (!decl) {
				missingEnvelopes.push(name);
				continue;
			}
			const problems = envelopeDeclProblems(decl, name);
			if (problems.length > 0) {
				openEnvelopes.push(name);
				envelopeProblems[name] = problems;
			}
		}

		// Supporting: present + non-opaque + >=1 field or closed literal union.
		const missingSupporting: string[] = [];
		const openSupporting: string[] = [];
		const supportingProblems: Record<string, string[]> = {};
		for (const name of supporting) {
			const decl =
				findDeclAcrossSources("type", name) ?? findDeclAcrossSources("interface", name);
			if (!decl) {
				missingSupporting.push(name);
				continue;
			}
			const problems = supportingDeclProblems(decl, name);
			if (problems.length > 0) {
				openSupporting.push(name);
				supportingProblems[name] = problems;
			}
		}

		// (2) ContractIssueCode — leading | / one paren wrap; >=2 string lits; known stable; no wide.
		const issueCodeDecl = findDeclAcrossSources("type", "ContractIssueCode");
		const issueCodeAnalysis = issueCodeDecl
			? analyzeContractIssueCode(issueCodeDecl)
			: { ok: false, reason: "missing" };
		const issueCodeOk = issueCodeAnalysis.ok;

		// ContractIssue.code: ContractIssueCode inside ContractIssue decl.
		const contractIssueDecl =
			findDeclAcrossSources("type", "ContractIssue") ??
			findDeclAcrossSources("interface", "ContractIssue");
		const issueCodeFieldOk =
			!!contractIssueDecl && /code\s*:\s*ContractIssueCode\b/.test(contractIssueDecl);

		// (3) Parser signatures — exact ParseResult<EnvelopeV1>, statement-local.
		const parsers: Array<[string, string]> = [
			["parseRoleRequestV1", "RoleRequestV1"],
			["parseRoleResultV1", "RoleResultV1"],
			["parseApprovalRequestV1", "ApprovalRequestV1"],
			["parseApprovalDecisionV1", "ApprovalDecisionV1"],
			["parseValidationContractV1", "ValidationContractV1"],
		];
		const badParsers: string[] = [];
		for (const [fn, t] of parsers) {
			const decl = findDeclAcrossSources("function", fn);
			if (!decl) {
				badParsers.push(`${fn}:missing`);
				continue;
			}
			const ok =
				new RegExp(
					String.raw`export\s+function\s+${fn}\s*\(\s*input\s*:\s*unknown\s*\)\s*:\s*ParseResult\s*<\s*${t}\s*>`,
				).test(decl.replace(/\s+/g, " ")) && !/ParseResult\s*<\s*unknown\s*>/.test(decl);
			if (!ok) badParsers.push(`${fn}:not ParseResult<${t}>`);
		}

		// index.ts re-exports — via declaration/export extractor (not comment/string hits).
		const missingIndex = [...envelopes, "ContractIssueCode", ...supporting].filter(
			(n) => !indexExports.has(n),
		);

		// ParseResult generic still exported.
		const parseResultDecl = findDeclAcrossSources("type", "ParseResult");
		const parseResultOk =
			!!parseResultDecl &&
			/export\s+type\s+ParseResult\s*<\s*T\s*>/.test(parseResultDecl.replace(/\s+/g, " "));

		// Analyzer self-checks FIRST (always run; independent of production gaps).
		const syntheticOk = [
			`export type ContractIssueCode = "unknown_field" | "bound_exceeded";`,
			`export type ContractIssueCode = | "unknown_field" | "unsafe_path";`,
			`export type ContractIssueCode = ("invalid_type" | "required");`,
			`export type ContractIssueCode = (| "unknown_field" | "bound_exceeded");`,
		];
		for (const s of syntheticOk) {
			expect(
				analyzeContractIssueCode(s).ok,
				sig(`ContractIssueCode analyzer must accept idiomatic ${s}`),
			).toBe(true);
		}
		const syntheticBad = [
			`export type ContractIssueCode = string;`,
			`export type ContractIssueCode = "only_one";`,
			`export type ContractIssueCode = "unknown_field" | string;`,
			`export type ContractIssueCode = SomeAlias | "unknown_field";`,
			`export type ContractIssueCode = object;`,
		];
		for (const s of syntheticBad) {
			expect(
				analyzeContractIssueCode(s).ok,
				sig(`ContractIssueCode analyzer must reject wide/opaque ${s}`),
			).toBe(false);
		}
		expect(
			envelopeDeclProblems(`export type RoleRequestV1 = object;`, "RoleRequestV1").length > 0,
			sig("envelope oracle rejects opaque object alias"),
		).toBe(true);
		expect(
			envelopeDeclProblems(`export type RoleRequestV1 = {};`, "RoleRequestV1").length > 0,
			sig("envelope oracle rejects empty object alias"),
		).toBe(true);
		expect(
			envelopeDeclProblems(`export type RoleRequestV1 = OtherName;`, "RoleRequestV1").length >
				0,
			sig("envelope oracle rejects alias-only name"),
		).toBe(true);
		// Structural positive: schemaVersion + kind required.
		const structuralOk = envelopeDeclProblems(
			`export type RoleRequestV1 = { schemaVersion: 1; kind: "role-request"; taskId: string; };`,
			"RoleRequestV1",
		);
		expect(
			structuralOk,
			sig(`envelope oracle must accept structural schemaVersion+kind; got ${structuralOk.join(",")}`),
		).toEqual([]);
		expect(
			supportingDeclProblems(`export type BudgetV1 = object;`, "BudgetV1").length > 0,
			sig("supporting oracle rejects opaque object"),
		).toBe(true);
		expect(
			supportingDeclProblems(`export type BudgetV1 = {};`, "BudgetV1").length > 0,
			sig("supporting oracle rejects empty object"),
		).toBe(true);
		expect(
			supportingDeclProblems(
				`export type BudgetV1 = { maxTokens: number; maxCostUsd: number; maxDurationMs: number; };`,
				"BudgetV1",
			),
			sig("supporting oracle accepts fieldful object"),
		).toEqual([]);

		// Spot-check: extractor stays statement-local when present.
		if (issueCodeDecl) {
			expect(
				issueCodeDecl.includes("export type ContractIssueCode"),
				sig("ContractIssueCode decl must be statement-local export"),
			).toBe(true);
			const exportTypeCount = (issueCodeDecl.match(/export\s+type\s+/g) ?? []).length;
			expect(
				exportTypeCount,
				sig("ContractIssueCode extractor must not swallow later export type decls"),
			).toBe(1);
		}

		// Production surface batch (causal red on current HEAD).
		expect(
			{
				missingEnvelopes,
				openEnvelopes,
				missingSupporting,
				openSupporting,
				issueCodeOk,
				issueCodeFieldOk,
				badParsers,
				missingIndex,
				parseResultOk,
			},
			sig(
				`typed public surface; missingEnvelopes=${JSON.stringify(missingEnvelopes)} openEnvelopes=${JSON.stringify(openEnvelopes)} envelopeProblems=${JSON.stringify(envelopeProblems)} missingSupporting=${JSON.stringify(missingSupporting)} openSupporting=${JSON.stringify(openSupporting)} supportingProblems=${JSON.stringify(supportingProblems)} issueCodeOk=${issueCodeOk} issueCodeReason=${issueCodeAnalysis.reason} badParsers=${JSON.stringify(badParsers)} missingIndex=${JSON.stringify(missingIndex)}`,
			),
		).toEqual({
			missingEnvelopes: [],
			openEnvelopes: [],
			missingSupporting: [],
			openSupporting: [],
			issueCodeOk: true,
			issueCodeFieldOk: true,
			badParsers: [],
			missingIndex: [],
			parseResultOk: true,
		});
	});
});

// Meta: lock oracle identity strings for ValidationContract wiring.
test("CON-01 review harness > locks primary test id and failure signature", () => {
	expect(CON01_REVIEW_P1_PRIMARY_TEST_ID).toBe(
		"CON-01 review P1 > separates concrete references from validation-only trailing globs",
	);
	expect(CON01_REVIEW_P1_FAILURE_SIGNATURE).toBe(
		"review regression accepted unsafe glob, permissive timestamp, unbounded object, or drifted descriptor/type contract",
	);
});

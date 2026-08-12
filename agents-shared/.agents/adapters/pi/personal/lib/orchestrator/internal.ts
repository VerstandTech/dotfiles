import { CONTRACT_LIMITS_V1, preflightUntrustedGraph } from "../contracts/index.ts";

export type PlainRecord = Record<string, unknown>;
export type PrimitiveName =
	| "assurance_status"
	| "assurance_plan_role"
	| "assurance_spawn_role"
	| "assurance_wait_role"
	| "assurance_record_handoff"
	| "assurance_request_approval";

const STABLE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const SHA = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const FINGERPRINT = /^[0-9a-f]{64}$/;
const CONTROL = /[\u0000-\u001f\u007f]/;

export function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
	if (value === null || typeof value !== "object" || seen.has(value)) return value;
	seen.add(value);
	for (const key of Reflect.ownKeys(value)) {
		const descriptor = Object.getOwnPropertyDescriptor(value, key);
		if (descriptor && "value" in descriptor) deepFreeze(descriptor.value, seen);
	}
	return Object.freeze(value);
}

export function result(
	primitive: PrimitiveName,
	ok: boolean,
	outcome: string,
	code: string,
	extra: PlainRecord = {},
): Readonly<PlainRecord> {
	return deepFreeze({ schemaVersion: 1, primitive, ok, outcome, code, ...extra });
}

export function isPlainRecord(value: unknown): value is PlainRecord {
	return value !== null && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

export function own(value: PlainRecord, key: string): unknown {
	return value[key];
}

export function exactKeys(value: PlainRecord, keys: readonly string[]): boolean {
	const expected = new Set(keys);
	return Object.keys(value).every((key) => expected.has(key)) && keys.every((key) => key in value);
}

export function optionalExactKeys(
	value: PlainRecord,
	required: readonly string[],
	optional: readonly string[] = [],
): boolean {
	const expected = new Set([...required, ...optional]);
	return Object.keys(value).every((key) => expected.has(key)) && required.every((key) => key in value);
}

export function safeInput(input: unknown):
	| { ok: true; value: PlainRecord }
	| { ok: false; code: "ORC01_BOUNDS" | "ORC01_INVALID_INPUT" } {
	const preflight = preflightUntrustedGraph(input);
	if (!preflight.ok) {
		const bounded = preflight.issues.some((issue) => issue.code === "bound_exceeded");
		return { ok: false, code: bounded ? "ORC01_BOUNDS" : "ORC01_INVALID_INPUT" };
	}
	if (!isPlainRecord(preflight.value)) return { ok: false, code: "ORC01_INVALID_INPUT" };
	return { ok: true, value: preflight.value };
}

export function validVersion(value: unknown): value is 1 {
	return value === 1;
}

export function validStableId(value: unknown): value is string {
	return typeof value === "string" && STABLE_ID.test(value);
}

export function validSha(value: unknown): value is string {
	return typeof value === "string" && SHA.test(value);
}

export function validFingerprint(value: unknown): value is string {
	return typeof value === "string" && FINGERPRINT.test(value);
}

export function validAbsolutePath(value: unknown): value is string {
	if (typeof value !== "string" || value.length < 2 || value.length > CONTRACT_LIMITS_V1.maxPathLength) return false;
	if (!value.startsWith("/") || value.startsWith("//") || value.endsWith("/") || value.includes("\\") || CONTROL.test(value)) return false;
	return value.slice(1).split("/").every((segment) => segment.length > 0 && segment !== "." && segment !== "..");
}

export function validBoundedString(value: unknown, max = CONTRACT_LIMITS_V1.maxStringLength): value is string {
	return typeof value === "string" && value.length > 0 && value.length <= max && !CONTROL.test(value);
}

export function validInteger(value: unknown, minimum: number, maximum: number): value is number {
	return typeof value === "number" && Number.isInteger(value) && value >= minimum && value <= maximum;
}

export function safeAdapterRecord(value: unknown): PlainRecord | undefined {
	const normalized = safeInput(value);
	return normalized.ok ? normalized.value : undefined;
}

export async function callAdapter(
	callback: unknown,
	request: Readonly<PlainRecord>,
): Promise<PlainRecord | undefined> {
	if (typeof callback !== "function") return undefined;
	try {
		return safeAdapterRecord(await callback(request));
	} catch {
		return undefined;
	}
}

export function sameStrings(left: unknown, right: unknown): boolean {
	if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
	return left.every((value, index) => typeof value === "string" && value === right[index]);
}

export function pathOwned(path: string, ownedPaths: readonly string[]): boolean {
	return ownedPaths.some((owned) => path === owned || path.startsWith(`${owned}/`));
}

export function publicError(
	primitive: PrimitiveName,
	code: string,
	outcome = "blocked",
	extra: PlainRecord = {},
) {
	return result(primitive, false, outcome, code, extra);
}

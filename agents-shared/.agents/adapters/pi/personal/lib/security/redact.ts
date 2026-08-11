import { Buffer } from "node:buffer";

import { CONTRACT_LIMITS_V1 } from "../contracts/limits.ts";
import { isSafeRepoRelativePath } from "../contracts/path.ts";

export const REDACTION_LIMITS_V1 = Object.freeze({
	maxSerializedBytes: CONTRACT_LIMITS_V1.maxSerializedBytes,
	maxNestingDepth: CONTRACT_LIMITS_V1.maxNestingDepth,
	maxStringLength: CONTRACT_LIMITS_V1.maxStringLength,
	maxArrayLength: CONTRACT_LIMITS_V1.maxArrayLength,
	maxObjectKeys: CONTRACT_LIMITS_V1.maxObjectKeys,
	maxPercentDecodePasses: 2,
	maxBase64DecodePasses: 1,
	minEntropyCandidateLength: 24,
	minEntropyBitsPerCharacter: 4.2,
});

export const REDACTION_MARKERS_V1 = Object.freeze({
	secret: "[REDACTED]",
	encoded: "[REDACTED:encoded]",
	path: "[REDACTED:path]",
	keyPrefix: "[REDACTED_KEY_",
});

export type RedactionRefusalCodeV1 =
	| "accessor"
	| "binary"
	| "cycle"
	| "hostile-object"
	| "max-array"
	| "max-depth"
	| "max-input-bytes"
	| "max-object-keys"
	| "max-output-bytes"
	| "max-string"
	| "unsafe-key"
	| "unsupported-type";

export type RedactedJsonValueV1 =
	| null
	| boolean
	| number
	| string
	| readonly RedactedJsonValueV1[]
	| { readonly [key: string]: RedactedJsonValueV1 };

export type RedactionSuccessV1 = Readonly<{
	ok: true;
	value: RedactedJsonValueV1;
	json: string;
	redactionCount: number;
}>;

export type RedactionRefusalV1 = Readonly<{
	ok: false;
	code: RedactionRefusalCodeV1;
}>;

export type RedactionResultV1 = RedactionSuccessV1 | RedactionRefusalV1;

type WalkContext = Readonly<{
	key?: string;
	pathField?: boolean;
	redactAllLeaves?: boolean;
}>;

type WalkState = {
	active: WeakSet<object>;
	inputBytes: number;
	redactionCount: number;
	reservedKeys: Set<string>;
	nextRedactedKey: number;
};

class RedactionRefusal extends Error {
	readonly code: RedactionRefusalCodeV1;

	constructor(code: RedactionRefusalCodeV1) {
		super(code);
		this.code = code;
	}
}

const UNSAFE_DATA_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const GIT_SHA_RE = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/i;
const SHA256_RE = /^[0-9a-f]{64}$/;
const TOKEN_CANDIDATE_RE = /[A-Za-z0-9+/_=-]{24,}/g;
const LONG_HEX_RE = /\b[0-9A-Fa-f]{32,}\b/g;
const JWT_CANDIDATE_RE = /\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{20,}\b/g;
const PRIVATE_KEY_RE = /-----BEGIN [^-\r\n]*PRIVATE KEY-----[\s\S]*?-----END [^-\r\n]*PRIVATE KEY-----/g;
const URI_USERINFO_RE = /([a-z][a-z0-9+.-]*:\/\/)([^\s/@]*:[^\s/@]+)(@)/gi;
const CREDENTIAL_PATH_RE = /(?<![A-Za-z0-9._-])(?:~?\/)?(?:\.ssh\/id_[A-Za-z0-9._-]+|id_(?:rsa|dsa|ecdsa|ed25519)(?:\.[A-Za-z0-9._-]+)?|\.aws\/credentials|\.npmrc|\.netrc|\.env(?:\.[A-Za-z0-9_-]+)?|\.kube\/config|[^\s"']*service-account(?:-key)?\.json)/gi;
const AUTH_VALUE_RE = /\b(Bearer|Basic)\s+([A-Za-z0-9+/_=.-]+)/gi;
const FLAG_SECRET_RE = /(\s--(?:api[-_]?key|password|secret|token)(?:=|\s+))([^\s"']+)/gi;
const ASSIGNMENT_RE = /(["']?(?:api[-_]?key|access[-_]?token|refresh[-_]?token|client[-_]?secret|private[-_]?key|secret[-_]?access[-_]?key|aws[-_]?secret[-_]?access[-_]?key|secret[-_]?key|password|passwd|passphrase|authorization|credentials?|secret|token)["']?\s*[=:＝：]\s*["']?)([^\s"',;}\]]+)/gi;
const KNOWN_TOKEN_PATTERNS = [
	/\bghp_[A-Za-z0-9]{20,}\b/g,
	/\bgithub_pat_[A-Za-z0-9_]{20,}\b/g,
	/\bglpat-[A-Za-z0-9_-]{20,}\b/g,
	/\bnpm_[A-Za-z0-9_-]{20,}\b/g,
	/\bxox[baprs]-[A-Za-z0-9_-]{20,}\b/g,
	/\bAKIA[A-Z0-9]{16}\b/g,
	/\bAIza[A-Za-z0-9_-]{30,}\b/g,
	/\bsk-[A-Za-z0-9_-]{20,}\b/g,
] as const;

function refuse(code: RedactionRefusalCodeV1): never {
	throw new RedactionRefusal(code);
}

function addInputBytes(state: WalkState, text: string): void {
	state.inputBytes += Buffer.byteLength(text, "utf8");
	if (state.inputBytes > REDACTION_LIMITS_V1.maxSerializedBytes) {
		refuse("max-input-bytes");
	}
}

function splitSemanticKey(key: string): string[] {
	return key
		.replace(/([a-z0-9])([A-Z])/g, "$1_$2")
		.toLowerCase()
		.split(/[^a-z0-9]+/)
		.filter(Boolean);
}

function compactSemanticKey(key: string): string {
	return splitSemanticKey(key).join("");
}

function endsWithSegments(parts: readonly string[], suffix: readonly string[]): boolean {
	if (parts.length < suffix.length) return false;
	return suffix.every((part, index) => parts[parts.length - suffix.length + index] === part);
}

function isSensitiveField(key: string): boolean {
	const parts = splitSemanticKey(key);
	const compact = parts.join("");
	const last = parts.at(-1);
	if (
		[
			"password",
			"passwd",
			"passphrase",
			"secret",
			"token",
			"authorization",
			"cookie",
			"credential",
			"credentials",
		].includes(last ?? "")
	) {
		return true;
	}
	if (
		[
			"apikey",
			"accesstoken",
			"refreshtoken",
			"clientsecret",
			"privatekey",
			"secretkey",
			"secretaccesskey",
			"awssecretaccesskey",
			"accesskeyid",
		].includes(compact)
	) {
		return true;
	}
	return [
		["api", "key"],
		["access", "token"],
		["refresh", "token"],
		["client", "secret"],
		["private", "key"],
		["secret", "key"],
		["secret", "access", "key"],
		["proxy", "authorization"],
		["set", "cookie"],
		["access", "key", "id"],
	].some((suffix) => endsWithSegments(parts, suffix));
}

function isEnvironmentContainer(key: string): boolean {
	const compact = compactSemanticKey(key);
	return compact === "env" || compact === "environment";
}

function isPathField(key: string): boolean {
	const parts = splitSemanticKey(key);
	const compact = parts.join("");
	const last = parts.at(-1);
	return (
		last === "path" ||
		last === "paths" ||
		compact === "cwd" ||
		compact === "evidenceref" ||
		compact === "artifactref"
	);
}

function isUuidField(key: string): boolean {
	const compact = compactSemanticKey(key);
	return compact === "taskid" || compact === "runid" || compact === "sessionid";
}

function isHashField(key: string): "sha256" | "git" | undefined {
	const compact = compactSemanticKey(key);
	if (compact === "sha256" || compact === "digest" || compact.endsWith("sha256")) return "sha256";
	if (compact === "sha" || compact.endsWith("sha")) return "git";
	return undefined;
}

function entropyBitsPerCharacter(value: string): number {
	if (value.length === 0) return 0;
	const counts = new Map<string, number>();
	for (const character of value) counts.set(character, (counts.get(character) ?? 0) + 1);
	let entropy = 0;
	for (const count of counts.values()) {
		const probability = count / value.length;
		entropy -= probability * Math.log2(probability);
	}
	return entropy;
}

function isHighEntropyToken(value: string): boolean {
	const candidate = value.replace(/=+$/g, "");
	if (candidate.length < REDACTION_LIMITS_V1.minEntropyCandidateLength) return false;
	const classes = [/[a-z]/.test(candidate), /[A-Z]/.test(candidate), /[0-9]/.test(candidate), /[^A-Za-z0-9]/.test(candidate)].filter(Boolean).length;
	return classes >= 2 && entropyBitsPerCharacter(candidate) >= REDACTION_LIMITS_V1.minEntropyBitsPerCharacter;
}

function isJwtToken(value: string): boolean {
	const [header, payload, signature, extra] = value.split(".");
	if (extra !== undefined || !header || !payload || !signature) return false;
	try {
		const parsedHeader = JSON.parse(Buffer.from(header, "base64url").toString("utf8"));
		const parsedPayload = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
		return (
			parsedHeader !== null &&
			typeof parsedHeader === "object" &&
			("alg" in parsedHeader || "typ" in parsedHeader) &&
			parsedPayload !== null &&
			typeof parsedPayload === "object"
		);
	} catch {
		return false;
	}
}

function hasJwtToken(value: string): boolean {
	JWT_CANDIDATE_RE.lastIndex = 0;
	for (const match of value.matchAll(JWT_CANDIDATE_RE)) {
		if (isJwtToken(match[0])) {
			JWT_CANDIDATE_RE.lastIndex = 0;
			return true;
		}
	}
	JWT_CANDIDATE_RE.lastIndex = 0;
	return false;
}

function hasLongUntypedHex(value: string): boolean {
	LONG_HEX_RE.lastIndex = 0;
	const matched = LONG_HEX_RE.test(value);
	LONG_HEX_RE.lastIndex = 0;
	return matched;
}

function hasUntypedEntropySecret(value: string): boolean {
	if (hasLongUntypedHex(value)) return true;
	TOKEN_CANDIDATE_RE.lastIndex = 0;
	for (const match of value.matchAll(TOKEN_CANDIDATE_RE)) {
		if (isHighEntropyToken(match[0])) {
			TOKEN_CANDIDATE_RE.lastIndex = 0;
			return true;
		}
	}
	TOKEN_CANDIDATE_RE.lastIndex = 0;
	return false;
}

function hasKnownToken(value: string): boolean {
	if (hasJwtToken(value)) return true;
	return KNOWN_TOKEN_PATTERNS.some((pattern) => {
		pattern.lastIndex = 0;
		const matched = pattern.test(value);
		pattern.lastIndex = 0;
		return matched;
	});
}

function hasCredentialPath(value: string): boolean {
	CREDENTIAL_PATH_RE.lastIndex = 0;
	const matched = CREDENTIAL_PATH_RE.test(value);
	CREDENTIAL_PATH_RE.lastIndex = 0;
	return matched;
}

function hasPlainSecret(value: string): boolean {
	PRIVATE_KEY_RE.lastIndex = 0;
	if (PRIVATE_KEY_RE.test(value)) {
		PRIVATE_KEY_RE.lastIndex = 0;
		return true;
	}
	PRIVATE_KEY_RE.lastIndex = 0;
	if (hasKnownToken(value) || hasCredentialPath(value) || hasLongUntypedHex(value)) return true;
	AUTH_VALUE_RE.lastIndex = 0;
	if (AUTH_VALUE_RE.test(value)) {
		AUTH_VALUE_RE.lastIndex = 0;
		return true;
	}
	AUTH_VALUE_RE.lastIndex = 0;
	FLAG_SECRET_RE.lastIndex = 0;
	if (FLAG_SECRET_RE.test(value)) {
		FLAG_SECRET_RE.lastIndex = 0;
		return true;
	}
	FLAG_SECRET_RE.lastIndex = 0;
	ASSIGNMENT_RE.lastIndex = 0;
	if (ASSIGNMENT_RE.test(value)) {
		ASSIGNMENT_RE.lastIndex = 0;
		return true;
	}
	ASSIGNMENT_RE.lastIndex = 0;
	URI_USERINFO_RE.lastIndex = 0;
	if (URI_USERINFO_RE.test(value)) {
		URI_USERINFO_RE.lastIndex = 0;
		return true;
	}
	URI_USERINFO_RE.lastIndex = 0;
	return hasUntypedEntropySecret(value);
}

type EncodedClassification = "not-encoded" | "safe" | "secret";

function isPrintableDecoded(value: string): boolean {
	if (value.length === 0 || value.includes("\uFFFD") || value.includes("\0")) return false;
	let printable = 0;
	for (const character of value) {
		const code = character.codePointAt(0) ?? 0;
		if (code === 9 || code === 10 || code === 13 || code >= 32) printable += 1;
	}
	return printable / value.length >= 0.9;
}

function classifyPercentEncoding(value: string): EncodedClassification {
	if (!/%[0-9A-Fa-f]{2}/.test(value)) return "not-encoded";
	let current = value;
	let decodedAny = false;
	for (let pass = 0; pass < REDACTION_LIMITS_V1.maxPercentDecodePasses; pass += 1) {
		if (!/%[0-9A-Fa-f]{2}/.test(current)) break;
		try {
			const decoded = decodeURIComponent(current);
			if (decoded === current) break;
			decodedAny = true;
			current = decoded;
			if (hasPlainSecret(current)) return "secret";
		} catch {
			return "not-encoded";
		}
	}
	if (/%[0-9A-Fa-f]{2}/.test(current)) return "secret";
	return decodedAny ? "safe" : "not-encoded";
}

function classifyBase64Encoding(value: string): EncodedClassification {
	const compact = value.replace(/\s+/g, "");
	if (compact.length < 16) return "not-encoded";
	const standard = /^[A-Za-z0-9+/]+={0,2}$/.test(compact) && compact.length % 4 === 0;
	const url = /^[A-Za-z0-9_-]+$/.test(compact);
	if (!standard && !url) return "not-encoded";
	try {
		const bytes = Buffer.from(compact, url && !standard ? "base64url" : "base64");
		if (bytes.length === 0) return "not-encoded";
		const roundTrip = (url && !standard ? bytes.toString("base64url") : bytes.toString("base64")).replace(/=+$/g, "");
		if (roundTrip !== compact.replace(/=+$/g, "")) return "not-encoded";
		const decoded = bytes.toString("utf8");
		if (!isPrintableDecoded(decoded)) return "not-encoded";
		return hasPlainSecret(decoded) ? "secret" : "safe";
	} catch {
		return "not-encoded";
	}
}

function classifyEncoded(value: string): EncodedClassification {
	const percent = classifyPercentEncoding(value);
	if (percent !== "not-encoded") return percent;
	return classifyBase64Encoding(value);
}

function replaceAndCount(
	value: string,
	pattern: RegExp,
	replacer: (...args: string[]) => string,
): { value: string; count: number } {
	let count = 0;
	pattern.lastIndex = 0;
	const replaced = value.replace(pattern, (...args: unknown[]) => {
		const match = String(args[0]);
		const replacement = replacer(...(args.slice(0, -2) as string[]));
		if (replacement !== match) count += 1;
		return replacement;
	});
	pattern.lastIndex = 0;
	return { value: replaced, count };
}

function sanitizePlainString(
	value: string,
	options: Readonly<{ skipEntropy?: boolean }> = {},
): { value: string; count: number } {
	let current = value;
	let count = 0;
	let replacement = replaceAndCount(current, PRIVATE_KEY_RE, () => REDACTION_MARKERS_V1.secret);
	current = replacement.value;
	count += replacement.count;
	replacement = replaceAndCount(current, URI_USERINFO_RE, (_match, prefix, _password, suffix) => `${prefix}${REDACTION_MARKERS_V1.secret}${suffix}`);
	current = replacement.value;
	count += replacement.count;
	replacement = replaceAndCount(current, CREDENTIAL_PATH_RE, () => REDACTION_MARKERS_V1.path);
	current = replacement.value;
	count += replacement.count;
	replacement = replaceAndCount(current, AUTH_VALUE_RE, (_match, scheme) => `${scheme} ${REDACTION_MARKERS_V1.secret}`);
	current = replacement.value;
	count += replacement.count;
	replacement = replaceAndCount(current, FLAG_SECRET_RE, (_match, prefix) => `${prefix}${REDACTION_MARKERS_V1.secret}`);
	current = replacement.value;
	count += replacement.count;
	replacement = replaceAndCount(current, ASSIGNMENT_RE, (_match, prefix) => `${prefix}${REDACTION_MARKERS_V1.secret}`);
	current = replacement.value;
	count += replacement.count;
	for (const pattern of KNOWN_TOKEN_PATTERNS) {
		replacement = replaceAndCount(current, pattern, () => REDACTION_MARKERS_V1.secret);
		current = replacement.value;
		count += replacement.count;
	}
	replacement = replaceAndCount(current, JWT_CANDIDATE_RE, (candidate) =>
		isJwtToken(candidate) ? REDACTION_MARKERS_V1.secret : candidate,
	);
	current = replacement.value;
	count += replacement.count;
	if (!options.skipEntropy) {
		replacement = replaceAndCount(current, LONG_HEX_RE, () => REDACTION_MARKERS_V1.secret);
		current = replacement.value;
		count += replacement.count;
		replacement = replaceAndCount(current, TOKEN_CANDIDATE_RE, (candidate) =>
			isHighEntropyToken(candidate) ? REDACTION_MARKERS_V1.secret : candidate,
		);
		current = replacement.value;
		count += replacement.count;
	}
	return { value: current, count };
}

function stringValue(
	value: string,
	context: WalkContext,
	state: WalkState,
): string {
	if (value.length > REDACTION_LIMITS_V1.maxStringLength) refuse("max-string");
	addInputBytes(state, value);
	if (context.redactAllLeaves || (context.key !== undefined && isSensitiveField(context.key))) {
		state.redactionCount += 1;
		return REDACTION_MARKERS_V1.secret;
	}
	if (context.pathField) {
		if (!isSafeRepoRelativePath(value) || hasCredentialPath(value)) {
			state.redactionCount += 1;
			return REDACTION_MARKERS_V1.path;
		}
		if (classifyEncoded(value) === "secret") {
			state.redactionCount += 1;
			return REDACTION_MARKERS_V1.path;
		}
		const sanitizedPath = sanitizePlainString(value, { skipEntropy: true });
		if (sanitizedPath.count > 0) {
			state.redactionCount += 1;
			return REDACTION_MARKERS_V1.path;
		}
		return value;
	}
	if (context.key !== undefined) {
		if (isUuidField(context.key) && UUID_RE.test(value)) return value;
		const hashKind = isHashField(context.key);
		if (hashKind === "sha256" && SHA256_RE.test(value)) return value;
		if (hashKind === "git" && GIT_SHA_RE.test(value)) return value;
	}
	const encoded = classifyEncoded(value);
	if (encoded === "secret") {
		state.redactionCount += 1;
		return REDACTION_MARKERS_V1.encoded;
	}
	if (encoded === "safe") {
		if (hasUntypedEntropySecret(value)) {
			state.redactionCount += 1;
			return REDACTION_MARKERS_V1.secret;
		}
		return value;
	}
	const sanitized = sanitizePlainString(value);
	state.redactionCount += sanitized.count;
	return sanitized.value;
}

function chooseRedactedKey(state: WalkState): string {
	while (true) {
		const candidate = `${REDACTION_MARKERS_V1.keyPrefix}${state.nextRedactedKey}]`;
		state.nextRedactedKey += 1;
		if (!state.reservedKeys.has(candidate)) {
			state.reservedKeys.add(candidate);
			return candidate;
		}
	}
}

function compareKeys(left: string, right: string): number {
	return left < right ? -1 : left > right ? 1 : 0;
}

function shouldRedactObjectKey(key: string): boolean {
	if (hasPlainSecret(key)) return true;
	return classifyEncoded(key) === "secret";
}

function primitiveLeafMarker(context: WalkContext, state: WalkState): string | undefined {
	if (!context.redactAllLeaves) return undefined;
	state.redactionCount += 1;
	return REDACTION_MARKERS_V1.secret;
}

function validateSensitiveValue(
	value: unknown,
	depth: number,
	state: WalkState,
): string {
	const validationState: WalkState = {
		active: state.active,
		inputBytes: state.inputBytes,
		redactionCount: 0,
		reservedKeys: new Set(state.reservedKeys),
		nextRedactedKey: state.nextRedactedKey,
	};
	walk(value, { redactAllLeaves: true }, depth, validationState);
	state.inputBytes = validationState.inputBytes;
	state.redactionCount += 1;
	return REDACTION_MARKERS_V1.secret;
}

function walk(
	value: unknown,
	context: WalkContext,
	depth: number,
	state: WalkState,
): RedactedJsonValueV1 {
	if (depth > REDACTION_LIMITS_V1.maxNestingDepth) refuse("max-depth");
	if (value === null) return primitiveLeafMarker(context, state) ?? null;
	if (typeof value === "string") return stringValue(value, context, state);
	if (typeof value === "boolean") {
		addInputBytes(state, value ? "true" : "false");
		return primitiveLeafMarker(context, state) ?? value;
	}
	if (typeof value === "number") {
		if (!Number.isFinite(value)) refuse("unsupported-type");
		addInputBytes(state, String(value));
		return primitiveLeafMarker(context, state) ?? value;
	}
	if (typeof value !== "object") refuse("unsupported-type");

	if (
		value instanceof ArrayBuffer ||
		(typeof SharedArrayBuffer !== "undefined" && value instanceof SharedArrayBuffer) ||
		ArrayBuffer.isView(value)
	) {
		refuse("binary");
	}

	const object = value as object;
	if (state.active.has(object)) refuse("cycle");
	state.active.add(object);
	try {
		if (Array.isArray(value)) {
			let arrayPrototype: object | null;
			try {
				arrayPrototype = Object.getPrototypeOf(value);
			} catch {
				refuse("hostile-object");
			}
			if (arrayPrototype !== Array.prototype) refuse("unsupported-type");
			if (value.length > REDACTION_LIMITS_V1.maxArrayLength) refuse("max-array");
			const output = value.map((item) => walk(item, context, depth + 1, state));
			return output;
		}

		let prototype: object | null;
		try {
			prototype = Object.getPrototypeOf(value);
		} catch {
			refuse("hostile-object");
		}
		if (prototype !== Object.prototype && prototype !== null) refuse("unsupported-type");

		let keys: (string | symbol)[];
		try {
			keys = Reflect.ownKeys(value);
		} catch {
			refuse("hostile-object");
		}
		const properties: Array<{ key: string; value: unknown }> = [];
		for (const rawKey of keys) {
			let descriptor: PropertyDescriptor | undefined;
			try {
				descriptor = Object.getOwnPropertyDescriptor(value, rawKey);
			} catch {
				refuse("hostile-object");
			}
			if (!descriptor?.enumerable) continue;
			if (typeof rawKey !== "string") refuse("unsupported-type");
			if (!("value" in descriptor) || descriptor.get !== undefined || descriptor.set !== undefined) {
				refuse("accessor");
			}
			properties.push({ key: rawKey, value: descriptor.value });
		}
		if (properties.length > REDACTION_LIMITS_V1.maxObjectKeys) refuse("max-object-keys");
		properties.sort((left, right) => compareKeys(left.key, right.key));
		for (const property of properties) {
			if (UNSAFE_DATA_KEYS.has(property.key)) refuse("unsafe-key");
			if (property.key.length > REDACTION_LIMITS_V1.maxStringLength) refuse("max-string");
			addInputBytes(state, property.key);
			state.reservedKeys.add(property.key);
		}

		const entries: Array<[string, RedactedJsonValueV1]> = [];
		for (const property of properties) {
			let outputKey = property.key;
			if (!isSensitiveField(property.key) && shouldRedactObjectKey(property.key)) {
				outputKey = chooseRedactedKey(state);
				state.redactionCount += 1;
			}
			const childContext: WalkContext = {
				key: property.key,
				pathField: isPathField(property.key),
				redactAllLeaves: context.redactAllLeaves || isEnvironmentContainer(property.key),
			};
			const child = isSensitiveField(property.key)
				? validateSensitiveValue(property.value, depth + 1, state)
				: walk(property.value, childContext, depth + 1, state);
			entries.push([outputKey, child]);
		}
		entries.sort(([left], [right]) => compareKeys(left, right));
		const output: Record<string, RedactedJsonValueV1> = {};
		for (const [key, child] of entries) output[key] = child;
		return output;
	} finally {
		state.active.delete(object);
	}
}

function deepFreeze(value: RedactedJsonValueV1): RedactedJsonValueV1 {
	if (value !== null && typeof value === "object") {
		if (Array.isArray(value)) {
			for (const child of value) deepFreeze(child);
		} else {
			for (const child of Object.values(value)) deepFreeze(child);
		}
		Object.freeze(value);
	}
	return value;
}

export function redactForPersistence(input: unknown): RedactionResultV1 {
	try {
		const state: WalkState = {
			active: new WeakSet(),
			inputBytes: 0,
			redactionCount: 0,
			reservedKeys: new Set(),
			nextRedactedKey: 1,
		};
		const value = walk(input, {}, 0, state);
		const json = JSON.stringify(value);
		if (Buffer.byteLength(json, "utf8") > REDACTION_LIMITS_V1.maxSerializedBytes) {
			refuse("max-output-bytes");
		}
		deepFreeze(value);
		return Object.freeze({
			ok: true,
			value,
			json,
			redactionCount: state.redactionCount,
		});
	} catch (error) {
		const code = error instanceof RedactionRefusal ? error.code : "hostile-object";
		return Object.freeze({ ok: false, code });
	}
}

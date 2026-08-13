import { createHash } from "node:crypto";
import { CONTRACT_LIMITS_V1 } from "../contracts/limits.ts";
import { redactForPersistence } from "./redact.ts";
import { isSecretLeafBasenameV1 } from "./secret-leaf.ts";

export const SECURITY_POLICY_LIMITS_V1 = Object.freeze({
	maxSerializedBytes: CONTRACT_LIMITS_V1.maxSerializedBytes,
	maxNestingDepth: CONTRACT_LIMITS_V1.maxNestingDepth,
	maxStringLength: CONTRACT_LIMITS_V1.maxStringLength,
	maxArrayLength: CONTRACT_LIMITS_V1.maxArrayLength,
	maxObjectKeys: CONTRACT_LIMITS_V1.maxObjectKeys,
	maxPathLength: CONTRACT_LIMITS_V1.maxPathLength,
	maxArgv: 64,
	maxEnvironmentNameLength: 128,
	maxDomains: 64,
	maxCommands: 64,
} as const);

export const SECURITY_RUNTIME_MATRIX_V1 = deepFreeze({
	"fleet-child": {
		roles: ["fleet-reviewer", "fleet-researcher", "fleet-ux"],
		rawNetwork: false,
	},
	"herdr-pi-worker": { rawNetwork: false },
	"gate-command": { rawNetwork: false },
	"web-tool": { rawNetwork: false, providerEgress: true },
} as const);

const PROFILES = ["interactive", "strict", "overnight"] as const;
const PROVIDERS = ["sandbox-runtime", "gondolin"] as const;
const PLATFORMS = ["darwin", "linux"] as const;
const RUNTIME_KINDS = ["fleet-child", "herdr-pi-worker", "gate-command", "web-tool"] as const;
const SLOT_ORDER = ["secret", "sast", "sca", "license"] as const;
const GATE_STATUSES = ["successful", "failed", "timeout", "aborted", "unavailable"] as const;
const SAFE_ENVIRONMENT_KEYS = new Set(["HOME", "LANG", "LC_ALL", "LC_CTYPE", "PATH", "TERM", "TMPDIR", "TZ"]);
const FORBIDDEN_ENVIRONMENT_KEYS = new Set([
	"BASH_ENV",
	"ENV",
	"LD_PRELOAD",
	"DYLD_INSERT_LIBRARIES",
	"NODE_OPTIONS",
	"PYTHONPATH",
	"PYTHONSTARTUP",
	"PERL5OPT",
	"RUBYOPT",
	"GIT_ASKPASS",
	"SSH_ASKPASS",
]);
const SECRET_ENVIRONMENT_RE = /(?:API[_-]?KEY|ACCESS[_-]?TOKEN|AUTH|BEARER|COOKIE|CREDENTIAL|OAUTH|PASS(?:WORD)?|PRIVATE[_-]?KEY|SECRET|SESSION|TOKEN)/i;
const SAFE_ID_RE = /^[a-z][a-z0-9_-]{0,63}$/;
const HASH_RE = /^[a-f0-9]{64}$/;
const ENVIRONMENT_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]{0,127}$/;
const DOMAIN_RE = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(?:\.(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?))*$/;
const SHELLS = new Set(["sh", "bash", "zsh", "dash", "fish", "ksh", "ash", "csh", "tcsh"]);
const INDIRECT_EXECUTORS = new Set([
	"env", "xargs", "nohup", "command", "nice", "timeout", "gtimeout", "time", "stdbuf",
	"script", "setsid", "chroot", "doas", "sudo", "su", "runuser", "npx", "bunx", "busybox",
	"ionice", "unshare", "nsenter", "parallel", "strace", "gdb", "lldb", "rlwrap", "systemd-run",
	"watch", "capsh",
]);
const UNSAFE_FILE_KINDS = new Set(["socket", "fifo", "device", "block-device", "character-device", "unknown"]);
const SECRET_BASENAMES = new Set([
	".npmrc", ".yarnrc", ".yarnrc.yml", ".pypirc", ".netrc", ".htpasswd", "credentials", "credentials.json",
	"auth.json", "hosts.yml", "id_rsa", "id_dsa", "id_ecdsa", "id_ed25519",
	"known_hosts.old", "secrets.json", "service-account.json",
]);
const SECRET_SEGMENTS = new Set([".ssh", ".aws", ".gnupg", ".kube", ".docker"]);
const PROTECTED_WRITE_BASENAMES = new Set(["agents.md", "claude.md"]);
const PROTECTED_WRITE_SEGMENTS = new Set([".git", ".cursor", ".codex"]);
const OPAQUE_CAPABILITIES = new WeakMap<object, SandboxState>();
const SECURITY_DECISIONS = new WeakMap<object, DecisionState>();
const GATE_EVIDENCE = new WeakMap<object, GateEvidenceState>();

export type TrustProfileV1 = (typeof PROFILES)[number];
export type SecurityRuntimeKindV1 = (typeof RUNTIME_KINDS)[number];
export type SecurityGateSlotV1 = (typeof SLOT_ORDER)[number];
export type SecurityRefusalV1 = Readonly<{ ok: false; code: string }>;

type PlainRecord = Record<string, unknown>;
type SandboxState = {
	active: boolean;
	provider: (typeof PROVIDERS)[number];
	sessionId: string;
	policyFingerprint: string;
	worktreeRoot: string;
	sessionTempRoot: string;
	homeRoot: string;
	fingerprint: string;
	allowedCommands: readonly (readonly string[])[];
	allowedDomains: readonly string[];
	allowedPorts: readonly number[];
	operatorRequestedPaths: readonly string[];
};
type DecisionState = {
	profile: TrustProfileV1;
	runtimeKey: string;
	action: string;
};
type GateEvidenceState = {
	candidateSha: string;
	inventoryFingerprint: string;
	requiredSlots: readonly SecurityGateSlotV1[];
};

type ValidationState = {
	seen: Set<object>;
	bytes: number;
};

function refusal(code: string): SecurityRefusalV1 {
	return Object.freeze({ ok: false, code });
}

function deepFreeze<T>(value: T, seen = new Set<object>()): T {
	if (value === null || typeof value !== "object" || seen.has(value as object)) return value;
	seen.add(value as object);
	for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child, seen);
	return Object.freeze(value);
}

function plainRecord(value: unknown): value is PlainRecord {
	if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
	try {
		return Object.getPrototypeOf(value) === Object.prototype;
	} catch {
		return false;
	}
}

function ownData(record: PlainRecord, key: string): { present: boolean; value?: unknown } | undefined {
	try {
		const descriptor = Object.getOwnPropertyDescriptor(record, key);
		if (!descriptor) return { present: false };
		if (!("value" in descriptor) || !descriptor.enumerable) return undefined;
		return { present: true, value: descriptor.value };
	} catch {
		return undefined;
	}
}

function recordKeys(record: PlainRecord): string[] | undefined {
	try {
		const keys = Reflect.ownKeys(record);
		if (keys.some((key) => typeof key !== "string")) return undefined;
		const strings = keys as string[];
		for (const key of strings) {
			const descriptor = Object.getOwnPropertyDescriptor(record, key);
			if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) return undefined;
		}
		return strings;
	} catch {
		return undefined;
	}
}

function strictRecord(value: unknown, allowed: readonly string[]): PlainRecord | undefined {
	if (!plainRecord(value)) return undefined;
	const keys = recordKeys(value);
	if (!keys || keys.length > SECURITY_POLICY_LIMITS_V1.maxObjectKeys) return undefined;
	const allowedSet = new Set(allowed);
	if (keys.some((key) => !allowedSet.has(key))) return undefined;
	return value;
}

function read(record: PlainRecord, key: string): unknown {
	const descriptor = ownData(record, key);
	return descriptor?.present ? descriptor.value : undefined;
}

function byteLength(value: string): number {
	return new TextEncoder().encode(value).byteLength;
}

function boundedPlain(value: unknown, depth = 0, state: ValidationState = { seen: new Set(), bytes: 0 }): boolean {
	if (depth > SECURITY_POLICY_LIMITS_V1.maxNestingDepth) return false;
	if (value === null || typeof value === "boolean") {
		state.bytes += 4;
		return state.bytes <= SECURITY_POLICY_LIMITS_V1.maxSerializedBytes;
	}
	if (typeof value === "string") {
		if (value.length > SECURITY_POLICY_LIMITS_V1.maxStringLength) return false;
		state.bytes += byteLength(value);
		return state.bytes <= SECURITY_POLICY_LIMITS_V1.maxSerializedBytes;
	}
	if (typeof value === "number") return Number.isFinite(value);
	if (typeof value !== "object") return false;
	if (state.seen.has(value)) return false;
	state.seen.add(value);
	if (Array.isArray(value)) {
		try {
			if (Object.getPrototypeOf(value) !== Array.prototype || value.length > SECURITY_POLICY_LIMITS_V1.maxArrayLength) return false;
			const keys = Reflect.ownKeys(value);
			if (keys.some((key) => typeof key !== "string")) return false;
			for (let index = 0; index < value.length; index += 1) {
				const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
				if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) return false;
				if (!boundedPlain(descriptor.value, depth + 1, state)) return false;
			}
			return keys.every((key) => key === "length" || /^(0|[1-9][0-9]*)$/.test(key as string));
		} catch {
			return false;
		}
	}
	const record = strictRecord(value, recordKeys(value as PlainRecord) ?? []);
	if (!record) return false;
	for (const key of recordKeys(record) ?? []) {
		state.bytes += byteLength(key);
		if (state.bytes > SECURITY_POLICY_LIMITS_V1.maxSerializedBytes) return false;
		const descriptor = ownData(record, key);
		if (!descriptor?.present || !boundedPlain(descriptor.value, depth + 1, state)) return false;
	}
	return true;
}

function isProfile(value: unknown): value is TrustProfileV1 {
	return typeof value === "string" && (PROFILES as readonly string[]).includes(value);
}

function isSafeHash(value: unknown): value is string {
	return typeof value === "string" && HASH_RE.test(value);
}

function isSafeId(value: unknown): value is string {
	return typeof value === "string" && SAFE_ID_RE.test(value);
}

function pathSegments(path: string): string[] {
	return path.split("/").filter(Boolean);
}

function validAbsolutePath(value: unknown): value is string {
	if (typeof value !== "string" || value.length === 0 || value.length > SECURITY_POLICY_LIMITS_V1.maxPathLength) return false;
	if (!value.startsWith("/") || value.includes("\\") || /[\0-\x1f\x7f\u2044\u2215\uff0f]/.test(value) || value.includes("//")) return false;
	const segments = pathSegments(value);
	return segments.every((segment) => segment !== "." && segment !== ".." && segment.length > 0);
}

function within(root: string, path: string): boolean {
	return path === root || path.startsWith(`${root}/`);
}

function lowerSegments(path: string): string[] {
	return pathSegments(path).map((segment) => segment.toLowerCase());
}

function isSecretPath(path: string, homeRoot: string): boolean {
	const segments = lowerSegments(path);
	const basename = segments.at(-1) ?? "";
	if (SECRET_BASENAMES.has(basename) || isSecretLeafBasenameV1(basename)) return true;
	if (segments.some((segment) => SECRET_SEGMENTS.has(segment))) return true;
	if (segments.includes("private") && /key|credential|secret/.test(basename)) return true;
	if (within(homeRoot, path)) {
		if (segments.includes(".config") && (segments.includes("gh") || segments.includes("gcloud"))) return true;
		if (segments.includes(".pi") && /auth|credential|token|secret/.test(basename)) return true;
	}
	return /(?:^|[-_.])(credential|private[-_.]?key|secret)(?:[-_.]|$)/i.test(basename);
}

function isProtectedWrite(path: string, homeRoot: string): boolean {
	if (isSecretPath(path, homeRoot)) return true;
	const segments = lowerSegments(path);
	const basename = segments.at(-1) ?? "";
	if (segments.some((segment) => PROTECTED_WRITE_SEGMENTS.has(segment))) return true;
	if (PROTECTED_WRITE_BASENAMES.has(basename)) return true;
	if (segments.includes(".pi") && /(?:approval|decision|worktree-board)/.test(basename)) return true;
	return false;
}

function denseStringArray(value: unknown, max: number): readonly string[] | undefined {
	if (!Array.isArray(value)) return undefined;
	try {
		if (Object.getPrototypeOf(value) !== Array.prototype || value.length > max) return undefined;
		const keys = Reflect.ownKeys(value);
		if (keys.some((key) => typeof key !== "string" || (key !== "length" && !/^(0|[1-9][0-9]*)$/.test(key)))) return undefined;
		const output: string[] = [];
		for (let index = 0; index < value.length; index += 1) {
			const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
			if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) return undefined;
			if (typeof descriptor.value !== "string" || descriptor.value.length === 0 || descriptor.value.length > SECURITY_POLICY_LIMITS_V1.maxStringLength || /[\0\r\n]/.test(descriptor.value)) return undefined;
			output.push(descriptor.value);
		}
		return Object.freeze(output);
	} catch {
		return undefined;
	}
}

function denseNumberArray(value: unknown, max: number): readonly number[] | undefined {
	if (!Array.isArray(value)) return undefined;
	try {
		if (Object.getPrototypeOf(value) !== Array.prototype || value.length > max) return undefined;
		const output: number[] = [];
		for (let index = 0; index < value.length; index += 1) {
			const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
			if (!descriptor || !("value" in descriptor) || !descriptor.enumerable || !Number.isInteger(descriptor.value)) return undefined;
			output.push(descriptor.value as number);
		}
		return Object.freeze(output);
	} catch {
		return undefined;
	}
}

function unique<T>(values: readonly T[]): boolean {
	return new Set(values).size === values.length;
}

function canonicalJson(value: unknown): string {
	if (value === null || typeof value !== "object") return JSON.stringify(value);
	if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
	const record = value as Record<string, unknown>;
	return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
}

function fingerprint(value: unknown): string {
	return createHash("sha256").update(canonicalJson(value), "utf8").digest("hex");
}

function normalizeRuntime(value: unknown): { key: string; value: Readonly<PlainRecord> } | undefined {
	const record = strictRecord(value, ["kind", "role"]);
	if (!record) return undefined;
	const kind = read(record, "kind");
	if (typeof kind !== "string" || !(RUNTIME_KINDS as readonly string[]).includes(kind)) return undefined;
	const role = read(record, "role");
	if (kind === "fleet-child") {
		if (typeof role !== "string" || !(SECURITY_RUNTIME_MATRIX_V1["fleet-child"].roles as readonly string[]).includes(role)) return undefined;
		return { key: `${kind}:${role}`, value: deepFreeze({ kind, role }) };
	}
	if (role !== undefined) return undefined;
	return { key: kind, value: deepFreeze({ kind }) };
}

function capabilityState(value: unknown): { state?: SandboxState; code?: string } {
	if (value === null || typeof value !== "object") return { code: "sandbox-required" };
	const state = OPAQUE_CAPABILITIES.get(value);
	if (!state) return { code: "sandbox-required" };
	if (!state.active) return { code: "sandbox-capability-stale" };
	return { state };
}

function permit(
	profile: TrustProfileV1,
	runtime: { key: string; value: Readonly<PlainRecord> },
	action: string,
	policyFingerprint: string,
	candidateSha: string,
): Readonly<PlainRecord> {
	const visible = deepFreeze({
		ok: true,
		decision: "permit",
		profile,
		runtime: runtime.value,
		action,
		trust: profile === "interactive" ? "interactive-untrusted" : profile,
		policyFingerprint,
		candidateSha,
		decisionFingerprint: fingerprint({ profile, runtime: runtime.key, action, policyFingerprint, candidateSha }),
	});
	SECURITY_DECISIONS.set(visible, { profile, runtimeKey: runtime.key, action });
	return visible;
}

export function resolveEffectiveTrustProfileV1(input: unknown): Readonly<PlainRecord> | SecurityRefusalV1 {
	try {
		const record = strictRecord(input, ["machineProfile", "sessionProfile", "projectProfile"]);
		if (!record || !boundedPlain(input)) return refusal("invalid-profile-authority");
		const machine = read(record, "machineProfile");
		const session = read(record, "sessionProfile");
		const project = read(record, "projectProfile");
		for (const value of [machine, session, project]) {
			if (value !== undefined && !isProfile(value)) return refusal("unsupported-profile");
		}
		if (project === "overnight") return refusal("invalid-profile-authority");
		const rank: Record<TrustProfileV1, number> = { interactive: 0, strict: 1, overnight: 2 };
		let profile: TrustProfileV1 = "interactive";
		for (const value of [machine, session, project]) {
			if (isProfile(value) && rank[value] > rank[profile]) profile = value;
		}
		return deepFreeze({ ok: true, profile });
	} catch {
		return refusal("invalid-profile-authority");
	}
}

export function createSandboxCapabilityV1(input: unknown): Readonly<PlainRecord> | SecurityRefusalV1 {
	try {
		const record = strictRecord(input, [
			"provider", "platform", "sessionId", "policyFingerprint", "worktreeRoot", "sessionTempRoot", "homeRoot",
			"initialized", "active", "features", "allowedCommands", "allowedDomains", "allowedPorts",
		]);
		if (!record || !boundedPlain(input)) return refusal("invalid-sandbox-observation");
		const provider = read(record, "provider");
		const platform = read(record, "platform");
		if (typeof provider !== "string" || !(PROVIDERS as readonly string[]).includes(provider)) return refusal("sandbox-unsupported");
		if (typeof platform !== "string" || !(PLATFORMS as readonly string[]).includes(platform)) return refusal("sandbox-unsupported");
		const initialized = read(record, "initialized");
		const active = read(record, "active");
		if (typeof initialized !== "boolean" || typeof active !== "boolean") return refusal("invalid-sandbox-observation");
		if (!initialized && active) return refusal("invalid-sandbox-observation");
		if (!initialized || !active) return refusal("sandbox-initialization-failed");
		const sessionId = read(record, "sessionId");
		const policyFingerprint = read(record, "policyFingerprint");
		const worktreeRoot = read(record, "worktreeRoot");
		const sessionTempRoot = read(record, "sessionTempRoot");
		const homeRoot = read(record, "homeRoot");
		if (!isSafeId(sessionId) || !isSafeHash(policyFingerprint) || !validAbsolutePath(worktreeRoot) || !validAbsolutePath(sessionTempRoot) || !validAbsolutePath(homeRoot)) return refusal("invalid-sandbox-observation");
		const tempSegments = pathSegments(sessionTempRoot);
		const validSessionTemp =
			(within("/tmp", sessionTempRoot) && tempSegments.length >= 3) ||
			(within("/private/tmp", sessionTempRoot) && tempSegments.length >= 4);
		if (!validSessionTemp || worktreeRoot === "/" || worktreeRoot === homeRoot) return refusal("invalid-sandbox-observation");
		const features = strictRecord(read(record, "features"), [
			"processTree", "denyRead", "allowWrite", "denyNetwork", "redirectRecheck", "dnsRebindingDefense", "lifecycleReset", "workspaceMountPolicy",
		]);
		if (!features) return refusal("invalid-sandbox-observation");
		for (const key of ["processTree", "denyRead", "allowWrite", "denyNetwork", "redirectRecheck", "dnsRebindingDefense", "lifecycleReset", "workspaceMountPolicy"]) {
			if (read(features, key) !== true) return refusal("sandbox-capability-incomplete");
		}
		const commandsInput = read(record, "allowedCommands");
		if (!Array.isArray(commandsInput) || commandsInput.length > SECURITY_POLICY_LIMITS_V1.maxCommands) return refusal("invalid-sandbox-observation");
		const commands: (readonly string[])[] = [];
		for (let index = 0; index < commandsInput.length; index += 1) {
			const descriptor = Object.getOwnPropertyDescriptor(commandsInput, String(index));
			const argv = descriptor && "value" in descriptor ? denseStringArray(descriptor.value, SECURITY_POLICY_LIMITS_V1.maxArgv) : undefined;
			if (!argv) return refusal("invalid-sandbox-observation");
			commands.push(argv);
		}
		const domains = denseStringArray(read(record, "allowedDomains"), SECURITY_POLICY_LIMITS_V1.maxDomains);
		const ports = denseNumberArray(read(record, "allowedPorts"), SECURITY_POLICY_LIMITS_V1.maxDomains);
		if (!domains || !ports || !unique(domains) || !unique(ports)) return refusal("invalid-sandbox-observation");
		const normalizedDomains = domains.map((domain) => normalizeDomain(domain)).filter((domain): domain is string => domain !== undefined);
		const commandKeys = commands.map((argv) => canonicalJson(argv));
		if (
			normalizedDomains.length !== domains.length ||
			!unique(normalizedDomains) ||
			!unique(commandKeys) ||
			ports.some((port) => port < 1 || port > 65_535)
		) return refusal("invalid-sandbox-observation");
		const normalized = {
			provider,
			platform,
			sessionId,
			policyFingerprint,
			worktreeRoot,
			sessionTempRoot,
			homeRoot,
			features: Object.fromEntries(Object.keys(features).sort().map((key) => [key, read(features, key)])),
			allowedCommands: commands,
			allowedDomains: [...normalizedDomains].sort(),
			allowedPorts: [...ports].sort((a, b) => a - b),
		};
		const capability = Object.freeze({});
		const digest = fingerprint(normalized);
		OPAQUE_CAPABILITIES.set(capability, {
			active: true,
			provider: provider as SandboxState["provider"],
			sessionId,
			policyFingerprint,
			worktreeRoot,
			sessionTempRoot,
			homeRoot,
			fingerprint: digest,
			allowedCommands: deepFreeze(commands),
			allowedDomains: Object.freeze([...normalizedDomains].sort()),
			allowedPorts: Object.freeze([...ports].sort((a, b) => a - b)),
			operatorRequestedPaths: Object.freeze([]),
		});
		return deepFreeze({ ok: true, provider, fingerprint: digest, capability });
	} catch {
		return refusal("invalid-sandbox-observation");
	}
}

function isPathBreakerV1(ch: string): boolean {
	return ch <= " " || "\"'`<>()[]{},;".includes(ch);
}

function extractOperatorRequestedPathsV1(text: string, homeRoot: string): readonly string[] {
	if (text.length === 0 || text.length > SECURITY_POLICY_LIMITS_V1.maxSerializedBytes) return Object.freeze([]);
	const found: string[] = [];
	let index = 0;
	while (index < text.length) {
		const ch = text[index];
		if (ch === "/" || (ch === "~" && text[index + 1] === "/")) {
			let end = index + 1;
			while (end < text.length && !isPathBreakerV1(text[end])) end += 1;
			const raw = text.slice(index, end);
			const expanded = raw.startsWith("~/") ? `${homeRoot}${raw.slice(1)}` : raw;
			if (validAbsolutePath(expanded) && !found.includes(expanded)) found.push(expanded);
			index = end;
			continue;
		}
		index += 1;
	}
	return Object.freeze(found);
}

export function captureOperatorRequestedPathsV1(capability: unknown, text: unknown): Readonly<PlainRecord> | SecurityRefusalV1 {
	const current = capabilityState(capability);
	if (!current.state) return refusal(current.code ?? "sandbox-required");
	if (typeof text !== "string") return refusal("invalid-policy-input");
	current.state.operatorRequestedPaths = extractOperatorRequestedPathsV1(text, current.state.homeRoot);
	return deepFreeze({ ok: true, count: current.state.operatorRequestedPaths.length });
}

export function disposeSandboxCapabilityV1(value: unknown): Readonly<PlainRecord> | SecurityRefusalV1 {
	try {
		if (value === null || typeof value !== "object") return refusal("sandbox-capability-stale");
		const state = OPAQUE_CAPABILITIES.get(value);
		if (!state?.active) return refusal("sandbox-capability-stale");
		state.active = false;
		return Object.freeze({ ok: true });
	} catch {
		return refusal("sandbox-capability-stale");
	}
}

export function sanitizeSecurityEnvironmentV1(input: unknown): Readonly<PlainRecord> | SecurityRefusalV1 {
	try {
		const root = strictRecord(input, ["profile", "runtime", "environment"]);
		if (!root) return refusal("invalid-environment");
		const profile = read(root, "profile");
		const runtime = normalizeRuntime(read(root, "runtime"));
		const environmentValue = read(root, "environment");
		if (!isProfile(profile) || !runtime || !plainRecord(environmentValue)) return refusal("invalid-environment");
		const keys = recordKeys(environmentValue);
		if (!keys) return refusal("invalid-environment");
		if (keys.length > SECURITY_POLICY_LIMITS_V1.maxObjectKeys) return refusal("environment-bounds");
		const environment = strictRecord(environmentValue, keys);
		if (!environment) return refusal("invalid-environment");
		const foldedKeys = keys.map((key) => key.toUpperCase());
		if (!unique(foldedKeys)) return refusal("invalid-environment");
		const output: Record<string, string> = {};
		const removed: string[] = [];
		for (const key of [...keys].sort()) {
			if (!ENVIRONMENT_NAME_RE.test(key)) return refusal(key.length > SECURITY_POLICY_LIMITS_V1.maxEnvironmentNameLength ? "environment-bounds" : "invalid-environment");
			const descriptor = ownData(environment, key);
			if (!descriptor?.present || typeof descriptor.value !== "string") return refusal("invalid-environment");
			if (descriptor.value.length > SECURITY_POLICY_LIMITS_V1.maxStringLength) return refusal("environment-bounds");
			const forbidden = FORBIDDEN_ENVIRONMENT_KEYS.has(key.toUpperCase()) || SECRET_ENVIRONMENT_RE.test(key);
			const allowed = profile === "interactive" ? !forbidden : SAFE_ENVIRONMENT_KEYS.has(key) && !forbidden;
			if (allowed) output[key] = descriptor.value;
			else removed.push(key);
		}
		return deepFreeze({ ok: true, environment: output, allowedKeys: Object.keys(output).sort(), removedKeys: removed.sort() });
	} catch {
		return refusal("invalid-environment");
	}
}

function validatePathFacts(value: unknown): { facts?: PlainRecord; code?: string } {
	const facts = strictRecord(value, ["requestedPath", "resolvedPath", "resolvedParentPath", "fileKind", "linkCount", "symlink", "factsCurrent"]);
	if (!facts) return { code: "path-authority-missing" };
	for (const key of ["requestedPath", "resolvedPath", "resolvedParentPath", "fileKind", "linkCount", "symlink", "factsCurrent"]) {
		if (!ownData(facts, key)?.present) return { code: "path-authority-missing" };
	}
	if (!validAbsolutePath(read(facts, "requestedPath")) || !validAbsolutePath(read(facts, "resolvedPath")) || !validAbsolutePath(read(facts, "resolvedParentPath"))) return { code: "invalid-path" };
	if (typeof read(facts, "fileKind") !== "string" || !Number.isInteger(read(facts, "linkCount")) || typeof read(facts, "symlink") !== "boolean" || typeof read(facts, "factsCurrent") !== "boolean") return { code: "path-authority-missing" };
	if (read(facts, "factsCurrent") !== true) return { code: "path-authority-stale" };
	const requested = read(facts, "requestedPath") as string;
	const resolved = read(facts, "resolvedPath") as string;
	const parent = read(facts, "resolvedParentPath") as string;
	const expectedParent = resolved.slice(0, resolved.lastIndexOf("/")) || "/";
	const kind = read(facts, "fileKind");
	const linkCount = read(facts, "linkCount");
	if (parent !== expectedParent) return { code: "invalid-path-facts" };
	if (read(facts, "symlink") === false && requested !== resolved) return { code: "invalid-path-facts" };
	if ((kind === "regular" && (linkCount as number) < 1) || (kind === "absent" && linkCount !== 0)) return { code: "invalid-path-facts" };
	return { facts };
}

function evaluateRead(state: SandboxState, action: PlainRecord): string | undefined {
	const validated = validatePathFacts(read(action, "facts"));
	if (!validated.facts) return validated.code;
	const facts = validated.facts;
	const requested = read(facts, "requestedPath") as string;
	const resolved = read(facts, "resolvedPath") as string;
	if (isSecretPath(requested, state.homeRoot) || isSecretPath(resolved, state.homeRoot)) return "secret-read-denied";
	const approved = state.operatorRequestedPaths;
	const operatorApproved = requested === resolved && approved.includes(resolved);
	if (!within(state.worktreeRoot, resolved) && !within(state.sessionTempRoot, resolved) && !operatorApproved) return "read-outside-authority";
	if (read(facts, "linkCount") as number > 1) return "hardlink-denied";
	if (read(facts, "symlink") === true) return "symlink-denied";
	if (read(facts, "fileKind") !== "regular") return "unsafe-file-kind";
	return undefined;
}

function evaluateWrite(state: SandboxState, action: PlainRecord): string | undefined {
	const validated = validatePathFacts(read(action, "facts"));
	if (!validated.facts) return validated.code;
	const facts = validated.facts;
	const requested = read(facts, "requestedPath") as string;
	const resolved = read(facts, "resolvedPath") as string;
	const parent = read(facts, "resolvedParentPath") as string;
	if (isProtectedWrite(requested, state.homeRoot) || isProtectedWrite(resolved, state.homeRoot)) return "protected-write";
	const inAuthority = (within(state.worktreeRoot, resolved) && within(state.worktreeRoot, parent)) || (within(state.sessionTempRoot, resolved) && within(state.sessionTempRoot, parent));
	if (!inAuthority) return "write-outside-authority";
	if (read(facts, "linkCount") as number > 1) return "hardlink-denied";
	if (read(facts, "symlink") === true) return "symlink-denied";
	const kind = read(facts, "fileKind") as string;
	if (UNSAFE_FILE_KINDS.has(kind) || !["regular", "absent"].includes(kind)) return "unsafe-file-kind";
	return undefined;
}

function basename(command: string): string {
	const raw = command.split("/").at(-1)?.toLowerCase() ?? command.toLowerCase();
	return raw.replace(/\.(?:exe|cmd|com)$/i, "");
}

function sameArgv(left: readonly string[], right: readonly string[]): boolean {
	return left.length === right.length && left.every((value, index) => value === right[index]);
}

function hasLongOption(argv: readonly string[], names: readonly string[]): boolean {
	return argv.slice(1).some((argument) => names.some((name) => argument === name || argument.startsWith(`${name}=`)));
}

function hasShortOption(argv: readonly string[], letters: string): boolean {
	return argv.slice(1).some((argument) => {
		if (!argument.startsWith("-") || argument.startsWith("--") || argument === "-") return false;
		const cluster = argument.slice(1);
		return [...letters].some((letter) => cluster.includes(letter));
	});
}

function shellEnablesCommandString(argv: readonly string[]): boolean {
	for (const argument of argv.slice(1)) {
		if (argument === "--") return false;
		if (argument === "--command" || argument.startsWith("--command=")) return true;
		if (/^-[^-]*c/.test(argument)) return true;
	}
	return false;
}

function interpreterEnablesInlineCode(executable: string, argv: readonly string[]): boolean {
	if (/^(?:python|pypy)(?:[0-9]+(?:\.[0-9]+)*)?$/.test(executable)) return hasShortOption(argv, "c") || hasLongOption(argv, ["--command"]);
	if (/^(?:node|nodejs|bun)(?:[0-9]+(?:\.[0-9]+)*)?$/.test(executable)) return hasShortOption(argv, "ep") || hasLongOption(argv, ["--eval", "--print"]);
	if (/^perl(?:[0-9]+(?:\.[0-9]+)*)?$/.test(executable)) return hasShortOption(argv, "eE");
	if (/^ruby(?:[0-9]+(?:\.[0-9]+)*)?$/.test(executable)) return hasShortOption(argv, "e");
	if (/^php(?:[0-9]+(?:\.[0-9]+)*)?$/.test(executable)) return hasShortOption(argv, "rRF");
	if (executable === "osascript") return hasShortOption(argv, "e");
	if (executable === "powershell" || executable === "pwsh") {
		const lowered = argv.map((argument) => argument.toLowerCase());
		return hasShortOption(lowered, "ce") || hasLongOption(lowered, ["--command", "-command", "-encodedcommand"]);
	}
	return false;
}

function evaluateCommand(state: SandboxState, action: PlainRecord): string | undefined {
	const executorKind = read(action, "executorKind");
	const sourceAuthority = read(action, "sourceAuthority");
	const command = read(action, "command");
	if (executorKind !== undefined || sourceAuthority !== undefined || command !== undefined) {
		if (executorKind === "shell" || sourceAuthority === "project" || typeof command === "string") return "untrusted-gate-command";
		if (executorKind !== "argv" || read(action, "trustTier") !== "trusted") return "untrusted-gate-command";
	}
	const argv = denseStringArray(read(action, "argv"), SECURITY_POLICY_LIMITS_V1.maxArgv);
	if (!argv || argv.length === 0) return "invalid-argv";
	const executable = basename(argv[0]);
	if (SHELLS.has(executable) && shellEnablesCommandString(argv)) return "shell-denied";
	if (interpreterEnablesInlineCode(executable, argv)) return "inline-interpreter-denied";
	if (INDIRECT_EXECUTORS.has(executable) || /^(?:ld(?:-linux|-musl)?|ld-linux|ld-musl|ld\.so|dyld)/.test(executable)) return "command-indirection-denied";
	if (executable === "find" && argv.some((argument) => ["-exec", "-execdir", "-ok", "-okdir"].includes(argument))) return "command-indirection-denied";
	if (["curl", "wget", "nc", "ncat", "socat"].includes(executable) || /^nc\./.test(executable)) return "egress-denied";
	if (!state.allowedCommands.some((allowed) => sameArgv(allowed, argv))) return "command-not-allowed";
	return undefined;
}

function normalizeDomain(value: unknown): string | undefined {
	if (typeof value !== "string" || value !== value.trim() || value.endsWith(".") || value.includes("@") || value.includes(":")) return undefined;
	const normalized = value.toLowerCase();
	if (!normalized.includes(".") || !DOMAIN_RE.test(normalized)) return undefined;
	return normalized;
}

function forbiddenHost(hostname: string): boolean {
	if (hostname === "localhost" || hostname.endsWith(".localhost")) return true;
	if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname)) return true;
	return hostname === "::1" || hostname.startsWith("fe80:");
}

function validateDestination(value: PlainRecord, allowedDomains: readonly string[], allowedPorts: readonly number[]): { allowed?: true; code?: string } {
	const scheme = read(value, "scheme");
	const hostInput = read(value, "hostname");
	const port = read(value, "port");
	if (scheme !== "https" || typeof port !== "number" || !Number.isInteger(port)) return { code: "invalid-destination" };
	if (typeof hostInput === "string" && forbiddenHost(hostInput.toLowerCase())) return { code: "egress-denied" };
	const host = normalizeDomain(hostInput);
	if (!host) return { code: "invalid-destination" };
	if (forbiddenHost(host) || !allowedDomains.includes(host) || !allowedPorts.includes(port)) return { code: "egress-denied" };
	return { allowed: true };
}

function evaluateEgress(state: SandboxState, runtimeKey: string, action: PlainRecord): string | undefined {
	const permittedRuntime = runtimeKey === "fleet-child:fleet-researcher" || runtimeKey === "web-tool";
	if (!permittedRuntime) return "egress-denied";
	if (read(action, "tool") !== "xai_web_search") return "egress-denied";
	const destination = validateDestination(action, state.allowedDomains, state.allowedPorts);
	if (!destination.allowed) return destination.code;
	const redirects = read(action, "redirects");
	if (!Array.isArray(redirects) || redirects.length > SECURITY_POLICY_LIMITS_V1.maxArrayLength) return "invalid-destination";
	for (let index = 0; index < redirects.length; index += 1) {
		const descriptor = Object.getOwnPropertyDescriptor(redirects, String(index));
		const target = descriptor && "value" in descriptor ? strictRecord(descriptor.value, ["scheme", "hostname", "port"]) : undefined;
		if (!target || !validateDestination(target, state.allowedDomains, state.allowedPorts).allowed) return "redirect-denied";
	}
	return undefined;
}

function validAction(value: unknown): PlainRecord | undefined {
	if (!plainRecord(value)) return undefined;
	const kind = read(value, "kind");
	const allowed = kind === "read" || kind === "write"
		? ["kind", "facts"]
		: kind === "command"
			? ["kind", "argv", "command", "executorKind", "trustTier", "sourceAuthority"]
			: kind === "egress"
				? ["kind", "tool", "scheme", "hostname", "port", "redirects"]
				: [];
	return allowed.length ? strictRecord(value, allowed) : undefined;
}

export function evaluateSecurityPolicyV1(input: unknown): Readonly<PlainRecord> | SecurityRefusalV1 {
	try {
		const root = strictRecord(input, ["profile", "runtime", "policyFingerprint", "candidateSha", "sandboxCapability", "securityGateEvidence", "securityInventoryFingerprint", "action"]);
		if (!root) return refusal("invalid-policy-input");
		const profile = read(root, "profile");
		const runtime = normalizeRuntime(read(root, "runtime"));
		const policyFingerprint = read(root, "policyFingerprint");
		const candidateSha = read(root, "candidateSha");
		const action = validAction(read(root, "action"));
		if (!isProfile(profile)) return refusal("unsupported-profile");
		if (!runtime || !isSafeHash(policyFingerprint) || !isSafeHash(candidateSha) || !action) return refusal("invalid-policy-input");
		if (read(action, "kind") === "command" && read(action, "argv") !== undefined && !denseStringArray(read(action, "argv"), SECURITY_POLICY_LIMITS_V1.maxArgv)) return refusal("invalid-argv");
		if (!boundedPlain(input)) return refusal("invalid-policy-input");
		const actionKind = read(action, "kind") as string;
		if (profile === "interactive") {
			if (actionKind === "read" || actionKind === "write") {
				const pathValidation = validatePathFacts(read(action, "facts"));
				if (!pathValidation.facts) return refusal(pathValidation.code ?? "path-authority-missing");
			}
			return permit(profile, runtime, actionKind, policyFingerprint, candidateSha);
		}
		const capability = capabilityState(read(root, "sandboxCapability"));
		if (!capability.state) return refusal(capability.code ?? "sandbox-required");
		const state = capability.state;
		if (state.policyFingerprint !== policyFingerprint) return refusal("sandbox-capability-stale");
		if (profile === "overnight") {
			const gateValue = read(root, "securityGateEvidence");
			const inventoryFingerprint = read(root, "securityInventoryFingerprint");
			if (!isSafeHash(inventoryFingerprint) || gateValue === null || typeof gateValue !== "object") return refusal("required-security-gate-unavailable");
			const gate = GATE_EVIDENCE.get(gateValue);
			if (
				!gate ||
				gate.candidateSha !== candidateSha ||
				gate.inventoryFingerprint !== inventoryFingerprint ||
				!SLOT_ORDER.every((slot) => gate.requiredSlots.includes(slot))
			) return refusal("required-security-gate-unavailable");
		}
		let code: string | undefined;
		if (actionKind === "read") code = evaluateRead(state, action);
		else if (actionKind === "write") code = evaluateWrite(state, action);
		else if (actionKind === "command") code = evaluateCommand(state, action);
		else if (actionKind === "egress") code = evaluateEgress(state, runtime.key, action);
		if (code) return refusal(code);
		return permit(profile, runtime, actionKind, policyFingerprint, candidateSha);
	} catch {
		return refusal("invalid-policy-input");
	}
}

export function assertSecurityDecisionV1(value: unknown, expected: unknown): Readonly<PlainRecord> | SecurityRefusalV1 {
	try {
		if (value === null || typeof value !== "object") return refusal("invalid-security-decision");
		const state = SECURITY_DECISIONS.get(value);
		if (!state) return refusal("invalid-security-decision");
		const root = strictRecord(expected, ["profile", "runtime", "action"]);
		if (!root || !isProfile(read(root, "profile")) || typeof read(root, "action") !== "string") return refusal("invalid-security-decision");
		const runtime = normalizeRuntime(read(root, "runtime"));
		if (!runtime) return refusal("invalid-security-decision");
		if (state.runtimeKey !== runtime.key) return refusal("runtime-mismatch");
		if (state.profile !== read(root, "profile") || state.action !== read(root, "action")) return refusal("invalid-security-decision");
		return Object.freeze({ ok: true });
	} catch {
		return refusal("invalid-security-decision");
	}
}

export function evaluateSecurityGateSlotsV1(input: unknown): Readonly<PlainRecord> | SecurityRefusalV1 {
	try {
		if (!boundedPlain(input)) return refusal("invalid-security-gates");
		const root = strictRecord(input, ["candidateSha", "inventoryFingerprint", "requiredSlots", "observations"]);
		if (!root) return refusal("invalid-security-gates");
		const candidateSha = read(root, "candidateSha");
		const inventoryFingerprint = read(root, "inventoryFingerprint");
		if (!isSafeHash(candidateSha) || !isSafeHash(inventoryFingerprint)) return refusal("invalid-security-gates");
		const requiredInput = denseStringArray(read(root, "requiredSlots"), SLOT_ORDER.length);
		if (!requiredInput || !unique(requiredInput) || requiredInput.some((slot) => !(SLOT_ORDER as readonly string[]).includes(slot))) return refusal("invalid-security-gates");
		const observationsInput = read(root, "observations");
		if (!Array.isArray(observationsInput) || observationsInput.length > SLOT_ORDER.length) return refusal("invalid-security-gates");
		const observations = new Map<string, PlainRecord>();
		for (let index = 0; index < observationsInput.length; index += 1) {
			const descriptor = Object.getOwnPropertyDescriptor(observationsInput, String(index));
			const item = descriptor && "value" in descriptor ? strictRecord(descriptor.value, ["slot", "status", "executorKind", "trustTier", "candidateSha", "inventoryFingerprint"]) : undefined;
			if (!item) return refusal("invalid-security-gates");
			const slotName = read(item, "slot");
			const status = read(item, "status");
			if (typeof slotName !== "string" || !(SLOT_ORDER as readonly string[]).includes(slotName) || observations.has(slotName) || typeof status !== "string" || !(GATE_STATUSES as readonly string[]).includes(status)) return refusal("invalid-security-gates");
			observations.set(slotName, item);
		}
		const slots = SLOT_ORDER.map((slotName) => {
			const item = observations.get(slotName);
			let status = "unknown";
			if (item) {
				if (read(item, "candidateSha") !== candidateSha || read(item, "inventoryFingerprint") !== inventoryFingerprint) status = "stale";
				else if (!["argv", "internal"].includes(String(read(item, "executorKind"))) || read(item, "trustTier") !== "trusted") status = "untrusted";
				else status = read(item, "status") as string;
			}
			return Object.freeze({ slot: slotName, status });
		});
		const required = requiredInput as readonly SecurityGateSlotV1[];
		const available = required.every((slotName) => slots.find((item) => item.slot === slotName)?.status === "successful");
		if (!available) return deepFreeze({ ok: true, available: false, slots });
		const evidence = Object.freeze({});
		GATE_EVIDENCE.set(evidence, { candidateSha, inventoryFingerprint, requiredSlots: Object.freeze([...required]) });
		return deepFreeze({ ok: true, available: true, slots, evidence });
	} catch {
		return refusal("invalid-security-gates");
	}
}

type OptionalResultChannelV1 =
	| Readonly<{ state: "absent" }>
	| Readonly<{ state: "present"; value: unknown }>
	| Readonly<{ state: "invalid" }>;

type ResultEnvelopeKindV1 = "channels" | "legacy" | "invalid";

function classifyResultEnvelopeV1(result: unknown): ResultEnvelopeKindV1 {
	try {
		if (!result || typeof result !== "object" || Array.isArray(result) || Object.getPrototypeOf(result) !== Object.prototype) return "invalid";
		let hasChannel = false;
		let hasLegacy = false;
		for (const key of Reflect.ownKeys(result)) {
			if (typeof key !== "string") return "invalid";
			const descriptor = Object.getOwnPropertyDescriptor(result, key);
			if (!descriptor || !descriptor.enumerable) return "invalid";
			if (key === "content" || key === "details") hasChannel = true;
			else {
				if (!("value" in descriptor)) return "invalid";
				hasLegacy = true;
			}
		}
		if (hasChannel && hasLegacy) return "invalid";
		return hasChannel || !hasLegacy ? "channels" : "legacy";
	} catch {
		return "invalid";
	}
}

function readOptionalResultChannelV1(result: unknown, key: "content" | "details"): OptionalResultChannelV1 {
	try {
		if (classifyResultEnvelopeV1(result) !== "channels") {
			return Object.freeze({ state: "invalid" });
		}
		const descriptor = Object.getOwnPropertyDescriptor(result, key);
		if (!descriptor) return Object.freeze({ state: "absent" });
		if (!("value" in descriptor) || !descriptor.enumerable) return Object.freeze({ state: "invalid" });
		if (descriptor.value === undefined) return Object.freeze({ state: "absent" });
		return Object.freeze({ state: "present", value: descriptor.value });
	} catch {
		return Object.freeze({ state: "invalid" });
	}
}

export function prepareSecurityToolResultV1(input: unknown): Readonly<PlainRecord> | SecurityRefusalV1 {
	try {
		const root = strictRecord(input, ["isError", "toolName", "result"]);
		if (!root || typeof read(root, "isError") !== "boolean" || !isSafeId(read(root, "toolName"))) return refusal("redaction-refused");
		const rawResult = read(root, "result");
		const envelopeKind = classifyResultEnvelopeV1(rawResult);
		if (envelopeKind === "invalid") return refusal("redaction-refused");
		if (envelopeKind === "legacy") {
			const redacted = redactForPersistence(rawResult);
			if (!redacted.ok) return refusal("redaction-refused");
			return deepFreeze({ ok: true, isError: read(root, "isError"), toolName: read(root, "toolName"), value: redacted.value });
		}
		const content = readOptionalResultChannelV1(rawResult, "content");
		const details = readOptionalResultChannelV1(rawResult, "details");
		if (content.state === "invalid") return refusal("content-redaction-refused");

		const value: PlainRecord = {};
		if (content.state === "present") {
			const redactedContent = redactForPersistence(content.value);
			if (!redactedContent.ok) return refusal("content-redaction-refused");
			value.content = redactedContent.value;
		}

		let detailsRefused = details.state === "invalid";
		if (details.state === "present") {
			const redactedDetails = redactForPersistence(details.value);
			if (redactedDetails.ok) value.details = redactedDetails.value;
			else detailsRefused = true;
		}
		if (detailsRefused) {
			value.details = { securityPolicy: { ok: false, code: "details-redaction-refused" } };
		}

		let boundedValue = redactForPersistence(value);
		if (!boundedValue.ok && value.content !== undefined && !detailsRefused) {
			detailsRefused = true;
			value.details = { securityPolicy: { ok: false, code: "details-redaction-refused" } };
			boundedValue = redactForPersistence(value);
		}
		if (!boundedValue.ok) return refusal(value.content === undefined ? "redaction-refused" : "content-redaction-refused");
		return deepFreeze({
			ok: true,
			isError: read(root, "isError"),
			toolName: read(root, "toolName"),
			value: boundedValue.value,
			detailsRefused,
		});
	} catch {
		return refusal("redaction-refused");
	}
}

/**
 * SEC-00 — Minimum fleet child containment policy.
 *
 * Pure helpers are fixture-testable. The default export is the Pi child-runtime
 * extension that acknowledges policy presence, sanitizes env before model/tool
 * work, and fail-closes undeclared/mutation/shell/network/path violations.
 *
 * This is not an OS sandbox. SEC-01 owns host/process isolation.
 */
import {
	appendFileSync,
	chmodSync,
	existsSync,
	lstatSync,
	mkdirSync,
	readFileSync,
	realpathSync,
	statSync,
} from "node:fs";
import { homedir } from "node:os";
import {
	basename,
	dirname,
	isAbsolute,
	join,
	normalize,
	relative,
	resolve,
	sep,
} from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { isSecretLeafBasenameV1 } from "../security/secret-leaf.ts";

/** Runtime acknowledgement id for pi-subagents `subagent:acknowledge-extension`. */
export const FLEET_CHILD_POLICY_ACK_ID = "fleet-child-policy-v1" as const;

/** Canonical path/id agents must list so ambient extensions stay disabled. */
export const CHILD_POLICY_EXTENSION =
	"~/.pi/agent/personal/lib/fleet/child-policy.ts" as const;

export const XAI_WEB_SEARCH_EXTENSION =
	"~/.pi/agent/personal/extensions/xai-web-search.ts" as const;

export const CANONICAL_FLEET_AGENTS = [
	"fleet-researcher",
	"fleet-reviewer",
	"fleet-ux",
] as const;

export type CanonicalFleetAgent = (typeof CANONICAL_FLEET_AGENTS)[number];

const MUTATION_TOOLS = new Set([
	"write",
	"edit",
	"bash",
	"apply_patch",
	"subagent",
	"shell",
	"exec",
	"terminal",
	"notebook_edit",
	"notebookedit",
]);

const NETWORK_TOOLS = new Set([
	"curl",
	"fetch",
	"web_search",
	"browser",
	"agent-browser",
	"http",
	"wget",
]);

const INSPECTION_TOOLS = new Set(["read", "grep", "find", "ls"]);

const INTERNAL_TOOLS = new Set([
	"contact_supervisor",
	"intercom",
	"subagent_wait",
	"structured_output",
]);

/** Exact canonical tool sets (pi-subagents child frontmatter lock). */
const EXACT_REVIEWER_TOOLS = [
	"read",
	"grep",
	"find",
	"ls",
	"contact_supervisor",
	"intercom",
] as const;
const EXACT_RESEARCHER_TOOLS = [
	...EXACT_REVIEWER_TOOLS,
	"xai_web_search",
] as const;

/** Pre-start injection / loader keys — parent preflight must reject these. */
export const FORBIDDEN_PRESTART_ENV_KEYS = [
	"NODE_OPTIONS",
	"BASH_ENV",
	"ENV",
	"LD_PRELOAD",
	"DYLD_INSERT_LIBRARIES",
	"PYTHONSTARTUP",
	"PERL5OPT",
	"RUBYOPT",
	"JAVA_TOOL_OPTIONS",
	"DOTNET_STARTUP_HOOKS",
	"SSLKEYLOGFILE",
	"PI_SUBAGENT_PI_BINARY",
	"NODE_PATH",
	"BUN_OPTIONS",
] as const;

const FORBIDDEN_PRESTART = new Set<string>(FORBIDDEN_PRESTART_ENV_KEYS);

const EXACT_ENV_ALLOW = new Set([
	"PATH",
	"HOME",
	"USER",
	"LOGNAME",
	"SHELL",
	"TERM",
	"TERMINFO",
	"COLORTERM",
	"TERM_PROGRAM",
	"TERM_PROGRAM_VERSION",
	"LANG",
	"LANGUAGE",
	"LC_ALL",
	"LC_CTYPE",
	"LC_MESSAGES",
	"LC_TIME",
	"LC_NUMERIC",
	"LC_COLLATE",
	"LC_MONETARY",
	"TZ",
	"TMPDIR",
	"TMP",
	"TEMP",
	"PWD",
	"OLDPWD",
	"SHLVL",
	"EDITOR",
	"VISUAL",
	"PAGER",
	"NO_COLOR",
	"FORCE_COLOR",
	"CI",
	"USER_ZDOTDIR",
	"XPC_FLAGS",
	"XPC_SERVICE_NAME",
	"__CF_USER_TEXT_ENCODING",
]);

const SECRET_ENV_NAME =
	/(?:^|_)(?:TOKEN|SECRET|PASSWORD|PASSWD|API[_-]?KEY|ACCESS[_-]?KEY|PRIVATE[_-]?KEY|CREDENTIAL|AUTH|BEARER)(?:_|$)|PROXY|PI_AUTH_PATH/i;

const SECRET_VALUE_RE =
	/\b(?:Bearer\s+\S+|(?:sk|ghp|github_pat|xox[baprs]|xai)[-_A-Za-z0-9]{8,})\b/gi;

const REDACT_ARG_KEYS =
	/topic|task|prompt|content|message|token|secret|password|authorization|credential|api[_-]?key|body|text|cmd|command|input/i;

const SECRET_BASENAMES = new Set([
	"auth.json",
	".env",
	".env.local",
	".env.development",
	".env.production",
	".env.test",
	".npmrc",
	".yarnrc",
	".yarnrc.yml",
	".pypirc",
	".netrc",
	"id_rsa",
	"id_dsa",
	"id_ecdsa",
	"id_ed25519",
	"credentials",
	"credentials.json",
	"service-account.json",
]);

const PSEUDO_PATH_RE =
	/^\/proc(\/|$)|^\/dev\/(?:fd|stdin|stdout|stderr)(\/|$)|^\/dev\/null$|^\/sys(\/|$)/i;

const AGENTS_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../agents");

const PERMISSION_AUDIT_PATH_ENV = "PI_SUBAGENT_PERMISSION_AUDIT_PATH";
const CHILD_AGENT_ENV = "PI_SUBAGENT_CHILD_AGENT";
const RUNTIME_ACK_EVENT = "subagent:acknowledge-extension";

export type InspectionTool = "read" | "grep" | "find" | "ls";

export type InspectionDecision = { allowed: boolean; reason?: string };

export type SanitizeResult = {
	env: Record<string, string>;
	removedKeys: string[];
};

export type LaunchEnvironmentResult =
	| { ok: true }
	| { ok: false; code: string; keys?: string[] };

export type PreflightResult =
	| { ok: true }
	| { ok: false; code: string; reason?: string; blocked?: true };

export type CanonicalAgentContractInput = {
	name: string;
	frontmatter: string;
	tools: string[];
	extensions: string[];
	subagentOnlyExtensions: string[];
	raw: string;
};

// ---------------------------------------------------------------------------
// Env allowlist
// ---------------------------------------------------------------------------

function isAllowedEnvKey(key: string): boolean {
	if (!key || key.includes("\0")) return false;
	if (FORBIDDEN_PRESTART.has(key)) return false;
	if (key === "PI_AUTH_PATH") return false;
	// Secret-shaped names (incl. PI_SUBAGENT_API_TOKEN) before broad control-prefix allow.
	if (SECRET_ENV_NAME.test(key)) return false;
	if (/proxy/i.test(key)) return false;
	if (key.startsWith("PI_SUBAGENT_") || key.startsWith("PI_INTERCOM_")) return true;
	if (EXACT_ENV_ALLOW.has(key)) return true;
	if (key.startsWith("LC_")) return true;
	return false;
}

/**
 * Strip inherited secrets/providers/proxies/loader keys before model/tool work.
 * Returns key names only in removedKeys — never values.
 */
export function sanitizeChildEnvironment(
	env: Record<string, string | undefined>,
): SanitizeResult {
	const next: Record<string, string> = {};
	const removedKeys: string[] = [];
	for (const [key, value] of Object.entries(env)) {
		if (value === undefined) continue;
		if (isAllowedEnvKey(key)) {
			next[key] = value;
		} else {
			removedKeys.push(key);
		}
	}
	removedKeys.sort();
	return { env: next, removedKeys };
}

/** Mutate process.env to the allowlisted set (child extension startup). */
export function applySanitizedEnvironment(
	target: NodeJS.ProcessEnv = process.env,
): SanitizeResult {
	const snapshot: Record<string, string | undefined> = { ...target };
	const sanitized = sanitizeChildEnvironment(snapshot);
	for (const key of Object.keys(target)) {
		if (!(key in sanitized.env)) {
			delete target[key];
		}
	}
	for (const [key, value] of Object.entries(sanitized.env)) {
		target[key] = value;
	}
	return sanitized;
}

/**
 * Parent preflight: reject known pre-start injection variables rather than
 * pretending a post-start delete neutralized them.
 */
export function assertSafeLaunchEnvironment(
	env: Record<string, string | undefined>,
): LaunchEnvironmentResult {
	const bad: string[] = [];
	for (const key of Object.keys(env)) {
		if (env[key] === undefined) continue;
		if (FORBIDDEN_PRESTART.has(key)) bad.push(key);
	}
	if (bad.length > 0) {
		bad.sort();
		return {
			ok: false,
			code: "dangerous-pre-start-env",
			keys: bad,
		};
	}
	return { ok: true };
}

// ---------------------------------------------------------------------------
// Path inspection
// ---------------------------------------------------------------------------

function expandHome(raw: string, home: string): string {
	if (raw === "~") return home;
	if (raw.startsWith("~/") || raw.startsWith("~\\")) {
		return join(home, raw.slice(2));
	}
	return raw;
}

/** Pi 0.84-compatible Unicode space fold + trim. */
function normalizeUnicodeSpaces(raw: string): string {
	return raw
		.replace(/[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000\uFEFF]/g, " ")
		.replace(/[ \t\f\v]+/g, " ")
		.trim();
}

function stripLeadingAt(raw: string): string {
	return raw.startsWith("@") ? raw.slice(1) : raw;
}

/** Decode local file:// URLs; non-file schemes return undefined. */
function decodeLocalFileUrl(raw: string): string | undefined {
	if (!/^file:/i.test(raw)) return undefined;
	try {
		return fileURLToPath(raw);
	} catch {
		try {
			return fileURLToPath(new URL(raw));
		} catch {
			// file:///etc/passwd style fallback
			const m = raw.match(/^file:\/\/(\/.*)$/i);
			if (m?.[1]) {
				try {
					return decodeURIComponent(m[1]);
				} catch {
					return m[1];
				}
			}
			return undefined;
		}
	}
}

/**
 * Pi 0.84 path alias order before policy resolution:
 * trim/Unicode spaces → strip leading @ → decode local file:// → expand tilde.
 */
function normalizePiPathInput(raw: string, home: string): string {
	let s = normalizeUnicodeSpaces(raw);
	s = stripLeadingAt(s);
	const decoded = decodeLocalFileUrl(s);
	if (decoded !== undefined) s = decoded;
	s = normalizeUnicodeSpaces(s);
	return expandHome(s, home);
}

function normalizeToolName(raw: string): string {
	return raw.trim().toLowerCase();
}

function tryRealpath(path: string): string {
	try {
		return realpathSync(path);
	} catch {
		// Resolve the longest existing prefix so symlink escapes still surface.
		// Use index-based remainder (not indexOf) so repeated segments stay correct.
		const abs = normalize(path);
		const parts = abs.split(sep).filter((p, i) => p.length > 0 || i === 0);
		// Rebuild from root
		let cur = isAbsolute(abs) ? sep : "";
		if (process.platform === "win32" && /^[A-Za-z]:$/.test(parts[0] ?? "")) {
			cur = `${parts.shift()}${sep}`;
		}
		let lastExisting = cur || ".";
		for (let i = 0; i < parts.length; i++) {
			const part = parts[i]!;
			const next = cur ? join(cur, part) : part;
			try {
				if (existsSync(next)) {
					lastExisting = realpathSync(next);
					cur = lastExisting;
					continue;
				}
			} catch {
				// fall through
			}
			const rest = parts.slice(i);
			return normalize(join(lastExisting, ...rest));
		}
		return normalize(lastExisting || abs);
	}
}

function isInsideDir(root: string, candidate: string): boolean {
	const rel = relative(root, candidate);
	if (rel === "") return true;
	if (isAbsolute(rel)) return false;
	if (rel === "..") return false;
	if (rel.startsWith(`..${sep}`)) return false;
	return true;
}

function isSecretPath(candidate: string, home: string): string | undefined {
	const base = basename(candidate);
	const baseLower = base.toLowerCase();
	// Case-insensitive secret basename + auth path checks (Darwin + defense-in-depth).
	if (
		SECRET_BASENAMES.has(base) ||
		SECRET_BASENAMES.has(baseLower) ||
		isSecretLeafBasenameV1(baseLower)
	) {
		return "secret path denied";
	}
	const lowered = candidate.toLowerCase();
	const authNeedle = `${sep}.pi${sep}agent${sep}auth`;
	if (baseLower === "auth.json" || lowered.includes(authNeedle)) {
		return "auth path denied";
	}
	const homeAuth = join(home, ".pi", "agent", "auth.json");
	const homeAuthLower = homeAuth.toLowerCase();
	if (
		candidate === homeAuth ||
		candidate.startsWith(`${homeAuth}${sep}`) ||
		lowered === homeAuthLower ||
		lowered.startsWith(`${homeAuthLower}${sep}`)
	) {
		return "auth path denied";
	}
	// Credential-ish directories under home
	if (
		lowered.includes(`${sep}.ssh${sep}`) ||
		lowered.includes(`${sep}.aws${sep}`) ||
		lowered.includes(`${sep}.gnupg${sep}`)
	) {
		return "secret path denied";
	}
	if (PSEUDO_PATH_RE.test(candidate)) {
		return "pseudo-filesystem path denied";
	}
	return undefined;
}

/**
 * Deny multi-link regular files fail-closed.
 *
 * A benign basename can still alias `.env.local` / `.npmrc` / auth.json via
 * hardlink. Prefer link-count over an incomplete secret-path graph; ordinary
 * single-link in-cwd sources stay allowed. Auth hardlinks remain denied.
 */
function isHardlinkToSecret(candidate: string, _home: string): string | undefined {
	let candStat: ReturnType<typeof statSync>;
	try {
		candStat = statSync(candidate);
	} catch {
		return undefined;
	}
	if (!candStat.isFile()) return undefined;
	// nlink > 1 ⇒ at least one additional directory entry shares this inode.
	if (typeof candStat.nlink === "number" && candStat.nlink > 1) {
		return "hardlink to secret path denied";
	}
	return undefined;
}

/**
 * Repository-confined, secret-aware inspection after lexical + realpath checks.
 */
export function evaluateInspectionPath(input: {
	cwd: string;
	tool: InspectionTool;
	target: string;
	home?: string;
}): InspectionDecision {
	const { tool } = input;
	const home = input.home ?? process.env.HOME ?? homedir();
	const cwdRaw = input.cwd;
	const targetRaw = input.target;

	if (typeof targetRaw !== "string" || targetRaw.length === 0) {
		return { allowed: false, reason: "missing inspection target denied" };
	}
	if (targetRaw.includes("\0")) {
		return { allowed: false, reason: "NUL in path denied" };
	}
	if (cwdRaw.includes("\0")) {
		return { allowed: false, reason: "NUL in cwd denied" };
	}

	const cwdReal = tryRealpath(resolve(cwdRaw));
	const expanded = normalizePiPathInput(targetRaw, home);
	if (!expanded || expanded.length === 0) {
		return { allowed: false, reason: "missing inspection target denied" };
	}
	if (expanded.includes("\0")) {
		return { allowed: false, reason: "NUL in path denied" };
	}

	const absolute = isAbsolute(expanded)
		? normalize(expanded)
		: resolve(cwdReal, expanded);

	// Fast pseudo check before realpath (broken /proc links etc.)
	if (PSEUDO_PATH_RE.test(absolute) || PSEUDO_PATH_RE.test(expanded)) {
		return { allowed: false, reason: "pseudo-filesystem path denied" };
	}

	// Symlink / canonical resolution (lexical + realpath containment)
	let canonical = absolute;
	try {
		if (existsSync(absolute)) {
			canonical = tryRealpath(absolute);
		} else {
			canonical = tryRealpath(absolute);
		}
	} catch {
		canonical = normalize(absolute);
	}

	const secretHit =
		isSecretPath(canonical, home) ??
		isSecretPath(absolute, home) ??
		isSecretPath(expanded, home) ??
		isSecretPath(targetRaw, home);
	if (secretHit) {
		return { allowed: false, reason: secretHit };
	}

	// Multi-link (hardlink) denial: benign basename may alias secret material.
	const hardlinkHit =
		isHardlinkToSecret(canonical, home) ??
		isHardlinkToSecret(absolute, home);
	if (hardlinkHit) {
		return { allowed: false, reason: hardlinkHit };
	}

	if (!isInsideDir(cwdReal, canonical)) {
		// grep/find/ls rooted outside cwd (e.g. $HOME) are blocked even if benign.
		return {
			allowed: false,
			reason: `outside child cwd denied (${tool})`,
		};
	}

	// Re-check basename after canonicalization (symlink to auth renamed in-cwd)
	const postSecret = isSecretPath(canonical, home);
	if (postSecret) {
		return { allowed: false, reason: postSecret };
	}
	const postHardlink = isHardlinkToSecret(canonical, home);
	if (postHardlink) {
		return { allowed: false, reason: postHardlink };
	}

	return { allowed: true };
}

// ---------------------------------------------------------------------------
// Bounded redacted audit
// ---------------------------------------------------------------------------

function redactValue(key: string, value: unknown, depth = 0): unknown {
	if (REDACT_ARG_KEYS.test(key)) return "[redacted]";
	if (depth >= 2) return "[truncated]";
	if (value === null || value === undefined) return value;
	if (typeof value === "string") {
		if (SECRET_VALUE_RE.test(value)) {
			SECRET_VALUE_RE.lastIndex = 0;
			return "[redacted]";
		}
		SECRET_VALUE_RE.lastIndex = 0;
		// Never persist long free text / topic-like payloads
		if (value.length > 160) return `${value.slice(0, 48)}…`;
		return value;
	}
	if (typeof value === "number" || typeof value === "boolean") return value;
	if (Array.isArray(value)) {
		return value.slice(0, 8).map((item, i) => redactValue(String(i), item, depth + 1));
	}
	if (typeof value === "object") {
		const out: Record<string, unknown> = {};
		for (const [k, v] of Object.entries(value as Record<string, unknown>).slice(0, 20)) {
			out[k] = redactValue(k, v, depth + 1);
		}
		return out;
	}
	return "[truncated]";
}

function redactArgs(args: unknown): Record<string, unknown> {
	if (!args || typeof args !== "object" || Array.isArray(args)) return {};
	const out: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(args as Record<string, unknown>)) {
		out[key] = redactValue(key, value);
	}
	return out;
}

/**
 * Append one bounded blocked record as mode-0600 JSONL.
 * Never persists raw env values, topic/task text, credentials, or bearer strings.
 */
export function recordBlockedAttempt(
	auditPath: string,
	record: Record<string, unknown>,
): void {
	if (!auditPath || auditPath.includes("\0")) {
		throw new Error("audit path invalid");
	}
	const rawTool =
		typeof record.tool === "string"
			? record.tool
			: typeof record.action === "string"
				? record.action
				: "unknown";
	const rawAction =
		typeof record.action === "string"
			? record.action
			: typeof record.tool === "string"
				? record.tool
				: "unknown";
	const row: Record<string, unknown> = {
		timestamp: new Date().toISOString(),
		agent: typeof record.agent === "string" ? record.agent : "unknown",
		tool: normalizeToolName(rawTool),
		action: normalizeToolName(rawAction),
		reason:
			typeof record.reason === "string"
				? record.reason
				: typeof record.code === "string"
					? record.code
					: "blocked",
		args: redactArgs(record.args),
	};
	if (typeof record.runId === "string" && record.runId.length > 0) {
		row.runId = record.runId;
	}
	// Drop any accidental secret-looking strings in the serialized envelope keys we control.
	const line = JSON.stringify(row);
	if (SECRET_VALUE_RE.test(line)) {
		SECRET_VALUE_RE.lastIndex = 0;
		// Fail closed: rewrite args entirely if something slipped through.
		row.args = { redacted: true };
	}
	SECRET_VALUE_RE.lastIndex = 0;

	mkdirSync(dirname(auditPath), { recursive: true, mode: 0o700 });
	appendFileSync(auditPath, `${JSON.stringify(row)}\n`, {
		encoding: "utf-8",
		mode: 0o600,
	});
	// appendFile mode only applies on create — always re-assert 0600.
	chmodSync(auditPath, 0o600);
}

// ---------------------------------------------------------------------------
// Canonical agent contract
// ---------------------------------------------------------------------------

function parseToolsLine(fm: string): string[] {
	const line = fm.match(/^tools:\s*(.+)$/m)?.[1] ?? "";
	return line
		.split(",")
		.map((t) => t.trim())
		.filter(Boolean);
}

function parseListField(fm: string, field: string): string[] {
	const inline = fm.match(new RegExp(`^${field}:\\s*\\[(.+)\\]\\s*$`, "m"));
	if (inline?.[1]) {
		return inline[1]
			.split(",")
			.map((s) => s.replace(/^["']|["']$/g, "").trim())
			.filter(Boolean);
	}
	const single = fm.match(new RegExp(`^${field}:\\s*(.+)$`, "m"))?.[1]?.trim();
	if (!single || single === "[]") return [];
	if (single.startsWith("-")) return [];
	return single
		.split(",")
		.map((s) => s.replace(/^["']|["']$/g, "").trim())
		.filter(Boolean);
}

function parseScalar(fm: string, field: string): string | undefined {
	return fm.match(new RegExp(`^${field}:\\s*(.+)$`, "m"))?.[1]?.trim();
}

function frontmatterOf(raw: string): string {
	const parts = raw.split("---");
	if (parts.length < 3) return "";
	return parts[1] ?? "";
}

function hasPolicyExtension(entries: string[]): boolean {
	return entries.some(
		(e) => e.includes("child-policy") || e === CHILD_POLICY_EXTENSION,
	);
}

function hasXaiExtension(entries: string[]): boolean {
	return entries.some(
		(e) => e.includes("xai-web-search") || e === XAI_WEB_SEARCH_EXTENSION,
	);
}

function isCanonicalAgent(name: string): name is CanonicalFleetAgent {
	return (CANONICAL_FLEET_AGENTS as readonly string[]).includes(name);
}

function sortedExact(values: readonly string[]): string {
	return [...values].map((v) => v.trim()).filter(Boolean).sort().join("\0");
}

function isPolicyExtensionEntry(entry: string): boolean {
	return entry.includes("child-policy") || entry === CHILD_POLICY_EXTENSION;
}

function isXaiExtensionEntry(entry: string): boolean {
	return entry.includes("xai-web-search") || entry === XAI_WEB_SEARCH_EXTENSION;
}

/**
 * Static mechanical contract for canonical fleet agent definitions.
 * Throws on drift (mutation tools, missing policy extension, etc.).
 */
export function assertCanonicalFleetAgentContract(
	input: CanonicalAgentContractInput,
): void {
	const { name, tools, extensions, subagentOnlyExtensions } = input;
	const fm = input.frontmatter || frontmatterOf(input.raw);
	const allExt = [...extensions, ...subagentOnlyExtensions];

	if (!isCanonicalAgent(name)) {
		throw new Error(`uncontained-agent: ${name}`);
	}

	const expectedTools =
		name === "fleet-researcher"
			? EXACT_RESEARCHER_TOOLS
			: EXACT_REVIEWER_TOOLS;
	if (sortedExact(tools) !== sortedExact(expectedTools)) {
		throw new Error(
			`${name} must declare exact tools only (got ${tools.join(",")}; expected ${expectedTools.join(",")})`,
		);
	}

	for (const tool of tools) {
		const normalized = normalizeToolName(tool);
		if (MUTATION_TOOLS.has(normalized) || MUTATION_TOOLS.has(tool)) {
			throw new Error(`${name} declares mutation/shell tool ${tool}`);
		}
		if (NETWORK_TOOLS.has(normalized) || NETWORK_TOOLS.has(tool)) {
			throw new Error(`${name} declares generic network tool ${tool}`);
		}
	}

	if (name === "fleet-researcher") {
		if (allExt.length !== 2) {
			throw new Error(
				"fleet-researcher must load exactly policy + xAI extensions (no extras)",
			);
		}
		if (!hasPolicyExtension(allExt) || !hasXaiExtension(allExt)) {
			throw new Error(
				"fleet-researcher missing required policy or xAI web search extension",
			);
		}
		if (!allExt.every((e) => isPolicyExtensionEntry(e) || isXaiExtensionEntry(e))) {
			throw new Error(
				"fleet-researcher extensions must be exactly policy + xAI (extra extension rejected)",
			);
		}
	} else {
		if (tools.includes("xai_web_search")) {
			throw new Error(`${name} must not expose xai_web_search`);
		}
		if (hasXaiExtension(allExt)) {
			throw new Error(`${name} must not load xAI web search extension`);
		}
		if (subagentOnlyExtensions.length > 0) {
			throw new Error(`${name} must not declare subagentOnlyExtensions extras`);
		}
		if (extensions.length !== 1 || allExt.length !== 1) {
			throw new Error(
				`${name} must load exactly the policy extension (no extras)`,
			);
		}
		if (!allExt.every((e) => isPolicyExtensionEntry(e))) {
			throw new Error(
				`${name} must load exactly the policy extension (extra extension rejected)`,
			);
		}
	}

	if (!hasPolicyExtension(allExt)) {
		throw new Error(`${name} missing policy extension (child-policy required)`);
	}

	if (parseScalar(fm, "maxSubagentDepth") !== "0") {
		throw new Error(`${name} must set maxSubagentDepth: 0`);
	}
	if (parseScalar(fm, "defaultContext") !== "fresh") {
		throw new Error(`${name} must use defaultContext: fresh`);
	}
	const output = parseScalar(fm, "output");
	if (!(output === undefined || output === "false")) {
		throw new Error(`${name} must not declare default checkout output`);
	}
}

function loadCanonicalAgentRaw(name: CanonicalFleetAgent): string {
	const path = join(AGENTS_DIR, `${name}.md`);
	if (!existsSync(path)) {
		throw new Error(`missing agent definition: ${name}`);
	}
	return readFileSync(path, "utf8");
}

function validateCanonicalAgentFile(name: CanonicalFleetAgent): void {
	const raw = loadCanonicalAgentRaw(name);
	const fm = frontmatterOf(raw);
	assertCanonicalFleetAgentContract({
		name,
		frontmatter: fm,
		tools: parseToolsLine(fm),
		extensions: parseListField(fm, "extensions"),
		subagentOnlyExtensions: parseListField(fm, "subagentOnlyExtensions"),
		raw,
	});
}

/** Expanded agent-declared policy path (`~/...` → `$HOME/...`). */
function expandedChildPolicyExtensionPath(): string {
	return CHILD_POLICY_EXTENSION.startsWith("~/")
		? join(homedir(), CHILD_POLICY_EXTENSION.slice(2))
		: CHILD_POLICY_EXTENSION;
}

function missingPolicyResult(): PreflightResult {
	return {
		ok: false,
		code: "missing-policy",
		reason: "installed policy extension missing; disable live fleets",
		blocked: true,
	};
}

/**
 * Resolve deterministic installed-policy injection.
 * - path string → exact path agents load (preferred)
 * - boolean → locked-test compatibility
 * - neither → undefined (caller must require expanded CHILD_POLICY_EXTENSION)
 *
 * Local `import.meta.dir` module source never satisfies this check.
 */
function resolveInstalledPolicyInjection(input: {
	installedPolicyExtensionPath?: string;
	installedPolicyExtensionExists?: boolean;
}): boolean | undefined {
	if (typeof input.installedPolicyExtensionPath === "string") {
		return existsSync(input.installedPolicyExtensionPath);
	}
	if (typeof input.installedPolicyExtensionExists === "boolean") {
		return input.installedPolicyExtensionExists;
	}
	return undefined;
}

/**
 * Fail-closed dispatch preflight before any pi-subagents RPC spawn.
 * Never echoes topic/task text into the blocked result.
 *
 * `installedPolicyExtensionPath` / `installedPolicyExtensionExists` are
 * deterministic injection points for tests and parent callers that already
 * resolved the installed extension path agents will load.
 */
export function preflightFleetContainment(input: {
	agents: string[];
	agentScope?: unknown;
	env?: Record<string, string | undefined>;
	topic?: string;
	installedPolicyExtensionExists?: boolean;
	installedPolicyExtensionPath?: string;
}): PreflightResult {
	// topic intentionally unused — must never appear in results/audits.
	void input.topic;

	// Injected installed-path/boolean fail closed immediately (never via module source).
	const injectedPresent = resolveInstalledPolicyInjection({
		installedPolicyExtensionPath: input.installedPolicyExtensionPath,
		installedPolicyExtensionExists: input.installedPolicyExtensionExists,
	});
	if (injectedPresent === false) {
		return missingPolicyResult();
	}

	if (input.agentScope !== "user") {
		return {
			ok: false,
			code: "untrusted-agent-scope",
			reason: 'agentScope must be "user"',
			blocked: true,
		};
	}

	const env = input.env ?? {};
	const launch = assertSafeLaunchEnvironment(env);
	if (!launch.ok) {
		return {
			ok: false,
			code: launch.code,
			reason: `dangerous pre-start env: ${(launch.keys ?? []).join(",")}`,
			blocked: true,
		};
	}

	const agents = Array.isArray(input.agents) ? input.agents : [];
	if (agents.length === 0) {
		return {
			ok: false,
			code: "uncontained-agent",
			reason: "no agents in plan",
			blocked: true,
		};
	}

	// When callers inject installed-policy existence, skip on-disk agent file I/O
	// only for the policy path check — agent contract still validates when files exist.
	for (const agent of agents) {
		if (!isCanonicalAgent(agent)) {
			return {
				ok: false,
				code: "uncontained-agent",
				reason: "agent is not a canonical fleet role",
				blocked: true,
			};
		}
		// Prefer live agent definitions when present; injection-only paths still
		// require canonical names + safe env (covered above).
		const agentPath = join(AGENTS_DIR, `${agent}.md`);
		if (existsSync(agentPath)) {
			try {
				validateCanonicalAgentFile(agent);
			} catch (error) {
				const message =
					error instanceof Error ? error.message : "agent-contract drift";
				return {
					ok: false,
					code: "agent-contract",
					reason: message,
					blocked: true,
				};
			}
		}
	}

	// Default (no injection): require expanded agent-declared CHILD_POLICY_EXTENSION.
	// Package source under import.meta.dir must not satisfy this.
	if (injectedPresent === undefined) {
		if (!existsSync(expandedChildPolicyExtensionPath())) {
			return missingPolicyResult();
		}
	}

	return { ok: true };
}

// ---------------------------------------------------------------------------
// Child extension (default export)
// ---------------------------------------------------------------------------

function extractInspectionTarget(input: unknown): string | undefined {
	if (!input || typeof input !== "object") return undefined;
	const o = input as Record<string, unknown>;
	for (const key of [
		"path",
		"file",
		"file_path",
		"target",
		"root",
		"directory",
		"dir",
		"cwd",
	]) {
		if (typeof o[key] === "string") return o[key];
	}
	if (Array.isArray(o.paths) && typeof o.paths[0] === "string") return o.paths[0];
	if (Array.isArray(o.args) && typeof o.args[0] === "string") return o.args[0];
	return undefined;
}

function roleAllowsTool(agent: string, toolName: string): boolean {
	const tool = normalizeToolName(toolName);
	if (INTERNAL_TOOLS.has(tool)) return true;
	if (MUTATION_TOOLS.has(tool)) return false;
	if (NETWORK_TOOLS.has(tool)) return false;
	if (tool === "xai_web_search") return agent === "fleet-researcher";
	if (INSPECTION_TOOLS.has(tool)) return true;
	// Undeclared / unknown tools — fail closed.
	return false;
}

function auditBlocked(
	partial: Record<string, unknown>,
): void {
	const auditPath = process.env[PERMISSION_AUDIT_PATH_ENV]?.trim();
	if (!auditPath) return;
	try {
		recordBlockedAttempt(auditPath, partial);
	} catch {
		// Audit must not crash the child; denial still stands via block return.
	}
}

/**
 * Pi child-runtime extension factory.
 * Sanitizes env on register (before model/tool work), emits acknowledgement,
 * and enforces tool_call containment.
 */
export default function fleetChildPolicyExtension(pi: ExtensionAPI): void {
	// 1) Sanitize inherited environment immediately on registration (before tool work).
	applySanitizedEnvironment(process.env);

	// 2) Observable policy presence — acknowledge exactly once per registration.
	let acknowledged = false;
	try {
		const events = (
			pi as {
				events?: { emit?: (event: string, payload: unknown) => void };
			}
		).events;
		if (!acknowledged) {
			events?.emit?.(RUNTIME_ACK_EVENT, { id: FLEET_CHILD_POLICY_ACK_ID });
			acknowledged = true;
		}
	} catch {
		// Acknowledgement is best-effort observability.
	}

	// 3) tool_call gate
	pi.on("tool_call", (event) => {
		const rawToolName =
			typeof event.toolName === "string" && event.toolName.length > 0
				? event.toolName
				: "tool";
		const toolName = normalizeToolName(rawToolName);
		const agent =
			process.env[CHILD_AGENT_ENV]?.trim() ||
			process.env.PI_SUBAGENT_CHILD_AGENT?.trim() ||
			"fleet-child";
		const runId =
			process.env.PI_SUBAGENT_RUN_ID?.trim() ||
			process.env.PI_SUBAGENT_ASYNC_ID?.trim();

		if (MUTATION_TOOLS.has(toolName)) {
			auditBlocked({
				agent,
				runId,
				tool: toolName,
				action: toolName,
				reason: "mutation-tool-denied",
				args: event.input ?? {},
			});
			return {
				block: true,
				reason: `Blocked by fleet child policy: '${rawToolName}' is a mutation/shell tool (mutation-tool-denied).`,
			};
		}

		if (NETWORK_TOOLS.has(toolName)) {
			auditBlocked({
				agent,
				runId,
				tool: toolName,
				action: toolName,
				reason: "network-tool-denied",
				args: event.input ?? {},
			});
			return {
				block: true,
				reason: `Blocked by fleet child policy: '${rawToolName}' network egress is denied.`,
			};
		}

		if (toolName === "xai_web_search" && agent !== "fleet-researcher") {
			auditBlocked({
				agent,
				runId,
				tool: toolName,
				action: toolName,
				reason: "network-tool-denied",
				args: event.input ?? {},
			});
			return {
				block: true,
				reason: `Blocked by fleet child policy: xai_web_search is researcher-only.`,
			};
		}

		if (!roleAllowsTool(agent, toolName)) {
			auditBlocked({
				agent,
				runId,
				tool: toolName,
				action: toolName,
				reason: "undeclared-tool-denied",
				args: event.input ?? {},
			});
			return {
				block: true,
				reason: `Blocked by fleet child policy: undeclared tool '${rawToolName}'.`,
			};
		}

		if (INSPECTION_TOOLS.has(toolName)) {
			let target = extractInspectionTarget(event.input);
			// Missing/empty path: grep/find/ls default to "."; read stays denied.
			if (target === undefined || target.trim() === "") {
				if (toolName === "read") {
					auditBlocked({
						agent,
						runId,
						tool: toolName,
						action: toolName,
						reason: "inspection-target-missing",
						args: event.input ?? {},
					});
					return {
						block: true,
						reason: `Blocked by fleet child policy: ${toolName} missing path.`,
					};
				}
				target = ".";
			}
			const decision = evaluateInspectionPath({
				cwd: process.cwd(),
				tool: toolName as InspectionTool,
				target,
				home: process.env.HOME,
			});
			if (!decision.allowed) {
				const reason = decision.reason ?? "outside child cwd denied";
				auditBlocked({
					agent,
					runId,
					tool: toolName,
					action: toolName,
					reason,
					args: { path: target },
				});
				return {
					block: true,
					reason: `Blocked by fleet child policy: ${reason}`,
				};
			}
		}

		return undefined;
	});
}

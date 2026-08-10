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
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

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
	"NotebookEdit",
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

const SECRET_BASENAME_RE =
	/^\.env(\..+)?$|\.pem$|\.key$|^id_(rsa|dsa|ecdsa|ed25519)(\.pub)?$/i;

const PSEUDO_PATH_RE =
	/^\/proc(\/|$)|^\/dev\/(?:fd|stdin|stdout|stderr)(\/|$)|^\/dev\/null$|^\/sys(\/|$)/i;

const AGENTS_DIR = join(import.meta.dir, "../../agents");

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
	if (key.startsWith("PI_SUBAGENT_") || key.startsWith("PI_INTERCOM_")) return true;
	if (EXACT_ENV_ALLOW.has(key)) return true;
	if (key.startsWith("LC_")) return true;
	if (SECRET_ENV_NAME.test(key)) return false;
	if (/proxy/i.test(key)) return false;
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

function tryRealpath(path: string): string {
	try {
		return realpathSync(path);
	} catch {
		// Resolve the longest existing prefix so symlink escapes still surface.
		const abs = normalize(path);
		const parts = abs.split(sep).filter((p, i) => p.length > 0 || i === 0);
		// Rebuild from root
		let cur = isAbsolute(abs) ? sep : "";
		if (process.platform === "win32" && /^[A-Za-z]:$/.test(parts[0] ?? "")) {
			cur = `${parts.shift()}${sep}`;
		}
		let lastExisting = cur || ".";
		for (const part of parts) {
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
			// Append remaining lexical segments onto last real prefix.
			const restIdx = parts.indexOf(part);
			const rest = parts.slice(restIdx);
			return normalize(join(lastExisting, ...rest));
		}
		return normalize(abs);
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
	if (SECRET_BASENAMES.has(base) || SECRET_BASENAME_RE.test(base)) {
		return "secret path denied";
	}
	if (base === "auth.json" || candidate.includes(`${sep}.pi${sep}agent${sep}auth`)) {
		return "auth path denied";
	}
	const homeAuth = join(home, ".pi", "agent", "auth.json");
	if (candidate === homeAuth || candidate.startsWith(`${homeAuth}${sep}`)) {
		return "auth path denied";
	}
	// Credential-ish directories under home
	const lowered = candidate.toLowerCase();
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
 * Repository-confined, secret-aware inspection after lexical + realpath checks.
 */
export function evaluateInspectionPath(input: {
	cwd: string;
	tool: InspectionTool;
	target: string;
	home?: string;
}): InspectionDecision {
	const { tool, target } = input;
	const home = input.home ?? process.env.HOME ?? homedir();
	const cwdRaw = input.cwd;

	if (typeof target !== "string" || target.length === 0) {
		return { allowed: false, reason: "missing inspection target denied" };
	}
	if (target.includes("\0")) {
		return { allowed: false, reason: "NUL in path denied" };
	}
	if (cwdRaw.includes("\0")) {
		return { allowed: false, reason: "NUL in cwd denied" };
	}

	const cwdReal = tryRealpath(resolve(cwdRaw));
	const expanded = expandHome(target, home);
	const absolute = isAbsolute(expanded)
		? normalize(expanded)
		: resolve(cwdReal, expanded);

	// Fast pseudo check before realpath (broken /proc links etc.)
	if (PSEUDO_PATH_RE.test(absolute)) {
		return { allowed: false, reason: "pseudo-filesystem path denied" };
	}

	// Symlink / canonical resolution
	let canonical = absolute;
	try {
		if (existsSync(absolute)) {
			const st = lstatSync(absolute);
			canonical = st.isSymbolicLink() || st.isDirectory() || st.isFile()
				? tryRealpath(absolute)
				: tryRealpath(absolute);
		} else {
			canonical = tryRealpath(absolute);
		}
	} catch {
		canonical = normalize(absolute);
	}

	const secretHit =
		isSecretPath(canonical, home) ??
		isSecretPath(absolute, home) ??
		isSecretPath(expanded, home);
	if (secretHit) {
		return { allowed: false, reason: secretHit };
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
	const row: Record<string, unknown> = {
		timestamp: new Date().toISOString(),
		agent: typeof record.agent === "string" ? record.agent : "unknown",
		tool:
			typeof record.tool === "string"
				? record.tool
				: typeof record.action === "string"
					? record.action
					: "unknown",
		action:
			typeof record.action === "string"
				? record.action
				: typeof record.tool === "string"
					? record.tool
					: "unknown",
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

	for (const banned of MUTATION_TOOLS) {
		if (tools.includes(banned)) {
			throw new Error(`${name} declares mutation/shell tool ${banned}`);
		}
	}
	for (const banned of NETWORK_TOOLS) {
		if (tools.includes(banned)) {
			throw new Error(`${name} declares generic network tool ${banned}`);
		}
	}

	if (name === "fleet-researcher") {
		if (!tools.includes("xai_web_search")) {
			throw new Error("fleet-researcher must expose xai_web_search");
		}
		if (!hasXaiExtension(allExt)) {
			throw new Error("fleet-researcher missing xAI web search extension");
		}
	} else if (tools.includes("xai_web_search")) {
		throw new Error(`${name} must not expose xai_web_search`);
	} else if (hasXaiExtension(allExt)) {
		throw new Error(`${name} must not load xAI web search extension`);
	} else if (subagentOnlyExtensions.length > 0) {
		throw new Error(`${name} must not declare subagentOnlyExtensions extras`);
	} else if (!allExt.every((e) => e.includes("child-policy") || e === CHILD_POLICY_EXTENSION)) {
		throw new Error(`${name} must load exactly the policy extension (no extras)`);
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

function childPolicyFilePresent(): boolean {
	// Module file (this source) must exist; also check the installed/tilde path form used in agents.
	const here = typeof import.meta.dir === "string"
		? join(import.meta.dir, "child-policy.ts")
		: "";
	if (here && existsSync(here)) return true;
	const expanded = CHILD_POLICY_EXTENSION.startsWith("~/")
		? join(homedir(), CHILD_POLICY_EXTENSION.slice(2))
		: CHILD_POLICY_EXTENSION;
	return existsSync(expanded);
}

/**
 * Fail-closed dispatch preflight before any pi-subagents RPC spawn.
 * Never echoes topic/task text into the blocked result.
 */
export function preflightFleetContainment(input: {
	agents: string[];
	agentScope?: unknown;
	env?: Record<string, string | undefined>;
	topic?: string;
}): PreflightResult {
	// topic intentionally unused — must never appear in results/audits.
	void input.topic;

	if (!childPolicyFilePresent()) {
		return {
			ok: false,
			code: "missing-policy",
			reason: "child-policy module missing; disable live fleets",
			blocked: true,
		};
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

	for (const agent of agents) {
		if (!isCanonicalAgent(agent)) {
			return {
				ok: false,
				code: "uncontained-agent",
				reason: "agent is not a canonical fleet role",
				blocked: true,
			};
		}
		try {
			validateCanonicalAgentFile(agent);
		} catch (error) {
			const message = error instanceof Error ? error.message : "agent-contract drift";
			return {
				ok: false,
				code: "agent-contract",
				reason: message,
				blocked: true,
			};
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
	if (INTERNAL_TOOLS.has(toolName)) return true;
	if (MUTATION_TOOLS.has(toolName)) return false;
	if (NETWORK_TOOLS.has(toolName)) return false;
	if (toolName === "xai_web_search") return agent === "fleet-researcher";
	if (INSPECTION_TOOLS.has(toolName)) {
		if (agent === "fleet-researcher") {
			// Researcher may read; grep/find/ls are also safe inspection primitives.
			return true;
		}
		return true;
	}
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
	// 1) Sanitize inherited environment immediately on registration.
	applySanitizedEnvironment(process.env);

	// 2) Observable policy presence for pi-subagents runtime acknowledgement.
	try {
		const events = (
			pi as {
				events?: { emit?: (event: string, payload: unknown) => void };
			}
		).events;
		events?.emit?.(RUNTIME_ACK_EVENT, { id: FLEET_CHILD_POLICY_ACK_ID });
	} catch {
		// Acknowledgement is best-effort observability.
	}

	// 3) tool_call gate
	pi.on("tool_call", (event) => {
		const toolName =
			typeof event.toolName === "string" && event.toolName.length > 0
				? event.toolName
				: "tool";
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
				reason: `Blocked by fleet child policy: '${toolName}' is a mutation/shell tool (mutation-tool-denied).`,
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
				reason: `Blocked by fleet child policy: '${toolName}' network egress is denied.`,
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
				reason: `Blocked by fleet child policy: undeclared tool '${toolName}'.`,
			};
		}

		if (INSPECTION_TOOLS.has(toolName)) {
			const target = extractInspectionTarget(event.input);
			if (target === undefined) {
				// ls with no path defaults to cwd — allow.
				if (toolName === "ls") return undefined;
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

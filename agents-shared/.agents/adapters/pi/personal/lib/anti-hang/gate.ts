/**
 * Anti-hang gates for Pi tool calls.
 *
 * Pi's bash tool has no default timeout. context-mode's ctx_batch_execute /
 * ctx_execute also omit a host-side timeout on Pi (resolveExecTimeout →
 * undefined). A single unbounded command (e.g. `find /`) wedges the agent
 * loop indefinitely because pi-agent-core awaits tool execute() with no
 * outer deadline.
 */

/** Default bash tool timeout (seconds). Mutated into event.input when missing. */
export const DEFAULT_BASH_TIMEOUT_SEC = 120;

/** Default context-mode execute timeout (ms). */
export const DEFAULT_CTX_TIMEOUT_MS = 120_000;

/** Hard cap for bash timeouts the model may request (seconds). */
export const MAX_BASH_TIMEOUT_SEC = 600;

/** Hard cap for context-mode timeouts the model may request (ms). */
export const MAX_CTX_TIMEOUT_MS = 600_000;

export type HangGateResult =
	| { action: "allow" }
	| { action: "block"; reason: string }
	| { action: "patch"; patches: Record<string, unknown>; note?: string };

/** Unquote a single shell token (best-effort). */
function unquote(token: string): string {
	const t = token.trim();
	if (
		(t.startsWith("'") && t.endsWith("'")) ||
		(t.startsWith('"') && t.endsWith('"'))
	) {
		return t.slice(1, -1);
	}
	return t;
}

/**
 * True when a path argument is the filesystem root (or a root glob/dot form).
 * Allows `/Users/...`, `/opt/...`, etc.
 */
export function isRootPathArg(token: string): boolean {
	const t = unquote(token).trim();
	if (!t.startsWith("/")) return false;
	// Exact root and common root-only variants
	if (t === "/" || t === "/." || t === "/.." || t === "//") return true;
	// Root globs: /*, /**, /.*, etc. (not /Users*)
	if (/^\/(?:\.|\.\.|\/|\*)*$/.test(t)) return true;
	if (/^\/\*+/.test(t) && !/^\/[A-Za-z0-9._-]/.test(t)) return true;
	return false;
}

/**
 * First path-like argument after `find` (skips flags like -name, -L).
 */
export function firstFindPathArg(segment: string): string | undefined {
	// Strip leading env assignments: FOO=1 find /
	const stripped = segment.replace(/^(?:\w+=\S+\s+)+/, "").trim();
	const m = stripped.match(/\bfind(?:\s+|$)/i);
	if (!m || m.index === undefined) return undefined;
	const rest = stripped.slice(m.index + m[0].length).trim();
	if (!rest) return undefined;

	// Tokenize roughly: quoted strings or non-space runs
	const tokens = rest.match(/(?:'[^']*'|"[^"]*"|\S+)/g) ?? [];
	for (const raw of tokens) {
		const tok = raw.trim();
		if (!tok) continue;
		// find flags / options (including combined -H/-L)
		if (tok.startsWith("-")) continue;
		// Operators mid-expression
		if (tok === "\\(" || tok === "\\)" || tok === "(" || tok === ")") continue;
		return tok;
	}
	return undefined;
}

/**
 * True when a shell command walks the filesystem root without a path
 * component — the classic "find / -name …" hang that can run for hours.
 */
export function isUnboundedRootWalk(command: string): boolean {
	const cmd = command.trim();
	if (!cmd) return false;

	// Split chained / piped segments so `find / | head` and `true && find /` are caught.
	const parts = cmd.split(/(?:&&|\|\||[|;\n])/);
	for (const part of parts) {
		const p = part.trim();
		if (!p) continue;

		if (/\bupdatedb\b/i.test(p)) return true;
		if (/\bls\s+-[a-zA-Z]*R[a-zA-Z]*\s+\/(?:\s|$|[|<>&;])/i.test(p)) return true;

		if (/\bfind\b/i.test(p)) {
			const pathArg = firstFindPathArg(p);
			if (pathArg !== undefined && isRootPathArg(pathArg)) return true;
			// Bare `find /` with no further tokens already handled; also
			// `find/` typos are ignored. Fallback for `find / -name` when
			// tokenizer misses: classic regex including pipe/redirect tails.
			if (/\bfind\s+\/(?:\s|$|-[a-zA-Z]|[|<>&;])/i.test(p)) return true;
		}
	}
	return false;
}

/**
 * Extract shell command strings from a tool call for hang scanning.
 * Returns [] when the tool has no scannable command payload.
 */
export function extractShellCommands(
	toolName: string,
	input: Record<string, unknown> | null | undefined,
): string[] {
	if (!input || typeof input !== "object") return [];

	if (toolName === "bash" || toolName === "Bash") {
		const c = input.command;
		return typeof c === "string" && c.trim() ? [c] : [];
	}

	if (
		toolName === "ctx_batch_execute" ||
		toolName === "context-mode_ctx_batch_execute"
	) {
		const commands = input.commands;
		if (!Array.isArray(commands)) return [];
		const out: string[] = [];
		for (const item of commands) {
			if (
				item &&
				typeof item === "object" &&
				typeof (item as { command?: unknown }).command === "string"
			) {
				out.push((item as { command: string }).command);
			}
		}
		return out;
	}

	if (toolName === "ctx_execute" || toolName === "context-mode_ctx_execute") {
		const language = String(input.language ?? "").toLowerCase();
		const code = input.code;
		if (typeof code !== "string") return [];
		if (
			language === "shell" ||
			language === "bash" ||
			language === "sh" ||
			language === ""
		) {
			return [code];
		}
		return [];
	}

	return [];
}

type TimeoutSpec = {
	defaultValue: number;
	max: number;
	label: string;
	unit: string;
};

function ensureTimeout(
	input: Record<string, unknown>,
	spec: TimeoutSpec,
): { timeout?: number; note?: string } {
	const raw = input.timeout;
	if (raw === undefined || raw === null) {
		return {
			timeout: spec.defaultValue,
			note: `${spec.label}: injected default timeout ${spec.defaultValue}${spec.unit}`,
		};
	}
	const n = typeof raw === "number" ? raw : Number(raw);
	if (!Number.isFinite(n) || n <= 0) {
		return {
			timeout: spec.defaultValue,
			note: `${spec.label}: replaced invalid timeout with ${spec.defaultValue}${spec.unit}`,
		};
	}
	if (n > spec.max) {
		return {
			timeout: spec.max,
			note: `${spec.label}: capped timeout ${n}${spec.unit} → ${spec.max}${spec.unit}`,
		};
	}
	return {};
}

/** Ensure bash has a finite timeout (seconds). */
export function ensureBashTimeout(
	input: Record<string, unknown>,
): { timeout?: number; note?: string } {
	return ensureTimeout(input, {
		defaultValue: DEFAULT_BASH_TIMEOUT_SEC,
		max: MAX_BASH_TIMEOUT_SEC,
		label: "bash",
		unit: "s",
	});
}

/** Ensure context-mode execute tools have a finite timeout (ms). */
export function ensureCtxTimeout(
	input: Record<string, unknown>,
): { timeout?: number; note?: string } {
	return ensureTimeout(input, {
		defaultValue: DEFAULT_CTX_TIMEOUT_MS,
		max: MAX_CTX_TIMEOUT_MS,
		label: "ctx",
		unit: "ms",
	});
}

const CTX_TIMEOUT_TOOLS = new Set([
	"ctx_batch_execute",
	"ctx_execute",
	"ctx_execute_file",
	"context-mode_ctx_batch_execute",
	"context-mode_ctx_execute",
	"context-mode_ctx_execute_file",
]);

/**
 * Decide allow / block / patch for a single tool call.
 * Pure — no I/O. Callers apply patches by mutating event.input.
 */
export function evaluateHangGate(
	toolName: string,
	input: Record<string, unknown> | null | undefined,
): HangGateResult {
	const safeInput = input && typeof input === "object" ? input : {};
	const commands = extractShellCommands(toolName, safeInput);

	for (const cmd of commands) {
		if (isUnboundedRootWalk(cmd)) {
			return {
				action: "block",
				reason:
					"Anti-hang: blocked unbounded root filesystem walk " +
					"(e.g. `find / …`, `updatedb`, `ls -R /`). " +
					"Scope to a project path with maxdepth, or use `fd`/`rg`.",
			};
		}
	}

	if (toolName === "bash" || toolName === "Bash") {
		const patch = ensureBashTimeout(safeInput);
		if (patch.timeout !== undefined) {
			return {
				action: "patch",
				patches: { timeout: patch.timeout },
				note: patch.note,
			};
		}
		return { action: "allow" };
	}

	if (CTX_TIMEOUT_TOOLS.has(toolName)) {
		const patch = ensureCtxTimeout(safeInput);
		if (patch.timeout !== undefined) {
			return {
				action: "patch",
				patches: { timeout: patch.timeout },
				note: patch.note,
			};
		}
		return { action: "allow" };
	}

	return { action: "allow" };
}

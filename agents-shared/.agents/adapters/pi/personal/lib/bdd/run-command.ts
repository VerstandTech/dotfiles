/**
 * Run a shell or trusted argv command and capture a truncated summary for red/green evidence.
 */

import { spawn } from "node:child_process";
import { realpathSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import type { ExpectedRedContract, RedMatchMode, RedReasonCode, TrustTier } from "./types.ts";

export interface RunCommandResult {
	exitCode: number;
	stdout: string;
	stderr: string;
	summary: string;
	command: string;
	/** True when the runner hit timeoutMs */
	timedOut?: boolean;
	/** True when spawn failed (missing binary, etc.) */
	spawnError?: boolean;
	/** Best-effort failed test identifiers from output */
	failedTestHints?: string[];
	/** True when trusted-runner policy rejected before spawn. */
	policyRejected?: boolean;
	/** True when retained output was truncated to the configured bound. */
	outputTruncated?: boolean;
	/** Alias marker for bounded output. */
	bounded?: boolean;
}

export interface ArgvRunSpec {
	version: 1;
	file: string;
	args: string[];
	cwd?: string;
	maxOutputBytes?: number;
	timeoutMs?: number;
}

export interface RunCommandOptions {
	cwd: string;
	/** Legacy shell command string. Optional when trusted argv is supplied. */
	command?: string;
	/** Trusted argv form — preferred when trust is "trusted". */
	argv?: ArgvRunSpec;
	/** "trusted" enables argv shell:false path with scrubbed env. */
	trust?: "trusted" | "legacy" | string;
	/** Project root for argv cwd-escape checks. Defaults to cwd. */
	projectRoot?: string;
	timeoutMs?: number;
	env?: NodeJS.ProcessEnv;
	maxSummaryChars?: number;
	spawnImpl?: typeof spawn;
}

export interface RedValidationResult {
	ok: boolean;
	reason: string;
	reasonCode?: RedReasonCode | string;
	cause?: string;
	assuranceEligible?: boolean;
	trustTier?: TrustTier | string;
	matchMode?: RedMatchMode | string;
}

const DEFAULT_OUTPUT_CAP = 200_000;
const HARD_MAX_OUTPUT = 200_000;

/** Deterministic env allowlist for trusted argv runs (R5). */
const TRUSTED_ENV_ALLOWLIST = new Set([
	"PATH",
	"HOME",
	"LANG",
	"LC_ALL",
	"LC_CTYPE",
	"TMPDIR",
	"TMP",
	"TEMP",
	"CI",
	"TERM",
	"USER",
	"LOGNAME",
	"SHELL",
	"NODE_ENV",
	"TZ",
]);

const SECRET_ENV_RE = /key|token|secret|password|passwd|credential|authorization|private/i;

/** Shell metacharacters / NUL disallowed in trusted executable names. */
const UNSAFE_EXECUTABLE_RE = /[\x00\s;|&$`<>(){}[\]!*?~'"\\]/;

const SETUP_IMPORT_RE =
	/Cannot find module|Cannot find package|SyntaxError|Unexpected token|Jest encountered an unexpected token|ERR_MODULE_NOT_FOUND|MODULE_NOT_FOUND|failed to load|setup.*(fail|error)|import.*(fail|error)/i;

function summarizeOutput(
	exitCode: number,
	stdout: string,
	stderr: string,
	max: number,
	flags: { timedOut?: boolean; spawnError?: boolean; policyRejected?: boolean },
): string {
	const combined = [stderr.trim(), stdout.trim()].filter(Boolean).join("\n");
	const lines = combined.split("\n").filter(Boolean);
	const interesting = lines.filter((l) =>
		/(fail|error|✗|×|assert|expected|received|not ok|FAIL|policy)/i.test(l),
	);
	const pick = (interesting.length > 0 ? interesting : lines).slice(-12).join(" | ");
	let head: string;
	if (flags.policyRejected) head = `POLICY_REJECTED (exit ${exitCode})`;
	else if (flags.timedOut) head = `TIMEOUT (exit ${exitCode})`;
	else if (flags.spawnError) head = `SPAWN_ERROR (exit ${exitCode})`;
	else if (exitCode === 0) head = "PASS";
	else head = `FAIL (exit ${exitCode})`;
	const body = pick.replace(/\s+/g, " ").trim();
	const text = body ? `${head}: ${body}` : head;
	return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

function formatArgvCommand(argv: ArgvRunSpec): string {
	const args = argv.args.map((a) => (/\s/.test(a) ? JSON.stringify(a) : a)).join(" ");
	return args ? `${argv.file} ${args}` : argv.file;
}

export function isUnsafeExecutableName(file: string): boolean {
	if (!file || typeof file !== "string") return true;
	if (file.includes("\0")) return true;
	return UNSAFE_EXECUTABLE_RE.test(file);
}

export function isCwdEscape(projectRoot: string, candidateCwd: string): boolean {
	const rootLexical = resolve(projectRoot);
	const candidateLexical = isAbsolute(candidateCwd)
		? resolve(candidateCwd)
		: resolve(rootLexical, candidateCwd);

	// Lexical containment first (cheap fail-closed for `..` escapes).
	const lexicalRel = relative(rootLexical, candidateLexical);
	if (lexicalRel === ".." || lexicalRel.startsWith(`..${sep}`) || isAbsolute(lexicalRel)) {
		return true;
	}

	// Realpath check: reject symlink escapes and realpath failures (E46).
	try {
		const rootReal = realpathSync(rootLexical);
		const candidateReal = realpathSync(candidateLexical);
		const realRel = relative(rootReal, candidateReal);
		if (realRel === "") return false;
		return realRel.startsWith(`..${sep}`) || realRel === ".." || isAbsolute(realRel);
	} catch {
		// Fail closed on realpath errors (missing path, permission, broken symlink).
		return true;
	}
}

export function scrubTrustedEnv(env: NodeJS.ProcessEnv = {}): Record<string, string> {
	const out: Record<string, string> = {};
	for (const [key, value] of Object.entries(env)) {
		if (value == null) continue;
		if (SECRET_ENV_RE.test(key)) continue;
		if (!TRUSTED_ENV_ALLOWLIST.has(key)) continue;
		out[key] = String(value);
	}
	return out;
}

function boundOutput(
	text: string,
	maxBytes: number,
): { text: string; truncated: boolean } {
	const cap = Math.max(0, Math.min(maxBytes, HARD_MAX_OUTPUT));
	if (text.length <= cap) return { text, truncated: false };
	return { text: text.slice(0, cap), truncated: true };
}

function policyRejectResult(
	command: string,
	reason: string,
	maxSummaryChars: number,
): RunCommandResult {
	const exitCode = 126;
	const stderr = reason;
	return {
		exitCode,
		stdout: "",
		stderr,
		command,
		policyRejected: true,
		spawnError: false,
		failedTestHints: [],
		summary: summarizeOutput(exitCode, "", stderr, maxSummaryChars, { policyRejected: true }),
	};
}

function runTrustedArgv(options: RunCommandOptions): Promise<RunCommandResult> {
	const argv = options.argv!;
	const maxSummaryChars = options.maxSummaryChars ?? 400;
	const command = formatArgvCommand(argv);
	const projectRoot = options.projectRoot ?? options.cwd;
	const spawnImpl = options.spawnImpl ?? spawn;
	const timeoutMs = argv.timeoutMs ?? options.timeoutMs ?? 120_000;
	const maxOutputBytes = Math.min(
		argv.maxOutputBytes ?? DEFAULT_OUTPUT_CAP,
		HARD_MAX_OUTPUT,
	);

	if (isUnsafeExecutableName(argv.file)) {
		return Promise.resolve(
			policyRejectResult(
				command,
				`policy rejected: unsafe executable name (NUL or shell metacharacters): ${argv.file}`,
				maxSummaryChars,
			),
		);
	}

	if (!Array.isArray(argv.args) || argv.args.some((a) => typeof a !== "string")) {
		return Promise.resolve(
			policyRejectResult(command, "policy rejected: argv.args must be string[]", maxSummaryChars),
		);
	}

	let spawnCwd = options.cwd;
	if (argv.cwd != null && String(argv.cwd).trim()) {
		if (isCwdEscape(projectRoot, argv.cwd)) {
			return Promise.resolve(
				policyRejectResult(
					command,
					`policy rejected: argv cwd escapes project root: ${argv.cwd}`,
					maxSummaryChars,
				),
			);
		}
		spawnCwd = isAbsolute(argv.cwd) ? resolve(argv.cwd) : resolve(projectRoot, argv.cwd);
	}

	const env = scrubTrustedEnv(options.env ?? process.env);

	return new Promise((resolvePromise) => {
		const child = spawnImpl(argv.file, argv.args, {
			cwd: spawnCwd,
			env,
			shell: false,
			stdio: ["ignore", "pipe", "pipe"],
		});

		let stdout = "";
		let stderr = "";
		let settled = false;
		let timedOut = false;
		let spawnError = false;
		let outputTruncated = false;

		const finish = (exitCode: number) => {
			if (settled) return;
			settled = true;
			const boundOut = boundOutput(stdout, maxOutputBytes);
			const boundErr = boundOutput(stderr, maxOutputBytes);
			stdout = boundOut.text;
			stderr = boundErr.text;
			// Preserve in-stream truncation flags; boundOutput alone is false when already capped.
			outputTruncated = outputTruncated || boundOut.truncated || boundErr.truncated;
			const combined = `${stderr}\n${stdout}`;
			resolvePromise({
				exitCode,
				stdout,
				stderr,
				command,
				timedOut,
				spawnError,
				policyRejected: false,
				outputTruncated,
				bounded: outputTruncated,
				failedTestHints: extractFailedTestHints(combined),
				summary: summarizeOutput(exitCode, stdout, stderr, maxSummaryChars, {
					timedOut,
					spawnError,
				}),
			});
		};

		const timer = setTimeout(() => {
			timedOut = true;
			try {
				if (typeof child.pid === "number" && child.pid > 0) {
					try {
						process.kill(-child.pid, "SIGTERM");
					} catch {
						child.kill("SIGTERM");
					}
				} else {
					child.kill("SIGTERM");
				}
			} catch {
				// ignore
			}
			finish(124);
		}, timeoutMs);

		child.stdout?.on("data", (chunk: Buffer | string) => {
			if (stdout.length < maxOutputBytes) {
				stdout += String(chunk);
				if (stdout.length > maxOutputBytes) {
					stdout = stdout.slice(0, maxOutputBytes);
					outputTruncated = true;
				}
			} else {
				outputTruncated = true;
			}
		});
		child.stderr?.on("data", (chunk: Buffer | string) => {
			if (stderr.length < maxOutputBytes) {
				stderr += String(chunk);
				if (stderr.length > maxOutputBytes) {
					stderr = stderr.slice(0, maxOutputBytes);
					outputTruncated = true;
				}
			} else {
				outputTruncated = true;
			}
		});
		child.on("error", (err) => {
			clearTimeout(timer);
			spawnError = true;
			stderr += `\n${err.message}`;
			finish(1);
		});
		child.on("close", (code) => {
			clearTimeout(timer);
			finish(code ?? 1);
		});
	});
}

export function runCommand(options: RunCommandOptions): Promise<RunCommandResult> {
	const maxSummaryCharsEarly = options.maxSummaryChars ?? 400;

	// E45 — trust:"trusted" without a valid argv spec must never shell-fallback.
	if (options.trust === "trusted") {
		if (!options.argv || typeof options.argv.file !== "string" || !options.argv.file.trim()) {
			const command = options.command ?? "";
			return Promise.resolve(
				policyRejectResult(
					command,
					"policy rejected: trust=trusted requires a valid argv spec (no shell fallback)",
					maxSummaryCharsEarly,
				),
			);
		}
		return runTrustedArgv(options);
	}

	const {
		cwd,
		timeoutMs = 120_000,
		env = process.env,
		maxSummaryChars = 400,
		spawnImpl = spawn,
	} = options;
	const command = options.command ?? (options.argv ? formatArgvCommand(options.argv) : "");
	if (!command) {
		return Promise.resolve(
			policyRejectResult("", "policy rejected: no command or argv provided", maxSummaryChars),
		);
	}

	return new Promise((resolvePromise) => {
		const child = spawnImpl(command, {
			cwd,
			env,
			shell: true,
			stdio: ["ignore", "pipe", "pipe"],
		});

		let stdout = "";
		let stderr = "";
		let settled = false;
		let timedOut = false;
		let spawnError = false;

		const finish = (exitCode: number) => {
			if (settled) return;
			settled = true;
			const combined = `${stderr}\n${stdout}`;
			resolvePromise({
				exitCode,
				stdout,
				stderr,
				command,
				timedOut,
				spawnError,
				failedTestHints: extractFailedTestHints(combined),
				summary: summarizeOutput(exitCode, stdout, stderr, maxSummaryChars, {
					timedOut,
					spawnError,
				}),
			});
		};

		const timer = setTimeout(() => {
			timedOut = true;
			try {
				// Kill the whole process group when possible
				if (typeof child.pid === "number" && child.pid > 0) {
					try {
						process.kill(-child.pid, "SIGTERM");
					} catch {
						child.kill("SIGTERM");
					}
				} else {
					child.kill("SIGTERM");
				}
			} catch {
				// ignore
			}
			finish(124);
		}, timeoutMs);

		child.stdout?.on("data", (chunk: Buffer | string) => {
			stdout += String(chunk);
			if (stdout.length > DEFAULT_OUTPUT_CAP) stdout = stdout.slice(-100_000);
		});
		child.stderr?.on("data", (chunk: Buffer | string) => {
			stderr += String(chunk);
			if (stderr.length > DEFAULT_OUTPUT_CAP) stderr = stderr.slice(-100_000);
		});
		child.on("error", (err) => {
			clearTimeout(timer);
			spawnError = true;
			stderr += `\n${err.message}`;
			finish(1);
		});
		child.on("close", (code) => {
			clearTimeout(timer);
			finish(code ?? 1);
		});
	});
}

const INFRA_EXIT_CODES = new Set([124, 126, 127]);

/** Pull likely failed test names from runner output (best-effort). */
export function extractFailedTestHints(output: string, limit = 12): string[] {
	const hints: string[] = [];
	const seen = new Set<string>();
	const patterns: RegExp[] = [
		/(?:FAIL|✗|×|✖)\s+(.+?)\s*$/gim,
		/(?:\d+\)\s+)(.+?)\s*$/gm,
		/(?:not ok \d+\s*-\s*)(.+?)\s*$/gim,
		/(?:●|✓)\s+(?:FAIL\s+)?(.+?)\s*$/gm,
		/(?:Expected|AssertionError)[\s\S]{0,40}?\n\s*(.+?\.test\.[\w]+)/gi,
		/([\w./-]+\.(?:test|spec)\.[\w]+)/g,
	];
	for (const re of patterns) {
		let m: RegExpExecArray | null;
		const r = new RegExp(re.source, re.flags);
		while ((m = r.exec(output)) !== null) {
			const h = (m[1] ?? m[0]).replace(/\s+/g, " ").trim().slice(0, 160);
			if (!h || h.length < 3) continue;
			if (seen.has(h)) continue;
			seen.add(h);
			hints.push(h);
			if (hints.length >= limit) return hints;
		}
	}
	return hints;
}

function combinedOutput(result: RunCommandResult): string {
	return [result.stdout, result.stderr, result.summary, ...(result.failedTestHints ?? [])]
		.filter(Boolean)
		.join("\n");
}

function identityHit(result: RunCommandResult, expectedTestId: string): boolean {
	const id = expectedTestId.trim();
	if (!id) return false;
	// E37 / Q9 — full expected identity may appear inside a richer hint/output,
	// but a shorter unrelated hint contained by the expected id is never a match.
	const hints = result.failedTestHints ?? [];
	if (hints.some((h) => h.includes(id))) return true;
	const haystack = combinedOutput(result);
	return haystack.includes(id);
}

function signatureHit(result: RunCommandResult, signature: string): boolean {
	const sig = signature.trim();
	if (!sig) return false;
	return combinedOutput(result).includes(sig);
}

function resolveMatchMode(contract?: ExpectedRedContract): RedMatchMode {
	if (contract?.matchMode) return contract.matchMode;
	if (contract?.assuranceEnabled) {
		return contract.expectedFailureSignature ? "signature" : "identity";
	}
	if (contract?.expectedTestId) {
		return contract.expectedFailureSignature ? "signature" : "identity";
	}
	return "legacy";
}

/**
 * Red must be a real failing test run — not pass, timeout, or missing binary.
 * With an expected-red contract, only the intended assertion is assurance-causal (R1–R3).
 */
export function validateRedResult(
	result: RunCommandResult,
	contract?: ExpectedRedContract,
): RedValidationResult {
	// R12 / E47 — policyRejected is never red, regardless of exit code or matching hints.
	if (result.policyRejected) {
		return {
			ok: false,
			reasonCode: "policy_rejected",
			cause: "policy_rejected",
			assuranceEligible: false,
			trustTier: "policy_rejected",
			reason:
				`Red rejected: policy rejected command (policyRejected=true is never causal red).\n` +
				`Command: ${result.command}\n${result.summary}`,
		};
	}
	// R2 precedence: timeout/124 → spawn → 126/127 → exit zero → setup/import → identity/signature
	if (result.timedOut || result.exitCode === 124) {
		return {
			ok: false,
			reasonCode: "timeout",
			cause: "timeout",
			assuranceEligible: false,
			reason:
				`Red rejected: command timed out (exit 124). Fix the hang or raise timeout; timeouts are not valid failing tests.\n` +
				`Command: ${result.command}\n${result.summary}`,
		};
	}
	if (result.spawnError) {
		return {
			ok: false,
			reasonCode: "spawn",
			cause: "spawn",
			assuranceEligible: false,
			reason:
				`Red rejected: command failed to spawn (missing binary / shell error).\n` +
				`Command: ${result.command}\n${result.summary}`,
		};
	}
	if (result.exitCode === 127) {
		return {
			ok: false,
			reasonCode: "infra_127",
			cause: "infra_127",
			assuranceEligible: false,
			reason:
				`Red rejected: infrastructure exit 127 (command not found).\n` +
				`Command: ${result.command}\n${result.summary}`,
		};
	}
	if (result.exitCode === 126) {
		return {
			ok: false,
			reasonCode: "infra_126",
			cause: "infra_126",
			assuranceEligible: false,
			reason:
				`Red rejected: infrastructure exit 126 (not executable / policy).\n` +
				`Command: ${result.command}\n${result.summary}`,
		};
	}
	if (result.exitCode === 0) {
		return {
			ok: false,
			reasonCode: "pass",
			cause: "pass",
			assuranceEligible: false,
			reason:
				`Expected a failing test run for red, but command exited 0.\n` +
				`Command: ${result.command}\n${result.summary}`,
		};
	}

	const output = combinedOutput(result);
	if (SETUP_IMPORT_RE.test(output)) {
		return {
			ok: false,
			reasonCode: "setup_import",
			cause: "setup_import",
			assuranceEligible: false,
			reason:
				`Red rejected: setup/import/harness failure is not a causal assertion failure.\n` +
				`Command: ${result.command}\n${result.summary}`,
		};
	}

	const matchMode = resolveMatchMode(contract);
	const assuranceEnabled = contract?.assuranceEnabled === true;

	if (assuranceEnabled && !contract?.expectedTestId?.trim()) {
		return {
			ok: false,
			reasonCode: "contract_required",
			cause: "contract_required",
			assuranceEligible: false,
			matchMode,
			trustTier: "interactive_untrusted",
			reason:
				`Red rejected: expectedTestId is required when assurance is enabled (contract-required).\n` +
				`Command: ${result.command}\n${result.summary}`,
		};
	}

	if (contract?.expectedTestId?.trim() && matchMode !== "legacy") {
		const expectedId = contract.expectedTestId.trim();
		const hit = identityHit(result, expectedId);
		if (!hit) {
			return {
				ok: false,
				reasonCode: "unrelated_identity",
				cause: "missing_identity",
				assuranceEligible: false,
				matchMode,
				reason:
					`Red rejected: unrelated or missing identity — expected test id was absent from failures.\n` +
					`expectedTestId: ${expectedId}\n` +
					`Command: ${result.command}\n${result.summary}`,
			};
		}
		if (matchMode === "signature") {
			const signature = contract.expectedFailureSignature?.trim() ?? "";
			if (!signature || !signatureHit(result, signature)) {
				return {
					ok: false,
					reasonCode: "signature_mismatch",
					cause: "signature_mismatch",
					assuranceEligible: false,
					matchMode,
					reason:
						`Red rejected: signature mismatch — expected failure signature was not found.\n` +
						`expectedTestId: ${expectedId}\n` +
						`Command: ${result.command}\n${result.summary}`,
				};
			}
		}
		return {
			ok: true,
			reasonCode: "expected_assertion",
			cause: "expected_assertion",
			assuranceEligible: true,
			matchMode,
			trustTier: "trusted",
			reason: result.summary,
		};
	}

	// E10 / R3 — legacy interactive non-zero remains recordable but non-assurance
	return {
		ok: true,
		reasonCode: "legacy_interactive",
		cause: "legacy",
		assuranceEligible: false,
		trustTier: "interactive_untrusted",
		matchMode: "legacy",
		reason: result.summary,
	};
}

export function validateGreenResult(result: RunCommandResult): { ok: boolean; reason: string } {
	if (result.policyRejected) {
		return {
			ok: false,
			reason:
				`Green rejected: policy rejected command before spawn.\nCommand: ${result.command}\n${result.summary}`,
		};
	}
	if (result.timedOut || result.exitCode === 124) {
		return {
			ok: false,
			reason:
				`Green rejected: command timed out.\nCommand: ${result.command}\n${result.summary}`,
		};
	}
	if (result.spawnError || INFRA_EXIT_CODES.has(result.exitCode)) {
		return {
			ok: false,
			reason:
				`Green rejected: infrastructure failure (exit ${result.exitCode}).\n` +
				`Command: ${result.command}\n${result.summary}`,
		};
	}
	if (result.exitCode !== 0) {
		return {
			ok: false,
			reason:
				`Expected a passing test run for green, but command exited ${result.exitCode}.\n` +
				`Command: ${result.command}\n${result.summary}`,
		};
	}
	return { ok: true, reason: result.summary };
}

function tokenizeCmd(cmd: string): string[] {
	// naive split; good enough for bun/npm/pnpm/yarn/go test invocations
	return cmd
		.trim()
		.split(/\s+/)
		.filter(Boolean);
}

/** Non-test invocations that share a binary with test runners (e.g. bun -e). */
function isNonTestInvocation(tokens: string[]): boolean {
	if (tokens.length < 2) return false;
	const bin = tokens[0]!.toLowerCase();
	const sub = tokens[1]!.toLowerCase();
	if ((bin === "bun" || bin === "node" || bin === "deno") && (sub === "-e" || sub === "--eval" || sub === "eval")) {
		return true;
	}
	if (bin === "npm" || bin === "pnpm" || bin === "yarn") {
		if (sub === "run" && tokens[2] && !/test|gherkin|spec/i.test(tokens[2])) return true;
		if (!/^(test|run)$/i.test(sub) && sub !== "exec") {
			// npm build, npm start, etc.
			if (!/test/i.test(sub)) return true;
		}
	}
	return false;
}

function looksLikeTestFocus(token: string): boolean {
	return (
		/\.(test|spec)\.[cm]?[jt]sx?$/i.test(token) ||
		/\/tests?\//i.test(token) ||
		/\.feature$/i.test(token) ||
		/^@/.test(token)
	);
}

/**
 * True if green is the same test command or a broader suite covering red.
 * Rejects same-binary non-tests (bun -e, npm run build) and unrelated filters.
 */
export function greenCoversRed(redCommand: string, greenCommand: string): boolean {
	const r = redCommand.trim();
	const g = greenCommand.trim();
	if (!r || !g) return false;
	if (r === g) return true;

	const rt = tokenizeCmd(r);
	const gt = tokenizeCmd(g);
	if (rt.length === 0 || gt.length === 0) return false;
	if (isNonTestInvocation(gt)) return false;

	// Green is token-prefix of red → broader suite (green `bun test`, red `bun test a.test.ts`)
	if (gt.length <= rt.length && gt.every((t, i) => t === rt[i])) {
		return true;
	}

	// Red is token-prefix of green → same command + extra flags (red `bun test a`, green `bun test a --bail`)
	if (rt.length <= gt.length && rt.every((t, i) => t === gt[i])) {
		return true;
	}

	// Same runner binary + green includes red's focus path/filter
	const redFocus = rt.find((t, i) => i > 0 && looksLikeTestFocus(t));
	if (redFocus && gt[0] === rt[0] && g.includes(redFocus)) {
		return true;
	}

	return false;
}

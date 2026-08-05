/**
 * Run a shell command and capture a truncated summary for red/green evidence.
 */

import { spawn } from "node:child_process";

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
}

export interface RunCommandOptions {
	cwd: string;
	command: string;
	timeoutMs?: number;
	env?: NodeJS.ProcessEnv;
	maxSummaryChars?: number;
	spawnImpl?: typeof spawn;
}

function summarizeOutput(
	exitCode: number,
	stdout: string,
	stderr: string,
	max: number,
	flags: { timedOut?: boolean; spawnError?: boolean },
): string {
	const combined = [stderr.trim(), stdout.trim()].filter(Boolean).join("\n");
	const lines = combined.split("\n").filter(Boolean);
	const interesting = lines.filter((l) =>
		/(fail|error|✗|×|assert|expected|received|not ok|FAIL)/i.test(l),
	);
	const pick = (interesting.length > 0 ? interesting : lines).slice(-12).join(" | ");
	let head: string;
	if (flags.timedOut) head = `TIMEOUT (exit ${exitCode})`;
	else if (flags.spawnError) head = `SPAWN_ERROR (exit ${exitCode})`;
	else if (exitCode === 0) head = "PASS";
	else head = `FAIL (exit ${exitCode})`;
	const body = pick.replace(/\s+/g, " ").trim();
	const text = body ? `${head}: ${body}` : head;
	return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

export function runCommand(options: RunCommandOptions): Promise<RunCommandResult> {
	const {
		cwd,
		command,
		timeoutMs = 120_000,
		env = process.env,
		maxSummaryChars = 400,
		spawnImpl = spawn,
	} = options;

	return new Promise((resolve) => {
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
			resolve({
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
			if (stdout.length > 200_000) stdout = stdout.slice(-100_000);
		});
		child.stderr?.on("data", (chunk: Buffer | string) => {
			stderr += String(chunk);
			if (stderr.length > 200_000) stderr = stderr.slice(-100_000);
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

/**
 * Red must be a real failing test run — not pass, timeout, or missing binary.
 */
export function validateRedResult(result: RunCommandResult): { ok: boolean; reason: string } {
	if (result.timedOut || result.exitCode === 124) {
		return {
			ok: false,
			reason:
				`Red rejected: command timed out (exit 124). Fix the hang or raise timeout; timeouts are not valid failing tests.\n` +
				`Command: ${result.command}\n${result.summary}`,
		};
	}
	if (result.spawnError) {
		return {
			ok: false,
			reason:
				`Red rejected: command failed to spawn (missing binary / shell error).\n` +
				`Command: ${result.command}\n${result.summary}`,
		};
	}
	if (result.exitCode === 127 || result.exitCode === 126) {
		return {
			ok: false,
			reason:
				`Red rejected: infrastructure exit ${result.exitCode} (command not found / not executable).\n` +
				`Command: ${result.command}\n${result.summary}`,
		};
	}
	if (result.exitCode === 0) {
		return {
			ok: false,
			reason:
				`Expected a failing test run for red, but command exited 0.\n` +
				`Command: ${result.command}\n${result.summary}`,
		};
	}
	// Soft warn on empty output for non-zero (still accept — could be tap/quiet runner)
	return { ok: true, reason: result.summary };
}

export function validateGreenResult(result: RunCommandResult): { ok: boolean; reason: string } {
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

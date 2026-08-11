import { describe, expect, test } from "bun:test";
import { EventEmitter } from "node:events";
import {
	greenCoversRed,
	runCommand,
	validateGreenResult,
	validateRedResult,
} from "./run-command.ts";

function fakeSpawn(exitCode: number, stdout = "", stderr = "", opts?: { error?: Error }) {
	return (() => {
		const ee = new EventEmitter() as EventEmitter & {
			stdout: EventEmitter;
			stderr: EventEmitter;
			kill: () => void;
			pid: number;
		};
		ee.stdout = new EventEmitter();
		ee.stderr = new EventEmitter();
		ee.pid = 12345;
		ee.kill = () => {
			ee.emit("close", 124);
		};
		queueMicrotask(() => {
			if (opts?.error) {
				ee.emit("error", opts.error);
				return;
			}
			if (stdout) ee.stdout.emit("data", stdout);
			if (stderr) ee.stderr.emit("data", stderr);
			ee.emit("close", exitCode);
		});
		return ee;
	}) as unknown as typeof import("node:child_process").spawn;
}

/** Additive expected-red contract — exercised through current export without importing missing symbols. */
type ExpectedRedContract = {
	expectedTestId?: string;
	expectedFailureSignature?: string;
	matchMode?: "identity" | "signature" | "legacy";
	assuranceEnabled?: boolean;
	trustProfile?: "interactive" | "strict" | "overnight";
};

type RedClassification = {
	ok: boolean;
	reason: string;
	reasonCode?: string;
	cause?: string;
	assuranceEligible?: boolean;
	trustTier?: string;
	matchMode?: string;
};

function classifyRed(
	result: Parameters<typeof validateRedResult>[0],
	contract?: ExpectedRedContract,
): RedClassification {
	return (
		validateRedResult as unknown as (
			r: Parameters<typeof validateRedResult>[0],
			c?: ExpectedRedContract,
		) => RedClassification
	)(result, contract);
}

function baseFail(partial: Partial<Parameters<typeof validateRedResult>[0]> = {}) {
	return {
		exitCode: 1,
		command: "bun test",
		stdout: "",
		stderr: "",
		summary: "FAIL (exit 1)",
		...partial,
	};
}

describe("runCommand", () => {
	test("captures failure summary", async () => {
		const result = await runCommand({
			cwd: process.cwd(),
			command: "false",
			spawnImpl: fakeSpawn(1, "expected true\n", "error line\n"),
		});
		expect(result.exitCode).toBe(1);
		expect(result.summary).toMatch(/FAIL/);
	});

	test("captures pass", async () => {
		const result = await runCommand({
			cwd: process.cwd(),
			command: "true",
			spawnImpl: fakeSpawn(0, "ok\n"),
		});
		expect(result.exitCode).toBe(0);
		expect(result.summary).toMatch(/PASS/);
	});
});

describe("validateRedResult / validateGreenResult", () => {
	test("red requires non-zero real failure", () => {
		expect(
			validateRedResult({
				exitCode: 0,
				command: "t",
				stdout: "",
				stderr: "",
				summary: "PASS",
			}).ok,
		).toBe(false);
		expect(
			validateRedResult({
				exitCode: 1,
				command: "t",
				stdout: "",
				stderr: "",
				summary: "FAIL",
			}).ok,
		).toBe(true);
	});

	test("red rejects timeout 124", () => {
		expect(
			validateRedResult({
				exitCode: 124,
				command: "t",
				stdout: "",
				stderr: "",
				summary: "TIMEOUT",
				timedOut: true,
			}).ok,
		).toBe(false);
		expect(
			validateRedResult({
				exitCode: 124,
				command: "t",
				stdout: "",
				stderr: "",
				summary: "TIMEOUT",
			}).ok,
		).toBe(false);
	});

	test("red rejects command not found 127 and spawn errors", () => {
		expect(
			validateRedResult({
				exitCode: 127,
				command: "missing",
				stdout: "",
				stderr: "",
				summary: "not found",
			}).ok,
		).toBe(false);
		expect(
			validateRedResult({
				exitCode: 1,
				command: "x",
				stdout: "",
				stderr: "",
				summary: "SPAWN",
				spawnError: true,
			}).ok,
		).toBe(false);
	});

	test("green requires zero and rejects infra", () => {
		expect(
			validateGreenResult({
				exitCode: 1,
				command: "t",
				stdout: "",
				stderr: "",
				summary: "FAIL",
			}).ok,
		).toBe(false);
		expect(
			validateGreenResult({
				exitCode: 0,
				command: "t",
				stdout: "",
				stderr: "",
				summary: "PASS",
			}).ok,
		).toBe(true);
		expect(
			validateGreenResult({
				exitCode: 124,
				command: "t",
				stdout: "",
				stderr: "",
				summary: "TIMEOUT",
				timedOut: true,
			}).ok,
		).toBe(false);
	});
});

describe("greenCoversRed", () => {
	test("exact match", () => {
		expect(greenCoversRed("bun test foo.test.ts", "bun test foo.test.ts")).toBe(true);
	});

	test("broader suite (green token-prefix of red)", () => {
		expect(greenCoversRed("bun test a/b.test.ts", "bun test")).toBe(true);
		expect(greenCoversRed("bun test a/b.test.ts", "bun test a/b.test.ts")).toBe(true);
	});

	test("rejects bun -e and unrelated same binary", () => {
		expect(greenCoversRed("bun test a.test.ts", "bun -e '1'")).toBe(false);
		expect(greenCoversRed("bun test a.test.ts", "bun test b.test.ts")).toBe(false);
		expect(greenCoversRed("npm test", "npm run build")).toBe(false);
	});

	test("accepts green that still includes red focus path", () => {
		expect(
			greenCoversRed("bun test tests/unit/a.test.ts", "bun test tests/unit/a.test.ts --bail"),
		).toBe(true);
	});

	// E32 — broader green covering focused red remains compatible
	test("broader suite still covers focused causal-red classifier command", () => {
		expect(
			greenCoversRed(
				"bun test lib/bdd/run-command.test.ts lib/bdd/quality-gates.test.ts",
				"bun test",
			),
		).toBe(true);
		expect(
			greenCoversRed(
				"bun test lib/bdd/run-command.test.ts",
				"bun test lib/bdd/run-command.test.ts lib/bdd/quality-gates.test.ts",
			),
		).toBe(true);
	});
});

describe("expected-red identity and signature classifier (BDD-01 R1–R3)", () => {
	const expectedId = "rejects an unrelated failing assertion when the expected test id is absent";

	// E1
	test("accepts expected assertion when identity hits", () => {
		const check = classifyRed(
			baseFail({
				stdout: `FAIL ${expectedId}\nexpected true\n`,
				summary: `FAIL (exit 1): ${expectedId}`,
				failedTestHints: [expectedId],
			}),
			{ expectedTestId: expectedId, matchMode: "identity" },
		);
		expect(check.ok).toBe(true);
		expect(check.assuranceEligible).toBe(true);
		expect(`${check.cause ?? ""} ${check.reasonCode ?? ""} ${check.reason}`).toMatch(
			/expected.?assertion|identity|causal/i,
		);
	});

	// E2 — PRIMARY CAUSAL RED
	// Current production validateRedResult ignores contracts and returns ok:true for any non-zero.
	test("rejects an unrelated failing assertion when the expected test id is absent", () => {
		const check = classifyRed(
			baseFail({
				stdout: "FAIL other unrelated test\nexpected 2 received 3\n",
				summary: "FAIL (exit 1): other unrelated test",
				failedTestHints: ["other unrelated test"],
			}),
			{
				expectedTestId: expectedId,
				matchMode: "identity",
			},
		);
		// Causal signature: contract-aware classifier must reject; baseline currently accepts.
		expect(check.ok).toBe(false);
		expect(`${check.reason} ${check.reasonCode ?? ""} ${check.cause ?? ""}`).toMatch(
			/unrelated|missing|identity|expected.?test|absent/i,
		);
		expect(`${check.reason} ${check.reasonCode ?? ""}`).not.toMatch(
			/timeout|spawn|not found|import|Cannot find module/i,
		);
	});

	// E3
	test("rejects signature mismatch when expected id is present", () => {
		const check = classifyRed(
			baseFail({
				stdout: `FAIL ${expectedId}\nreceived ok: true for unrelated reasons\n`,
				summary: `FAIL (exit 1): ${expectedId}`,
				failedTestHints: [expectedId],
			}),
			{
				expectedTestId: expectedId,
				expectedFailureSignature: "current validator returns ok: true for a non-zero unrelated assertion",
				matchMode: "signature",
			},
		);
		expect(check.ok).toBe(false);
		expect(`${check.reason} ${check.reasonCode ?? ""} ${check.cause ?? ""}`).toMatch(
			/signature/i,
		);
	});

	// E4
	test("accepts when expected id and failure signature both appear", () => {
		const signature =
			"current validator returns ok: true for a non-zero unrelated assertion";
		const check = classifyRed(
			baseFail({
				stdout: `FAIL ${expectedId}\n${signature}\n`,
				summary: `FAIL (exit 1): ${expectedId}`,
				failedTestHints: [expectedId],
			}),
			{
				expectedTestId: expectedId,
				expectedFailureSignature: signature,
				matchMode: "signature",
			},
		);
		expect(check.ok).toBe(true);
		expect(check.assuranceEligible).toBe(true);
	});

	// E5
	test("rejects setup and import failures even with non-zero exit", () => {
		for (const text of [
			"Cannot find module './missing.ts'",
			"error: Cannot find package 'foo'",
			"SyntaxError: Unexpected token",
			"Jest encountered an unexpected token",
		]) {
			const check = classifyRed(
				baseFail({
					stdout: text,
					stderr: text,
					summary: `FAIL (exit 1): ${text}`,
					failedTestHints: [expectedId],
				}),
				{ expectedTestId: expectedId, matchMode: "identity" },
			);
			expect(check.ok).toBe(false);
			expect(`${check.reason} ${check.reasonCode ?? ""} ${check.cause ?? ""}`).toMatch(
				/setup|import|module|harness/i,
			);
		}
	});

	// E6–E9 reason codes remain distinct under contract
	test("emits distinct reason codes for timeout spawn infra and pass", () => {
		const timeout = classifyRed(
			baseFail({ exitCode: 124, timedOut: true, summary: "TIMEOUT" }),
			{ expectedTestId: expectedId, matchMode: "identity" },
		);
		const spawn = classifyRed(
			baseFail({ spawnError: true, summary: "SPAWN" }),
			{ expectedTestId: expectedId, matchMode: "identity" },
		);
		const missing = classifyRed(
			baseFail({ exitCode: 127, summary: "not found" }),
			{ expectedTestId: expectedId, matchMode: "identity" },
		);
		const notExec = classifyRed(
			baseFail({ exitCode: 126, summary: "not executable" }),
			{ expectedTestId: expectedId, matchMode: "identity" },
		);
		const pass = classifyRed(
			baseFail({ exitCode: 0, summary: "PASS" }),
			{ expectedTestId: expectedId, matchMode: "identity" },
		);
		for (const check of [timeout, spawn, missing, notExec, pass]) {
			expect(check.ok).toBe(false);
			expect(check.assuranceEligible ?? false).toBe(false);
		}
		const codes = [timeout, spawn, missing, notExec, pass].map(
			(c) => c.reasonCode ?? c.cause ?? c.reason,
		);
		// Distinct classification signals (not one generic blob)
		expect(new Set(codes.map((c) => c.toLowerCase().slice(0, 24))).size).toBeGreaterThanOrEqual(4);
		expect(`${timeout.reasonCode ?? ""} ${timeout.reason}`).toMatch(/timeout|124/i);
		expect(`${spawn.reasonCode ?? ""} ${spawn.reason}`).toMatch(/spawn/i);
		expect(`${missing.reasonCode ?? ""} ${missing.reason}`).toMatch(/127|not found|infra/i);
		expect(`${pass.reasonCode ?? ""} ${pass.reason}`).toMatch(/pass|exit 0|zero/i);
	});

	// E10 — legacy interactive without contract
	test("labels legacy interactive non-zero as non-assurance", () => {
		const check = classifyRed(
			baseFail({
				stdout: "FAIL some test\n",
				failedTestHints: ["some test"],
			}),
			// no expected-red contract; interactive default
			{ trustProfile: "interactive", matchMode: "legacy" },
		);
		// Back-compat: may still be ok for interactive recording…
		expect(check.ok).toBe(true);
		// …but must never be assurance-eligible without a contract.
		expect(check.assuranceEligible).toBe(false);
		expect(`${check.trustTier ?? ""} ${check.reasonCode ?? ""} ${check.cause ?? ""} ${check.reason}`).toMatch(
			/interactive_untrusted|legacy/i,
		);
	});

	// E11
	test("requires expected test id when assurance is enabled", () => {
		const check = classifyRed(
			baseFail({
				stdout: "FAIL some test\n",
				failedTestHints: ["some test"],
			}),
			{ assuranceEnabled: true },
		);
		expect(check.ok).toBe(false);
		expect(`${check.reason} ${check.reasonCode ?? ""}`).toMatch(
			/contract|expectedTestId|required/i,
		);
	});

	// E37 — PRIMARY CAUSAL RED (adversarial review)
	// Current production identityHit accepts reverse-substring: expectedId.includes(shortHint).
	test("rejects a short unrelated hint contained inside the expected test id", () => {
		// shortHint is deliberately a token inside expectedId, not the full identity.
		const shortHint = "unrelated";
		expect(expectedId.includes(shortHint)).toBe(true);
		expect(shortHint.includes(expectedId)).toBe(false);

		const check = classifyRed(
			baseFail({
				stdout: `FAIL ${shortHint}\nexpected 1 received 2\n`,
				summary: `FAIL (exit 1): ${shortHint}`,
				failedTestHints: [shortHint],
			}),
			{
				expectedTestId: expectedId,
				matchMode: "identity",
			},
		);

		// Causal signature: reverse-substring must NOT count as identity.
		expect(check.ok).toBe(false);
		expect(check.assuranceEligible ?? false).toBe(false);
		expect(`${check.reason} ${check.reasonCode ?? ""} ${check.cause ?? ""}`).toMatch(
			/unrelated|missing|identity|expected.?test|absent|reverse|substring/i,
		);
		expect(`${check.reason} ${check.reasonCode ?? ""}`).not.toMatch(
			/timeout|spawn|not found|import|Cannot find module/i,
		);
	});

	// E47 — policyRejected is never red, even with non-126 exit + matching hint
	test("rejects policyRejected true even with non-126 exit and matching expected hint", () => {
		const check = classifyRed(
			baseFail({
				exitCode: 1,
				stdout: `FAIL ${expectedId}\n`,
				summary: `FAIL (exit 1): ${expectedId}`,
				failedTestHints: [expectedId],
				policyRejected: true,
			} as Parameters<typeof validateRedResult>[0]),
			{ expectedTestId: expectedId, matchMode: "identity" },
		);
		expect(check.ok).toBe(false);
		expect(check.assuranceEligible ?? false).toBe(false);
		expect(`${check.reason} ${check.reasonCode ?? ""} ${check.cause ?? ""}`).toMatch(
			/policy/i,
		);
	});
});

describe("trusted argv runner (BDD-01 R5)", () => {
	type SpawnCapture = {
		fileOrCmd: unknown;
		argsOrOpts: unknown;
		maybeOpts: unknown;
		calls: number;
	};

	function capturingSpawn(exitCode = 0, stdout = "ok\n"): {
		impl: typeof import("node:child_process").spawn;
		capture: SpawnCapture;
	} {
		const capture: SpawnCapture = { fileOrCmd: null, argsOrOpts: null, maybeOpts: null, calls: 0 };
		const impl = ((fileOrCmd: unknown, argsOrOpts?: unknown, maybeOpts?: unknown) => {
			capture.calls += 1;
			capture.fileOrCmd = fileOrCmd;
			capture.argsOrOpts = argsOrOpts;
			capture.maybeOpts = maybeOpts;
			return (fakeSpawn(exitCode, stdout) as unknown as () => EventEmitter)();
		}) as unknown as typeof import("node:child_process").spawn;
		return { impl, capture };
	}

	// E14
	test("trusted argv uses shell false with file and args", async () => {
		const { impl, capture } = capturingSpawn(0, "ok\n");
		const result = await (
			runCommand as unknown as (opts: Record<string, unknown>) => Promise<{
				exitCode: number;
				policyRejected?: boolean;
			}>
		)({
			cwd: process.cwd(),
			// Additive trusted form — implementer must honor argv over legacy shell string.
			argv: {
				version: 1,
				file: process.execPath,
				args: ["-e", "console.log('ok')"],
			},
			trust: "trusted",
			spawnImpl: impl,
		});
		expect(result.policyRejected ?? false).toBe(false);
		expect(capture.calls).toBe(1);
		// node:child_process spawn(file, args, { shell:false })
		const opts =
			capture.maybeOpts && typeof capture.maybeOpts === "object"
				? (capture.maybeOpts as { shell?: boolean })
				: (capture.argsOrOpts as { shell?: boolean } | undefined);
		expect(opts?.shell).toBe(false);
		expect(typeof capture.fileOrCmd).toBe("string");
		expect(Array.isArray(capture.argsOrOpts) || Array.isArray((capture.argsOrOpts as { args?: string[] })?.args)).toBe(
			true,
		);
	});

	// E15 / E16
	test("scrubs secret-like env and keeps allowlisted deterministic keys", async () => {
		const { impl, capture } = capturingSpawn(0, "ok\n");
		await (
			runCommand as unknown as (opts: Record<string, unknown>) => Promise<unknown>
		)({
			cwd: process.cwd(),
			argv: { version: 1, file: process.execPath, args: ["-e", "0"] },
			trust: "trusted",
			env: {
				PATH: "/usr/bin",
				HOME: "/home/dev",
				LANG: "C",
				TMPDIR: "/tmp",
				CI: "1",
				OPENAI_API_KEY: "sk-secret",
				GH_TOKEN: "ghp_secret",
				DATABASE_PASSWORD: "p@ss",
				MY_SECRET: "nope",
				NORMAL_FLAG: "keep-or-drop-non-allowlisted",
			},
			spawnImpl: impl,
		});
		const opts =
			(capture.maybeOpts as { env?: Record<string, string> } | undefined) ??
			(capture.argsOrOpts as { env?: Record<string, string> } | undefined);
		const env = opts?.env ?? {};
		expect(env.OPENAI_API_KEY).toBeUndefined();
		expect(env.GH_TOKEN).toBeUndefined();
		expect(env.DATABASE_PASSWORD).toBeUndefined();
		expect(env.MY_SECRET).toBeUndefined();
		expect(env.PATH).toBe("/usr/bin");
		expect(env.HOME).toBe("/home/dev");
		expect(env.LANG).toBe("C");
		expect(env.TMPDIR).toBe("/tmp");
		expect(env.CI).toBe("1");
	});

	// E17
	test("rejects argv executable with metacharacters without spawn", async () => {
		const { impl, capture } = capturingSpawn(0);
		const result = await (
			runCommand as unknown as (opts: Record<string, unknown>) => Promise<{
				exitCode: number;
				policyRejected?: boolean;
				spawnError?: boolean;
			}>
		)({
			cwd: process.cwd(),
			argv: { version: 1, file: "echo; rm -rf /", args: [] },
			trust: "trusted",
			spawnImpl: impl,
		});
		expect(capture.calls).toBe(0);
		expect(result.policyRejected).toBe(true);
		expect(result.exitCode).not.toBe(0);
	});

	// E18
	test("rejects argv cwd escape without spawn", async () => {
		const { impl, capture } = capturingSpawn(0);
		const result = await (
			runCommand as unknown as (opts: Record<string, unknown>) => Promise<{
				exitCode: number;
				policyRejected?: boolean;
			}>
		)({
			cwd: process.cwd(),
			argv: {
				version: 1,
				file: process.execPath,
				args: ["-e", "0"],
				cwd: "../../outside",
			},
			projectRoot: process.cwd(),
			trust: "trusted",
			spawnImpl: impl,
		});
		expect(capture.calls).toBe(0);
		expect(result.policyRejected).toBe(true);
	});

	// E19
	test("bounds retained argv output deterministically", async () => {
		// Keep payload large enough to exceed the per-command override without blowing test runtime.
		const huge = "x".repeat(12_000);
		const { impl } = capturingSpawn(0, huge);
		const result = await (
			runCommand as unknown as (opts: Record<string, unknown>) => Promise<{
				stdout: string;
				outputTruncated?: boolean;
				bounded?: boolean;
			}>
		)({
			cwd: process.cwd(),
			// Legacy command string keeps the current runner path alive; trusted argv must still bound.
			command: "true",
			argv: { version: 1, file: process.execPath, args: ["-e", "0"], maxOutputBytes: 4_096 },
			trust: "trusted",
			maxSummaryChars: 200,
			spawnImpl: impl,
		});
		expect(result.stdout.length).toBeLessThanOrEqual(4_096);
		expect(result.stdout.length).toBeLessThan(huge.length);
		expect(Boolean(result.outputTruncated ?? result.bounded)).toBe(true);
	});

	// E45 — trust:"trusted" without argv must not shell-fallback
	test("rejects trust trusted without argv before shell fallback", async () => {
		const { impl, capture } = capturingSpawn(0, "pwned\n");
		const result = await (
			runCommand as unknown as (opts: Record<string, unknown>) => Promise<{
				exitCode: number;
				policyRejected?: boolean;
				summary?: string;
			}>
		)({
			cwd: process.cwd(),
			command: "echo pwned",
			trust: "trusted",
			// deliberately omit argv
			spawnImpl: impl,
		});
		expect(capture.calls).toBe(0);
		expect(result.policyRejected).toBe(true);
		expect(result.exitCode).not.toBe(0);
		expect(`${result.summary ?? ""}`).toMatch(/policy|argv|trusted/i);
	});

	// E46 — in-project symlink cwd that realpaths outside project must reject without spawn
	test("rejects argv cwd symlink escape using realpath without spawn", async () => {
		const { mkdtempSync, mkdirSync, symlinkSync, rmSync, realpathSync } = await import("node:fs");
		const { join } = await import("node:path");
		const { tmpdir } = await import("node:os");

		const root = mkdtempSync(join(tmpdir(), "bdd01-cwd-root-"));
		const outside = mkdtempSync(join(tmpdir(), "bdd01-cwd-outside-"));
		const linkName = "escape-link";
		const linkPath = join(root, linkName);
		try {
			mkdirSync(root, { recursive: true });
			symlinkSync(outside, linkPath);
			// Sanity: lexical path is in-project; realpath escapes.
			expect(linkPath.startsWith(root)).toBe(true);
			expect(realpathSync(linkPath)).toBe(realpathSync(outside));

			const { impl, capture } = capturingSpawn(0);
			const result = await (
				runCommand as unknown as (opts: Record<string, unknown>) => Promise<{
					exitCode: number;
					policyRejected?: boolean;
					summary?: string;
				}>
			)({
				cwd: root,
				projectRoot: root,
				argv: {
					version: 1,
					file: process.execPath,
					args: ["-e", "0"],
					cwd: linkName,
				},
				trust: "trusted",
				spawnImpl: impl,
			});
			expect(capture.calls).toBe(0);
			expect(result.policyRejected).toBe(true);
			expect(result.exitCode).not.toBe(0);
			expect(`${result.summary ?? ""}`).toMatch(/cwd|escape|realpath|symlink|policy/i);
		} finally {
			rmSync(root, { recursive: true, force: true });
			rmSync(outside, { recursive: true, force: true });
		}
	});
});

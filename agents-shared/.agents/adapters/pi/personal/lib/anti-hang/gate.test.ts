import { describe, expect, test } from "bun:test";
import {
	DEFAULT_BASH_TIMEOUT_SEC,
	DEFAULT_CTX_TIMEOUT_MS,
	MAX_BASH_TIMEOUT_SEC,
	MAX_CTX_TIMEOUT_MS,
	ensureBashTimeout,
	ensureCtxTimeout,
	evaluateHangGate,
	extractShellCommands,
	isUnboundedRootWalk,
} from "./gate.ts";

describe("isUnboundedRootWalk", () => {
	test("blocks find from filesystem root", () => {
		expect(isUnboundedRootWalk("find / -name '*claude-code*' -type d")).toBe(true);
		expect(isUnboundedRootWalk("find / -type d")).toBe(true);
		expect(isUnboundedRootWalk("find /")).toBe(true);
		expect(isUnboundedRootWalk("  find   /  -name x")).toBe(true);
	});

	test("blocks root walk inside chains", () => {
		expect(isUnboundedRootWalk("true && find / -name x | head")).toBe(true);
		expect(isUnboundedRootWalk("ls; find / -name y")).toBe(true);
		expect(isUnboundedRootWalk("find / | head")).toBe(true);
	});

	test("blocks root globs, dots, and quoted root", () => {
		expect(isUnboundedRootWalk("find /* -name x")).toBe(true);
		expect(isUnboundedRootWalk("find /. -name x")).toBe(true);
		expect(isUnboundedRootWalk("find /.. -name x")).toBe(true);
		expect(isUnboundedRootWalk('find "/" -name x')).toBe(true);
		expect(isUnboundedRootWalk("find '/' -type d")).toBe(true);
	});

	test("blocks updatedb and ls -R /", () => {
		expect(isUnboundedRootWalk("updatedb")).toBe(true);
		expect(isUnboundedRootWalk("ls -R /")).toBe(true);
		expect(isUnboundedRootWalk("ls -laR /")).toBe(true);
	});

	test("allows scoped finds", () => {
		expect(isUnboundedRootWalk("find /Users/leonardoribeiro -maxdepth 4 -type d")).toBe(false);
		expect(isUnboundedRootWalk("find . -name '*.ts'")).toBe(false);
		expect(isUnboundedRootWalk("find /opt/homebrew -name pi")).toBe(false);
		expect(isUnboundedRootWalk("find /Users -maxdepth 2 -type d")).toBe(false);
		expect(isUnboundedRootWalk("rg -n goal src")).toBe(false);
		expect(isUnboundedRootWalk("ls -la /")).toBe(false);
		expect(isUnboundedRootWalk("find /Users/* -maxdepth 1")).toBe(false);
	});
});

describe("extractShellCommands", () => {
	test("bash command", () => {
		expect(extractShellCommands("bash", { command: "echo hi" })).toEqual(["echo hi"]);
	});

	test("ctx_batch_execute commands array", () => {
		expect(
			extractShellCommands("ctx_batch_execute", {
				commands: [
					{ label: "a", command: "ls" },
					{ label: "b", command: "find / -name x" },
				],
			}),
		).toEqual(["ls", "find / -name x"]);
	});

	test("ctx_execute shell code", () => {
		expect(
			extractShellCommands("ctx_execute", { language: "shell", code: "find / -name x" }),
		).toEqual(["find / -name x"]);
	});

	test("ignores non-shell ctx_execute", () => {
		expect(
			extractShellCommands("ctx_execute", {
				language: "javascript",
				code: "console.log('find /')",
			}),
		).toEqual([]);
	});
});

describe("ensureBashTimeout / ensureCtxTimeout", () => {
	test("injects defaults when missing", () => {
		expect(ensureBashTimeout({}).timeout).toBe(DEFAULT_BASH_TIMEOUT_SEC);
		expect(ensureCtxTimeout({}).timeout).toBe(DEFAULT_CTX_TIMEOUT_MS);
	});

	test("leaves valid timeouts alone", () => {
		expect(ensureBashTimeout({ timeout: 30 })).toEqual({});
		expect(ensureCtxTimeout({ timeout: 5000 })).toEqual({});
	});

	test("caps excessive timeouts", () => {
		expect(ensureBashTimeout({ timeout: 99999 }).timeout).toBe(MAX_BASH_TIMEOUT_SEC);
		expect(ensureCtxTimeout({ timeout: 9e12 }).timeout).toBe(MAX_CTX_TIMEOUT_MS);
	});
});

describe("evaluateHangGate", () => {
	test("blocks root find on bash", () => {
		const r = evaluateHangGate("bash", { command: "find / -name x" });
		expect(r.action).toBe("block");
	});

	test("blocks root find inside ctx_batch_execute", () => {
		const r = evaluateHangGate("ctx_batch_execute", {
			commands: [
				{ label: "docs", command: "ls docs" },
				{ label: "claude", command: "find / -name '*claude-code*' -type d" },
			],
			queries: ["goal"],
		});
		expect(r.action).toBe("block");
		if (r.action === "block") {
			expect(r.reason).toContain("Anti-hang");
		}
	});

	test("patches bash timeout when missing", () => {
		const r = evaluateHangGate("bash", { command: "sleep 1" });
		expect(r.action).toBe("patch");
		if (r.action === "patch") {
			expect(r.patches.timeout).toBe(DEFAULT_BASH_TIMEOUT_SEC);
		}
	});

	test("patches ctx_batch_execute timeout when missing", () => {
		const r = evaluateHangGate("ctx_batch_execute", {
			commands: [{ label: "a", command: "ls" }],
			queries: ["x"],
		});
		expect(r.action).toBe("patch");
		if (r.action === "patch") {
			expect(r.patches.timeout).toBe(DEFAULT_CTX_TIMEOUT_MS);
		}
	});

	test("allows healthy scoped batch with timeout already set", () => {
		const r = evaluateHangGate("ctx_batch_execute", {
			commands: [{ label: "a", command: "find . -maxdepth 2 -type f" }],
			queries: ["x"],
			timeout: 30_000,
		});
		expect(r.action).toBe("allow");
	});
});

/**
 * SEC-00 — Minimum fleet containment contract (Test Designer red lock).
 *
 * Fixture-only. No live fleet_dispatch, no pi-subagents child spawn, no model.
 * child-policy.ts is loaded via guarded dynamic import so absence becomes a
 * named assertion failure (not module/setup/timeout/126/127).
 */
import { afterEach, describe, expect, test } from "bun:test";
import {
	chmodSync,
	existsSync,
	mkdtempSync,
	mkdirSync,
	readFileSync,
	rmSync,
	statSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { buildFleetPlan } from "./plan.ts";

const packageRoot = resolve(import.meta.dir, "../..");
const agentsDir = join(packageRoot, "agents");
const policyModuleUrl = new URL("./child-policy.ts", import.meta.url);
const agenticFleetSourcePath = join(packageRoot, "extensions/agentic-fleet.ts");

const CANONICAL_AGENTS = ["fleet-researcher", "fleet-reviewer", "fleet-ux"] as const;
const MUTATION_TOOLS = [
	"write",
	"edit",
	"bash",
	"apply_patch",
	"subagent",
	"shell",
	"exec",
	"terminal",
	"notebook_edit",
] as const;
const NETWORK_TOOLS = [
	"curl",
	"fetch",
	"web_search",
	"browser",
	"agent-browser",
	"http",
] as const;
const FORBIDDEN_PRESTART = [
	"NODE_OPTIONS",
	"BASH_ENV",
	"ENV",
	"LD_PRELOAD",
	"DYLD_INSERT_LIBRARIES",
	"PYTHONSTARTUP",
	"PERL5OPT",
] as const;

const SYNTHETIC_SECRET = "sec00-synthetic-secret-value-DO-NOT-LEAK";

type PolicyModule = {
	FLEET_CHILD_POLICY_ACK_ID?: string;
	CHILD_POLICY_EXTENSION?: string;
	assertCanonicalFleetAgentContract?: (input: {
		name: string;
		frontmatter: string;
		tools: string[];
		extensions: string[];
		subagentOnlyExtensions: string[];
		raw: string;
	}) => void;
	evaluateInspectionPath?: (input: {
		cwd: string;
		tool: "read" | "grep" | "find" | "ls";
		target: string;
		home?: string;
	}) => { allowed: boolean; reason?: string };
	sanitizeChildEnvironment?: (
		env: Record<string, string | undefined>,
	) => {
		env: Record<string, string>;
		removedKeys: string[];
	};
	assertSafeLaunchEnvironment?: (
		env: Record<string, string | undefined>,
	) => { ok: true } | { ok: false; code: string; keys?: string[] };
	recordBlockedAttempt?: (
		auditPath: string,
		record: Record<string, unknown>,
	) => void;
	preflightFleetContainment?: (input: {
		agents: string[];
		agentScope?: unknown;
		env?: Record<string, string | undefined>;
		topic?: string;
	}) =>
		| { ok: true }
		| {
				ok: false;
				code: string;
				reason?: string;
				blocked?: true;
		  };
};

type LoadResult =
	| { ok: true; mod: PolicyModule }
	| { ok: false; error: unknown };

let tempDirs: string[] = [];

afterEach(() => {
	for (const dir of tempDirs.splice(0)) {
		try {
			rmSync(dir, { recursive: true, force: true });
		} catch {
			// best-effort cleanup
		}
	}
});

function tempDir(prefix: string): string {
	const dir = mkdtempSync(join(tmpdir(), prefix));
	tempDirs.push(dir);
	return dir;
}

/** Guarded dynamic import — never throws into the Bun harness as setup failure. */
async function loadChildPolicy(): Promise<LoadResult> {
	try {
		const mod = (await import(policyModuleUrl.href)) as PolicyModule;
		return { ok: true, mod };
	} catch (error) {
		return { ok: false, error };
	}
}

function requirePolicy(loaded: LoadResult): PolicyModule {
	expect(
		loaded.ok,
		"child-policy module must exist so fleet containment can lock bash/mutation/policy extension/agentScope before RPC",
	).toBe(true);
	if (!loaded.ok) {
		throw new Error("unreachable: child-policy missing (assertion should have failed)");
	}
	return loaded.mod;
}

function requireFn<K extends keyof PolicyModule>(
	mod: PolicyModule,
	name: K,
	why: string,
): NonNullable<PolicyModule[K]> {
	const value = mod[name];
	expect(typeof value, why).toBe("function");
	return value as NonNullable<PolicyModule[K]>;
}

function readAgent(name: (typeof CANONICAL_AGENTS)[number]): string {
	return readFileSync(join(agentsDir, `${name}.md`), "utf8");
}

function frontmatterBlock(raw: string): string {
	const parts = raw.split("---");
	expect(parts.length, `agent frontmatter missing in definition`).toBeGreaterThanOrEqual(3);
	return parts[1] ?? "";
}

function parseTools(fm: string): string[] {
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

function agenticFleetSource(): string {
	return readFileSync(agenticFleetSourcePath, "utf8");
}

// ---------------------------------------------------------------------------
// SEC-00 R2/R3/R6/R7 — canonical agent capability lock
// ---------------------------------------------------------------------------
describe("SEC-00 R2/R3/R6/R7 > locks canonical fleet agent capabilities", () => {
	test("canonical agents forbid bash/mutation/network drift and require policy extension", async () => {
		// Static agent-definition oracle first — current bash is a causal red even before policy module exists.
		const snapshots = CANONICAL_AGENTS.map((name) => {
			const raw = readAgent(name);
			const fm = frontmatterBlock(raw);
			const tools = parseTools(fm);
			const extensions = [
				...parseListField(fm, "extensions"),
				...parseListField(fm, "subagentOnlyExtensions"),
			];
			const subOnly = parseListField(fm, "subagentOnlyExtensions");
			return { name, raw, fm, tools, extensions, subOnly };
		});

		for (const { name, fm, tools, extensions, subOnly } of snapshots) {
			// R1/R3 — mechanical deny of mutation + shell
			for (const banned of MUTATION_TOOLS) {
				expect(
					tools,
					`${name} must not declare mutation/shell tool ${banned} (bash/mutation remain uncontained)`,
				).not.toContain(banned);
			}

			// R6 — network tools
			for (const banned of NETWORK_TOOLS) {
				expect(tools, `${name} must not declare generic network tool ${banned}`).not.toContain(
					banned,
				);
			}
			if (name === "fleet-researcher") {
				expect(tools, "fleet-researcher must expose xai_web_search only as network tool").toContain(
					"xai_web_search",
				);
			} else {
				expect(
					tools,
					`${name} must not expose xai_web_search or any network tool`,
				).not.toContain("xai_web_search");
			}

			// R3 — depth, context, no default checkout write
			expect(
				parseScalar(fm, "maxSubagentDepth"),
				`${name} must set maxSubagentDepth: 0`,
			).toBe("0");
			expect(
				parseScalar(fm, "defaultContext"),
				`${name} must use defaultContext: fresh`,
			).toBe("fresh");
			const output = parseScalar(fm, "output");
			expect(
				output === undefined || output === "false",
				`${name} must not declare default checkout output (got ${output ?? "undefined"})`,
			).toBe(true);

			// R7 — policy extension required on every role (static name check; module supplies canonical path)
			expect(
				extensions.some((e) => e.includes("child-policy")),
				`${name} missing policy extension (child-policy required; ambient extensions disabled)`,
			).toBe(true);

			if (name === "fleet-researcher") {
				expect(
					extensions.some((e) => e.includes("xai-web-search")),
					"fleet-researcher must include xAI web search extension",
				).toBe(true);
			} else {
				expect(
					extensions.every((e) => e.includes("child-policy")),
					`${name} must load exactly the policy extension (no extras)`,
				).toBe(true);
				expect(subOnly, `${name} must not declare subagentOnlyExtensions extras`).toEqual([]);
			}

			const perm = fm.match(/permissions:[\s\S]*?(?=\n[a-zA-Z_]|$)/)?.[0] ?? fm;
			for (const tool of ["write", "edit", "apply_patch", "subagent"]) {
				if (tools.includes(tool)) {
					expect(perm, `${name} permissions must deny ${tool}`).toMatch(
						new RegExp(`${tool}\\s*:\\s*deny`),
					);
				}
			}
		}

		// Policy module exports + deep contract (guarded dynamic import).
		const loaded = await loadChildPolicy();
		const mod = requirePolicy(loaded);

		expect(
			mod.FLEET_CHILD_POLICY_ACK_ID,
			"policy runtime acknowledgement id fleet-child-policy-v1 is required",
		).toBe("fleet-child-policy-v1");
		expect(
			typeof mod.CHILD_POLICY_EXTENSION === "string" && mod.CHILD_POLICY_EXTENSION.length > 0,
			"CHILD_POLICY_EXTENSION path/id is required for exact extension allowlists",
		).toBe(true);

		const assertContract = requireFn(
			mod,
			"assertCanonicalFleetAgentContract",
			"assertCanonicalFleetAgentContract must validate agent tool/extension contracts",
		);

		const policyExt = mod.CHILD_POLICY_EXTENSION as string;
		for (const { name, raw, fm, tools, extensions, subOnly } of snapshots) {
			expect(
				extensions.some((e) => e.includes("child-policy") || e === policyExt),
				`${name} missing policy extension (child-policy required)`,
			).toBe(true);
			expect(() =>
				assertContract({
					name,
					frontmatter: fm,
					tools,
					extensions: parseListField(fm, "extensions"),
					subagentOnlyExtensions: subOnly,
					raw,
				}),
			).not.toThrow();
		}
	});
});

// ---------------------------------------------------------------------------
// SEC-00 R4 — path inspection
// ---------------------------------------------------------------------------
describe("SEC-00 R4 > blocks secret and path-escape inspection", () => {
	test("blocks auth/secret/symlink/home escapes and allows in-cwd sources", async () => {
		const loaded = await loadChildPolicy();
		const mod = requirePolicy(loaded);
		const evaluate = requireFn(
			mod,
			"evaluateInspectionPath",
			"evaluateInspectionPath must enforce cwd-confined secret-aware inspection (auth/outside child cwd)",
		);

		const root = tempDir("sec00-r4-");
		const cwd = join(root, "repo");
		const home = join(root, "home");
		mkdirSync(join(cwd, "src"), { recursive: true });
		mkdirSync(join(home, ".pi/agent"), { recursive: true });
		writeFileSync(join(cwd, "src/example.ts"), "export const ok = 1;\n");
		writeFileSync(join(cwd, ".env.local"), "SECRET=1\n");
		writeFileSync(join(cwd, ".npmrc"), "//registry=…\n");
		writeFileSync(join(cwd, "id_rsa"), "-----BEGIN PRIVATE KEY-----\n");
		const authPath = join(home, ".pi/agent/auth.json");
		writeFileSync(authPath, JSON.stringify({ token: SYNTHETIC_SECRET }));
		const linkToAuth = join(cwd, "escape-auth.json");
		symlinkSync(authPath, linkToAuth);

		const allow = evaluate({ cwd, tool: "read", target: "src/example.ts", home });
		expect(allow.allowed, "in-cwd source read must be allowed").toBe(true);

		const denials: Array<{ tool: "read" | "grep" | "find" | "ls"; target: string; note: string }> =
			[
				{ tool: "read", target: authPath, note: "auth.json absolute" },
				{ tool: "read", target: linkToAuth, note: "symlink to auth" },
				{ tool: "read", target: join(cwd, ".env.local"), note: ".env.local" },
				{ tool: "read", target: join(cwd, ".npmrc"), note: ".npmrc" },
				{ tool: "read", target: join(cwd, "id_rsa"), note: "private key" },
				{ tool: "read", target: "/proc/self/environ", note: "pseudo environ" },
				{ tool: "read", target: "/dev/fd/0", note: "dev fd" },
				{ tool: "read", target: join(cwd, "..", "home", ".pi/agent/auth.json"), note: ".. escape" },
				{ tool: "grep", target: home, note: "grep rooted at HOME" },
				{ tool: "read", target: `src/exam\0ple.ts`, note: "NUL" },
			];

		for (const d of denials) {
			const result = evaluate({ cwd, tool: d.tool, target: d.target, home });
			expect(
				result.allowed,
				`${d.note} must be blocked (auth/outside child cwd/secret path)`,
			).toBe(false);
			expect(
				`${result.reason ?? ""}`,
				`${d.note} denial must name auth, outside child cwd, or secret path`,
			).toMatch(/auth|outside child cwd|secret|denied|blocked|escape|symlink|pseudo|env/i);
		}
	});
});

// ---------------------------------------------------------------------------
// SEC-00 R5 — environment sanitization
// ---------------------------------------------------------------------------
describe("SEC-00 R5 > sanitizes inherited child environment", () => {
	test("strips secrets/providers/proxies and rejects dangerous pre-start keys", async () => {
		const loaded = await loadChildPolicy();
		const mod = requirePolicy(loaded);
		const sanitize = requireFn(
			mod,
			"sanitizeChildEnvironment",
			"sanitizeChildEnvironment must strip secret environment keys before model/tool work",
		);
		const assertLaunch = requireFn(
			mod,
			"assertSafeLaunchEnvironment",
			"assertSafeLaunchEnvironment must reject dangerous pre-start injection variables",
		);

		const inherited: Record<string, string | undefined> = {
			PATH: "/usr/bin:/bin",
			HOME: "/tmp/sec00-home",
			LANG: "en_US.UTF-8",
			TMPDIR: "/tmp",
			USER: "sec00",
			PI_SUBAGENT_DEPTH: "0",
			PI_SUBAGENT_PERMISSION_POLICY: "{}",
			PI_INTERCOM_SESSION: "sess-1",
			GITHUB_TOKEN: SYNTHETIC_SECRET,
			XAI_API_KEY: SYNTHETIC_SECRET,
			AWS_SECRET_ACCESS_KEY: SYNTHETIC_SECRET,
			PI_AUTH_PATH: "/tmp/leaky-auth.json",
			HTTPS_PROXY: "http://proxy.example:8080",
			OPENAI_API_KEY: SYNTHETIC_SECRET,
			NODE_OPTIONS: "--require ./evil.js",
		};

		const sanitized = sanitize(inherited);
		const env = sanitized.env;
		const blob = JSON.stringify(sanitized);

		for (const key of [
			"GITHUB_TOKEN",
			"XAI_API_KEY",
			"AWS_SECRET_ACCESS_KEY",
			"PI_AUTH_PATH",
			"HTTPS_PROXY",
			"OPENAI_API_KEY",
			"NODE_OPTIONS",
		]) {
			expect(env[key], `secret environment key ${key} must be absent after sanitization`).toBeUndefined();
			expect(sanitized.removedKeys, `removedKeys must include ${key}`).toContain(key);
		}

		for (const key of ["PATH", "HOME", "LANG", "TMPDIR", "PI_SUBAGENT_DEPTH", "PI_INTERCOM_SESSION"]) {
			expect(env[key], `runtime/control key ${key} must be retained`).toBe(inherited[key]);
		}

		expect(blob, "synthetic secret value must never enter sanitize outputs/audits").not.toContain(
			SYNTHETIC_SECRET,
		);

		// Pre-start injection must fail closed at parent preflight (not “delete after start”).
		for (const key of FORBIDDEN_PRESTART) {
			const dangerous = { PATH: "/usr/bin", [key]: "inject" };
			const launch = assertLaunch(dangerous);
			expect(launch.ok, `pre-start ${key} must fail closed before RPC`).toBe(false);
			if (!launch.ok) {
				expect(`${launch.code} ${launch.keys?.join(",") ?? ""}`).toMatch(
					/pre-start|dangerous|inject|NODE_OPTIONS|LD_PRELOAD|BASH_ENV|DYLD/i,
				);
			}
		}

		const cleanLaunch = assertLaunch({
			PATH: "/usr/bin",
			HOME: "/tmp",
			PI_SUBAGENT_DEPTH: "0",
		});
		expect(cleanLaunch.ok, "ordinary runtime env must pass launch preflight").toBe(true);
	});
});

// ---------------------------------------------------------------------------
// SEC-00 R8 — bounded redacted audit
// ---------------------------------------------------------------------------
describe("SEC-00 R8 > records bounded redacted blocked attempts", () => {
	test("writes mode-0600 JSONL without secrets, topic text, or raw env values", async () => {
		const loaded = await loadChildPolicy();
		const mod = requirePolicy(loaded);
		const record = requireFn(
			mod,
			"recordBlockedAttempt",
			"recordBlockedAttempt must append bounded redacted blocked audit records",
		);

		const dir = tempDir("sec00-r8-");
		const auditPath = join(dir, "blocked.jsonl");

		record(auditPath, {
			agent: "fleet-reviewer",
			runId: "run-1",
			tool: "read",
			action: "read",
			reason: "auth-path-denied",
			args: { path: "~/.pi/agent/auth.json", token: SYNTHETIC_SECRET },
		});
		record(auditPath, {
			agent: "fleet-reviewer",
			runId: "run-1",
			tool: "write",
			action: "write",
			reason: "mutation-tool-denied",
			args: { path: "src/x.ts", content: "nope" },
		});
		record(auditPath, {
			agent: "worker",
			tool: "dispatch",
			action: "dispatch",
			reason: "uncontained-agent",
			args: { topic: "SECRET_TOPIC_SHOULD_NOT_PERSIST", agent: "worker" },
		});

		expect(existsSync(auditPath), "audit JSONL must be created").toBe(true);
		const mode = statSync(auditPath).mode & 0o777;
		expect(mode, "audit file mode must be 0600").toBe(0o600);

		const body = readFileSync(auditPath, "utf8");
		const lines = body.trim().split("\n").filter(Boolean);
		expect(lines.length, "three blocked records expected").toBe(3);

		for (const line of lines) {
			const row = JSON.parse(line) as Record<string, unknown>;
			expect(row).toMatchObject({
				// bounded metadata
			});
			expect(typeof row.timestamp === "string" || typeof row.ts === "string").toBe(true);
			expect(typeof row.agent).toBe("string");
			expect(typeof row.tool === "string" || typeof row.action === "string").toBe(true);
			expect(typeof row.reason === "string" || typeof row.code === "string").toBe(true);
			const serialized = JSON.stringify(row);
			expect(serialized, "audit must not persist synthetic secret").not.toContain(SYNTHETIC_SECRET);
			expect(serialized, "audit must not persist fleet topic text").not.toContain(
				"SECRET_TOPIC_SHOULD_NOT_PERSIST",
			);
			expect(serialized).not.toMatch(/Bearer\s+\S+/i);
		}

		expect(body).toMatch(/auth-path-denied|auth/i);
		expect(body).toMatch(/mutation-tool-denied/);
		expect(body).toMatch(/uncontained-agent/);

		// Ensure implementer doesn't "pass" by chmod after world-readable write without enforcement.
		chmodSync(auditPath, 0o644);
		record(auditPath, {
			agent: "fleet-ux",
			tool: "bash",
			action: "bash",
			reason: "mutation-tool-denied",
			args: { cmd: "echo hi" },
		});
		const modeAfter = statSync(auditPath).mode & 0o777;
		expect(modeAfter, "re-open/append must restore mode 0600").toBe(0o600);
	});
});

// ---------------------------------------------------------------------------
// SEC-00 R2/R9 — dispatch preflight before RPC
// ---------------------------------------------------------------------------
describe("SEC-00 R2/R9 > rejects uncontained dispatch before RPC", () => {
	test("rejects uncontained agents, missing agentScope, dangerous env; agentic-fleet calls preflight before RPC", async () => {
		// Static seams first — missing agentScope on public payload and missing preflight wiring are causal reds today.
		const plan = buildFleetPlan({
			kind: "review",
			topic: "sec00-scope",
			count: 1,
		});
		const params = plan.subagentParams as Record<string, unknown>;
		expect(
			params.agentScope,
			"buildFleetPlan public payload missing agentScope:\"user\" (untrusted project overrides possible)",
		).toBe("user");

		const source = agenticFleetSource();
		expect(
			source,
			"agentic-fleet.ts must import preflightFleetContainment (or child-policy preflight)",
		).toMatch(/preflightFleetContainment|child-policy/);

		const dispatchIdx = source.indexOf("async function dispatchPlan");
		expect(dispatchIdx, "dispatchPlan must exist for pre-RPC containment seam").toBeGreaterThanOrEqual(
			0,
		);
		const dispatchRegion = source.slice(dispatchIdx, dispatchIdx + 2500);
		const regionPre = Math.max(
			dispatchRegion.indexOf("preflightFleetContainment"),
			dispatchRegion.indexOf("assertFleetContainment"),
			dispatchRegion.search(/preflight\w*Containment|containmentPreflight/),
		);
		const regionRpc = dispatchRegion.indexOf("callSubagentRpc");
		expect(
			regionPre,
			"dispatchPlan must invoke fail-closed containment preflight before callSubagentRpc",
		).toBeGreaterThanOrEqual(0);
		expect(regionRpc, "dispatchPlan must still call callSubagentRpc after preflight").toBeGreaterThan(
			regionPre,
		);

		// Runtime preflight helper (guarded dynamic import).
		const loaded = await loadChildPolicy();
		const mod = requirePolicy(loaded);
		const preflight = requireFn(
			mod,
			"preflightFleetContainment",
			"preflightFleetContainment must reject uncontained-agent and missing agentScope before RPC",
		);

		const worker = preflight({
			agents: ["worker"],
			agentScope: "user",
			env: { PATH: "/usr/bin" },
			topic: "should-not-appear-in-blocked-code-path-only",
		});
		expect(worker.ok, "agent worker must be rejected as uncontained-agent").toBe(false);
		if (!worker.ok) {
			expect(worker.blocked ?? true).toBe(true);
			expect(worker.code).toMatch(/uncontained-agent/);
			expect(JSON.stringify(worker)).not.toContain("should-not-appear-in-blocked-code-path-only");
		}

		for (const scope of [undefined, "both", "project", ""]) {
			const result = preflight({
				agents: ["fleet-reviewer"],
				agentScope: scope,
				env: { PATH: "/usr/bin" },
			});
			expect(result.ok, `agentScope ${String(scope)} must be rejected as untrusted-agent-scope`).toBe(
				false,
			);
			if (!result.ok) {
				expect(`${result.code} ${result.reason ?? ""}`).toMatch(
					/untrusted-agent-scope|agentScope/,
				);
			}
		}

		const dangerous = preflight({
			agents: ["fleet-reviewer"],
			agentScope: "user",
			env: { PATH: "/usr/bin", LD_PRELOAD: "/tmp/evil.so" },
		});
		expect(dangerous.ok, "dangerous launch environment must block before RPC").toBe(false);

		const clean = preflight({
			agents: ["fleet-reviewer"],
			agentScope: "user",
			env: { PATH: "/usr/bin", HOME: "/tmp", PI_SUBAGENT_DEPTH: "0" },
		});
		if (!clean.ok) {
			expect(clean.blocked ?? true).toBe(true);
			expect(clean.code).toMatch(
				/uncontained-agent|agent-contract|policy extension|bash|mutation|missing-policy|drift/i,
			);
		} else {
			expect(clean.ok).toBe(true);
		}

		// No live child: this test never calls callSubagentRpc or fleet_dispatch.
		expect(typeof buildFleetPlan).toBe("function");
	});
});

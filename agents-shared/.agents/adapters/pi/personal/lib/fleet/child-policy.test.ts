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
	XAI_WEB_SEARCH_EXTENSION?: string;
	default?: (pi: {
		on: (event: string, handler: (event: Record<string, unknown>) => unknown) => void;
		events?: { emit?: (event: string, payload: unknown) => void };
	}) => void;
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
		/** Injected installed-extension existence for deterministic preflight. */
		installedPolicyExtensionExists?: boolean;
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

// ===========================================================================
// SEC-00 review remediation regressions (accepted independent-review blockers)
// ===========================================================================

const EXACT_INSPECTION_TOOLS = ["read", "grep", "find", "ls"] as const;
const EXACT_INTERNAL_TOOLS = ["contact_supervisor", "intercom"] as const;
const EXACT_REVIEWER_TOOLS = [...EXACT_INSPECTION_TOOLS, ...EXACT_INTERNAL_TOOLS] as const;
const EXACT_RESEARCHER_TOOLS = [...EXACT_REVIEWER_TOOLS, "xai_web_search"] as const;
/** pi-subagents 0.45.2 rejects permissions.bash — deny only supported mutation keys. */
const PERMISSION_DENY_TOOLS = [
	"write",
	"edit",
	"apply_patch",
	"subagent",
	"notebook_edit",
] as const;

function sortedCopy(values: readonly string[]): string[] {
	return [...values].map((v) => v.trim()).filter(Boolean).sort();
}

function parsePermissionDenies(fm: string): string[] {
	const block = fm.match(/permissions:\s*\n([\s\S]*?)(?=\n[a-zA-Z_][^\n]*:|$)/)?.[1] ?? "";
	const denies: string[] = [];
	for (const line of block.split("\n")) {
		const m = line.match(/^\s*([A-Za-z0-9_-]+)\s*:\s*deny\s*$/);
		if (m?.[1]) denies.push(m[1]);
	}
	return denies.sort();
}

type ExtensionHarness = {
	acks: Array<{ event: string; payload: unknown }>;
	invokeTool: (
		toolName: string,
		input?: Record<string, unknown>,
	) => Promise<unknown>;
	restore: () => void;
};

/**
 * Deterministic child-policy extension harness (fixtures/mocks only).
 * Saves/restores process.env and process.cwd so registration sanitization
 * cannot leak across tests.
 */
async function installExtensionHarness(options?: {
	agent?: string;
	cwd?: string;
	env?: Record<string, string | undefined>;
	auditPath?: string;
}): Promise<ExtensionHarness> {
	const loaded = await loadChildPolicy();
	const mod = requirePolicy(loaded);
	const factory = mod.default;
	expect(
		typeof factory,
		"child-policy default export must be the runtime extension factory for harness tests",
	).toBe("function");

	const previousCwd = process.cwd();
	const previousEnv = { ...process.env };
	const acks: Array<{ event: string; payload: unknown }> = [];
	let toolHandler:
		| ((event: Record<string, unknown>) => unknown)
		| undefined;

	const restore = () => {
		for (const key of Object.keys(process.env)) {
			if (!(key in previousEnv)) delete process.env[key];
		}
		for (const [key, value] of Object.entries(previousEnv)) {
			if (value === undefined) delete process.env[key];
			else process.env[key] = value;
		}
		try {
			process.chdir(previousCwd);
		} catch {
			// best-effort
		}
	};

	try {
		// Replace env with a controlled synthetic set before registration.
		for (const key of Object.keys(process.env)) {
			delete process.env[key];
		}
		const baseEnv: Record<string, string | undefined> = {
			PATH: "/usr/bin:/bin",
			HOME: previousEnv.HOME ?? "/tmp",
			TMPDIR: previousEnv.TMPDIR ?? "/tmp",
			LANG: "en_US.UTF-8",
			PI_SUBAGENT_DEPTH: "0",
			PI_SUBAGENT_CHILD_AGENT: options?.agent ?? "fleet-reviewer",
			PI_SUBAGENT_RUN_ID: "harness-run-1",
			GITHUB_TOKEN: SYNTHETIC_SECRET,
			XAI_API_KEY: SYNTHETIC_SECRET,
			...(options?.env ?? {}),
		};
		if (options?.auditPath) {
			baseEnv.PI_SUBAGENT_PERMISSION_AUDIT_PATH = options.auditPath;
		}
		for (const [key, value] of Object.entries(baseEnv)) {
			if (value === undefined) delete process.env[key];
			else process.env[key] = value;
		}
		if (options?.cwd) process.chdir(options.cwd);

		const pi = {
			on(event: string, handler: (event: Record<string, unknown>) => unknown) {
				if (event === "tool_call") toolHandler = handler;
			},
			events: {
				emit(event: string, payload: unknown) {
					acks.push({ event, payload });
				},
			},
		};
		factory!(pi);
	} catch (error) {
		restore();
		throw error;
	}

	return {
		acks,
		invokeTool: async (toolName, input = {}) => {
			expect(typeof toolHandler, "extension must register a tool_call handler").toBe(
				"function",
			);
			return await toolHandler!({
				type: "tool_call",
				toolCallId: "tc-harness-1",
				toolName,
				input,
			});
		},
		restore,
	};
}

function expectBlocked(
	result: unknown,
	note: string,
	reasonRe: RegExp,
): asserts result is { block: true; reason: string } {
	expect(result && typeof result === "object", note).toBe(true);
	const row = result as { block?: unknown; reason?: unknown };
	expect(row.block, `${note} must block`).toBe(true);
	expect(String(row.reason ?? ""), `${note} reason`).toMatch(reasonRe);
}

// ---------------------------------------------------------------------------
// Review finding 1 — Pi-compatible path normalization
// ---------------------------------------------------------------------------
describe("SEC-00 review R4 > Pi-compatible path aliases and hardlink denial", () => {
	test("normalizes @, file://, trim/Unicode spaces; denies AUTH.JSON and hardlink-to-secret", async () => {
		const loaded = await loadChildPolicy();
		const mod = requirePolicy(loaded);
		const evaluate = requireFn(
			mod,
			"evaluateInspectionPath",
			"evaluateInspectionPath must apply Pi-compatible path normalization before allow/deny",
		);

		const root = tempDir("sec00-r4-review-");
		const cwd = join(root, "repo");
		const home = join(root, "home");
		mkdirSync(join(cwd, "src"), { recursive: true });
		mkdirSync(join(home, ".pi/agent"), { recursive: true });
		writeFileSync(join(cwd, "src/example.ts"), "export const ok = 1;\n");
		const authPath = join(home, ".pi/agent/auth.json");
		writeFileSync(authPath, JSON.stringify({ token: SYNTHETIC_SECRET }));

		// Hardlink-to-secret under a benign in-cwd name (inode alias bypass).
		const hardlinkPath = join(cwd, "harmless-notes.txt");
		let hardlinkCreated = false;
		try {
			const { linkSync } = await import("node:fs");
			linkSync(authPath, hardlinkPath);
			hardlinkCreated = true;
		} catch {
			hardlinkCreated = false;
		}
		expect(
			hardlinkCreated,
			"hardlink fixture must be creatable so hardlink-to-secret denial is assertion-based, not skipped",
		).toBe(true);

		// Case-variant secret basename (Darwin case-insensitive FS + defense-in-depth elsewhere).
		const authCasePath = join(cwd, "AUTH.JSON");
		writeFileSync(authCasePath, JSON.stringify({ token: SYNTHETIC_SECRET }));

		const { pathToFileURL } = await import("node:url");
		const fileUrlInCwd = pathToFileURL(join(cwd, "src/example.ts")).href;
		const fileUrlAuth = pathToFileURL(authPath).href;
		const fileUrlOutside = "file:///etc/passwd";

		const nbsp = "\u00A0"; // real Unicode NBSP for Pi normalizeUnicodeSpaces parity
		const allowedTargets = [
			"src/example.ts",
			"@src/example.ts",
			"  src/example.ts  ",
			`${nbsp}src/example.ts`,
			"src/./example.ts",
			"src//example.ts",
			fileUrlInCwd,
		];
		for (const target of allowedTargets) {
			const result = evaluate({ cwd, tool: "read", target, home });
			expect(
				result.allowed,
				`Pi-normalized in-cwd read must allow after @/file:///trim/Unicode/dot-segment handling: ${JSON.stringify(target)}`,
			).toBe(true);
		}

		const denied: Array<{ target: string; note: string }> = [
			{ target: fileUrlOutside, note: "file:// outside cwd (/etc/passwd)" },
			{ target: fileUrlAuth, note: "file:// auth.json" },
			{ target: `@${authPath}`, note: "leading @ absolute auth" },
			{ target: `  ${authPath}  `, note: "trimmed absolute auth" },
			{ target: authCasePath, note: "AUTH.JSON case-insensitive secret name" },
			{ target: hardlinkPath, note: "hardlink-to-secret denial" },
			{ target: join(cwd, "src", "..", "..", "home", ".pi", "agent", "auth.json"), note: "repeated .. segments to auth" },
		];

		for (const d of denied) {
			const result = evaluate({ cwd, tool: "read", target: d.target, home });
			expect(
				result.allowed,
				`${d.note} must be blocked (file://, @, AUTH.JSON, hardlink, or path alias)`,
			).toBe(false);
			expect(
				`${result.reason ?? ""}`,
				`${d.note} denial must name auth/secret/outside/hardlink/alias`,
			).toMatch(/auth|secret|outside child cwd|hardlink|denied|blocked|alias|escape/i);
		}
	});
});

// ---------------------------------------------------------------------------
// Review finding 2 — runtime extension harness
// ---------------------------------------------------------------------------
describe("SEC-00 review R10/R3/R4/R6 > runtime extension harness acknowledges and deny-closes tools", () => {
	test("acks fleet-child-policy-v1, sanitizes env, pathless grep/find/ls, role xAI, mutation/network/unknown", async () => {
		const root = tempDir("sec00-harness-");
		const cwd = join(root, "repo");
		const home = join(root, "home");
		const auditPath = join(root, "blocked.jsonl");
		mkdirSync(join(cwd, "src"), { recursive: true });
		mkdirSync(join(home, ".pi/agent"), { recursive: true });
		writeFileSync(join(cwd, "src/example.ts"), "export const ok = 1;\n");
		writeFileSync(join(home, ".pi/agent/auth.json"), "{}\n");

		// Reviewer harness
		const reviewer = await installExtensionHarness({
			agent: "fleet-reviewer",
			cwd,
			auditPath,
			env: {
				HOME: home,
				GITHUB_TOKEN: SYNTHETIC_SECRET,
				PI_SUBAGENT_API_TOKEN: SYNTHETIC_SECRET,
			},
		});
		try {
			// Exact acknowledgement for subagent:acknowledge-extension
			expect(
				reviewer.acks.some(
					(a) =>
						a.event === "subagent:acknowledge-extension" &&
						(a.payload as { id?: string })?.id === "fleet-child-policy-v1",
				),
				"runtime ack must emit subagent:acknowledge-extension with id fleet-child-policy-v1",
			).toBe(true);

			// Env sanitization on register (before model/tool work)
			expect(
				process.env.GITHUB_TOKEN,
				"extension registration must strip GITHUB_TOKEN before tool work",
			).toBeUndefined();
			expect(
				process.env.PI_SUBAGENT_API_TOKEN,
				"secret-shaped PI_SUBAGENT_* must be stripped at registration",
			).toBeUndefined();
			expect(process.env.PI_SUBAGENT_DEPTH, "control PI_SUBAGENT_DEPTH retained").toBe("0");
			expect(
				JSON.stringify(process.env),
				"synthetic secret must not remain in process.env after sanitization",
			).not.toContain(SYNTHETIC_SECRET);

			// Pathless grep/find/ls default to cwd (allow); missing read denied
			for (const tool of ["grep", "find", "ls"] as const) {
				const result = await reviewer.invokeTool(tool, {});
				expect(
					result === undefined || (result as { block?: boolean }).block !== true,
					`pathless ${tool} must default to cwd and be allowed`,
				).toBe(true);
			}
			const missingRead = await reviewer.invokeTool("read", {});
			expectBlocked(missingRead, "missing read path", /missing|path|read/i);

			// Mutation / network / unknown
			expectBlocked(
				await reviewer.invokeTool("write", { path: "src/x.ts", content: "nope" }),
				"mutation write",
				/mutation-tool-denied|mutation|write/i,
			);
			expectBlocked(
				await reviewer.invokeTool("bash", { command: "echo hi" }),
				"mutation bash",
				/mutation-tool-denied|mutation|bash/i,
			);
			expectBlocked(
				await reviewer.invokeTool("curl", { url: "https://example.com" }),
				"network curl",
				/network|curl|denied/i,
			);
			expectBlocked(
				await reviewer.invokeTool("totally_unknown_tool", {}),
				"unknown tool",
				/undeclared|unknown|denied/i,
			);

			// Reviewer xAI denied
			expectBlocked(
				await reviewer.invokeTool("xai_web_search", { query: "x" }),
				"reviewer xAI",
				/xai|network|researcher|denied/i,
			);

			// Outside / secret read-like targets denied
			expectBlocked(
				await reviewer.invokeTool("read", { path: join(home, ".pi/agent/auth.json") }),
				"auth read",
				/auth|secret|denied/i,
			);
			expectBlocked(
				await reviewer.invokeTool("grep", { path: home, pattern: "todo" }),
				"grep home",
				/outside child cwd|denied|home/i,
			);

			// In-cwd read allowed
			const okRead = await reviewer.invokeTool("read", { path: "src/example.ts" });
			expect(
				okRead === undefined || (okRead as { block?: boolean }).block !== true,
				"in-cwd read must be allowed",
			).toBe(true);

			// Case-normalized mutation tool name still denied
			expectBlocked(
				await reviewer.invokeTool("WRITE", { path: "x.ts", content: "x" }),
				"case-normalized WRITE",
				/mutation|WRITE|write|denied/i,
			);
		} finally {
			reviewer.restore();
		}

		// Researcher harness — xAI allowed
		const researcher = await installExtensionHarness({
			agent: "fleet-researcher",
			cwd,
			env: { HOME: home },
		});
		try {
			const xai = await researcher.invokeTool("xai_web_search", { query: "pi-subagents 0.45.2" });
			expect(
				xai === undefined || (xai as { block?: boolean }).block !== true,
				"researcher xai_web_search must be allowed",
			).toBe(true);
		} finally {
			researcher.restore();
		}
	});
});

// ---------------------------------------------------------------------------
// Review finding 3 — exact agent contracts
// ---------------------------------------------------------------------------
describe("SEC-00 review R2/R3/R6/R7 > exact tools, extensions, and permission denies", () => {
	test("locks exact tool/extension sets and permission denies even when tools omit mutation", async () => {
		const loaded = await loadChildPolicy();
		const mod = requirePolicy(loaded);
		const assertContract = requireFn(
			mod,
			"assertCanonicalFleetAgentContract",
			"assertCanonicalFleetAgentContract must enforce exact tools/extensions",
		);
		const policyExt =
			typeof mod.CHILD_POLICY_EXTENSION === "string"
				? mod.CHILD_POLICY_EXTENSION
				: "~/.pi/agent/personal/lib/fleet/child-policy.ts";
		const xaiExt =
			typeof mod.XAI_WEB_SEARCH_EXTENSION === "string"
				? mod.XAI_WEB_SEARCH_EXTENSION
				: "~/.pi/agent/personal/extensions/xai-web-search.ts";

		for (const name of CANONICAL_AGENTS) {
			const raw = readAgent(name);
			const fm = frontmatterBlock(raw);
			const tools = parseTools(fm);
			const extensions = parseListField(fm, "extensions");
			const subOnly = parseListField(fm, "subagentOnlyExtensions");
			const expectedTools =
				name === "fleet-researcher" ? EXACT_RESEARCHER_TOOLS : EXACT_REVIEWER_TOOLS;

			expect(
				sortedCopy(tools),
				`${name} must declare exact tools only (no ambient/network/mutation extras)`,
			).toEqual(sortedCopy(expectedTools));

			if (name === "fleet-researcher") {
				const allExt = [...extensions, ...subOnly];
				expect(allExt, "researcher must load exactly policy + xAI (2 entries)").toHaveLength(2);
				expect(
					allExt.some((e) => e.includes("child-policy") || e === policyExt),
					"researcher policy extension required",
				).toBe(true);
				expect(
					allExt.some((e) => e.includes("xai-web-search") || e === xaiExt),
					"researcher xAI extension required",
				).toBe(true);
				expect(
					allExt.every(
						(e) =>
							e.includes("child-policy") ||
							e === policyExt ||
							e.includes("xai-web-search") ||
							e === xaiExt,
					),
					"researcher extensions must be exactly policy + xAI (no ambient extras)",
				).toBe(true);
			} else {
				expect(extensions, `${name} must have exactly one extension`).toHaveLength(1);
				expect(
					extensions[0]?.includes("child-policy") || extensions[0] === policyExt,
					`${name} extension must be exactly the child-policy entry`,
				).toBe(true);
				expect(subOnly, `${name} subagentOnlyExtensions must be empty`).toEqual([]);
			}

			// Permission denies asserted even when forbidden tools are absent from tools.
			// bash must stay absent from tools AND absent from permissions (0.45.2 rejects permissions.bash);
			// runtime child-policy remains the bash defense-in-depth layer.
			const denies = parsePermissionDenies(fm);
			for (const tool of PERMISSION_DENY_TOOLS) {
				expect(
					denies,
					`${name} permissions must deny ${tool} even when tools omit it`,
				).toContain(tool);
			}
			expect(tools, `${name} must not declare bash in tools`).not.toContain("bash");
			expect(
				denies,
				`${name} must not declare permissions.bash (pi-subagents 0.45.2 rejects it)`,
			).not.toContain("bash");
			expect(
				fm,
				`${name} frontmatter must not include bash: deny under permissions`,
			).not.toMatch(/permissions:[\s\S]*\bbash\s*:\s*deny/i);

			// Contract helper accepts the live definition.
			expect(() =>
				assertContract({
					name,
					frontmatter: fm,
					tools,
					extensions,
					subagentOnlyExtensions: subOnly,
					raw,
				}),
			).not.toThrow();

			// Extra extension / extra tool must fail the contract helper.
			expect(() =>
				assertContract({
					name,
					frontmatter: fm,
					tools: [...tools, "bash"],
					extensions,
					subagentOnlyExtensions: subOnly,
					raw,
				}),
				`${name} contract must reject extra bash tool`,
			).toThrow(/bash|mutation|exact|tool/i);

			expect(() =>
				assertContract({
					name,
					frontmatter: fm,
					tools,
					extensions: [...extensions, "~/.pi/agent/evil-extra.ts"],
					subagentOnlyExtensions: subOnly,
					raw,
				}),
				`${name} contract must reject extra extension`,
			).toThrow(/extension|exact|extra|policy/i);
		}
	});
});

// ---------------------------------------------------------------------------
// Review finding 4 — parent/preflight environment + installed policy injection
// ---------------------------------------------------------------------------
describe("SEC-00 review R5/R9 > dangerous PI_SUBAGENT_PI_BINARY/NODE_PATH/BUN_OPTIONS and installed policy", () => {
	test("rejects PI_SUBAGENT_PI_BINARY, NODE_PATH, BUN_OPTIONS; strips secret-shaped PI_SUBAGENT_*; installed policy injection", async () => {
		const loaded = await loadChildPolicy();
		const mod = requirePolicy(loaded);
		const sanitize = requireFn(
			mod,
			"sanitizeChildEnvironment",
			"sanitizeChildEnvironment must strip secret-shaped PI_SUBAGENT_* keys",
		);
		const assertLaunch = requireFn(
			mod,
			"assertSafeLaunchEnvironment",
			"assertSafeLaunchEnvironment must reject PI_SUBAGENT_PI_BINARY, NODE_PATH, BUN_OPTIONS",
		);
		const preflight = requireFn(
			mod,
			"preflightFleetContainment",
			"preflightFleetContainment must honor installed-policy injection and fail closed when missing",
		);

		for (const key of ["PI_SUBAGENT_PI_BINARY", "NODE_PATH", "BUN_OPTIONS"] as const) {
			const launch = assertLaunch({ PATH: "/usr/bin", [key]: "/evil/or/inject" });
			expect(
				launch.ok,
				`pre-start ${key} must fail closed (dangerous fixed set includes PI_SUBAGENT_PI_BINARY/NODE_PATH/BUN_OPTIONS)`,
			).toBe(false);
			if (!launch.ok) {
				expect(`${launch.code} ${(launch.keys ?? []).join(",")}`).toMatch(
					new RegExp(`${key}|dangerous|pre-start|inject`, "i"),
				);
			}
		}

		const sanitized = sanitize({
			PATH: "/usr/bin",
			PI_SUBAGENT_DEPTH: "0",
			PI_SUBAGENT_PERMISSION_POLICY: "{}",
			PI_SUBAGENT_API_KEY: SYNTHETIC_SECRET,
			PI_SUBAGENT_TOKEN: SYNTHETIC_SECRET,
			PI_SUBAGENT_AUTH_PASSWORD: SYNTHETIC_SECRET,
			PI_INTERCOM_SESSION: "sess",
		});
		for (const key of [
			"PI_SUBAGENT_API_KEY",
			"PI_SUBAGENT_TOKEN",
			"PI_SUBAGENT_AUTH_PASSWORD",
		]) {
			expect(
				sanitized.env[key],
				`secret-shaped ${key} must be stripped (not blanket-allowed under PI_SUBAGENT_*)`,
			).toBeUndefined();
			expect(sanitized.removedKeys, `removedKeys must include ${key}`).toContain(key);
		}
		expect(sanitized.env.PI_SUBAGENT_DEPTH).toBe("0");
		expect(sanitized.env.PI_INTERCOM_SESSION).toBe("sess");
		expect(JSON.stringify(sanitized), "synthetic secret must not appear in sanitize output").not.toContain(
			SYNTHETIC_SECRET,
		);

		const missingInstalled = preflight({
			agents: ["fleet-reviewer"],
			agentScope: "user",
			env: { PATH: "/usr/bin" },
			installedPolicyExtensionExists: false,
		});
		expect(
			missingInstalled.ok,
			"missing installed policy extension must fail closed",
		).toBe(false);
		if (!missingInstalled.ok) {
			expect(`${missingInstalled.code} ${missingInstalled.reason ?? ""}`).toMatch(
				/missing-policy|installed|policy extension|child-policy/i,
			);
			expect(missingInstalled.blocked ?? true).toBe(true);
		}

		const clean = preflight({
			agents: ["fleet-reviewer"],
			agentScope: "user",
			env: { PATH: "/usr/bin", HOME: "/tmp", PI_SUBAGENT_DEPTH: "0" },
			installedPolicyExtensionExists: true,
		});
		expect(
			clean,
			"clean preflight through injected installed-extension existence must be exactly {ok:true}",
		).toEqual({ ok: true });

		// Dangerous binary/env still blocks even when installed policy is present.
		const dangerousBinary = preflight({
			agents: ["fleet-reviewer"],
			agentScope: "user",
			env: { PATH: "/usr/bin", PI_SUBAGENT_PI_BINARY: "/tmp/evil-pi" },
			installedPolicyExtensionExists: true,
		});
		expect(
			dangerousBinary.ok,
			"PI_SUBAGENT_PI_BINARY must block preflight even with installed policy present",
		).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// Review finding 6 — bounded audit + case-normalized tool names
// ---------------------------------------------------------------------------
describe("SEC-00 review R8 > bounded audit case-normalizes tool names", () => {
	test("persists lowercase tool/action and never stores raw secrets or topic text", async () => {
		const loaded = await loadChildPolicy();
		const mod = requirePolicy(loaded);
		const record = requireFn(
			mod,
			"recordBlockedAttempt",
			"recordBlockedAttempt must case-normalize tool names in bounded audit records",
		);

		const dir = tempDir("sec00-r8-case-");
		const auditPath = join(dir, "blocked.jsonl");
		record(auditPath, {
			agent: "fleet-reviewer",
			runId: "run-case",
			tool: "WRITE",
			action: "WRITE",
			reason: "mutation-tool-denied",
			args: { path: "src/x.ts", token: SYNTHETIC_SECRET, topic: "TOPIC_MUST_NOT_PERSIST" },
		});

		const line = readFileSync(auditPath, "utf8").trim().split("\n").at(-1) ?? "";
		const row = JSON.parse(line) as Record<string, unknown>;
		expect(
			String(row.tool),
			"audit tool-name matching is case-normalized (WRITE → write)",
		).toBe("write");
		expect(String(row.action)).toBe("write");
		const serialized = JSON.stringify(row);
		expect(serialized, "bounded audit must not persist synthetic secret").not.toContain(
			SYNTHETIC_SECRET,
		);
		expect(serialized, "bounded audit must not persist topic text").not.toContain(
			"TOPIC_MUST_NOT_PERSIST",
		);
		expect(serialized.length, "audit record must stay bounded").toBeLessThan(4000);
	});
});

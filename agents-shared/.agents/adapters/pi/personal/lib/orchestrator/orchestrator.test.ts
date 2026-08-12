import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const MODULE_URL = new URL("./index.ts", import.meta.url).href;
const REPO_ROOT = "/repo";
const SHA = "a".repeat(40);
const FINGERPRINT = "b".repeat(64);
const SYNTHETIC_SECRET = "orc01-secret-provider-body-DO-NOT-ECHO";
const OWNED_ROOT = "agents-shared/.agents/adapters/pi/personal/lib/orchestrator";
const EVIDENCE_REF = "docs/plans/work-packages/ORC-01.feature";

const PRIMITIVES = [
	"assurance_status",
	"assurance_plan_role",
	"assurance_spawn_role",
	"assurance_wait_role",
	"assurance_record_handoff",
	"assurance_request_approval",
] as const;

type OrchestratorApi = Record<(typeof PRIMITIVES)[number], (...args: any[]) => any>;

async function loadApi(): Promise<OrchestratorApi> {
	try {
		const module = await import(MODULE_URL) as Record<string, unknown>;
		for (const name of PRIMITIVES) {
			if (typeof module[name] !== "function") {
				throw new Error(`ORC01_ORCHESTRATOR_MISSING: exports exactly six assurance primitives (${name})`);
			}
		}
		const callable = Object.entries(module)
			.filter(([, value]) => typeof value === "function")
			.map(([name]) => name)
			.sort();
		expect(callable).toEqual([...PRIMITIVES].sort());
		return module as OrchestratorApi;
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		if (/cannot find|module not found|resolve/i.test(message)) {
			throw new Error("ORC01_ORCHESTRATOR_MISSING: exports exactly six assurance primitives");
		}
		throw error;
	}
}

function roleRequest(over: Record<string, unknown> = {}) {
	return {
		schemaVersion: 1,
		kind: "role-request",
		taskId: "orc-01-task",
		role: "implementer",
		phase: "green",
		goal: "Implement the bounded ORC-01 façade",
		writeScope: "production",
		ownedPaths: [OWNED_ROOT],
		forbiddenPaths: ["agents-shared/.agents/adapters/pi/personal/extensions/bdd-mode.ts"],
		tools: ["read", "edit", "write", "bash"],
		model: "openai/gpt-5.4",
		thinking: "high",
		budget: { maxTokens: 100_000, maxCostUsd: 5, maxDurationMs: 600_000 },
		artifacts: [{ path: EVIDENCE_REF, mediaType: "text/x-gherkin" }],
		...over,
	};
}

function statusInput(over: Record<string, unknown> = {}) {
	return {
		schemaVersion: 1,
		facts: {
			bdd: {
				authority: "bdd-mode",
				phase: "green",
				spawnPermitted: true,
				evidenceFingerprint: FINGERPRINT,
			},
			herdr: { authority: "herdr", status: "idle" },
			worktree: {
				authority: "worktree-board",
				writerState: "available",
				pathWriterCount: 0,
				busyWriterCount: 0,
				maxBusyWriters: 1,
			},
			fleet: { authority: "agentic-fleet", status: "idle" },
			trajectory: { authority: "trajectory", status: "pass" },
			budget: { authority: "cost-budget", status: "ok", profile: "interactive" },
		},
		...over,
	};
}

async function validPlan(api: OrchestratorApi, request = roleRequest()) {
	const result = await api.assurance_plan_role({ schemaVersion: 1, repoRoot: REPO_ROOT, request });
	expect(result).toMatchObject({ ok: true, outcome: "planned", code: "ORC01_ROLE_PLANNED" });
	return result.plan;
}

function spawnInput(plan: any, over: Record<string, unknown> = {}) {
	return {
		schemaVersion: 1,
		plan,
		candidateSha: SHA,
		facts: {
			bdd: {
				authority: "bdd-mode",
				phase: "green",
				spawnPermitted: true,
				current: true,
				planId: plan.planId,
				evidenceFingerprint: FINGERPRINT,
			},
			workspace: {
				authority: "worktree-board",
				confirmed: true,
				repoRoot: REPO_ROOT,
				path: plan.assignment.path,
				boardFingerprint: FINGERPRINT,
				writerState: "available",
				pathWriterCount: 0,
				busyWriterCount: 0,
				maxBusyWriters: 1,
			},
			security: {
				authority: "security-policy",
				profile: "interactive",
				status: "passed",
				current: true,
				planId: plan.planId,
				fingerprint: FINGERPRINT,
			},
			budget: {
				authority: "cost-budget",
				profile: "interactive",
				status: "ok",
				current: true,
				planId: plan.planId,
				fingerprint: FINGERPRINT,
			},
			approval: {
				authority: "apr-01",
				profile: "interactive",
				status: "not-required",
				current: true,
				planId: plan.planId,
				candidateSha: SHA,
				fingerprint: FINGERPRINT,
			},
		},
		...over,
	};
}

function spawnAdapters(plan: any, calls: string[] = [], overrides: Record<string, unknown> = {}) {
	return {
		openWorktree: async () => {
			calls.push("open");
			return {
				ok: true,
				status: "opened",
				worktreeId: "worktree-1",
				paneId: "pane-1",
				path: plan.assignment.path,
			};
		},
		registerRole: async () => {
			calls.push("register");
			return { ok: true, registrationId: "registration-1" };
		},
		acquireLease: async (request: any) => {
			calls.push("acquire");
			expect(request.mode).toBe("writer");
			return { ok: true, leaseId: "lease-1", mode: "writer" };
		},
		startRole: async (request: any) => {
			calls.push("start");
			expect(request.request).toMatchObject({ kind: "role-request", taskId: "orc-01-task" });
			return { ok: true, agentId: "agent-1", paneId: "pane-1", sessionId: "session-1" };
		},
		releaseLease: async () => {
			calls.push("release");
			return { ok: true };
		},
		unregisterRole: async () => {
			calls.push("unregister");
			return { ok: true };
		},
		...overrides,
	};
}

function roleResult(over: Record<string, unknown> = {}) {
	return {
		schemaVersion: 1,
		kind: "role-result",
		taskId: "orc-01-task",
		role: "implementer",
		status: "completed",
		headSha: SHA,
		dirty: false,
		changedPaths: [`${OWNED_ROOT}/index.ts`],
		commands: [{ command: "bun test lib/orchestrator", exitCode: 0, summary: "focused green" }],
		evidenceRefs: [EVIDENCE_REF],
		artifactRefs: [EVIDENCE_REF],
		blockers: [],
		residualRisks: [],
		usage: { inputTokens: 100, outputTokens: 50 },
		...over,
	};
}

function roleRef(plan: any) {
	return {
		planId: plan.planId,
		taskId: "orc-01-task",
		role: "implementer",
		agentId: "agent-1",
		paneId: "pane-1",
		worktreePath: plan.assignment.path,
	};
}

function waitInput(plan: any) {
	return {
		schemaVersion: 1,
		roleRef: roleRef(plan),
		bounds: { maxAttempts: 3, maxDurationMs: 10_000 },
	};
}

function waitAdapters(plan: any, calls: string[] = [], overrides: Record<string, unknown> = {}) {
	return {
		wait: async (request: any) => {
			calls.push("wait");
			expect(request.bounds).toEqual({ maxAttempts: 3, maxDurationMs: 10_000 });
			return { ok: true, state: "done", attemptsUsed: 1, durationMs: 20 };
		},
		get: async () => {
			calls.push("get");
			return { ok: true, state: "done", agentId: "agent-1", paneId: "pane-1" };
		},
		read: async () => {
			calls.push("read");
			return { ok: true, artifactRef: EVIDENCE_REF, result: roleResult() };
		},
		...overrides,
	};
}

function handoffInput(plan: any, result = roleResult(), over: Record<string, unknown> = {}) {
	return {
		schemaVersion: 1,
		plan,
		result,
		current: {
			planId: plan.planId,
			taskId: "orc-01-task",
			role: "implementer",
			worktreePath: plan.assignment.path,
			headSha: SHA,
			expectedFingerprint: FINGERPRINT,
			currentFingerprint: FINGERPRINT,
			evidenceRefs: [EVIDENCE_REF],
			handoffPath: "docs/plans/work-packages/ORC-01-handoff.json",
		},
		...over,
	};
}

function approvalRequest(over: Record<string, unknown> = {}) {
	return {
		schemaVersion: 1,
		kind: "approval-request",
		requestId: "approval-1",
		action: "spawn one ORC-01 implementer",
		risk: "production-write",
		scopedPaths: [OWNED_ROOT],
		candidateSha: SHA,
		fingerprint: FINGERPRINT,
		requestedAt: "2026-08-11T20:00:00.000Z",
		expiresAt: "2026-08-11T21:00:00.000Z",
		...over,
	};
}

function approvalDecision(decision: "approved" | "rejected" = "approved", over: Record<string, unknown> = {}) {
	return {
		schemaVersion: 1,
		kind: "approval-decision",
		requestId: "approval-1",
		decision,
		action: "spawn one ORC-01 implementer",
		risk: "production-write",
		scopedPaths: [OWNED_ROOT],
		candidateSha: SHA,
		fingerprint: FINGERPRINT,
		decidedAt: "2026-08-11T20:10:00.000Z",
		...(decision === "approved"
			? { humanProvenance: { actorId: "human-operator", method: "pi-tui" } }
			: {}),
		...over,
	};
}

function expectDeepFrozen(value: unknown, seen = new WeakSet<object>()): void {
	if (value === null || typeof value !== "object" || seen.has(value)) return;
	seen.add(value);
	expect(Object.isFrozen(value)).toBe(true);
	for (const child of Object.values(value as Record<string, unknown>)) expectDeepFrozen(child, seen);
}

function listSourceFiles(root: string): string[] {
	const files: string[] = [];
	for (const name of readdirSync(root)) {
		const path = join(root, name);
		if (statSync(path).isDirectory()) files.push(...listSourceFiles(path));
		else if (path.endsWith(".ts") && !path.endsWith(".test.ts")) files.push(path);
	}
	return files;
}

describe("ORC-01 public surface and purity", () => {
	test("ORC01_ORCHESTRATOR_MISSING: exports exactly six assurance primitives", async () => {
		await loadApi();
	});

	test("pure source has no ambient file env network process timer or delivery authority", async () => {
		await loadApi();
		const sources = listSourceFiles(new URL(".", import.meta.url).pathname)
			.map((path) => readFileSync(path, "utf8"))
			.join("\n");
		for (const forbidden of [
			"node:fs",
			"node:child_process",
			"process.env",
			"Bun.spawn",
			"fetch(",
			"setTimeout",
			"setInterval",
			"Date.now",
			"git merge",
			"gh pr",
			"worktree remove",
			"pane close",
		]) expect(sources).not.toContain(forbidden);
	});

	test("closed hostile inputs fail without echo and results are deeply frozen", async () => {
		const api = await loadApi();
		const hostile = Object.create(null);
		hostile.schemaVersion = 1;
		hostile.facts = { password: SYNTHETIC_SECRET };
		const result = await api.assurance_status(hostile);
		expect(result).toMatchObject({ ok: false, code: "ORC01_INVALID_INPUT" });
		expect(JSON.stringify(result)).not.toContain(SYNTHETIC_SECRET);
		expectDeepFrozen(result);
	});
});

describe("ORC-01 status and planning", () => {
	test("reconciles six explicit facts in stable order without mutation", async () => {
		const api = await loadApi();
		const input = statusInput();
		const before = structuredClone(input);
		const result = await api.assurance_status(input);
		expect(result).toMatchObject({ ok: true, outcome: "ready", code: "ORC01_STATUS_READY" });
		expect(result.components.map((component: any) => component.name)).toEqual([
			"bdd",
			"herdr",
			"worktree",
			"fleet",
			"trajectory",
			"budget",
		]);
		expect(input).toEqual(before);
		expectDeepFrozen(result);
	});

	test.each([
		["unknown BDD", (input: any) => { input.facts.bdd.phase = "unknown"; }, "unknown", "ORC01_STATUS_UNKNOWN"],
		["writer conflict", (input: any) => { input.facts.worktree.writerState = "conflict"; }, "blocked", "ORC01_STATUS_BLOCKED"],
		["budget exceeded", (input: any) => { input.facts.budget.status = "exceeded"; }, "blocked", "ORC01_STATUS_BLOCKED"],
		["trajectory unavailable", (input: any) => { input.facts.trajectory.status = "unavailable"; }, "unknown", "ORC01_STATUS_UNKNOWN"],
	])("classifies %s deterministically", async (_label, mutate, outcome, code) => {
		const api = await loadApi();
		const input = statusInput();
		mutate(input);
		expect(await api.assurance_status(input)).toMatchObject({ outcome, code });
	});

	test("plan validates RoleRequestV1 and never calls mutation traps", async () => {
		const api = await loadApi();
		let effects = 0;
		const result = await api.assurance_plan_role({
			schemaVersion: 1,
			repoRoot: REPO_ROOT,
			request: roleRequest(),
			createWorktree: () => { effects += 1; },
			startRole: () => { effects += 1; },
		});
		expect(result).toMatchObject({ ok: false, code: "ORC01_INVALID_INPUT" });
		expect(effects).toBe(0);
		const plan = await validPlan(api);
		expect(plan).toMatchObject({
			schemaVersion: 1,
			planId: "orc01-orc-01-task--implementer",
			repoRoot: REPO_ROOT,
			request: { taskId: "orc-01-task", role: "implementer", phase: "green" },
			assignment: { taskId: "orc-01-task", role: "implementer", cardId: "orc-01-task--implementer" },
			caid: { taskId: "orc-01-task", role: "implementer", cardId: "orc-01-task--implementer" },
		});
		expectDeepFrozen(plan);
	});

	test("invalid role contract blocks with one stable code", async () => {
		const api = await loadApi();
		for (const request of [
			roleRequest({ schemaVersion: 2 }),
			roleRequest({ phase: "red" }),
			roleRequest({ writeScope: "tests" }),
			roleRequest({ tools: ["subagent"] }),
			roleRequest({ artifacts: [{ path: "../escape", mediaType: "text/plain" }] }),
		]) {
			const result = await api.assurance_plan_role({ schemaVersion: 1, repoRoot: REPO_ROOT, request });
			expect(result).toMatchObject({ ok: false, code: "ORC01_ROLE_REQUEST_INVALID" });
		}
	});
});

describe("ORC-01 spawn transaction", () => {
	test("runs open register acquire start in strict order and starts one role", async () => {
		const api = await loadApi();
		const plan = await validPlan(api);
		const calls: string[] = [];
		const result = await api.assurance_spawn_role(spawnInput(plan), spawnAdapters(plan, calls));
		expect(calls).toEqual(["open", "register", "acquire", "start"]);
		expect(result).toMatchObject({
			ok: true,
			outcome: "spawned",
			code: "ORC01_ROLE_SPAWNED",
			ids: {
				planId: plan.planId,
				worktreeId: "worktree-1",
				registrationId: "registration-1",
				leaseId: "lease-1",
				agentId: "agent-1",
				paneId: "pane-1",
				sessionId: "session-1",
			},
		});
		expectDeepFrozen(result);
	});

	test("ORC01_BDD_AUTHORITY_MUTATION: bdd-mode denial blocks before open", async () => {
		const api = await loadApi();
		const plan = await validPlan(api);
		const calls: string[] = [];
		const input = spawnInput(plan);
		input.facts.bdd.spawnPermitted = false;
		const result = await api.assurance_spawn_role(input, spawnAdapters(plan, calls));
		expect(result).toMatchObject({ ok: false, outcome: "blocked", code: "ORC01_BDD_SPAWN_BLOCKED" });
		expect(calls).toEqual([]);
	});

	test("unknown or missing phase and workspace facts block before effects", async () => {
		const api = await loadApi();
		const plan = await validPlan(api);
		for (const mutate of [
			(input: any) => { delete input.facts.bdd.phase; },
			(input: any) => { input.facts.bdd.authority = "model"; },
			(input: any) => { input.facts.workspace.confirmed = false; },
			(input: any) => { input.facts.workspace.path = "/repo/other"; },
		]) {
			const input = spawnInput(plan);
			mutate(input);
			const calls: string[] = [];
			const result = await api.assurance_spawn_role(input, spawnAdapters(plan, calls));
			expect(result.ok).toBe(false);
			expect(calls).toEqual([]);
		}
	});

	test("ORC01_SECOND_WRITER_MUTATION: exact-path writer blocks spawn", async () => {
		const api = await loadApi();
		const plan = await validPlan(api);
		const input = spawnInput(plan);
		input.facts.workspace.pathWriterCount = 1;
		const calls: string[] = [];
		const result = await api.assurance_spawn_role(input, spawnAdapters(plan, calls));
		expect(result).toMatchObject({ ok: false, outcome: "blocked", code: "ORC01_SECOND_WRITER" });
		expect(calls).toEqual([]);
	});

	test("strict and overnight require current approval and current security budget facts", async () => {
		const api = await loadApi();
		const plan = await validPlan(api);
		for (const mutate of [
			(input: any) => { input.facts.security.status = "unavailable"; },
			(input: any) => { input.facts.budget.status = "unknown"; },
			(input: any) => {
				for (const key of ["security", "budget", "approval"]) input.facts[key].profile = "strict";
				input.facts.approval.status = "not-required";
			},
			(input: any) => {
				for (const key of ["security", "budget", "approval"]) input.facts[key].profile = "overnight";
				input.facts.approval.status = "approved";
				input.facts.approval.current = false;
			},
		]) {
			const input = spawnInput(plan);
			mutate(input);
			const calls: string[] = [];
			const result = await api.assurance_spawn_role(input, spawnAdapters(plan, calls));
			expect(result.ok).toBe(false);
			expect(calls).toEqual([]);
		}
	});

	test("read-only roles require current writer facts and acquire read-only mode", async () => {
		const api = await loadApi();
		const request = roleRequest({
			role: "breaker",
			phase: "verify",
			writeScope: "none",
			tools: ["read", "grep", "find", "ls"],
			ownedPaths: [],
		});
		const plan = await validPlan(api, request);
		const input = spawnInput(plan);
		input.facts.bdd.phase = "verify";
		const calls: string[] = [];
		const adapters = spawnAdapters(plan, calls, {
			acquireLease: async (request: any) => {
				calls.push("acquire");
				expect(request.mode).toBe("read-only");
				return { ok: true, leaseId: "lease-read-1", mode: "read-only" };
			},
		});
		const result = await api.assurance_spawn_role(input, adapters);
		expect(result).toMatchObject({ ok: true, outcome: "spawned" });
		expect(calls).toEqual(["open", "register", "acquire", "start"]);
	});

	test("read-only role may observe a currently held writer without becoming a second writer", async () => {
		const api = await loadApi();
		const request = roleRequest({
			role: "breaker",
			phase: "verify",
			writeScope: "none",
			tools: ["read", "grep", "find", "ls"],
			ownedPaths: [],
		});
		const plan = await validPlan(api, request);
		const input = spawnInput(plan);
		input.facts.bdd.phase = "verify";
		input.facts.workspace.writerState = "held";
		input.facts.workspace.pathWriterCount = 1;
		input.facts.workspace.busyWriterCount = 1;
		const calls: string[] = [];
		const result = await api.assurance_spawn_role(input, spawnAdapters(plan, calls, {
			acquireLease: async (lease: any) => {
				calls.push("acquire");
				expect(lease.mode).toBe("read-only");
				return { ok: true, leaseId: "lease-read-2", mode: "read-only" };
			},
		}));
		expect(result).toMatchObject({ ok: true, outcome: "spawned" });
		expect(calls).toEqual(["open", "register", "acquire", "start"]);
	});

	test.each(["register", "acquire", "start"])("%s explicit failure remains partial and compensates in reverse where possible", async (stage) => {
		const api = await loadApi();
		const plan = await validPlan(api);
		const calls: string[] = [];
		const overrides: Record<string, unknown> = {};
		if (stage === "register") overrides.registerRole = async () => { calls.push("register"); return { ok: false, partial: false, code: SYNTHETIC_SECRET }; };
		if (stage === "acquire") overrides.acquireLease = async () => { calls.push("acquire"); return { ok: false, partial: false, code: SYNTHETIC_SECRET }; };
		if (stage === "start") overrides.startRole = async () => { calls.push("start"); return { ok: false, partial: false, code: SYNTHETIC_SECRET }; };
		const result = await api.assurance_spawn_role(spawnInput(plan), spawnAdapters(plan, calls, overrides));
		expect(result).toMatchObject({
			ok: false,
			outcome: "partial-failure",
			code: "ORC01_SPAWN_PARTIAL_FAILURE",
			cleanupRequired: true,
			operatorRecoveryRequired: true,
		});
		expect(JSON.stringify(result)).not.toContain(SYNTHETIC_SECRET);
		if (stage === "register") expect(calls).toEqual(["open", "register"]);
		if (stage === "acquire") expect(calls).toEqual(["open", "register", "acquire", "unregister"]);
		if (stage === "start") expect(calls).toEqual(["open", "register", "acquire", "start", "release", "unregister"]);
	});

	test("ambiguous open or start failure retains authority for operator recovery", async () => {
		const api = await loadApi();
		const plan = await validPlan(api);
		const openCalls: string[] = [];
		const openResult = await api.assurance_spawn_role(spawnInput(plan), spawnAdapters(plan, openCalls, {
			openWorktree: async () => { openCalls.push("open"); throw new Error(SYNTHETIC_SECRET); },
		}));
		expect(openResult).toMatchObject({ outcome: "partial-failure", cleanupRequired: true, compensated: false });
		expect(openCalls).toEqual(["open"]);

		const startCalls: string[] = [];
		const startResult = await api.assurance_spawn_role(spawnInput(plan), spawnAdapters(plan, startCalls, {
			startRole: async () => { startCalls.push("start"); throw new Error(SYNTHETIC_SECRET); },
		}));
		expect(startResult).toMatchObject({ outcome: "partial-failure", cleanupRequired: true, compensated: false });
		expect(startCalls).toEqual(["open", "register", "acquire", "start"]);
		expect(JSON.stringify({ openResult, startResult })).not.toContain(SYNTHETIC_SECRET);
	});
});

describe("ORC-01 bounded wait", () => {
	test("terminal flow is wait get read and validates RoleResultV1", async () => {
		const api = await loadApi();
		const plan = await validPlan(api);
		const calls: string[] = [];
		const result = await api.assurance_wait_role(waitInput(plan), waitAdapters(plan, calls));
		expect(calls).toEqual(["wait", "get", "read"]);
		expect(result).toMatchObject({
			ok: true,
			outcome: "completed",
			code: "ORC01_ROLE_COMPLETED",
			artifactRef: EVIDENCE_REF,
			result: { taskId: "orc-01-task", role: "implementer", status: "completed" },
		});
	});

	test("ORC01_TIMEOUT_MUTATION: timeout remains unknown", async () => {
		const api = await loadApi();
		const plan = await validPlan(api);
		const calls: string[] = [];
		const adapters = waitAdapters(plan, calls, {
			wait: async () => {
				calls.push("wait");
				return { ok: true, state: "timeout", attemptsUsed: 3, durationMs: 10_000, providerBody: "done" };
			},
		});
		const result = await api.assurance_wait_role(waitInput(plan), adapters);
		expect(result).toMatchObject({ ok: false, outcome: "unknown", code: "ORC01_WAIT_TIMEOUT" });
		expect(calls).toEqual(["wait"]);
	});

	test.each([
		["blocked", "blocked", "ORC01_ROLE_BLOCKED"],
		["working", "unknown", "ORC01_ROLE_STILL_WORKING"],
		["unknown", "unknown", "ORC01_ROLE_UNKNOWN"],
	])("preserves %s wait state", async (state, outcome, code) => {
		const api = await loadApi();
		const plan = await validPlan(api);
		const calls: string[] = [];
		const adapters = waitAdapters(plan, calls, {
			wait: async () => { calls.push("wait"); return { ok: true, state, attemptsUsed: 1, durationMs: 20 }; },
		});
		const result = await api.assurance_wait_role(waitInput(plan), adapters);
		expect(result).toMatchObject({ outcome, code });
		expect(calls).toEqual(["wait"]);
	});

	test("provider-reported usage above explicit wait bounds is unknown", async () => {
		const api = await loadApi();
		const plan = await validPlan(api);
		const adapters = waitAdapters(plan, [], {
			wait: async () => ({ ok: true, state: "done", attemptsUsed: 4, durationMs: 20 }),
		});
		expect(await api.assurance_wait_role(waitInput(plan), adapters)).toMatchObject({
			ok: false,
			outcome: "unknown",
			code: "ORC01_WAIT_BOUNDS_VIOLATED",
		});
	});

	test("mismatched and non-completed role results are never upgraded", async () => {
		const api = await loadApi();
		const plan = await validPlan(api);
		for (const [resultValue, outcome] of [
			[roleResult({ status: "blocked", blockers: ["human input required"] }), "blocked"],
			[roleResult({ status: "failed" }), "blocked"],
			[roleResult({ status: "unknown" }), "unknown"],
			[roleResult({ dirty: true }), "blocked"],
			[roleResult({ taskId: "other-task" }), "blocked"],
			[roleResult({ role: "refactorer" }), "blocked"],
		] as const) {
			const adapters = waitAdapters(plan, [], {
				read: async () => ({ ok: true, artifactRef: EVIDENCE_REF, result: resultValue }),
			});
			const result = await api.assurance_wait_role(waitInput(plan), adapters);
			expect(result.outcome).toBe(outcome);
			expect(result.outcome === "completed").toBe(false);
		}
	});
});

describe("ORC-01 handoff persistence", () => {
	test("valid current handoff passes RED-01 and appends once", async () => {
		const api = await loadApi();
		const plan = await validPlan(api);
		const appended: Array<{ customType: string; data: unknown }> = [];
		const resultValue = roleResult({
			residualRisks: [`password=${SYNTHETIC_SECRET}`],
		});
		const result = await api.assurance_record_handoff(handoffInput(plan, resultValue), {
			appendEntry: async (customType: string, data: unknown) => {
				appended.push({ customType, data });
				return { ok: true, entryId: "entry-1" };
			},
		});
		expect(result).toMatchObject({ ok: true, outcome: "recorded", code: "ORC01_HANDOFF_RECORDED", entryId: "entry-1" });
		expect(appended).toHaveLength(1);
		expect(appended[0]?.customType).toBe("assurance:handoff:v1");
		expect(JSON.stringify(appended)).not.toContain(SYNTHETIC_SECRET);
	});

	test.each([
		["head", (input: any) => { input.current.headSha = "c".repeat(40); }, "ORC01_HANDOFF_STALE"],
		["fingerprint", (input: any) => { input.current.currentFingerprint = "d".repeat(64); }, "ORC01_HANDOFF_STALE"],
		["evidence", (input: any) => { input.current.evidenceRefs = []; }, "ORC01_HANDOFF_EVIDENCE_REQUIRED"],
		["scope", (input: any) => { input.result.changedPaths = ["outside/file.ts"]; }, "ORC01_HANDOFF_SCOPE_VIOLATION"],
	])("%s mismatch blocks before append", async (_label, mutate, code) => {
		const api = await loadApi();
		const plan = await validPlan(api);
		const input = handoffInput(plan);
		mutate(input);
		let appends = 0;
		const result = await api.assurance_record_handoff(input, {
			appendEntry: async () => { appends += 1; return { ok: true, entryId: "entry" }; },
		});
		expect(result).toMatchObject({ ok: false, code });
		expect(appends).toBe(0);
	});

	test("read-only result with changed paths blocks before append", async () => {
		const api = await loadApi();
		const request = roleRequest({
			role: "breaker",
			phase: "verify",
			writeScope: "none",
			tools: ["read", "grep", "find", "ls"],
			ownedPaths: [],
		});
		const plan = await validPlan(api, request);
		const input = handoffInput(plan, roleResult({ role: "breaker", changedPaths: [`${OWNED_ROOT}/index.ts`] }));
		input.current.role = "breaker";
		let appends = 0;
		const result = await api.assurance_record_handoff(input, {
			appendEntry: async () => { appends += 1; return { ok: true, entryId: "entry" }; },
		});
		expect(result).toMatchObject({ ok: false, code: "ORC01_HANDOFF_SCOPE_VIOLATION" });
		expect(appends).toBe(0);
	});

	test("blocked valid result is recorded but remains blocked", async () => {
		const api = await loadApi();
		const plan = await validPlan(api);
		const resultValue = roleResult({ status: "blocked", dirty: true, blockers: ["human input required"] });
		const result = await api.assurance_record_handoff(handoffInput(plan, resultValue), {
			appendEntry: async () => ({ ok: true, entryId: "entry-blocked" }),
		});
		expect(result).toMatchObject({ ok: false, recorded: true, outcome: "blocked", entryId: "entry-blocked" });
	});

	test.each(["refuse", "throw", "malformed"])("append %s is never successful", async (kind) => {
		const api = await loadApi();
		const plan = await validPlan(api);
		const appendEntry = async () => {
			if (kind === "throw") throw new Error(SYNTHETIC_SECRET);
			if (kind === "malformed") return { ok: true, entryId: SYNTHETIC_SECRET, extra: true };
			return { ok: false, code: SYNTHETIC_SECRET };
		};
		const result = await api.assurance_record_handoff(handoffInput(plan), { appendEntry });
		expect(result.ok).toBe(false);
		expect(result.outcome).not.toBe("recorded");
		expect(JSON.stringify(result)).not.toContain(SYNTHETIC_SECRET);
	});
});

describe("ORC-01 approval gateway", () => {
	test("missing gateway is unavailable and model/project approval fields are closed", async () => {
		const api = await loadApi();
		expect(await api.assurance_request_approval({ schemaVersion: 1, request: approvalRequest() })).toMatchObject({
			ok: false,
			outcome: "unavailable",
			code: "ORC01_APPROVAL_GATEWAY_UNAVAILABLE",
		});
		const forged = await api.assurance_request_approval({
			schemaVersion: 1,
			request: approvalRequest(),
			approved: true,
			projectFile: "approval.json",
		});
		expect(forged).toMatchObject({ ok: false, code: "ORC01_INVALID_INPUT" });
	});

	test.each(["approved", "rejected"] as const)("accepts only durable bound APR-01 %s", async (decision) => {
		const api = await loadApi();
		const result = await api.assurance_request_approval(
			{ schemaVersion: 1, request: approvalRequest() },
			async () => ({ ok: true, authority: "apr-01", durable: true, decision: approvalDecision(decision) }),
		);
		expect(result).toMatchObject({
			ok: decision === "approved",
			outcome: decision,
			code: decision === "approved" ? "ORC01_APPROVED" : "ORC01_REJECTED",
		});
	});

	test("forged stale non-durable or thrown gateway output is unavailable and non-echoing", async () => {
		const api = await loadApi();
		for (const gateway of [
			async () => ({ ok: true, authority: "model", durable: true, decision: approvalDecision() }),
			async () => ({ ok: true, authority: "apr-01", durable: false, decision: approvalDecision("rejected") }),
			async () => ({ ok: true, authority: "apr-01", durable: true, decision: approvalDecision("approved", { candidateSha: "c".repeat(40) }) }),
			async () => { throw new Error(SYNTHETIC_SECRET); },
		]) {
			const result = await api.assurance_request_approval({ schemaVersion: 1, request: approvalRequest() }, gateway);
			expect(result).toMatchObject({ ok: false, outcome: "unavailable" });
			expect(JSON.stringify(result)).not.toContain(SYNTHETIC_SECRET);
		}
	});
});

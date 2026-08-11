import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const EXTENSION_URL = new URL("./index.ts", import.meta.url).href;
const EXTENSION_SOURCE = new URL("./index.ts", import.meta.url);
const SHA = "a".repeat(40);
const FINGERPRINT = "b".repeat(64);
const SYNTHETIC_SECRET = "orc01-extension-secret-DO-NOT-ECHO";

const TOOL_NAMES = [
	"assurance_status",
	"assurance_plan_role",
	"assurance_spawn_role",
	"assurance_wait_role",
	"assurance_record_handoff",
	"assurance_request_approval",
] as const;

type Handler = (event: any, context?: any) => unknown;
type Tool = {
	name: string;
	execute: (...args: any[]) => unknown;
};
type ExtensionApi = {
	default: (pi: any) => void;
	assuranceOrchestratorExtension: (pi: any) => void;
	createAssuranceOrchestratorExtensionV1: (options?: Record<string, unknown>) => (pi: any) => void;
};

async function loadExtension(): Promise<ExtensionApi> {
	try {
		const module = await import(EXTENSION_URL) as Record<string, unknown>;
		if (
			typeof module.default !== "function" ||
			typeof module.assuranceOrchestratorExtension !== "function" ||
			typeof module.createAssuranceOrchestratorExtensionV1 !== "function"
		) throw new Error("ORC01_EXTENSION_MISSING");
		return module as unknown as ExtensionApi;
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		if (/cannot find|module not found|resolve/i.test(message)) {
			throw new Error("ORC01_EXTENSION_MISSING");
		}
		throw error;
	}
}

function statusInput() {
	return {
		schemaVersion: 1,
		facts: {
			bdd: { authority: "bdd-mode", phase: "green", spawnPermitted: true, evidenceFingerprint: FINGERPRINT },
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
	};
}

function approvalRequest() {
	return {
		schemaVersion: 1,
		kind: "approval-request",
		requestId: "approval-1",
		action: "spawn one role",
		risk: "production-write",
		scopedPaths: ["agents-shared/.agents/adapters/pi/personal/lib/orchestrator"],
		candidateSha: SHA,
		fingerprint: FINGERPRINT,
		requestedAt: "2026-08-11T20:00:00.000Z",
		expiresAt: "2026-08-11T21:00:00.000Z",
	};
}

function harness() {
	const handlers = new Map<string, Handler[]>();
	const tools: Tool[] = [];
	const appended: Array<{ customType: string; data: unknown }> = [];
	const emitted: Array<{ channel: string; data: unknown }> = [];
	const subscriptions: Array<{ channel: string; handler: (data: unknown) => void; active: boolean }> = [];
	let unsubscribeCalls = 0;
	const unexpected: string[] = [];
	const pi = {
		on(event: string, handler: Handler) {
			handlers.set(event, [...(handlers.get(event) ?? []), handler]);
		},
		registerTool(tool: Tool) {
			tools.push(tool);
		},
		registerCommand() { unexpected.push("command"); },
		registerShortcut() { unexpected.push("shortcut"); },
		registerFlag() { unexpected.push("flag"); },
		registerProvider() { unexpected.push("provider"); },
		registerEntryRenderer() { unexpected.push("entry-renderer"); },
		registerMessageRenderer() { unexpected.push("message-renderer"); },
		appendEntry(customType: string, data: unknown) {
			appended.push({ customType, data });
		},
		events: {
			on(channel: string, handler: (data: unknown) => void) {
				const subscription = { channel, handler, active: true };
				subscriptions.push(subscription);
				return () => {
					if (!subscription.active) return;
					subscription.active = false;
					unsubscribeCalls += 1;
				};
			},
			emit(channel: string, data: unknown) {
				emitted.push({ channel, data });
				for (const subscription of subscriptions) {
					if (subscription.active && subscription.channel === channel) subscription.handler(data);
				}
			},
		},
	};
	const context = { cwd: "/repo", hasUI: false };
	return {
		pi,
		context,
		handlers,
		tools,
		appended,
		emitted,
		subscriptions,
		unexpected,
		get unsubscribeCalls() { return unsubscribeCalls; },
		async emit(event: string, payload: unknown = {}) {
			let result: unknown;
			for (const handler of handlers.get(event) ?? []) result = await handler(payload, context);
			return result;
		},
		tool(name: string) {
			const tool = tools.find((candidate) => candidate.name === name);
			if (!tool) throw new Error(`missing tool ${name}`);
			return tool;
		},
	};
}

async function execute(tool: Tool, params: unknown) {
	return tool.execute("call-1", params, undefined, undefined, { cwd: "/repo", hasUI: false });
}

describe("ORC-01 extension contract", () => {
	test("registers exactly six tools and only lifecycle hooks", async () => {
		const api = await loadExtension();
		const mock = harness();
		api.createAssuranceOrchestratorExtensionV1()(mock.pi);
		expect(mock.tools.map((tool) => tool.name).sort()).toEqual([...TOOL_NAMES].sort());
		expect(mock.tools).toHaveLength(6);
		expect([...mock.handlers.keys()].sort()).toEqual(["session_shutdown", "session_start"]);
		expect(mock.unexpected).toEqual([]);
		expect(mock.subscriptions).toHaveLength(0);
	});

	test("factory performs no ambient work and source has no direct authority imports", async () => {
		const api = await loadExtension();
		const mock = harness();
		api.createAssuranceOrchestratorExtensionV1()(mock.pi);
		expect(mock.appended).toEqual([]);
		expect(mock.emitted).toEqual([]);
		expect(mock.subscriptions).toEqual([]);
		const source = readFileSync(EXTENSION_SOURCE, "utf8");
		for (const forbidden of [
			"node:fs",
			"node:child_process",
			"process.env",
			"Bun.spawn",
			"fetch(",
			"setTimeout",
			"setInterval",
			"bdd-mode.ts",
			"agentic-fleet.ts",
			"worktree-board.ts",
			"git merge",
			"gh pr",
			"worktree remove",
		]) expect(source).not.toContain(forbidden);
	});

	test("tools are inactive before session start and return stable non-echoing output", async () => {
		const api = await loadExtension();
		const mock = harness();
		api.createAssuranceOrchestratorExtensionV1()(mock.pi);
		const result = await execute(mock.tool("assurance_status"), {
			...statusInput(),
			secret: SYNTHETIC_SECRET,
		});
		expect(result).toMatchObject({
			content: [{ type: "text", text: expect.any(String) }],
			details: { ok: false, code: "ORC01_SESSION_INACTIVE" },
		});
		expect(JSON.stringify(result)).not.toContain(SYNTHETIC_SECRET);
	});

	test("starts subscriptions and resources only after session_start and replaces generations", async () => {
		const api = await loadExtension();
		const mock = harness();
		let opens = 0;
		let closes = 0;
		api.createAssuranceOrchestratorExtensionV1({
			openSessionResource: async () => {
				opens += 1;
				let closed = false;
				return {
					close: async () => {
						if (closed) return;
						closed = true;
						closes += 1;
					},
				};
			},
		})(mock.pi);
		expect(opens).toBe(0);
		expect(mock.subscriptions).toHaveLength(0);
		await mock.emit("session_start", { reason: "startup" });
		expect(opens).toBe(1);
		expect(mock.subscriptions.filter((item) => item.active)).toHaveLength(1);
		expect(mock.subscriptions[0]?.channel).toBe("assurance:orchestrator:ping");
		await mock.emit("session_start", { reason: "reload" });
		expect(opens).toBe(2);
		expect(closes).toBe(1);
		expect(mock.unsubscribeCalls).toBe(1);
	});

	test("reload/shutdown disposal is idempotent", async () => {
		const api = await loadExtension();
		const mock = harness();
		let closes = 0;
		api.createAssuranceOrchestratorExtensionV1({
			openSessionResource: async () => ({ close: async () => { closes += 1; } }),
		})(mock.pi);
		await mock.emit("session_start", { reason: "startup" });
		await mock.emit("session_shutdown", { reason: "reload" });
		await mock.emit("session_shutdown", { reason: "reload" });
		expect(closes).toBe(1);
		expect(mock.unsubscribeCalls).toBe(1);
		await mock.emit("session_start", { reason: "reload" });
		expect(mock.subscriptions.filter((item) => item.active)).toHaveLength(1);
	});

	test("active status tool composes the pure primitive and emits bounded namespaced summary", async () => {
		const api = await loadExtension();
		const mock = harness();
		api.createAssuranceOrchestratorExtensionV1()(mock.pi);
		await mock.emit("session_start", { reason: "startup" });
		const result = await execute(mock.tool("assurance_status"), statusInput());
		expect(result).toMatchObject({
			content: [{ type: "text", text: "ORC01_STATUS_READY" }],
			details: { ok: true, outcome: "ready", code: "ORC01_STATUS_READY" },
		});
		const event = mock.emitted.find((item) => item.channel === "assurance:orchestrator:result");
		expect(event).toBeDefined();
		expect(event?.data).toEqual({
			schemaVersion: 1,
			primitive: "assurance_status",
			ok: true,
			outcome: "ready",
			code: "ORC01_STATUS_READY",
		});
		for (const emitted of mock.emitted) expect(emitted.channel.startsWith("assurance:")).toBe(true);
	});

	test("missing approval gateway remains unavailable through the tool", async () => {
		const api = await loadExtension();
		const mock = harness();
		api.createAssuranceOrchestratorExtensionV1()(mock.pi);
		await mock.emit("session_start", { reason: "startup" });
		const result = await execute(mock.tool("assurance_request_approval"), {
			schemaVersion: 1,
			request: approvalRequest(),
		});
		expect(result).toMatchObject({
			content: [{ type: "text", text: "ORC01_APPROVAL_GATEWAY_UNAVAILABLE" }],
			details: { ok: false, outcome: "unavailable", code: "ORC01_APPROVAL_GATEWAY_UNAVAILABLE" },
		});
	});

	test("arbitrary adapter failures never reach tool output or event payloads", async () => {
		const api = await loadExtension();
		const mock = harness();
		api.createAssuranceOrchestratorExtensionV1({
			approvalGateway: async () => { throw new Error(SYNTHETIC_SECRET); },
		})(mock.pi);
		await mock.emit("session_start", { reason: "startup" });
		const result = await execute(mock.tool("assurance_request_approval"), {
			schemaVersion: 1,
			request: approvalRequest(),
		});
		const bytes = JSON.stringify({ result, emitted: mock.emitted });
		expect(bytes).not.toContain(SYNTHETIC_SECRET);
		expect(result).toMatchObject({ details: { ok: false, outcome: "unavailable" } });
	});

	test("ping event reports lifecycle only and stale generation unsubscribes", async () => {
		const api = await loadExtension();
		const mock = harness();
		api.createAssuranceOrchestratorExtensionV1()(mock.pi);
		await mock.emit("session_start", { reason: "startup" });
		mock.pi.events.emit("assurance:orchestrator:ping", { raw: SYNTHETIC_SECRET });
		const lifecycle = mock.emitted.find((item) => item.channel === "assurance:orchestrator:lifecycle");
		expect(lifecycle?.data).toEqual({ schemaVersion: 1, status: "active" });
		expect(JSON.stringify(lifecycle)).not.toContain(SYNTHETIC_SECRET);
		await mock.emit("session_shutdown", { reason: "quit" });
		const before = mock.emitted.length;
		mock.pi.events.emit("assurance:orchestrator:ping", {});
		expect(mock.emitted).toHaveLength(before + 1); // the externally emitted ping only
	});
});

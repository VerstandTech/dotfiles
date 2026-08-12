import { describe, expect, test } from "bun:test";

import { assurance_request_approval } from "../lib/orchestrator/index.ts";

const SHA = "a".repeat(40);
const FINGERPRINT = "2".repeat(64);
const NOW = "2026-08-11T20:10:00.000Z";
const SECRET = "APR01_EXTENSION_SECRET_DO_NOT_ECHO";

async function loadExtension(): Promise<any> {
	try {
		return await import("./approval-seams.ts");
	} catch {
		throw new Error("APR01_APPROVAL_AUTHORITY_MISSING");
	}
}

function orcRequest(over: Record<string, unknown> = {}) {
	return {
		schemaVersion: 1,
		kind: "approval-request",
		requestId: "orc-apr-request-1",
		action: "diff:review-candidate",
		risk: "production-write",
		scopedPaths: ["src/a.ts", "src/b.ts"],
		candidateSha: SHA,
		fingerprint: FINGERPRINT,
		requestedAt: "2026-08-11T20:00:00.000Z",
		expiresAt: "2026-08-11T21:00:00.000Z",
		...over,
	};
}

function storeFacts(over: Record<string, unknown> = {}) {
	return {
		schemaVersion: 1,
		storePath: "/Users/operator/.pi/authority/approvals.json",
		storeRealPath: "/Users/operator/.pi/authority/approvals.json",
		projectRoot: "/workspace/project",
		projectRealPath: "/workspace/project",
		exists: true,
		mode: 0o600,
		regularFile: true,
		symbolicLink: false,
		hardLinkCount: 1,
		noFollow: true,
		atomicReplace: true,
		parentDirectorySafe: true,
		machineLocal: true,
		...over,
	};
}

function fakeStore(over: Record<string, unknown> = {}) {
	let value: any = { schemaVersion: 1, records: [] };
	let revision = "revision-0";
	let commits = 0;
	let closes = 0;
	return {
		read: async () => ({
			ok: true,
			revision,
			facts: storeFacts(over),
			value: structuredClone(value),
		}),
		commit: async (input: any) => {
			commits += 1;
			value = structuredClone(input.value);
			revision = `revision-${commits}`;
			return { ok: true, revision, facts: storeFacts(over) };
		},
		close: async () => { closes += 1; },
		get commits() { return commits; },
		get closes() { return closes; },
		get value() { return structuredClone(value); },
	};
}

function mockPi() {
	const handlers = new Map<string, Array<(event: any, context?: any) => any>>();
	const tools: any[] = [];
	const commands: any[] = [];
	const entries: Array<{ customType: string; data: any }> = [];
	return {
		pi: {
			on: (event: string, handler: (event: any, context?: any) => any) => {
				const list = handlers.get(event) ?? [];
				list.push(handler);
				handlers.set(event, list);
			},
			registerTool: (tool: any) => tools.push(tool),
			registerCommand: (...args: any[]) => commands.push(args),
			appendEntry: (customType: string, data: any) => entries.push({ customType, data }),
		},
		handlers,
		tools,
		commands,
		entries,
		async emit(event: string, payload: any, context?: any) {
			for (const handler of handlers.get(event) ?? []) await handler(payload, context);
		},
	};
}

function tuiContext(over: Record<string, unknown> = {}) {
	let selects = 0;
	let confirms = 0;
	const context: any = {
		mode: "tui",
		hasUI: true,
		cwd: "/workspace/project",
		sessionManager: { getSessionId: () => "session-apr-extension" },
		ui: {
			select: async () => { selects += 1; return "Approve exact scope"; },
			confirm: async () => { confirms += 1; return true; },
		},
		...over,
	};
	return {
		context,
		get selects() { return selects; },
		get confirms() { return confirms; },
	};
}

function extensionOptions(store: any, over: Record<string, unknown> = {}) {
	return {
		clock: () => NOW,
		openStore: async () => store,
		...over,
	};
}

describe("APR-01 approval-seams extension", () => {
	test("causal RED names missing extension authority before production", async () => {
		const module = await loadExtension();
		expect(typeof module.createApprovalSeamsRuntimeV1).toBe("function");
		expect(typeof module.createInjectedSafeApprovalStoreV1).toBe("function");
	});

	test("provides an ORC-compatible durable human approval gateway", async () => {
		const module = await loadExtension();
		const store = fakeStore();
		const runtime = module.createApprovalSeamsRuntimeV1(extensionOptions(store));
		const mock = mockPi();
		const ui = tuiContext();
		runtime.extension(mock.pi);

		expect(mock.tools).toHaveLength(0);
		expect(store.commits).toBe(0);
		await mock.emit("session_start", { reason: "startup" }, ui.context);
		const gatewayResult = await runtime.approvalGateway(orcRequest());
		expect(gatewayResult).toMatchObject({
			ok: true,
			authority: "apr-01",
			durable: true,
			decision: {
				kind: "approval-decision",
				requestId: "orc-apr-request-1",
				decision: "approved",
				action: "diff:review-candidate",
				candidateSha: SHA,
				fingerprint: FINGERPRINT,
				humanProvenance: { actorId: "machine-local-human", method: "pi-tui-confirm-select" },
			},
		});
		expect(ui.selects).toBe(1);
		expect(ui.confirms).toBe(1);
		expect(store.commits).toBe(1);

		const orc = await assurance_request_approval(
			{ schemaVersion: 1, request: orcRequest() },
			runtime.approvalGateway,
		);
		expect(orc).toMatchObject({ ok: true, outcome: "approved", code: "ORC01_APPROVED" });
		expect(ui.selects).toBe(1);
	});

	test("durable human denial maps to ORC rejection and is not re-prompted", async () => {
		const module = await loadExtension();
		const store = fakeStore();
		const runtime = module.createApprovalSeamsRuntimeV1(extensionOptions(store));
		const mock = mockPi();
		let selects = 0;
		const ui = tuiContext({
			ui: {
				select: async () => { selects += 1; return "Deny exact scope"; },
				confirm: async () => true,
			},
		});
		runtime.extension(mock.pi);
		await mock.emit("session_start", { reason: "startup" }, ui.context);

		for (let i = 0; i < 2; i += 1) {
			const result = await assurance_request_approval(
				{ schemaVersion: 1, request: orcRequest() },
				runtime.approvalGateway,
			);
			expect(result).toMatchObject({ ok: false, outcome: "rejected", code: "ORC01_REJECTED" });
		}
		expect(selects).toBe(1);
		expect(store.commits).toBe(1);
	});

	test.each([
		["no UI", { hasUI: false }],
		["RPC", { mode: "rpc" }],
		["JSON", { mode: "json", hasUI: false }],
		["print", { mode: "print", hasUI: false }],
		["missing select", { ui: { confirm: async () => true } }],
		["missing confirm", { ui: { select: async () => "Approve exact scope" } }],
	] as const)("%s context is unavailable and never approves", async (_name, contextChange) => {
		const module = await loadExtension();
		const store = fakeStore();
		const runtime = module.createApprovalSeamsRuntimeV1(extensionOptions(store));
		const mock = mockPi();
		const ui = tuiContext(contextChange);
		runtime.extension(mock.pi);
		await mock.emit("session_start", { reason: "startup" }, ui.context);
		const result = await runtime.approvalGateway(orcRequest());
		expect(result).toMatchObject({ ok: false, code: "APR01_UI_UNAVAILABLE" });
		expect(store.commits).toBe(0);
	});

	test("missing store or clock is authority missing rather than approval", async () => {
		const module = await loadExtension();
		for (const options of [
			{ clock: () => NOW },
			{ openStore: async () => fakeStore() },
		]) {
			const runtime = module.createApprovalSeamsRuntimeV1(options);
			const mock = mockPi();
			const ui = tuiContext();
			runtime.extension(mock.pi);
			await mock.emit("session_start", { reason: "startup" }, ui.context);
			const result = await runtime.approvalGateway(orcRequest());
			expect(result).toMatchObject({ ok: false, code: "APR01_APPROVAL_AUTHORITY_MISSING" });
		}
	});

	test("model booleans and project-file fields remain blocked through the gateway", async () => {
		const module = await loadExtension();
		const store = fakeStore();
		const runtime = module.createApprovalSeamsRuntimeV1(extensionOptions(store));
		const mock = mockPi();
		const ui = tuiContext();
		runtime.extension(mock.pi);
		await mock.emit("session_start", { reason: "startup" }, ui.context);
		for (const forged of [
			orcRequest({ confirmed: true }),
			orcRequest({ projectFile: ".pi/approval.json" }),
		]) {
			const result = await runtime.approvalGateway(forged);
			expect(result).toMatchObject({ ok: false, code: "APR01_INVALID_ORC_REQUEST" });
		}
		expect(store.commits).toBe(0);
	});

	test("changed SHA through the ORC gateway is stale and does not prompt", async () => {
		const module = await loadExtension();
		const store = fakeStore();
		const runtime = module.createApprovalSeamsRuntimeV1(extensionOptions(store));
		const mock = mockPi();
		const ui = tuiContext();
		runtime.extension(mock.pi);
		await mock.emit("session_start", { reason: "startup" }, ui.context);
		expect((await runtime.approvalGateway(orcRequest())).ok).toBe(true);
		const stale = await runtime.approvalGateway(orcRequest({ candidateSha: "b".repeat(40) }));
		expect(stale).toMatchObject({ ok: false, code: "APR01_SCOPE_STALE" });
		expect(ui.selects).toBe(1);
	});

	test("unsupported ORC action prose is not used to infer approval kind", async () => {
		const module = await loadExtension();
		const store = fakeStore();
		const runtime = module.createApprovalSeamsRuntimeV1(extensionOptions(store));
		const mock = mockPi();
		const ui = tuiContext();
		runtime.extension(mock.pi);
		await mock.emit("session_start", { reason: "startup" }, ui.context);
		const result = await runtime.approvalGateway(orcRequest({ action: "please approve this diff" }));
		expect(result).toMatchObject({ ok: false, code: "APR01_INVALID_ORC_REQUEST" });
		expect(ui.selects).toBe(0);
	});

	test("session mirror is closed observational metadata and never authority", async () => {
		const module = await loadExtension();
		const store = fakeStore();
		const runtime = module.createApprovalSeamsRuntimeV1(extensionOptions(store));
		const mock = mockPi();
		const ui = tuiContext();
		runtime.extension(mock.pi);
		await mock.emit("session_start", { reason: "startup" }, ui.context);
		await runtime.approvalGateway(orcRequest());
		expect(mock.entries).toHaveLength(1);
		expect(mock.entries[0]?.customType).toBe("assurance:approval:mirror:v1");
		expect(mock.entries[0]?.data).toMatchObject({
			schemaVersion: 1,
			authority: false,
			authorityScope: "approval-only",
			requestId: "orc-apr-request-1",
		});
		const serialized = JSON.stringify(mock.entries[0]);
		expect(serialized).not.toContain("diff:review-candidate");
		expect(serialized).not.toContain("production-write");
		expect(serialized).not.toContain("src/a.ts");
	});

	test("trajectory errors fail without exposing raw errors", async () => {
		const module = await loadExtension();
		const store = fakeStore();
		const runtime = module.createApprovalSeamsRuntimeV1(extensionOptions(store, {
			trajectory: async () => { throw new Error(SECRET); },
		}));
		const mock = mockPi();
		const ui = tuiContext();
		runtime.extension(mock.pi);
		await mock.emit("session_start", { reason: "startup" }, ui.context);
		const result = await runtime.approvalGateway(orcRequest());
		expect(result).toMatchObject({ ok: false, code: "APR01_TRAJECTORY_UNAVAILABLE" });
		expect(JSON.stringify(result)).not.toContain(SECRET);
	});

	test("session lifecycle opens after start and disposes each generation idempotently", async () => {
		const module = await loadExtension();
		const first = fakeStore();
		const second = fakeStore();
		let opens = 0;
		const runtime = module.createApprovalSeamsRuntimeV1({
			clock: () => NOW,
			openStore: async () => { opens += 1; return opens === 1 ? first : second; },
		});
		const mock = mockPi();
		const ui = tuiContext();
		runtime.extension(mock.pi);
		expect(opens).toBe(0);

		await mock.emit("session_start", { reason: "startup" }, ui.context);
		expect(opens).toBe(1);
		await mock.emit("session_start", { reason: "reload" }, ui.context);
		expect(first.closes).toBe(1);
		expect(opens).toBe(2);
		await mock.emit("session_shutdown", { reason: "reload" });
		await mock.emit("session_shutdown", { reason: "reload" });
		expect(second.closes).toBe(1);
		const inactive = await runtime.approvalGateway(orcRequest());
		expect(inactive).toMatchObject({ ok: false, code: "APR01_SESSION_INACTIVE" });
	});

	test("a stale human selection resolving after shutdown cannot persist", async () => {
		const module = await loadExtension();
		const store = fakeStore();
		let resolveSelection: (value: string) => void = () => {};
		const selected = new Promise<string>((resolve) => { resolveSelection = resolve; });
		const runtime = module.createApprovalSeamsRuntimeV1(extensionOptions(store));
		const mock = mockPi();
		const ui = tuiContext({
			ui: {
				select: async () => selected,
				confirm: async () => true,
			},
		});
		runtime.extension(mock.pi);
		await mock.emit("session_start", { reason: "startup" }, ui.context);
		const pending = runtime.approvalGateway(orcRequest());
		await Promise.resolve();
		await mock.emit("session_shutdown", { reason: "reload" });
		resolveSelection("Approve exact scope");
		const result = await pending;
		expect(result).toMatchObject({ ok: false, code: "APR01_SESSION_INACTIVE" });
		expect(store.commits).toBe(0);
	});

	test("APR01_COMMIT_AFTER_DISPOSE: confirmed decision cannot commit after shutdown closes the store", async () => {
		const module = await loadExtension();
		let releaseCommit: (() => void) | undefined;
		const hold = new Promise<void>((resolve) => { releaseCommit = resolve; });
		let sawCommit = false;
		let resolveSawCommit: (() => void) | undefined;
		const sawCommitGate = new Promise<void>((resolve) => { resolveSawCommit = resolve; });
		let value: any = { schemaVersion: 1, records: [] };
		let revision = "revision-0";
		let commits = 0;
		let closes = 0;
		const store = {
			read: async () => ({
				ok: true,
				revision,
				facts: storeFacts(),
				value: structuredClone(value),
			}),
			commit: async (input: any) => {
				sawCommit = true;
				resolveSawCommit?.();
				await hold;
				commits += 1;
				value = structuredClone(input.value);
				revision = `revision-${commits}`;
				return { ok: true, revision, facts: storeFacts() };
			},
			close: async () => { closes += 1; },
		};
		const runtime = module.createApprovalSeamsRuntimeV1(extensionOptions(store));
		const mock = mockPi();
		const ui = tuiContext();
		runtime.extension(mock.pi);
		await mock.emit("session_start", { reason: "startup" }, ui.context);
		const pending = runtime.approvalGateway(orcRequest({ requestId: "orc-apr-dispose-race" }));
		await sawCommitGate;
		expect(sawCommit).toBe(true);
		await mock.emit("session_shutdown", { reason: "reload" });
		expect(closes).toBe(1);
		releaseCommit?.();
		const result = await pending;
		expect(["APR01_SESSION_INACTIVE", "APR01_STORE_CLOSED"]).toContain(result.code);
		expect(result.ok).toBe(false);
		expect(commits === 0 || value.records.length === 0).toBe(true);
		expect(value.records).toHaveLength(0);
	});

	test("APR01_CON_GATEWAY_COMPAT: valid CON request shapes are canonicalized without caller pre-normalization", async () => {
		const module = await loadExtension();
		const store = fakeStore();
		const runtime = module.createApprovalSeamsRuntimeV1(extensionOptions(store));
		const mock = mockPi();
		const ui = tuiContext();
		runtime.extension(mock.pi);
		await mock.emit("session_start", { reason: "startup" }, ui.context);

		const conShapes = [
			orcRequest({
				requestId: "con-paths",
				scopedPaths: ["src/b.ts", "src/a.ts", "src/a.ts"],
			}),
			orcRequest({
				requestId: "con-time",
				requestedAt: "2026-08-11T20:00:00Z",
				expiresAt: "2026-08-11T21:00:00Z",
			}),
			orcRequest({
				requestId: "con-fp",
				fingerprint: "plan-scope-v1",
			}),
			orcRequest({
				requestId: "con-risk-action",
				action: "diff:review candidate change",
				risk: "production write",
			}),
		];

		for (const request of conShapes) {
			const result = await runtime.approvalGateway(request);
			expect(result).toMatchObject({
				ok: true,
				authority: "apr-01",
				durable: true,
				decision: {
					requestId: request.requestId,
					decision: "approved",
					action: request.action,
					risk: request.risk,
					candidateSha: request.candidateSha,
					fingerprint: request.fingerprint,
				},
			});
			expect(result.decision.scopedPaths).toEqual(request.scopedPaths);
			const orc = await assurance_request_approval(
				{ schemaVersion: 1, request },
				async () => result,
			);
			expect(orc).toMatchObject({ ok: true, outcome: "approved", code: "ORC01_APPROVED" });
		}
		expect(store.commits).toBe(conShapes.length);
	});

	test("injected safe store close is terminal and refuses later commit/read", async () => {
		const module = await loadExtension();
		let value: any = { schemaVersion: 1, records: [] };
		let revision = "revision-0";
		const adapter = module.createInjectedSafeApprovalStoreV1({
			inspect: async () => storeFacts(),
			readValue: async () => ({ revision, value: structuredClone(value) }),
			compareAndCommit: async (input: any) => {
				value = structuredClone(input.value);
				revision = "revision-1";
				return { revision };
			},
		});
		await adapter.close?.();
		const read = await adapter.read();
		const committed = await adapter.commit({ expectedRevision: "revision-0", value, requirements: {} });
		expect(read).toMatchObject({ ok: false, code: "APR01_STORE_CLOSED" });
		expect(committed).toMatchObject({ ok: false, code: "APR01_STORE_CLOSED" });
		expect(value.records).toHaveLength(0);
	});

	test("injected safe store adapter uses explicit operations and no ambient persistence", async () => {
		const module = await loadExtension();
		let value: any = { schemaVersion: 1, records: [] };
		let revision = "revision-0";
		let compared: any;
		const adapter = module.createInjectedSafeApprovalStoreV1({
			inspect: async () => storeFacts(),
			readValue: async () => ({ revision, value: structuredClone(value) }),
			compareAndCommit: async (input: any) => {
				compared = input;
				value = structuredClone(input.value);
				revision = "revision-1";
				return { revision };
			},
		});
		const read = await adapter.read();
		expect(read).toMatchObject({ ok: true, revision: "revision-0", facts: { mode: 0o600 } });
		const committed = await adapter.commit({ expectedRevision: "revision-0", value, requirements: {} });
		expect(compared.expectedRevision).toBe("revision-0");
		expect(committed).toMatchObject({ ok: true, revision: "revision-1", facts: { atomicReplace: true } });
	});

	test("extension imports with no tools and no timer or resource side effect", async () => {
		const module = await loadExtension();
		expect(typeof module.default).toBe("function");
		const mock = mockPi();
		module.default(mock.pi);
		expect(mock.tools).toHaveLength(0);
		expect(mock.commands).toHaveLength(0);
		expect(mock.handlers.has("session_start")).toBe(true);
		expect(mock.handlers.has("session_shutdown")).toBe(true);
	});
});

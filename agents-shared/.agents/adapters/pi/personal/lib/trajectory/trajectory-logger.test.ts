import { describe, expect, test } from "bun:test";

async function loadExtension() {
	try {
		return await import("../../extensions/trajectory-logger.ts");
	} catch {
		throw new Error("OBS01_TRAJECTORY_LOGGER_MISSING");
	}
}

type Handler = (event: any, context?: any) => unknown;

function piMock(flag = false) {
	const handlers = new Map<string, Handler[]>();
	const appended: Array<{ type: string; data: any }> = [];
	const statuses: Array<string | undefined> = [];
	let busHandler: ((data: unknown) => void) | undefined;
	let unsubscribeCalls = 0;
	const pi = {
		on(event: string, handler: Handler) {
			handlers.set(event, [...(handlers.get(event) ?? []), handler]);
		},
		appendEntry(type: string, data: any) {
			appended.push({ type, data });
		},
		events: {
			on(channel: string, handler: (data: unknown) => void) {
				expect(channel).toBe("assurance:trajectory");
				busHandler = handler;
				return () => { unsubscribeCalls++; if (busHandler === handler) busHandler = undefined; };
			},
			emit() {},
		},
		registerFlag() {},
		getFlag(name: string) {
			expect(name).toBe("trajectory-file");
			return flag;
		},
	};
	const context = {
		cwd: "/repo",
		isProjectTrusted: () => true,
		sessionManager: {
			getSessionId: () => "11111111-1111-4111-8111-111111111111",
			getEntries: () => [],
		},
		ui: { setStatus: (_key: string, value: string | undefined) => statuses.push(value) },
	};
	return { pi, context, handlers, appended, statuses, emitBus: (data: unknown) => busHandler?.(data), get unsubscribeCalls() { return unsubscribeCalls; } };
}

async function emit(mock: ReturnType<typeof piMock>, event: string, value: any = {}) {
	let result: unknown;
	for (const handler of mock.handlers.get(event) ?? []) result = await handler(value, mock.context);
	return result;
}

describe("OBS-01 trajectory logger extension", () => {
	test("registers thin lifecycle and observation hooks", async () => {
		const { createTrajectoryLoggerExtensionV1 } = await loadExtension();
		const mock = piMock();
		createTrajectoryLoggerExtensionV1({ now: () => "2026-08-11T21:00:00.000Z" })(mock.pi as any);
		for (const event of ["session_start", "tool_call", "tool_result", "session_shutdown"]) {
			expect(mock.handlers.get(event)).toHaveLength(1);
		}
	});

	test("default lifecycle appends session entries and creates no file writer", async () => {
		const { createTrajectoryLoggerExtensionV1 } = await loadExtension();
		const mock = piMock(false);
		let writers = 0;
		createTrajectoryLoggerExtensionV1({ now: () => "2026-08-11T21:00:00.000Z", createFileWriter: async () => { writers++; return undefined; } })(mock.pi as any);
		await emit(mock, "session_start", { type: "session_start", reason: "startup" });
		expect(writers).toBe(0);
		expect(mock.appended).toHaveLength(1);
		expect(mock.appended[0]?.data).toMatchObject({ schemaVersion: 1, seq: 1, kind: "session", data: { status: "startup" } });
	});

	test("observes tool call and result without mutating either", async () => {
		const { createTrajectoryLoggerExtensionV1 } = await loadExtension();
		const mock = piMock();
		createTrajectoryLoggerExtensionV1({ now: () => "2026-08-11T21:00:00.000Z" })(mock.pi as any);
		await emit(mock, "session_start", { type: "session_start", reason: "startup" });
		const call = { type: "tool_call", toolCallId: "c1", toolName: "bash", input: { command: "printf secret", apiKey: "sk-ABCDEFGHIJKLMNOPQRSTUVWX" } };
		const beforeCall = structuredClone(call);
		const callResult = await emit(mock, "tool_call", call);
		expect(callResult).toBeUndefined();
		expect(call).toEqual(beforeCall);
		const result = { type: "tool_result", toolCallId: "c1", toolName: "bash", input: call.input, content: [{ type: "text", text: "token=sk-ABCDEFGHIJKLMNOPQRSTUVWX" }], details: { password: "secret-value" }, isError: true };
		const beforeResult = structuredClone(result);
		const resultResult = await emit(mock, "tool_result", result);
		expect(resultResult).toBeUndefined();
		expect(result).toEqual(beforeResult);
		const bytes = JSON.stringify(mock.appended);
		expect(bytes).not.toContain("ABCDEFGHIJKLMNOP");
		expect(bytes).not.toContain("secret-value");
		expect(mock.appended.map((entry) => entry.data.kind)).toEqual(["session", "tool_call", "tool_result"]);
	});

	test("accepts namespaced closed observations and rejects unknown custom kinds", async () => {
		const { createTrajectoryLoggerExtensionV1 } = await loadExtension();
		const mock = piMock();
		createTrajectoryLoggerExtensionV1({ now: () => "2026-08-11T21:00:00.000Z" })(mock.pi as any);
		await emit(mock, "session_start", { type: "session_start", reason: "startup" });
		mock.emitBus({ schemaVersion: 1, kind: "phase_change", data: { phase: "red" } });
		mock.emitBus({ schemaVersion: 1, kind: "invented", preview: "raw" });
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(mock.appended.filter((entry) => entry.data.kind === "phase_change")).toHaveLength(1);
		expect(mock.appended.some((entry) => entry.data.kind === "invented")).toBe(false);
	});

	test("explicit file persistence requires trusted project and valid session id", async () => {
		const { createTrajectoryLoggerExtensionV1 } = await loadExtension();
		const untrusted = piMock(true);
		untrusted.context.isProjectTrusted = () => false;
		let calls = 0;
		createTrajectoryLoggerExtensionV1({ now: () => "2026-08-11T21:00:00.000Z", createFileWriter: async () => { calls++; return undefined; } })(untrusted.pi as any);
		await emit(untrusted, "session_start", { type: "session_start", reason: "startup" });
		expect(calls).toBe(0);
		expect(untrusted.statuses.at(-1)).toContain("project-untrusted");

		const malformed = piMock(true);
		malformed.context.sessionManager.getSessionId = () => "../../escape";
		createTrajectoryLoggerExtensionV1({ now: () => "2026-08-11T21:00:00.000Z", createFileWriter: async () => { calls++; return undefined; } })(malformed.pi as any);
		await emit(malformed, "session_start", { type: "session_start", reason: "startup" });
		expect(calls).toBe(0);
		expect(malformed.statuses.at(-1)).toContain("invalid-session-id");
	});

	test("trusted explicit file option creates one writer and reports sink outcomes", async () => {
		const { createTrajectoryLoggerExtensionV1 } = await loadExtension();
		const mock = piMock(true);
		let creates = 0;
		let enqueues = 0;
		const writer = { enqueue: async () => { enqueues++; return { ok: true }; }, flush: async () => ({ ok: true }), close: async () => ({ ok: true }) };
		createTrajectoryLoggerExtensionV1({ now: () => "2026-08-11T21:00:00.000Z", createFileWriter: async (request: any) => { creates++; expect(request).toMatchObject({ projectRoot: "/repo", sessionId: "11111111-1111-4111-8111-111111111111" }); return writer; } })(mock.pi as any);
		await emit(mock, "session_start", { type: "session_start", reason: "startup" });
		await emit(mock, "tool_call", { type: "tool_call", toolCallId: "c1", toolName: "read", input: { path: "src/a.ts" } });
		expect(creates).toBe(1);
		expect(enqueues).toBe(2);
	});

	test("reload closes and unsubscribes old generation exactly once", async () => {
		const { createTrajectoryLoggerExtensionV1 } = await loadExtension();
		const mock = piMock(true);
		let closes = 0;
		let creates = 0;
		const makeWriter = () => ({ enqueue: async () => ({ ok: true }), flush: async () => ({ ok: true }), close: async () => { closes++; return { ok: true }; } });
		createTrajectoryLoggerExtensionV1({ now: () => "2026-08-11T21:00:00.000Z", createFileWriter: async () => { creates++; return makeWriter(); } })(mock.pi as any);
		await emit(mock, "session_start", { type: "session_start", reason: "startup" });
		await emit(mock, "session_shutdown", { type: "session_shutdown", reason: "reload" });
		await emit(mock, "session_shutdown", { type: "session_shutdown", reason: "reload" });
		await emit(mock, "session_start", { type: "session_start", reason: "reload" });
		expect(creates).toBe(2);
		expect(closes).toBe(1);
		expect(mock.unsubscribeCalls).toBe(1);
	});

	test("repeated session_start disposes prior resources before replacement", async () => {
		const { createTrajectoryLoggerExtensionV1 } = await loadExtension();
		const mock = piMock(true);
		let closes = 0;
		createTrajectoryLoggerExtensionV1({ now: () => "2026-08-11T21:00:00.000Z", createFileWriter: async () => ({ enqueue: async () => ({ ok: true }), flush: async () => ({ ok: true }), close: async () => { closes++; return { ok: true }; } }) })(mock.pi as any);
		await emit(mock, "session_start", { type: "session_start", reason: "startup" });
		await emit(mock, "session_start", { type: "session_start", reason: "reload" });
		expect(closes).toBe(1);
		expect(mock.unsubscribeCalls).toBe(1);
	});

	test("recorder failures are visible but do not block tools or echo arbitrary errors", async () => {
		const { createTrajectoryLoggerExtensionV1 } = await loadExtension();
		const mock = piMock();
		mock.pi.appendEntry = () => { throw new Error("credential-secret-value"); };
		createTrajectoryLoggerExtensionV1({ now: () => "2026-08-11T21:00:00.000Z" })(mock.pi as any);
		await emit(mock, "session_start", { type: "session_start", reason: "startup" });
		const result = await emit(mock, "tool_call", { type: "tool_call", toolCallId: "c1", toolName: "read", input: { path: "src/a.ts" } });
		expect(result).toBeUndefined();
		expect(mock.statuses.join(" ")).toContain("sink-unavailable");
		expect(mock.statuses.join(" ")).not.toContain("credential-secret-value");
	});
});


describe("OBS-01 trajectory logger review regressions", () => {
	test("explicit file flag without factory reports sink-unavailable instead of silent session-only", async () => {
		const { createTrajectoryLoggerExtensionV1 } = await loadExtension();
		const mock = piMock(true);
		createTrajectoryLoggerExtensionV1({ now: () => "2026-08-11T21:00:00.000Z" })(mock.pi as any);
		await emit(mock, "session_start", { type: "session_start", reason: "startup" });
		expect(mock.statuses.join(" ")).toContain("sink-unavailable");
		expect(mock.statuses.join(" ")).not.toContain("session-only");
	});

	test("session_shutdown records one shutdown observation before dispose", async () => {
		const { createTrajectoryLoggerExtensionV1 } = await loadExtension();
		const mock = piMock();
		createTrajectoryLoggerExtensionV1({ now: () => "2026-08-11T21:00:00.000Z" })(mock.pi as any);
		await emit(mock, "session_start", { type: "session_start", reason: "startup" });
		await emit(mock, "session_shutdown", { type: "session_shutdown", reason: "quit" });
		const kinds = mock.appended.map((e) => e.data.kind);
		const statuses = mock.appended.map((e) => e.data?.data?.status);
		expect(kinds).toContain("session");
		expect(statuses).toContain("startup");
		expect(statuses).toContain("shutdown");
	});
});

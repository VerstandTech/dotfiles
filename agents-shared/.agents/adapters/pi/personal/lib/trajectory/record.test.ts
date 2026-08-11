import { describe, expect, test } from "bun:test";

async function loadRecord() {
	try {
		return await import("./record.ts");
	} catch {
		throw new Error("OBS01_TRAJECTORY_RECORDER_MISSING");
	}
}

function candidate(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		schemaVersion: 1,
		kind: "tool_call",
		actor: "worker-a",
		tool: "read",
		toolCallId: "call-1",
		preview: "read repository file",
		raw: { path: "src/module.ts", request: "bounded metadata" },
		...overrides,
	};
}

function recorderOptions(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	let tick = 0;
	return {
		now: () => `2026-08-11T21:00:0${tick++}.000Z`,
		priorEntries: [],
		maxSessionEntries: 64,
		...overrides,
	};
}

describe("OBS-01 trajectory recorder", () => {
	test("exports a bounded recorder authority before any trajectory sink exists", async () => {
		const module = await loadRecord();
		expect(typeof module.createTrajectoryRecorderV1).toBe("function");
		expect(typeof module.createBufferedTrajectoryWriterV1).toBe("function");
		expect(typeof module.restoreTrajectorySequenceV1).toBe("function");
		expect(typeof module.planTrajectoryRetentionV1).toBe("function");
		expect(module.TRAJECTORY_CUSTOM_ENTRY_TYPE_V1).toBe("assurance-trajectory-event-v1");
		expect(module.TRAJECTORY_EVENT_BUS_CHANNEL_V1).toBe("assurance:trajectory");
		expect(Object.isFrozen(module.TRAJECTORY_LIMITS_V1)).toBe(true);
	});

	test("redacts previews and nested metadata before session append", async () => {
		const { createTrajectoryRecorderV1 } = await loadRecord();
		const appended: unknown[] = [];
		const recorder = createTrajectoryRecorderV1(
			recorderOptions({ appendSessionEntry: (_type: string, value: unknown) => appended.push(value) }),
		);
		const rawSecret = "sk-ABCDEFGHIJKLMNOPQRSTUVWX123456";
		const result = await recorder.record(
			candidate({ preview: `token=${rawSecret}`, data: { apiKey: rawSecret } }),
		);
		expect(result.ok).toBe(true);
		expect(appended).toHaveLength(1);
		const bytes = JSON.stringify(appended[0]);
		expect(bytes).not.toContain(rawSecret);
		expect(bytes).toContain("[REDACTED]");
	});

	test("hashes only RED-01 success bytes and never stores raw tool bodies", async () => {
		const { createTrajectoryRecorderV1 } = await loadRecord();
		const first = createTrajectoryRecorderV1(recorderOptions());
		const second = createTrajectoryRecorderV1(recorderOptions());
		const a = await first.record(candidate({ raw: { apiKey: "sk-AAAAAAAAAAAAAAAAAAAAAAAAAAAA" } }));
		const b = await second.record(candidate({ raw: { apiKey: "sk-BBBBBBBBBBBBBBBBBBBBBBBBBBBB" } }));
		expect(a.ok).toBe(true);
		expect(b.ok).toBe(true);
		if (!a.ok || !b.ok) return;
		expect(a.event.hashRefs?.[0]?.sha256).toBe(b.event.hashRefs?.[0]?.sha256);
		expect(JSON.stringify(a.event)).not.toContain("AAAA");
		expect(JSON.stringify(b.event)).not.toContain("BBBB");
		expect(a.event).not.toHaveProperty("raw");
	});

	test("assigns contiguous sequence under concurrent invocation", async () => {
		const { createTrajectoryRecorderV1 } = await loadRecord();
		const recorder = createTrajectoryRecorderV1(recorderOptions());
		const results = await Promise.all([
			recorder.record(candidate({ toolCallId: "c1" })),
			recorder.record(candidate({ toolCallId: "c2" })),
			recorder.record(candidate({ toolCallId: "c3" })),
		]);
		expect(results.map((result: any) => result.event?.seq)).toEqual([1, 2, 3]);
	});

	test("returns detached deeply frozen events and line bytes", async () => {
		const { createTrajectoryRecorderV1 } = await loadRecord();
		const source = candidate({ data: { status: "working" } });
		const recorder = createTrajectoryRecorderV1(recorderOptions());
		const result = await recorder.record(source);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		(source.data as Record<string, unknown>).status = "mutated";
		expect(result.event.data).toEqual({ status: "working" });
		expect(Object.isFrozen(result)).toBe(true);
		expect(Object.isFrozen(result.event)).toBe(true);
		expect(Object.isFrozen(result.event.data)).toBe(true);
		expect(result.line).not.toContain("mutated");
	});

	test("caller sequence time and unknown fields are not trusted", async () => {
		const { createTrajectoryRecorderV1 } = await loadRecord();
		const recorder = createTrajectoryRecorderV1(recorderOptions());
		for (const extra of [{ seq: 500 }, { at: "tomorrow" }, { force: true }, { trusted: true }]) {
			const result = await recorder.record(candidate(extra));
			expect(result).toMatchObject({ ok: false, code: "unknown-field" });
		}
	});

	test("refuses hostile and unsupported candidate shapes without throwing", async () => {
		const { createTrajectoryRecorderV1 } = await loadRecord();
		const cases: unknown[] = [
			null,
			[],
			new Date(),
			new Map(),
			{ schemaVersion: 2, kind: "tool_call" },
			candidate({ kind: "unknown-kind" }),
			candidate({ preview: "x".repeat(5000) }),
			candidate({ raw: new Uint8Array([1, 2, 3]) }),
		];
		const accessor = candidate();
		Object.defineProperty(accessor, "preview", { enumerable: true, get: () => { throw new Error("must-not-run"); } });
		cases.push(accessor);
		const cyclic = candidate();
		cyclic.raw = cyclic;
		cases.push(cyclic);
		for (const value of cases) {
			const recorder = createTrajectoryRecorderV1(recorderOptions());
			const result = await recorder.record(value);
			expect(result.ok).toBe(false);
			expect(JSON.stringify(result)).not.toContain("must-not-run");
		}
	});

	test("refused candidates invoke no sink and consume no sequence", async () => {
		const { createTrajectoryRecorderV1 } = await loadRecord();
		let sessionCalls = 0;
		let fileCalls = 0;
		const writer = { enqueue: async () => { fileCalls++; return { ok: true }; }, flush: async () => ({ ok: true }), close: async () => ({ ok: true }) };
		const recorder = createTrajectoryRecorderV1(
			recorderOptions({ appendSessionEntry: () => { sessionCalls++; }, fileWriter: writer }),
		);
		const refused = await recorder.record(candidate({ raw: new Uint8Array([1]) }));
		const accepted = await recorder.record(candidate());
		expect(refused.ok).toBe(false);
		expect(sessionCalls).toBe(1);
		expect(fileCalls).toBe(1);
		expect((accepted as any).event.seq).toBe(1);
	});

	test("validates safe artifact refs and rejects credential or escaped paths", async () => {
		const { createTrajectoryRecorderV1 } = await loadRecord();
		const allowed = await createTrajectoryRecorderV1(recorderOptions()).record(
			candidate({ artifactRefs: ["artifacts/trajectory/report.json"] }),
		);
		expect(allowed.ok).toBe(true);
		for (const path of ["../escape", "/tmp/raw", ".env", "auth.json.bak", "src/**", "https://example.test/x"]) {
			const result = await createTrajectoryRecorderV1(recorderOptions()).record(candidate({ artifactRefs: [path] }));
			expect(result).toMatchObject({ ok: false, code: "unsafe-path" });
		}
	});

	test("preserves closed event taxonomy and rejects arbitrary statuses", async () => {
		const { createTrajectoryRecorderV1 } = await loadRecord();
		const cases = [
			["session", { status: "reload" }],
			["phase_change", { phase: "red" }],
			["gate_result", { gateId: "unit", status: "passed", required: true }],
			["decision", { status: "stale" }],
			["handoff", { status: "blocked" }],
			["budget", { status: "unknown" }],
			["human_approval", { status: "approved" }],
			["herdr_state", { status: "working" }],
			["error", { code: "sink-unavailable" }],
		];
		for (const [kind, data] of cases) {
			const result = await createTrajectoryRecorderV1(recorderOptions()).record({ schemaVersion: 1, kind, data });
			expect(result.ok).toBe(true);
		}
		const invalid = await createTrajectoryRecorderV1(recorderOptions()).record({ schemaVersion: 1, kind: "gate_result", data: { status: "probably" } });
		expect(invalid.ok).toBe(false);
	});

	test("reports session and file sink outcomes separately", async () => {
		const { createTrajectoryRecorderV1 } = await loadRecord();
		const writer = {
			enqueue: async () => ({ ok: false, code: "sink-unavailable" }),
			flush: async () => ({ ok: false, code: "sink-unavailable" }),
			close: async () => ({ ok: true }),
		};
		const recorder = createTrajectoryRecorderV1(
			recorderOptions({ appendSessionEntry: () => undefined, fileWriter: writer }),
		);
		const result = await recorder.record(candidate());
		expect(result).toMatchObject({ ok: false, code: "sink-unavailable", sinks: { session: "persisted", file: "failed" } });
	});

	test("session append failure is non-echoing and never claims persistence", async () => {
		const { createTrajectoryRecorderV1 } = await loadRecord();
		const recorder = createTrajectoryRecorderV1(
			recorderOptions({ appendSessionEntry: () => { throw new Error("raw-secret-value"); } }),
		);
		const result = await recorder.record(candidate());
		expect(result).toMatchObject({ ok: false, code: "sink-unavailable", sinks: { session: "failed" } });
		expect(JSON.stringify(result)).not.toContain("raw-secret-value");
	});

	test("enforces session entry cap without invoking the next sink", async () => {
		const { createTrajectoryRecorderV1 } = await loadRecord();
		let calls = 0;
		const recorder = createTrajectoryRecorderV1(
			recorderOptions({ maxSessionEntries: 1, appendSessionEntry: () => { calls++; } }),
		);
		expect((await recorder.record(candidate({ toolCallId: "one" }))).ok).toBe(true);
		expect(await recorder.record(candidate({ toolCallId: "two" }))).toMatchObject({ ok: false, code: "retention-limit" });
		expect(calls).toBe(1);
	});

	test("restores only contiguous own entries", async () => {
		const { restoreTrajectorySequenceV1, TRAJECTORY_CUSTOM_ENTRY_TYPE_V1 } = await loadRecord();
		const own = (seq: number) => ({ type: "custom", customType: TRAJECTORY_CUSTOM_ENTRY_TYPE_V1, data: { schemaVersion: 1, seq, at: `2026-08-11T21:00:0${seq}.000Z`, kind: "message" } });
		expect(restoreTrajectorySequenceV1([])).toEqual({ ok: true, nextSequence: 1, count: 0 });
		expect(restoreTrajectorySequenceV1([own(1), { type: "custom", customType: "foreign", data: { seq: 99 } }, own(2)])).toEqual({ ok: true, nextSequence: 3, count: 2 });
		for (const entries of [[own(1), own(1)], [own(1), own(3)], [own(2), own(1)]]) {
			expect(restoreTrajectorySequenceV1(entries)).toMatchObject({ ok: false, code: "sequence-invalid" });
		}
	});

	test("closed recorder cannot append and closes a writer once", async () => {
		const { createTrajectoryRecorderV1 } = await loadRecord();
		let closes = 0;
		const writer = { enqueue: async () => ({ ok: true }), flush: async () => ({ ok: true }), close: async () => { closes++; return { ok: true }; } };
		const recorder = createTrajectoryRecorderV1(recorderOptions({ fileWriter: writer }));
		expect((await recorder.close()).ok).toBe(true);
		expect((await recorder.close()).ok).toBe(true);
		expect(closes).toBe(1);
		expect(await recorder.record(candidate())).toMatchObject({ ok: false, code: "writer-closed" });
	});
});

describe("OBS-01 buffered trajectory writer", () => {
	test("flushes complete ordered lines on count threshold without a timer", async () => {
		const { createBufferedTrajectoryWriterV1 } = await loadRecord();
		const batches: string[] = [];
		const writer = createBufferedTrajectoryWriterV1({
			append: async (bytes: string) => { batches.push(bytes); },
			maxBufferedEvents: 2,
			maxBufferedBytes: 1024,
			maxLineBytes: 512,
		});
		expect((await writer.enqueue({ seq: 1, line: '{"seq":1}' })).ok).toBe(true);
		expect((await writer.enqueue({ seq: 2, line: '{"seq":2}' })).ok).toBe(true);
		expect(batches).toEqual(['{"seq":1}\n{"seq":2}\n']);
		expect(writer).not.toHaveProperty("timer");
	});

	test("empty flush is a no-op and close flushes once", async () => {
		const { createBufferedTrajectoryWriterV1 } = await loadRecord();
		let appends = 0;
		const writer = createBufferedTrajectoryWriterV1({ append: async () => { appends++; }, maxBufferedEvents: 10, maxBufferedBytes: 1024, maxLineBytes: 512 });
		expect((await writer.flush()).ok).toBe(true);
		expect(appends).toBe(0);
		await writer.enqueue({ seq: 1, line: '{"seq":1}' });
		await writer.close();
		await writer.close();
		expect(appends).toBe(1);
	});

	test("rejects out-of-order or oversized lines before append", async () => {
		const { createBufferedTrajectoryWriterV1 } = await loadRecord();
		let appends = 0;
		const writer = createBufferedTrajectoryWriterV1({ append: async () => { appends++; }, maxBufferedEvents: 10, maxBufferedBytes: 64, maxLineBytes: 24 });
		expect((await writer.enqueue({ seq: 2, line: '{"seq":2}' })).ok).toBe(true);
		expect(await writer.enqueue({ seq: 2, line: '{"seq":2}' })).toMatchObject({ ok: false, code: "sequence-invalid" });
		expect(await writer.enqueue({ seq: 3, line: "x".repeat(25) })).toMatchObject({ ok: false, code: "bound-exceeded" });
		expect(appends).toBe(0);
	});

	test("ambiguous append failure permanently fails writer without retry", async () => {
		const { createBufferedTrajectoryWriterV1 } = await loadRecord();
		let appends = 0;
		const writer = createBufferedTrajectoryWriterV1({ append: async () => { appends++; throw new Error("partial"); }, maxBufferedEvents: 1, maxBufferedBytes: 1024, maxLineBytes: 512 });
		expect(await writer.enqueue({ seq: 1, line: '{"seq":1}' })).toMatchObject({ ok: false, code: "sink-unavailable" });
		expect(await writer.enqueue({ seq: 2, line: '{"seq":2}' })).toMatchObject({ ok: false, code: "sink-unavailable" });
		expect(appends).toBe(1);
	});
});

describe("OBS-01 retention planner", () => {
	const policy = {
		maxLineBytes: 512,
		maxBufferedBytes: 2048,
		maxSegmentBytes: 4096,
		maxTotalBytes: 8192,
		maxSegments: 3,
		maxSessionEntries: 128,
	};
	const segment = (overrides: Record<string, unknown> = {}) => ({ path: ".pi/trajectories/session-0.ndjson", segment: 0, sizeBytes: 1000, order: 1, kind: "file", links: 1, symlink: false, ...overrides });

	test("allows append or next segment from explicit inventory", async () => {
		const { planTrajectoryRetentionV1 } = await loadRecord();
		expect(planTrajectoryRetentionV1({ policy, inventory: [segment()], nextLineBytes: 100 })).toMatchObject({ ok: true, action: "append", segment: 0 });
		expect(planTrajectoryRetentionV1({ policy, inventory: [segment({ sizeBytes: 4050 })], nextLineBytes: 100 })).toMatchObject({ ok: true, action: "new-segment", segment: 1 });
	});

	test("returns stable limit with deterministic purge candidates but never deletes", async () => {
		const { planTrajectoryRetentionV1 } = await loadRecord();
		const inventory = [segment({ path: ".pi/trajectories/session-0.ndjson", segment: 0, sizeBytes: 3000, order: 1 }), segment({ path: ".pi/trajectories/session-1.ndjson", segment: 1, sizeBytes: 3000, order: 2 }), segment({ path: ".pi/trajectories/session-2.ndjson", segment: 2, sizeBytes: 2500, order: 3 })];
		const result = planTrajectoryRetentionV1({ policy, inventory, nextLineBytes: 100 });
		expect(result).toMatchObject({ ok: false, code: "retention-limit", purgeCandidates: [".pi/trajectories/session-0.ndjson"] });
	});

	test("rejects unknown or unsafe inventories", async () => {
		const { planTrajectoryRetentionV1 } = await loadRecord();
		for (const inventory of [undefined, [segment({ symlink: true })], [segment({ links: 2 })], [segment({ kind: "fifo" })], [segment({ path: "../escape" })], [segment(), segment()]]) {
			expect(planTrajectoryRetentionV1({ policy, inventory, nextLineBytes: 100 }).ok).toBe(false);
		}
	});
});

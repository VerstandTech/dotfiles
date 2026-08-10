import { describe, expect, test } from "bun:test";
import { buildFleetPlan } from "./plan.ts";
import {
	callSubagentRpc,
	replyChannel,
	SUBAGENT_RPC_REQUEST,
	SUBAGENT_RPC_VERSION,
} from "./rpc.ts";
import { extractRunIdentity } from "./run-ledger.ts";

const PUBLIC_CUTOVER_MESSAGE =
	"Legacy top-level chain and parallel inputs were removed; use workflowScript.";

const FORBIDDEN_PUBLIC_KEYS = [
	"action",
	"tasks",
	"chain",
	"parallel",
	"concurrency",
	"chainDir",
	"agent",
	"task",
	"step",
] as const;

/** Test-local mirror of pi-subagents 0.45.2 public-execution cutover. */
function normalizePublicSubagentExecutionMirror(
	params: Record<string, unknown>,
): { ok: true } | { ok: false; error: string } {
	const hasLegacyOrchestration =
		params.tasks !== undefined ||
		params.chain !== undefined ||
		params.parallel !== undefined ||
		params.concurrency !== undefined ||
		params.chainDir !== undefined;
	if (hasLegacyOrchestration) {
		return { ok: false, error: PUBLIC_CUTOVER_MESSAGE };
	}
	if (params.action !== undefined) {
		return {
			ok: false,
			error: "workflowScript execution must omit action; only schedule.create accepts action with workflowScript.",
		};
	}
	if (params.agent !== undefined || params.task !== undefined || params.step !== undefined) {
		return {
			ok: false,
			error: 'Direct execution was removed. Use workflowScript: "return runs.run(\'main\', { agent, task })".',
		};
	}
	if (typeof params.workflowScript !== "string" || !params.workflowScript.trim()) {
		return {
			ok: false,
			error:
				'Execution requires a non-empty workflowScript. Direct execution was removed; use workflowScript: "return runs.run(\'main\', { agent, task })".',
		};
	}
	return { ok: true };
}

function assertCurrentPublicParams(params: Record<string, unknown>): void {
	if (Object.prototype.hasOwnProperty.call(params, "tasks") || params.tasks !== undefined) {
		throw new Error("legacy top-level tasks payload is still emitted");
	}
	for (const key of FORBIDDEN_PUBLIC_KEYS) {
		expect(params[key], `public params must omit ${key}`).toBeUndefined();
	}
	expect(typeof params.workflowScript).toBe("string");
	expect(String(params.workflowScript).trim().length).toBeGreaterThan(0);
	expect(params.async).toBe(true);
	expect(params.context === "fresh" || params.context === "fork").toBe(true);
	expect(normalizePublicSubagentExecutionMirror(params).ok).toBe(true);
}

function createMockBus(options?: {
	onRequest?: (req: Record<string, unknown>) => void;
	reply?: (req: Record<string, unknown>) => unknown;
	/** When true, never reply (timeout path). */
	silent?: boolean;
}) {
	const handlers = new Map<string, Set<(d: unknown) => void>>();
	const events = {
		on(channel: string, handler: (d: unknown) => void) {
			if (!handlers.has(channel)) handlers.set(channel, new Set());
			handlers.get(channel)!.add(handler);
			return () => handlers.get(channel)?.delete(handler);
		},
		emit(channel: string, data: unknown) {
			if (channel !== SUBAGENT_RPC_REQUEST) return;
			const req = data as Record<string, unknown>;
			options?.onRequest?.(req);
			if (options?.silent) return;
			const requestId = String(req.requestId ?? "");
			const reply = options?.reply
				? options.reply(req)
				: {
						version: 1,
						requestId,
						success: true,
						data: {
							text: "Async parallel launched",
							details: {
								runId: "mock-run-cmp02",
								asyncDir: "/tmp/async/mock-run-cmp02",
							},
						},
					};
			const replyCh = replyChannel(requestId);
			for (const h of handlers.get(replyCh) ?? []) {
				h(reply);
			}
		},
		listenerCount(channel: string) {
			return handlers.get(channel)?.size ?? 0;
		},
	};
	return events;
}

describe("callSubagentRpc", () => {
	test("resolves successful reply", async () => {
		const handlers = new Map<string, Set<(d: unknown) => void>>();
		const events = {
			on(channel: string, handler: (d: unknown) => void) {
				if (!handlers.has(channel)) handlers.set(channel, new Set());
				handlers.get(channel)!.add(handler);
				return () => handlers.get(channel)?.delete(handler);
			},
			emit(channel: string, data: unknown) {
				if (channel === SUBAGENT_RPC_REQUEST) {
					const req = data as { requestId: string };
					const reply = replyChannel(req.requestId);
					for (const h of handlers.get(reply) ?? []) {
						h({ version: 1, requestId: req.requestId, success: true, data: { ok: true } });
					}
				}
			},
		};
		const reply = await callSubagentRpc(events, "ping", {});
		expect(reply.success).toBe(true);
		expect((reply.data as { ok: boolean }).ok).toBe(true);
	});

	test("times out", async () => {
		const events = {
			on() {
				return () => {};
			},
			emit() {},
		};
		const reply = await callSubagentRpc(events, "ping", {}, { timeoutMs: 20 });
		expect(reply.success).toBe(false);
		expect(reply.error?.code).toBe("timeout");
	});

	test("spawn emits v1 request with current WorkflowScript params", async () => {
		const plan = buildFleetPlan({
			kind: "research",
			topic: "rpc-current-params",
			count: 5,
			concurrency: 2,
			context: "fresh",
			modelPolicy: {
				models: ["xai/grok-4.5", "xai/grok-4-1-fast"],
				explicitOverride: true,
			},
		});
		const params = plan.subagentParams as unknown as Record<string, unknown>;
		assertCurrentPublicParams(params);

		let captured: Record<string, unknown> | undefined;
		const bus = createMockBus({
			onRequest(req) {
				captured = req;
			},
		});

		const reply = await callSubagentRpc(bus, "spawn", params, {
			timeoutMs: 500,
			source: "agentic-fleet",
		});

		expect(reply.success).toBe(true);
		expect(captured).toBeDefined();
		expect(captured!.version).toBe(SUBAGENT_RPC_VERSION);
		expect(captured!.version).toBe(1);
		expect(captured!.method).toBe("spawn");
		expect(captured!.params).toEqual(params);
		expect((captured!.source as { extension?: string })?.extension).toBe("agentic-fleet");

		const identity = extractRunIdentity(reply.data);
		expect(identity?.runId).toBe("mock-run-cmp02");
		expect(identity?.asyncDir).toBe("/tmp/async/mock-run-cmp02");
		// Successful identity stays available for ledger binding; no false empty claim.
		expect(identity?.runId).toBeTruthy();
	});

	test("timeout removes listener and never claims a run id", async () => {
		const bus = createMockBus({ silent: true });
		const reply = await callSubagentRpc(
			bus,
			"spawn",
			{
				workflowScript: "return [];",
				async: true,
				context: "fresh",
			},
			{ timeoutMs: 25, requestId: "fleet-timeout-cmp02" },
		);
		expect(reply.success).toBe(false);
		expect(reply.error?.code).toBe("timeout");
		expect(extractRunIdentity(reply)).toBeUndefined();
		expect(extractRunIdentity(reply.data)).toBeUndefined();
		expect(bus.listenerCount(replyChannel("fleet-timeout-cmp02"))).toBe(0);
	});

	test("malformed reply is honest failure and removes listener", async () => {
		const bus = createMockBus({
			reply: (req) => ({
				// Neither success:true nor a structured error object.
				version: 1,
				requestId: req.requestId,
				unexpected: true,
			}),
		});
		const reply = await callSubagentRpc(
			bus,
			"spawn",
			{
				workflowScript: "return [];",
				async: true,
				context: "fresh",
			},
			{ timeoutMs: 500, requestId: "fleet-malformed-cmp02" },
		);
		expect(reply.success).toBe(false);
		expect(reply.error).toBeDefined();
		expect(extractRunIdentity(reply)).toBeUndefined();
		expect(bus.listenerCount(replyChannel("fleet-malformed-cmp02"))).toBe(0);
	});

	test("cutover mirror rejects legacy params and accepts WorkflowScript params", () => {
		const legacy = {
			tasks: [{ agent: "fleet-researcher", task: "hello" }],
			concurrency: 2,
			context: "fresh",
			async: true,
		};
		const current = {
			workflowScript: "return runs.all([]);",
			async: true,
			context: "fork",
		};

		const legacyResult = normalizePublicSubagentExecutionMirror(legacy);
		expect(legacyResult.ok).toBe(false);
		if (!legacyResult.ok) {
			expect(legacyResult.error).toBe(PUBLIC_CUTOVER_MESSAGE);
		}

		const currentResult = normalizePublicSubagentExecutionMirror(current);
		expect(currentResult.ok).toBe(true);

		// Production plan must already be on the current side of the cutover.
		const plan = buildFleetPlan({
			kind: "research",
			topic: "rpc-mirror",
			count: 2,
			concurrency: 2,
		});
		assertCurrentPublicParams(plan.subagentParams as unknown as Record<string, unknown>);
	});
});

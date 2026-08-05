import { describe, expect, test } from "bun:test";
import {
	callSubagentRpc,
	replyChannel,
	SUBAGENT_RPC_REQUEST,
} from "./rpc.ts";

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
});

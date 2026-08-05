/**
 * Thin client for pi-subagents extension RPC (async spawn / status).
 */

export const SUBAGENT_RPC_VERSION = 1 as const;
export const SUBAGENT_RPC_REQUEST = "subagents:rpc:v1:request";
export const SUBAGENT_RPC_READY = "subagents:rpc:v1:ready";
export const SUBAGENT_RPC_REPLY_PREFIX = "subagents:rpc:v1:reply:";

export interface EventBusLike {
	emit(channel: string, data: unknown): void;
	on(channel: string, handler: (data: unknown) => void): () => void;
}

export interface RpcReply {
	success: boolean;
	data?: unknown;
	error?: { code?: string; message?: string };
	raw: unknown;
}

export function replyChannel(requestId: string): string {
	return `${SUBAGENT_RPC_REPLY_PREFIX}${requestId}`;
}

export function spawnRequestId(prefix = "fleet"): string {
	return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Emit a subagent RPC request and wait for the correlated reply.
 */
export function callSubagentRpc(
	events: EventBusLike,
	method: "ping" | "spawn" | "status" | "interrupt" | "stop",
	params: unknown,
	options: {
		requestId?: string;
		timeoutMs?: number;
		source?: string;
	} = {},
): Promise<RpcReply> {
	const requestId = options.requestId ?? spawnRequestId(method);
	const timeoutMs = options.timeoutMs ?? 30_000;
	const channel = replyChannel(requestId);

	return new Promise((resolve) => {
		let settled = false;
		const finish = (reply: RpcReply) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			unsub();
			resolve(reply);
		};

		const unsub = events.on(channel, (raw) => {
			const rec = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
			if (rec.success === true) {
				finish({ success: true, data: rec.data, raw });
				return;
			}
			const err =
				rec.error && typeof rec.error === "object"
					? (rec.error as { code?: string; message?: string })
					: { message: String(rec.error ?? "RPC failed") };
			finish({ success: false, error: err, raw });
		});

		const timer = setTimeout(() => {
			finish({
				success: false,
				error: {
					code: "timeout",
					message: `Timed out waiting for subagent RPC reply (${method}) after ${timeoutMs}ms. Is npm:pi-subagents loaded?`,
				},
				raw: null,
			});
		}, timeoutMs);

		events.emit(SUBAGENT_RPC_REQUEST, {
			version: SUBAGENT_RPC_VERSION,
			requestId,
			method,
			params,
			source: { extension: options.source ?? "agentic-fleet" },
		});
	});
}

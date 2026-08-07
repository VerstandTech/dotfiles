/**
 * Anti-hang extension for Pi.
 *
 * Prevents the agent loop from wedging indefinitely on tool execute():
 * 1. Blocks classic unbounded root walks (`find / …`, `updatedb`, `ls -R /`)
 * 2. Injects default timeouts on bash + context-mode execute tools when omitted
 *    (Pi bash has no default; context-mode leaves timeout undefined on Pi hosts)
 *
 * Evidence (2026-08-07): session ended at stopReason=toolUse with
 * ctx_batch_execute running `find / -name '*claude-code*'`; orphan process
 * still running 11+ minutes. pi-agent-core awaits tools without toolTimeoutMs.
 *
 * Escape: Esc interrupt still works for in-flight tools; this gate stops the
 * hang *before* execution for root walks, and bounds duration for the rest.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
	DEFAULT_BASH_TIMEOUT_SEC,
	DEFAULT_CTX_TIMEOUT_MS,
	evaluateHangGate,
} from "../lib/anti-hang/gate.ts";

export default function (pi: ExtensionAPI) {
	pi.on("tool_call", (event, ctx) => {
		const input =
			event.input && typeof event.input === "object"
				? (event.input as Record<string, unknown>)
				: null;

		const decision = evaluateHangGate(event.toolName, input);

		if (decision.action === "block") {
			if (ctx.hasUI) {
				ctx.ui.notify(decision.reason, "warning");
			}
			return { block: true, reason: decision.reason };
		}

		if (decision.action === "patch" && input) {
			for (const [key, value] of Object.entries(decision.patches)) {
				input[key] = value;
			}
		}

		return undefined;
	});

	pi.registerCommand("anti-hang", {
		description: "Show anti-hang gate defaults and what it blocks",
		handler: async (_args, ctx) => {
			const text =
				`**Anti-hang gate** (personal extension)\n\n` +
				`- Blocks: \`find / …\`, \`updatedb\`, \`ls -R /\` (unbounded root walks)\n` +
				`- bash default timeout: **${DEFAULT_BASH_TIMEOUT_SEC}s** (when omitted)\n` +
				`- ctx_batch_execute / ctx_execute default timeout: **${DEFAULT_CTX_TIMEOUT_MS}ms** (when omitted)\n` +
				`- Caps: bash ≤ 600s, ctx ≤ 600000ms\n\n` +
				`Why: Pi + context-mode leave tool timeouts unset; a hung tool freezes the agent loop.`;
			pi.sendMessage(
				{ customType: "anti-hang-status", content: text, display: true },
				{ triggerTurn: false },
			);
			if (ctx.hasUI) {
				ctx.ui.notify("Anti-hang defaults shown", "info");
			}
		},
	});
}

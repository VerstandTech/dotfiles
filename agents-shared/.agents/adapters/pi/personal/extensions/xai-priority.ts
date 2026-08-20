/**
 * xAI Priority Processing toggle for the Pi TUI.
 *
 * Shift+Tab cycles thinking. Ctrl+Shift+U toggles this.
 * /priority [on|off] does the same.
 *
 * Injects request-body `service_tier` on xAI calls (wins over models.json).
 * https://docs.x.ai/developers/advanced-api-usage/priority-processing
 */
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
	applyServiceTier,
	isXaiModel,
	parsePriorityArgs,
	statusLabel,
	type ServiceTier,
} from "../lib/xai-priority.ts";

const STATUS_KEY = "xai-priority";

export default function (pi: ExtensionAPI) {
	// ponytail: session-scoped; persist to settings if you want it sticky across /reload
	let on = true;

	const paint = (ctx: ExtensionContext) => {
		if (!ctx.hasUI) return;
		if (!isXaiModel(ctx.model)) {
			ctx.ui.setStatus(STATUS_KEY, undefined);
			return;
		}
		ctx.ui.setStatus(STATUS_KEY, statusLabel(on));
	};

	const setOn = (ctx: ExtensionContext, next: boolean) => {
		on = next;
		paint(ctx);
		if (ctx.hasUI) {
			ctx.ui.notify(on ? "xAI priority ON" : "xAI priority OFF", "info");
		}
	};

	pi.on("session_start", (_e, ctx) => paint(ctx));
	pi.on("model_select", (_e, ctx) => paint(ctx));

	pi.on("before_provider_request", (event, ctx) => {
		if (!isXaiModel(ctx.model)) return;
		const tier: ServiceTier = on ? "priority" : "default";
		return applyServiceTier(event.payload, tier);
	});

	pi.registerShortcut("ctrl+shift+u", {
		description: "Toggle xAI priority processing",
		handler: (ctx) => setOn(ctx, !on),
	});

	pi.registerCommand("priority", {
		description: "Toggle xAI Priority Processing. Usage: /priority [on|off]",
		handler: (args, ctx) => {
			setOn(ctx, parsePriorityArgs(args, on));
		},
	});
}

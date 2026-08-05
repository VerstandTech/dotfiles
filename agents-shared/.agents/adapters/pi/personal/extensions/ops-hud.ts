/**
 * Ops HUD — richer Pi TUI visuals while sub-agents and web research run.
 *
 * - Footer status chips (web ×N, agents ×N)
 * - Above-editor widget board for parallel live ops
 * - Custom working message while busy
 * - Terminal title spinner during multi-activity
 * - /ops-hud and /ops-hud off
 *
 * Complements pi-subagents' async widget + /subagents-fleet (Ctrl+Alt+F).
 */
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
	buildHudSnapshot,
	classifyTool,
	formatStatusLine,
	formatWidgetLines,
	formatWorkingMessage,
	summarizeToolArgs,
	type HudActivity,
} from "../lib/ops-hud/format.ts";

const STATUS_KEY = "ops-hud";
const WIDGET_KEY = "ops-hud";
const BRAILLE = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

type ToolStartEvent = {
	toolCallId?: string;
	toolName?: string;
	args?: unknown;
	input?: unknown;
};

type ToolEndEvent = {
	toolCallId?: string;
	toolName?: string;
};

export default function (pi: ExtensionAPI) {
	const activities = new Map<string, HudActivity>();
	let enabled = true;
	let titleTimer: ReturnType<typeof setInterval> | null = null;
	let titleFrame = 0;
	let lastUiCtx: ExtensionContext | null = null;
	let baseTitle = "π";

	const refresh = (ctx?: ExtensionContext) => {
		const uiCtx = ctx ?? lastUiCtx;
		if (!uiCtx?.hasUI || !enabled) return;
		lastUiCtx = uiCtx;
		const snapshot = buildHudSnapshot(activities.values());
		const theme = uiCtx.ui.theme;

		const status = formatStatusLine(snapshot);
		if (status) {
			uiCtx.ui.setStatus(STATUS_KEY, theme.fg("accent", "●") + theme.fg("dim", ` ${status}`));
		} else {
			uiCtx.ui.setStatus(STATUS_KEY, undefined);
		}

		const widgetLines = formatWidgetLines(snapshot);
		if (widgetLines.length > 0) {
			uiCtx.ui.setWidget(
				WIDGET_KEY,
				widgetLines.map((line, index) =>
					index === 0 ? theme.fg("accent", line) : theme.fg("dim", line),
				),
				{ placement: "aboveEditor" },
			);
		} else {
			uiCtx.ui.setWidget(WIDGET_KEY, undefined);
		}

		const working = formatWorkingMessage(snapshot);
		if (working) {
			uiCtx.ui.setWorkingMessage(working);
			uiCtx.ui.setWorkingIndicator({
				frames: BRAILLE.map((frame) => theme.fg("accent", frame)),
				intervalMs: 80,
			});
			startTitleSpinner(uiCtx, snapshot.activities.length);
		} else {
			uiCtx.ui.setWorkingMessage();
			uiCtx.ui.setWorkingIndicator();
			stopTitleSpinner(uiCtx);
		}
	};

	const startTitleSpinner = (ctx: ExtensionContext, count: number) => {
		if (titleTimer) return;
		titleFrame = 0;
		titleTimer = setInterval(() => {
			if (!lastUiCtx?.hasUI) return;
			const frame = BRAILLE[titleFrame % BRAILLE.length]!;
			titleFrame++;
			const n = activities.size;
			lastUiCtx.ui.setTitle(n > 0 ? `${frame} π · ops×${n}${count > 1 ? " parallel" : ""}` : baseTitle);
		}, 90);
	};

	const stopTitleSpinner = (ctx: ExtensionContext) => {
		if (titleTimer) {
			clearInterval(titleTimer);
			titleTimer = null;
		}
		titleFrame = 0;
		if (ctx.hasUI) ctx.ui.setTitle(baseTitle);
	};

	const upsertFromToolStart = (event: ToolStartEvent) => {
		const toolName = String(event.toolName ?? "");
		if (!toolName) return;
		const id = String(event.toolCallId ?? `${toolName}-${Date.now()}`);
		const args = event.args ?? event.input;
		const kind = classifyTool(toolName);
		const detail = summarizeToolArgs(toolName, args);
		const startedAt = Date.now();

		if (kind === "web_search") {
			activities.set(id, {
				kind: "web_search",
				id,
				query: detail || "web research",
				startedAt,
			});
			return;
		}
		if (kind === "subagent") {
			activities.set(id, {
				kind: "subagent",
				id,
				label: detail.split(" · ")[0] || "subagent",
				detail: detail.includes(" · ") ? detail.split(" · ").slice(1).join(" · ") : detail,
				startedAt,
			});
			return;
		}
		// Keep noise down: only track "other" tools when something interesting is already active
		// or when multiple tools run (parallel feel). Always track if name looks long-running.
		const interesting =
			activities.size > 0 ||
			/browser|fetch|http|crawl|research|parallel/i.test(toolName);
		if (interesting) {
			activities.set(id, {
				kind: "tool",
				id,
				name: toolName,
				detail: detail || undefined,
				startedAt,
			});
		}
	};

	const removeTool = (event: ToolEndEvent) => {
		const id = event.toolCallId ? String(event.toolCallId) : "";
		if (id && activities.has(id)) {
			activities.delete(id);
			return;
		}
		// Fallback: drop oldest matching tool name
		const toolName = String(event.toolName ?? "");
		for (const [key, activity] of activities) {
			if (
				(activity.kind === "tool" && activity.name === toolName) ||
				(activity.kind === "web_search" && classifyTool(toolName) === "web_search") ||
				(activity.kind === "subagent" && classifyTool(toolName) === "subagent")
			) {
				activities.delete(key);
				break;
			}
		}
	};

	pi.on("session_start", (_event, ctx) => {
		baseTitle = `π - ${ctx.cwd.split("/").filter(Boolean).pop() || "pi"}`;
		if (ctx.hasUI) ctx.ui.setTitle(baseTitle);
		refresh(ctx);
	});

	pi.on("session_shutdown", (_event, ctx) => {
		activities.clear();
		stopTitleSpinner(ctx);
		if (ctx.hasUI) {
			ctx.ui.setStatus(STATUS_KEY, undefined);
			ctx.ui.setWidget(WIDGET_KEY, undefined);
			ctx.ui.setWorkingMessage();
			ctx.ui.setWorkingIndicator();
		}
	});

	pi.on("tool_execution_start", (event, ctx) => {
		upsertFromToolStart(event as ToolStartEvent);
		refresh(ctx);
	});

	pi.on("tool_execution_end", (event, ctx) => {
		removeTool(event as ToolEndEvent);
		refresh(ctx);
	});

	pi.on("agent_end", (_event, ctx) => {
		// Clear stray activities if a turn ends without paired end events.
		if (activities.size > 0) {
			// Keep only very fresh items (<2s) to avoid flicker on streaming tool ends.
			const now = Date.now();
			for (const [id, activity] of activities) {
				if (now - activity.startedAt > 2000) activities.delete(id);
			}
		}
		refresh(ctx);
	});

	// Optional: listen for pi-subagents async lifecycle if the bus emits these names.
	try {
		const bus = pi.events as { on?: (event: string, cb: (data: unknown) => void) => unknown };
		bus.on?.("subagent:async-started", (data) => {
			const rec = (data ?? {}) as Record<string, unknown>;
			const id = String(rec.asyncId ?? rec.id ?? `async-${Date.now()}`);
			const agent = String(rec.agent ?? rec.name ?? "async-agent");
			activities.set(id, {
				kind: "subagent",
				id,
				label: agent,
				detail: typeof rec.task === "string" ? rec.task.slice(0, 48) : "background",
				startedAt: Date.now(),
			});
			refresh();
		});
		bus.on?.("subagent:async-complete", (data) => {
			const rec = (data ?? {}) as Record<string, unknown>;
			const id = String(rec.asyncId ?? rec.id ?? "");
			if (id) activities.delete(id);
			refresh();
		});
	} catch {
		// Event names may differ across versions; tool hooks still cover foreground work.
	}

	pi.registerCommand("ops-hud", {
		description: "Toggle ops HUD visuals (status/widget for sub-agents + web research)",
		handler: async (args, ctx) => {
			const arg = args.trim().toLowerCase();
			if (arg === "off" || arg === "disable") enabled = false;
			else if (arg === "on" || arg === "enable") enabled = true;
			else enabled = !enabled;

			if (!enabled) {
				activities.clear();
				stopTitleSpinner(ctx);
				ctx.ui.setStatus(STATUS_KEY, undefined);
				ctx.ui.setWidget(WIDGET_KEY, undefined);
				ctx.ui.setWorkingMessage();
				ctx.ui.setWorkingIndicator();
				ctx.ui.notify("Ops HUD off", "info");
				return;
			}
			refresh(ctx);
			ctx.ui.notify("Ops HUD on — tracks web search + sub-agents", "info");
		},
	});
}

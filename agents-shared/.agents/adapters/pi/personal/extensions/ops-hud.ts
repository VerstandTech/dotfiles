/**
 * Ops HUD — richer Pi TUI visuals while sub-agents and web research run.
 *
 * - Footer status chips (web ×N, agents ×N) with sky→teal gradient pulse
 * - Above-editor widget board for parallel live ops
 * - Gold half-moon working indicator (screenshot aesthetic) + ops braille
 * - Terminal title spinner during multi-activity
 * - /ops-hud and /ops-hud off
 *
 * Complements pi-subagents' async widget + /subagents-fleet (Ctrl+Alt+F).
 */
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { statusDim, statusDotFrame } from "../lib/ops-hud/chrome.ts";
import {
	buildHudSnapshot,
	classifyTool,
	formatStatusLine,
	summarizeToolArgs,
	type HudActivity,
} from "../lib/ops-hud/format.ts";
import { renderTaskBoard, type BoardTask } from "../lib/tui-chrome/task-board.ts";

const STATUS_KEY = "ops-hud";
const WIDGET_KEY = "ops-hud";
const BRAILLE = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
// Working row + spinner owned by tui-chrome (progress bar component).

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
	let statusTimer: ReturnType<typeof setInterval> | null = null;
	let titleFrame = 0;
	let statusFrame = 0;
	let lastUiCtx: ExtensionContext | null = null;
	let baseTitle = "π";

	const paintStatus = (uiCtx: ExtensionContext, status: string | undefined) => {
		if (!status) {
			uiCtx.ui.setStatus(STATUS_KEY, undefined);
			return;
		}
		uiCtx.ui.setStatus(STATUS_KEY, statusDotFrame(statusFrame) + statusDim(` ${status}`));
	};

	const startStatusPulse = () => {
		if (statusTimer) return;
		statusTimer = setInterval(() => {
			if (!lastUiCtx?.hasUI || !enabled) return;
			const snapshot = buildHudSnapshot(activities.values());
			const status = formatStatusLine(snapshot);
			if (!status) {
				stopStatusPulse(lastUiCtx);
				return;
			}
			statusFrame++;
			paintStatus(lastUiCtx, status);
			paintWidget(lastUiCtx, snapshot);
		}, 120);
		statusTimer.unref?.();
	};

	const stopStatusPulse = (ctx: ExtensionContext) => {
		if (statusTimer) {
			clearInterval(statusTimer);
			statusTimer = null;
		}
		statusFrame = 0;
		if (ctx.hasUI) ctx.ui.setStatus(STATUS_KEY, undefined);
	};

	const paintWidget = (uiCtx: ExtensionContext, snapshot: ReturnType<typeof buildHudSnapshot>) => {
		if (snapshot.activities.length === 0) {
			uiCtx.ui.setWidget(WIDGET_KEY, undefined);
			return;
		}
		// Target-TUI task board: numbered rows with green dotted mini-bars.
		const tasks: BoardTask[] = snapshot.activities.map((a) => ({
			id: a.id,
			startedAt: a.startedAt,
			label:
				a.kind === "web_search"
					? a.query
					: a.kind === "subagent"
						? a.detail
							? `${a.label} · ${a.detail}`
							: a.label
						: a.detail
							? `${a.name} · ${a.detail}`
							: a.name,
		}));
		const lines = renderTaskBoard(tasks, {
			width: 120, // clamped again by pi at render; keep generous
			frame: statusFrame,
		});
		uiCtx.ui.setWidget(WIDGET_KEY, lines, { placement: "aboveEditor" });
	};

	const refresh = (ctx?: ExtensionContext) => {
		const uiCtx = ctx ?? lastUiCtx;
		if (!uiCtx?.hasUI || !enabled) return;
		lastUiCtx = uiCtx;
		const snapshot = buildHudSnapshot(activities.values());

		const status = formatStatusLine(snapshot);
		if (status) {
			paintStatus(uiCtx, status);
			startStatusPulse();
		} else {
			stopStatusPulse(uiCtx);
		}

		paintWidget(uiCtx, snapshot);

		// Working row is owned by tui-chrome (moon + progress bar). Ops-hud only
		// drives the title spinner + status/widget board while activities run.
		if (snapshot.activities.length > 0) {
			startTitleSpinner(uiCtx, snapshot.activities.length);
		} else {
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
		titleTimer.unref?.();
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
		stopStatusPulse(ctx);
		if (ctx.hasUI) {
			ctx.ui.setStatus(STATUS_KEY, undefined);
			ctx.ui.setWidget(WIDGET_KEY, undefined);
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
				stopStatusPulse(ctx);
				ctx.ui.setStatus(STATUS_KEY, undefined);
				ctx.ui.setWidget(WIDGET_KEY, undefined);
				ctx.ui.notify("Ops HUD off", "info");
				return;
			}
			refresh(ctx);
			ctx.ui.notify("Ops HUD on — tracks web search + sub-agents", "info");
		},
	});
}

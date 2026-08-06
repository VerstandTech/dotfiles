/**
 * TUI Chrome — component structure matched to the reference agent TUI.
 *
 * Layout (top → bottom):
 *   [scrollback]
 *   ◐ Working... ████████████          ← working row (above editor)
 *   ─────────────
 *   > █                                ← editor with prompt prefix
 *   ─────────────
 *   yolo swarm K3 thinking: high path  ← mode-chip footer (single line)
 *
 * Complements ops-hud (ops board/status) and herd (sibling agent widget).
 */
import {
	CustomEditor,
	type ExtensionAPI,
	type ExtensionContext,
	type KeybindingsManager,
} from "@earendil-works/pi-coding-agent";
import type { EditorTheme, TUI } from "@earendil-works/pi-tui";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { applyPromptPrefix, PROMPT_COLS } from "../lib/tui-chrome/editor-chrome.ts";
import { renderFooterChips } from "../lib/tui-chrome/footer-chips.ts";
import { renderWorkingRow } from "../lib/tui-chrome/working-row.ts";

/** Force every rendered line ≤ width (pi-tui crashes on overflow). */
function fitLines(lines: string[], width: number): string[] {
	if (width <= 0) return lines.map(() => "");
	return lines.map((line) =>
		visibleWidth(line) > width ? truncateToWidth(line, width, "") : line,
	);
}

const WORKING_WIDGET = "tui-chrome-working";
const FOOTER_ENABLED_DEFAULT = true;

function shortModel(id: string | undefined): string | undefined {
	if (!id) return undefined;
	// grok-4.5 → grok-4.5 · kimi-k3-thinking → k3 · already-short kept
	const base = id.includes("/") ? id.split("/").pop()! : id;
	const compact = base.replace(/-thinking.*$/i, "").replace(/^kimi-/i, "");
	return compact.length > 18 ? compact.slice(0, 17) + "…" : compact;
}

function formatPath(cwd: string, branch: string | null | undefined): string {
	const home = process.env.HOME;
	let path = cwd;
	if (home && path.startsWith(home)) path = `~${path.slice(home.length)}`;
	// Prefer trailing segment like the reference `.../production-`
	const parts = path.split("/").filter(Boolean);
	const tail =
		parts.length <= 2 ? path : `.../${parts.slice(-2).join("/")}`;
	return branch ? `${tail} (${branch})` : tail;
}

function detectMode(editorText: string, statuses: ReadonlyMap<string, string>): string | undefined {
	// bash mode: editor starts with !
	if (/^\s*!/.test(editorText)) return "bash";
	// plan-mode extension sets a status key
	for (const [key, val] of statuses) {
		if (key === "plan-mode" && val) return "plan";
		// strip ANSI for matching
		const plain = val.replace(/\x1b\[[0-9;]*m/g, "");
		if (/\bplan\b/i.test(plain) && key.includes("plan")) return "plan";
	}
	return undefined;
}

function detectAgent(statuses: ReadonlyMap<string, string>): string | undefined {
	// ops-hud / herd may publish identity chips — look for swarm/herd/fleet hints
	for (const [key, val] of statuses) {
		const plain = val.replace(/\x1b\[[0-9;]*m/g, "").toLowerCase();
		if (key.includes("herd") || plain.includes("herd")) return "herd";
		if (plain.includes("swarm")) return "swarm";
		if (plain.includes("fleet") || key.includes("fleet")) return "fleet";
	}
	return undefined;
}

export default function (pi: ExtensionAPI) {
	let working = false;
	let workStartedAt = 0;
	let frame = 0;
	let tick: ReturnType<typeof setInterval> | null = null;
	let lastUi: ExtensionContext | null = null;
	let activeTui: TUI | undefined;
	let thinking = "";
	let workingLabel: string | undefined;
	let workingMounted = false;
	let footerOn = FOOTER_ENABLED_DEFAULT;

	const stopTick = () => {
		if (tick) {
			clearInterval(tick);
			tick = null;
		}
	};

	/**
	 * Mount (or clear) the working-row widget.
	 * setWidget requires a factory `(tui, theme) => Component` — not a bare object.
	 * After mount, animation only needs requestRender (closure reads live frame/label).
	 */
	const paintWorking = (ctx: ExtensionContext, forceRemount = false) => {
		if (!ctx.hasUI) return;
		if (!working) {
			ctx.ui.setWidget(WORKING_WIDGET, undefined);
			workingMounted = false;
			return;
		}
		if (workingMounted && !forceRemount) {
			activeTui?.requestRender();
			return;
		}
		const started = workStartedAt || Date.now();
		ctx.ui.setWidget(
			WORKING_WIDGET,
			(_tui, _theme) => ({
				render(width: number) {
					const elapsedSec = Math.max(0, Math.floor((Date.now() - started) / 1000));
					return fitLines(
						[
							renderWorkingRow({
								width,
								frame,
								label: workingLabel,
								elapsedSec,
							}),
						],
						width,
					);
				},
				invalidate() {},
			}),
			{ placement: "aboveEditor" },
		);
		workingMounted = true;
	};

	const startWorking = (ctx: ExtensionContext, label?: string) => {
		working = true;
		workStartedAt = Date.now();
		workingLabel = label;
		frame = 0;
		workingMounted = false;
		// Hide built-in loader row — we own the working component.
		ctx.ui.setWorkingVisible(false);
		ctx.ui.setWorkingMessage();
		paintWorking(ctx, true);
		stopTick();
		tick = setInterval(() => {
			frame++;
			activeTui?.requestRender();
		}, 110);
		tick.unref?.();
	};

	const stopWorking = (ctx: ExtensionContext) => {
		working = false;
		workingLabel = undefined;
		workingMounted = false;
		stopTick();
		ctx.ui.setWidget(WORKING_WIDGET, undefined);
		ctx.ui.setWorkingVisible(true);
	};

	const installFooter = (ctx: ExtensionContext) => {
		if (!footerOn) {
			ctx.ui.setFooter(undefined);
			return;
		}
		ctx.ui.setFooter((tui, _theme, footerData) => {
			activeTui = tui;
			const unsub = footerData.onBranchChange(() => tui.requestRender());
			return {
				dispose: unsub,
				invalidate() {},
				render(width: number): string[] {
					const branch = footerData.getGitBranch();
					const statuses = footerData.getExtensionStatuses();
					const editorText = ctx.ui.getEditorText?.() ?? "";
					const line = renderFooterChips({
						width,
						mode: detectMode(editorText, statuses),
						agent: detectAgent(statuses),
						model: shortModel(ctx.model?.id),
						thinking: thinking || undefined,
						path: formatPath(ctx.cwd, branch),
					});
					return fitLines(line ? [line] : [""], width);
				},
			};
		});
	};

	const installEditor = (ctx: ExtensionContext) => {
		class ChromeEditor extends CustomEditor {
			constructor(tui: TUI, theme: EditorTheme, keybindings: KeybindingsManager) {
				// paddingX=2 reserves columns for the `> ` prompt injection.
				// NOTE: Pi immediately overwrites this via setPaddingX(defaultEditor
				// padding) after the factory returns — see setPaddingX override below.
				super(tui, theme, keybindings, { paddingX: PROMPT_COLS });
				activeTui = tui;
			}

			/**
			 * Pi copies settings `editorPaddingX` (default 0) onto custom editors
			 * after construction. Keep PROMPT_COLS so `> ` can replace reserved
			 * spaces instead of prepending past terminal width.
			 */
			setPaddingX(_padding: number): void {
				super.setPaddingX(PROMPT_COLS);
			}

			render(width: number): string[] {
				// Re-assert padding in case something else called the parent setter.
				if (this.getPaddingX() !== PROMPT_COLS) {
					super.setPaddingX(PROMPT_COLS);
				}
				const lines = applyPromptPrefix(super.render(width), { maxWidth: width });
				return fitLines(lines, width);
			}
		}
		ctx.ui.setEditorComponent((tui, theme, kb) => new ChromeEditor(tui, theme, kb));
	};

	pi.on("session_start", (_event, ctx) => {
		if (!ctx.hasUI) return;
		lastUi = ctx;
		thinking = "";
		try {
			// Best-effort: some builds expose getThinkingLevel on the API.
			const level = (pi as { getThinkingLevel?: () => string }).getThinkingLevel?.();
			if (level) thinking = level;
		} catch {
			/* ignore */
		}
		installEditor(ctx);
		installFooter(ctx);
		// Default gold-moon is unused while idle; built-in hidden only when working.
		ctx.ui.setWorkingVisible(true);
	});

	pi.on("session_shutdown", (_event, ctx) => {
		stopTick();
		if (ctx.hasUI) {
			ctx.ui.setWidget(WORKING_WIDGET, undefined);
			ctx.ui.setFooter(undefined);
			ctx.ui.setEditorComponent(undefined);
			ctx.ui.setWorkingVisible(true);
		}
		lastUi = null;
		activeTui = undefined;
	});

	pi.on("agent_start", (_event, ctx) => {
		lastUi = ctx;
		startWorking(ctx, "Working...");
	});

	pi.on("agent_end", (_event, ctx) => {
		stopWorking(ctx);
	});

	pi.on("thinking_level_select", (event, ctx) => {
		thinking = event.level ?? "";
		activeTui?.requestRender();
		if (ctx.hasUI && footerOn) {
			// footer reads `thinking` on next render
			activeTui?.requestRender();
		}
	});

	// Specialize the working-row label for long-running tool families.
	pi.on("tool_execution_start", (event, ctx) => {
		if (!working || !ctx.hasUI) return;
		const name = String((event as { toolName?: string }).toolName ?? "");
		if (/web_search/i.test(name)) workingLabel = "Searching the web...";
		else if (/subagent/i.test(name)) workingLabel = "Running sub-agents...";
		else return;
		// Label is closed over by the mounted factory — just re-render.
		activeTui?.requestRender();
	});

	pi.registerCommand("chrome", {
		description: "Toggle TUI chrome (chip footer + prompt editor). Usage: /chrome [on|off|footer]",
		handler: async (args, ctx) => {
			const arg = args.trim().toLowerCase();
			if (arg === "off") {
				footerOn = false;
				ctx.ui.setFooter(undefined);
				ctx.ui.setEditorComponent(undefined);
				stopWorking(ctx);
				ctx.ui.notify("TUI chrome off", "info");
				return;
			}
			if (arg === "footer") {
				footerOn = !footerOn;
				installFooter(ctx);
				ctx.ui.notify(footerOn ? "Chip footer on" : "Default footer restored", "info");
				return;
			}
			// on / default toggle
			footerOn = true;
			installEditor(ctx);
			installFooter(ctx);
			ctx.ui.notify("TUI chrome on — prompt editor + chip footer + working row", "info");
		},
	});
}

/**
 * xAI / Grok web search for Pi.
 *
 * Registers:
 * - tool `xai_web_search` — model-callable research (auto-preferred for web research asks)
 * - `/web-search <query>` — manual run
 * - `/web-search-status` — credential / backend availability
 *
 * Auto-routing:
 * - User phrases like "research on the web" get a required-tool reminder via `input` transform
 * - System guidelines + before_agent_start nudge keep the tool in the model’s default path
 * - Tool is kept in the active tool set on session start
 *
 * Auth order: XAI_API_KEY → GROK_API_KEY → ~/.pi/agent/auth.json xai credentials.
 * Optional fallback: `grok` CLI (disable with XAI_WEB_SEARCH_ALLOW_GROK_CLI=0).
 */
import { Type } from "@earendil-works/pi-ai";
import { defineTool, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { describeAvailability, runWebSearch } from "../lib/xai-web-search/client.ts";
import { formatSearchReport } from "../lib/xai-web-search/format.ts";
import {
	maybeTransformForWebResearch,
	WEB_SEARCH_PROMPT_GUIDELINES,
	WEB_SEARCH_PROMPT_SNIPPET,
} from "../lib/xai-web-search/intent.ts";

const TOOL_NAME = "xai_web_search";

function truncate(text: string, max: number): string {
	const cleaned = text.replace(/\s+/g, " ").trim();
	if (cleaned.length <= max) return cleaned;
	return `${cleaned.slice(0, Math.max(0, max - 1))}…`;
}

const xaiWebSearchTool = defineTool({
	name: TOOL_NAME,
	label: "xAI Web Search",
	description:
		"Search the live web via Grok/xAI server-side web_search when credentials are available. " +
		"Use for current facts, pricing, docs, news, and competitor research. " +
		"Triggers for asks like 'research on the web', 'search the web', 'look up online', " +
		"'google this', 'latest/current price', or competitor research. " +
		"Returns an answer plus source URLs when the backend provides them.",
	promptSnippet: WEB_SEARCH_PROMPT_SNIPPET,
	promptGuidelines: WEB_SEARCH_PROMPT_GUIDELINES,
	parameters: Type.Object({
		query: Type.String({
			description: "Search/research query in natural language",
		}),
		model: Type.Optional(
			Type.String({
				description:
					"Optional xAI model id override (default: XAI_WEB_SEARCH_MODEL / grok-4-1-fast-reasoning)",
			}),
		),
		allowed_domains: Type.Optional(
			Type.Array(Type.String(), {
				description: "Optional domain allowlist for web_search filters",
			}),
		),
		excluded_domains: Type.Optional(
			Type.Array(Type.String(), {
				description: "Optional domain blocklist for web_search filters",
			}),
		),
	}),

	renderCall(args, theme) {
		const query = typeof args?.query === "string" ? args.query : "";
		return new Text(
			`${theme.fg("accent", "🌐")} ${theme.bold("Web search")} ${theme.fg("dim", truncate(query || "…", 72))}`,
			0,
			0,
		);
	},

	renderResult(result, options, theme) {
		const details = (result as { details?: Record<string, unknown> }).details ?? {};
		const ok = details.ok !== false;
		const sources = Array.isArray(details.sources) ? details.sources.length : 0;
		const calls = typeof details.webSearchCalls === "number" ? details.webSearchCalls : 0;
		const backend = typeof details.backend === "string" ? details.backend : "";
		const glyph = ok ? theme.fg("success", "✓") : theme.fg("error", "✗");
		const meta = [backend, calls ? `${calls} calls` : "", sources ? `${sources} sources` : ""]
			.filter(Boolean)
			.join(" · ");
		const line = `${glyph} ${theme.fg("dim", meta || (ok ? "done" : "failed"))}`;
		if (options.expanded) {
			const text =
				Array.isArray(result.content) && result.content[0] && typeof (result.content[0] as { text?: string }).text === "string"
					? (result.content[0] as { text: string }).text
					: "";
			const preview = truncate(text.replace(/^## Web search result[\s\S]*?\n\n/, ""), 160);
			return new Text(`${line}\n  ${theme.fg("dim", preview)}`, 0, 0);
		}
		return new Text(line, 0, 0);
	},

	async execute(_toolCallId, params, signal) {
		const result = await runWebSearch(
			{
				query: params.query,
				model: params.model,
				allowedDomains: params.allowed_domains,
				excludedDomains: params.excluded_domains,
			},
			{},
			signal,
		);

		if (!result.ok) {
			return {
				content: [{ type: "text", text: `Web search failed: ${result.error}` }],
				details: {
					ok: false,
					error: result.error,
					backend: result.backend,
					authSource: result.authSource,
				},
			};
		}

		return {
			content: [{ type: "text", text: formatSearchReport(result) }],
			details: {
				ok: true,
				backend: result.backend,
				model: result.model,
				authSource: result.authSource,
				webSearchCalls: result.webSearchCalls,
				sources: result.sources,
			},
		};
	},
});

function ensureToolActive(pi: ExtensionAPI) {
	try {
		const active = pi.getActiveTools();
		if (!active.includes(TOOL_NAME)) {
			pi.setActiveTools([...active, TOOL_NAME]);
		}
	} catch {
		// Older pi builds may not expose setActiveTools during load; tool still registers.
	}
}

export default function (pi: ExtensionAPI) {
	pi.registerTool(xaiWebSearchTool);

	pi.on("session_start", () => {
		ensureToolActive(pi);
	});

	// Keep a short standing guideline in the system prompt every agent run.
	pi.on("before_agent_start", (event) => {
		ensureToolActive(pi);
		const marker = "xai_web_search is the live web research tool";
		if (event.systemPrompt?.includes(marker)) {
			return;
		}
		return {
			systemPrompt:
				`${event.systemPrompt}\n\n` +
				`## Live web research\n` +
				`- ${marker} in this session.\n` +
				`- When the user asks to research on the web, search online, look up current facts/prices, ` +
				`or do competitor research, call ${TOOL_NAME} before answering and cite sources from the tool result.\n` +
				`- Do not invent URLs. If the tool fails, say so plainly.\n`,
		};
	});

	// Hard steer for explicit research phrasing in the user turn.
	pi.on("input", (event) => {
		if (event.source === "extension") return { action: "continue" as const };
		const text = typeof event.text === "string" ? event.text : "";
		const transformed = maybeTransformForWebResearch(text);
		if (!transformed.matched) return { action: "continue" as const };
		return { action: "transform" as const, text: transformed.text };
	});

	pi.registerCommand("web-search", {
		description: "Run xAI/Grok web search (usage: /web-search <query>)",
		handler: async (args, ctx) => {
			const query = args.trim();
			if (!query) {
				ctx.ui.notify("Usage: /web-search <query>", "warning");
				return;
			}
			ctx.ui.notify("Searching via xAI/Grok…", "info");
			const result = await runWebSearch({ query });
			if (!result.ok) {
				ctx.ui.notify(result.error, "error");
				return;
			}

			const report = formatSearchReport(result);
			pi.sendMessage(
				{
					customType: "xai-web-search",
					content: report,
					display: true,
					details: {
						backend: result.backend,
						model: result.model,
						sources: result.sources,
						webSearchCalls: result.webSearchCalls,
					},
				},
				{ triggerTurn: false },
			);
			ctx.ui.notify(
				`Search done (${result.backend}, ${result.webSearchCalls} web calls, ${result.sources.length} sources)`,
				"info",
			);
		},
	});

	pi.registerCommand("web-search-status", {
		description: "Show xAI/Grok web search availability",
		handler: async (_args, ctx) => {
			ctx.ui.notify(describeAvailability(), "info");
		},
	});
}

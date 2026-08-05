/**
 * Detect user turns that should force live web research via xai_web_search.
 */

const RESEARCH_PATTERNS: RegExp[] = [
	/\bresearch\s+(?:on\s+the\s+|on\s+|the\s+)?web\b/i,
	/\bresearch\s+online\b/i,
	/\bsearch\s+the\s+web\b/i,
	/\bweb\s*search\b/i,
	/\blive\s+web\b/i,
	/\blook\s+up\s+(?:online|on\s+the\s+web|on\s+the\s+internet)\b/i,
	/\bgoogle\s+(?:this|that|for|it)\b/i,
	/\b(?:what(?:'s|\s+is)|whats)\s+the\s+latest\b/i,
	/\bcurrent\s+(?:price|pricing|cost|version|release|news|status)\b/i,
	/\bas\s+of\s+(?:today|now|this\s+year|20\d{2})\b/i,
	/\bup[- ]to[- ]date\b/i,
	/\bfrom\s+the\s+(?:web|internet)\b/i,
	/\bcheck\s+online\b/i,
	/\bcompetitor\s+research\b/i,
	/\bresearch\s+competitors?\b/i,
];

/** Explicit opt-out so users can still chat without forcing search. */
const OPT_OUT = /\b(no\s+web\s+search|without\s+web\s+search|don'?t\s+search\s+the\s+web)\b/i;

const REMINDER =
	"[Required] Call the xai_web_search tool before answering. " +
	"Use live web results and cite sources. Do not answer from memory alone for this request.";

export function detectWebResearchIntent(text: string): boolean {
	const trimmed = text.trim();
	if (!trimmed) return false;
	if (trimmed.startsWith("/")) return false;
	if (OPT_OUT.test(trimmed)) return false;
	return RESEARCH_PATTERNS.some((re) => re.test(trimmed));
}

/**
 * Append a model-facing reminder when the user asks for web research.
 * Idempotent if the reminder is already present.
 */
export function withWebResearchReminder(text: string): string {
	const trimmed = text.replace(/\s+$/u, "");
	if (trimmed.includes("Call the xai_web_search tool before answering")) {
		return text;
	}
	return `${trimmed}\n\n${REMINDER}`;
}

export function maybeTransformForWebResearch(text: string): {
	matched: boolean;
	text: string;
} {
	if (!detectWebResearchIntent(text)) {
		return { matched: false, text };
	}
	return { matched: true, text: withWebResearchReminder(text) };
}

export const WEB_SEARCH_PROMPT_GUIDELINES = [
	"Use xai_web_search when the user asks to research on the web, search the web, look something up online, google a fact, or wants current/latest pricing, news, docs, or competitor info.",
	"When the user message includes a required xai_web_search reminder, call xai_web_search first with a focused query, then answer from the tool result and cite sources.",
	"Prefer xai_web_search over guessing for time-sensitive facts even if you think you know the answer.",
	"If xai_web_search fails, say that live web search failed and what you tried; do not invent URLs.",
];

export const WEB_SEARCH_PROMPT_SNIPPET =
	"Live web research via Grok/xAI (current facts, pricing, competitors, docs)";

export type AuthSource =
	| "env:XAI_API_KEY"
	| "env:GROK_API_KEY"
	| "pi-auth:xai.access"
	| "pi-auth:xai.key"
	| "unavailable";

export type AuthResolution =
	| { ok: true; token: string; source: Exclude<AuthSource, "unavailable"> }
	| { ok: false; source: "unavailable"; reason: string };

export type WebSearchParams = {
	query: string;
	model?: string;
	/** Optional allowlist of domains for the server-side web_search tool. */
	allowedDomains?: string[];
	/** Optional blocklist of domains. */
	excludedDomains?: string[];
};

export type WebSearchSource = {
	url: string;
	title?: string;
};

export type WebSearchSuccess = {
	ok: true;
	backend: "xai-responses" | "grok-cli";
	model?: string;
	text: string;
	sources: WebSearchSource[];
	webSearchCalls: number;
	authSource?: string;
};

export type WebSearchFailure = {
	ok: false;
	error: string;
	backend?: "xai-responses" | "grok-cli";
	authSource?: string;
};

export type WebSearchResult = WebSearchSuccess | WebSearchFailure;

export type XaiResponsesPayload = {
	model?: string;
	output?: unknown;
	usage?: {
		num_sources_used?: number;
		num_server_side_tools_used?: number;
		server_side_tool_usage_details?: {
			web_search_calls?: number;
		};
	};
	status?: string;
	error?: { message?: string } | string;
};

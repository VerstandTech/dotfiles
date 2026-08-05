import { execFileSync, spawn } from "node:child_process";
import {
	isGrokCliEnabled,
	resolveSearchModel,
	resolveXaiAuth,
	resolveXaiBaseUrl,
} from "./auth.ts";
import {
	extractOutputText,
	extractSources,
	extractWebSearchCallCount,
} from "./format.ts";
import type {
	WebSearchParams,
	WebSearchResult,
	XaiResponsesPayload,
} from "./types.ts";

export type SearchDeps = {
	env?: NodeJS.ProcessEnv;
	fetchImpl?: typeof fetch;
	runGrokCli?: (args: {
		query: string;
		signal?: AbortSignal;
	}) => Promise<{ ok: true; text: string } | { ok: false; error: string }>;
	whichGrok?: () => string | null;
};

function buildToolConfig(params: WebSearchParams): Record<string, unknown> {
	const tool: Record<string, unknown> = { type: "web_search" };
	const filters: Record<string, unknown> = {};
	if (params.allowedDomains?.length) filters.allowed_domains = params.allowedDomains;
	if (params.excludedDomains?.length) filters.excluded_domains = params.excludedDomains;
	if (Object.keys(filters).length > 0) tool.filters = filters;
	return tool;
}

async function callXaiResponsesApi(
	params: WebSearchParams,
	deps: SearchDeps,
	signal?: AbortSignal,
): Promise<WebSearchResult> {
	const env = deps.env ?? process.env;
	const auth = resolveXaiAuth(env);
	if (!auth.ok) {
		return { ok: false, error: auth.reason, authSource: auth.source };
	}

	const model = resolveSearchModel(env, params.model);
	const base = resolveXaiBaseUrl(env);
	const url = `${base}/responses`;
	const fetchImpl = deps.fetchImpl ?? fetch;

	const body = {
		model,
		input: [
			{
				role: "user",
				content:
					`You are a careful web research assistant. Use web search.\n` +
					`Query: ${params.query}\n` +
					`Return a concise, factual answer with inline citations where possible.`,
			},
		],
		tools: [buildToolConfig(params)],
	};

	let response: Response;
	try {
		response = await fetchImpl(url, {
			method: "POST",
			headers: {
				"content-type": "application/json",
				authorization: `Bearer ${auth.token}`,
			},
			body: JSON.stringify(body),
			signal,
		});
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return {
			ok: false,
			error: `xAI request failed: ${message}`,
			backend: "xai-responses",
			authSource: auth.source,
		};
	}

	const rawText = await response.text();
	let payload: XaiResponsesPayload;
	try {
		payload = JSON.parse(rawText) as XaiResponsesPayload;
	} catch {
		return {
			ok: false,
			error: `xAI returned non-JSON (${response.status}): ${rawText.slice(0, 240)}`,
			backend: "xai-responses",
			authSource: auth.source,
		};
	}

	if (!response.ok) {
		const errMsg =
			typeof payload.error === "string"
				? payload.error
				: payload.error?.message || rawText.slice(0, 240);
		return {
			ok: false,
			error: `xAI HTTP ${response.status}: ${errMsg}`,
			backend: "xai-responses",
			authSource: auth.source,
		};
	}

	const text = extractOutputText(payload);
	if (!text) {
		return {
			ok: false,
			error: "xAI response completed but contained no message text.",
			backend: "xai-responses",
			authSource: auth.source,
		};
	}

	return {
		ok: true,
		backend: "xai-responses",
		model,
		text,
		sources: extractSources(payload),
		webSearchCalls: extractWebSearchCallCount(payload),
		authSource: auth.source,
	};
}

async function defaultGrokCli(
	query: string,
	signal?: AbortSignal,
): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
	return await new Promise((resolve) => {
		const child = spawn(
			"grok",
			[
				"--print",
				"--output-format",
				"plain",
				// Keep the CLI research-focused; web search is on unless disabled.
				`Web research (use web search). Query: ${query}\n` +
					`Answer concisely with source URLs.`,
			],
			{
				stdio: ["ignore", "pipe", "pipe"],
				env: process.env,
			},
		);

		let stdout = "";
		let stderr = "";
		const onAbort = () => {
			child.kill("SIGTERM");
		};
		if (signal) {
			if (signal.aborted) onAbort();
			else signal.addEventListener("abort", onAbort, { once: true });
		}

		child.stdout.on("data", (chunk) => {
			stdout += String(chunk);
		});
		child.stderr.on("data", (chunk) => {
			stderr += String(chunk);
		});
		child.on("error", (err) => {
			resolve({ ok: false, error: `Failed to spawn grok CLI: ${err.message}` });
		});
		child.on("close", (code) => {
			if (signal) signal.removeEventListener("abort", onAbort);
			const text = stdout.trim();
			if (code === 0 && text) {
				resolve({ ok: true, text });
				return;
			}
			const err = stderr.trim() || text || `grok CLI exited with code ${code ?? "?"}`;
			resolve({ ok: false, error: err.slice(0, 500) });
		});
	});
}

function defaultWhichGrok(): string | null {
	// Lightweight presence check — spawn will still fail clearly if missing from PATH.
	try {
		const out = execFileSync("bash", ["-lc", "command -v grok"], {
			encoding: "utf8",
		}).trim();
		return out || null;
	} catch {
		return null;
	}
}

export async function runWebSearch(
	params: WebSearchParams,
	deps: SearchDeps = {},
	signal?: AbortSignal,
): Promise<WebSearchResult> {
	const query = params.query?.trim();
	if (!query) {
		return { ok: false, error: "query must be a non-empty string" };
	}

	const env = deps.env ?? process.env;
	const apiResult = await callXaiResponsesApi({ ...params, query }, deps, signal);
	if (apiResult.ok) return apiResult;

	// Fall back to Grok CLI only when API auth/transport failed and CLI is allowed.
	if (!isGrokCliEnabled(env)) {
		return apiResult;
	}

	const which = deps.whichGrok ?? defaultWhichGrok;
	if (!which()) {
		return {
			ok: false,
			error: `${apiResult.error} Grok CLI not found on PATH for fallback.`,
			backend: apiResult.backend,
			authSource: apiResult.authSource,
		};
	}

	const runCli = deps.runGrokCli ?? ((args) => defaultGrokCli(args.query, args.signal));
	const cli = await runCli({ query, signal });
	if (!cli.ok) {
		return {
			ok: false,
			error: `${apiResult.error} Grok CLI fallback failed: ${cli.error}`,
			backend: "grok-cli",
			authSource: apiResult.authSource,
		};
	}

	return {
		ok: true,
		backend: "grok-cli",
		text: cli.text,
		sources: [],
		webSearchCalls: 0,
		authSource: apiResult.authSource ?? "grok-cli",
	};
}

export function describeAvailability(env: NodeJS.ProcessEnv = process.env): string {
	const auth = resolveXaiAuth(env);
	const model = resolveSearchModel(env);
	const base = resolveXaiBaseUrl(env);
	const cli = isGrokCliEnabled(env) ? "allowed" : "disabled";
	if (auth.ok) {
		return [
			"xAI web search: available",
			`- auth: ${auth.source}`,
			`- base: ${base}`,
			`- model: ${model}`,
			`- grok CLI fallback: ${cli}`,
		].join("\n");
	}
	return [
		"xAI web search: limited",
		`- auth: unavailable (${auth.reason})`,
		`- grok CLI fallback: ${cli}`,
	].join("\n");
}

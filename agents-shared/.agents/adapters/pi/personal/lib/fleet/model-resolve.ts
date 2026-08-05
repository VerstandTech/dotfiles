/**
 * Prefer first-party providers (anthropic, openai-codex, xai, …) over OpenRouter.
 * OpenRouter is only used when the native provider is unavailable or the model
 * is not known under a native provider.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const THINKING_SUFFIX = /:(off|minimal|low|medium|high|xhigh|max)$/i;

export interface ResolvedModel {
	/** provider/id or provider/id:thinking */
	model: string;
	/** Native candidate if different from final */
	native?: string;
	/** OpenRouter fallback candidate if different from final */
	openrouter?: string;
	/** Which path was chosen */
	source: "native" | "openrouter" | "passthrough" | "native-assumed";
}

export interface ModelResolveContext {
	/** provider names that have credentials (e.g. anthropic, xai, openai-codex, openrouter) */
	authenticatedProviders: Set<string>;
	/** full provider/id strings known in the registry (no thinking suffix) */
	knownModels: Set<string>;
}

/** Split optional thinking suffix. */
export function splitThinking(spec: string): { base: string; thinking?: string } {
	const m = spec.trim().match(/^(.*?):(off|minimal|low|medium|high|xhigh|max)$/i);
	if (!m) return { base: spec.trim() };
	return { base: m[1]!.trim(), thinking: m[2]!.toLowerCase() };
}

function withThinking(base: string, thinking?: string): string {
	return thinking ? `${base}:${thinking}` : base;
}

/**
 * Map an OpenRouter (or bare) id to native provider/id candidates, best first.
 */
export function nativeCandidates(baseId: string): string[] {
	const id = baseId.replace(/^openrouter\//i, "");

	// openrouter/anthropic/claude-fable-5 → anthropic/claude-fable-5
	if (id.startsWith("anthropic/")) {
		return [id];
	}
	// openrouter/x-ai/grok-4.5 or x-ai/grok-4.5 → xai/grok-4.5
	if (id.startsWith("x-ai/")) {
		const rest = id.slice("x-ai/".length);
		return [`xai/${rest}`];
	}
	if (id.startsWith("xai/")) {
		return [id];
	}
	// openrouter/openai/gpt-5.6-sol → openai-codex/gpt-5.6-sol, openai/gpt-5.6-sol
	if (id.startsWith("openai/")) {
		const rest = id.slice("openai/".length);
		return [`openai-codex/${rest}`, `openai/${rest}`];
	}
	if (id.startsWith("openai-codex/")) {
		return [id];
	}
	// google, etc.
	if (id.startsWith("google/") || id.startsWith("gemini/")) {
		return [id.replace(/^gemini\//, "google/")];
	}

	// Bare ids — guess family
	if (/^claude/i.test(id) || /^~anthropic\//i.test(id)) {
		const bare = id.replace(/^~?anthropic\//i, "");
		return [`anthropic/${bare}`];
	}
	if (/^grok/i.test(id)) {
		return [`xai/${id}`];
	}
	if (/^gpt-/i.test(id) || /^o[1-9]/i.test(id)) {
		return [`openai-codex/${id}`, `openai/${id}`];
	}

	// Already provider/id for some other host
	if (id.includes("/")) {
		return [id];
	}
	return [];
}

/**
 * Map a model id to an OpenRouter form when possible.
 */
export function openrouterCandidate(baseId: string): string | undefined {
	const stripped = baseId.replace(/^openrouter\//i, "");
	if (baseId.startsWith("openrouter/")) {
		return baseId.includes("/") ? `openrouter/${stripped}` : undefined;
	}
	if (stripped.startsWith("anthropic/")) {
		return `openrouter/${stripped}`;
	}
	if (stripped.startsWith("xai/")) {
		return `openrouter/x-ai/${stripped.slice("xai/".length)}`;
	}
	if (stripped.startsWith("openai-codex/")) {
		return `openrouter/openai/${stripped.slice("openai-codex/".length)}`;
	}
	if (stripped.startsWith("openai/")) {
		return `openrouter/${stripped}`;
	}
	if (stripped.startsWith("google/")) {
		return `openrouter/${stripped}`;
	}
	if (/^claude/i.test(stripped)) {
		return `openrouter/anthropic/${stripped}`;
	}
	if (/^grok/i.test(stripped)) {
		return `openrouter/x-ai/${stripped}`;
	}
	if (/^gpt-/i.test(stripped)) {
		return `openrouter/openai/${stripped}`;
	}
	return undefined;
}

function providerOf(fullId: string): string {
	const base = splitThinking(fullId).base;
	const noOr = base.replace(/^openrouter\//i, "");
	if (base.toLowerCase().startsWith("openrouter/")) return "openrouter";
	const slash = noOr.indexOf("/");
	return slash === -1 ? noOr : noOr.slice(0, slash);
}

function isUsable(
	fullBase: string,
	ctx: ModelResolveContext,
): boolean {
	const provider = providerOf(fullBase);
	if (!ctx.authenticatedProviders.has(provider)) return false;
	// If registry is empty, trust auth alone (custom model ids still work)
	if (ctx.knownModels.size === 0) return true;
	if (ctx.knownModels.has(fullBase)) return true;
	// openai-codex registry often stores bare ids; accept provider/bare
	const bare = fullBase.includes("/") ? fullBase.slice(fullBase.indexOf("/") + 1) : fullBase;
	if (provider === "openai-codex" && ctx.knownModels.has(`openai-codex/${bare}`)) return true;
	// Allow native if provider authenticated even when catalog lags (custom ids)
	if (provider !== "openrouter" && ctx.authenticatedProviders.has(provider)) {
		return true;
	}
	return false;
}

/**
 * Prefer native provider; fall back to OpenRouter only when needed.
 */
export function resolvePreferredModel(
	spec: string,
	ctx: ModelResolveContext,
): ResolvedModel {
	const { base, thinking } = splitThinking(spec);
	if (!base) {
		return { model: spec, source: "passthrough" };
	}

	const natives = nativeCandidates(base);
	const or = openrouterCandidate(base.startsWith("openrouter/") ? base : natives[0] ?? base);

	for (const n of natives) {
		if (isUsable(n, ctx)) {
			return {
				model: withThinking(n, thinking),
				native: n,
				openrouter: or,
				source: "native",
			};
		}
	}

	// Fallback: OpenRouter only when native providers are not usable
	if (or && ctx.authenticatedProviders.has("openrouter")) {
		const orBase = or.startsWith("openrouter/") ? or : `openrouter/${or}`;
		return {
			model: withThinking(orBase, thinking),
			native: natives[0],
			openrouter: orBase,
			source: "openrouter",
		};
	}

	// Native assumed when user already passed a non-openrouter id
	if (natives[0] && !base.toLowerCase().startsWith("openrouter/")) {
		const chosen = natives[0];
		return {
			model: withThinking(chosen, thinking),
			native: chosen,
			openrouter: or,
			source: ctx.authenticatedProviders.has(providerOf(chosen)) ? "native" : "native-assumed",
		};
	}

	// Last resort: strip openrouter rewrite to native even without auth proof
	if (natives[0]) {
		return {
			model: withThinking(natives[0], thinking),
			native: natives[0],
			openrouter: or,
			source: "native-assumed",
		};
	}

	return { model: withThinking(base, thinking), source: "passthrough" };
}

export function preferNativeModels(
	specs: string[],
	ctx: ModelResolveContext,
): string[] {
	return specs.map((s) => resolvePreferredModel(s, ctx).model);
}

/** Load auth + model registry from the local Pi agent dir. */
export function loadModelResolveContext(
	agentDir = join(homedir(), ".pi", "agent"),
	io: {
		exists?: (p: string) => boolean;
		read?: (p: string) => string;
	} = {},
): ModelResolveContext {
	const exists = io.exists ?? existsSync;
	const read = io.read ?? ((p: string) => readFileSync(p, "utf8"));
	const authenticatedProviders = new Set<string>();
	const knownModels = new Set<string>();

	const authPath = join(agentDir, "auth.json");
	if (exists(authPath)) {
		try {
			const auth = JSON.parse(read(authPath)) as Record<string, unknown>;
			const now = Date.now();
			for (const [provider, val] of Object.entries(auth)) {
				if (!val || typeof val !== "object") continue;
				const v = val as Record<string, unknown>;
				// Static API keys never expire in-file
				if (v.key || v.apiKey) {
					authenticatedProviders.add(provider);
					continue;
				}
				// OAuth: require access/refresh; skip clearly expired access without refresh
				const hasToken = Boolean(v.access || v.accessToken || v.refresh);
				if (!hasToken && v.type !== "oauth" && v.type !== "api_key") continue;
				if (!hasToken && !v.type) continue;
				const exp = typeof v.expires === "number" ? v.expires : undefined;
				if (exp !== undefined && exp < now && !v.refresh) {
					// expired and not refreshable — treat as logged out
					continue;
				}
				// Has refresh token: still count as authenticated (pi can refresh)
				if (hasToken || v.type) authenticatedProviders.add(provider);
			}
		} catch {
			// ignore
		}
	}

	const storePath = join(agentDir, "models-store.json");
	if (exists(storePath)) {
		try {
			const store = JSON.parse(read(storePath)) as Record<string, { models?: Array<{ id?: string }> }>;
			for (const [provider, entry] of Object.entries(store)) {
				const models = entry?.models;
				if (!Array.isArray(models)) continue;
				for (const m of models) {
					if (typeof m?.id !== "string" || !m.id) continue;
					// openai-codex stores bare ids
					const full = m.id.includes("/") ? m.id : `${provider}/${m.id}`;
					knownModels.add(full);
					if (provider === "openrouter" && !m.id.startsWith("openrouter/")) {
						knownModels.add(`openrouter/${m.id}`);
					}
				}
			}
		} catch {
			// ignore
		}
	}

	return { authenticatedProviders, knownModels };
}

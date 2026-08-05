import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { AuthResolution } from "./types.ts";

function readJsonObject(path: string): Record<string, unknown> | null {
	try {
		if (!existsSync(path)) return null;
		const raw = readFileSync(path, "utf8");
		const data = JSON.parse(raw) as unknown;
		if (!data || typeof data !== "object" || Array.isArray(data)) return null;
		return data as Record<string, unknown>;
	} catch {
		return null;
	}
}

/**
 * Resolve a bearer token for api.x.ai without logging secret values.
 * Preference: explicit API keys, then Pi's stored xAI credentials.
 */
export function resolveXaiAuth(env: NodeJS.ProcessEnv = process.env): AuthResolution {
	const xaiKey = env.XAI_API_KEY?.trim();
	if (xaiKey) return { ok: true, token: xaiKey, source: "env:XAI_API_KEY" };

	const grokKey = env.GROK_API_KEY?.trim();
	if (grokKey) return { ok: true, token: grokKey, source: "env:GROK_API_KEY" };

	const authPath = env.PI_AUTH_PATH?.trim() || join(homedir(), ".pi", "agent", "auth.json");
	const auth = readJsonObject(authPath);
	const xai = auth?.xai;
	if (xai && typeof xai === "object" && !Array.isArray(xai)) {
		const rec = xai as Record<string, unknown>;
		const access = typeof rec.access === "string" ? rec.access.trim() : "";
		if (access) return { ok: true, token: access, source: "pi-auth:xai.access" };
		const key = typeof rec.key === "string" ? rec.key.trim() : "";
		if (key) return { ok: true, token: key, source: "pi-auth:xai.key" };
	}

	return {
		ok: false,
		source: "unavailable",
		reason:
			"No xAI/Grok API credentials found. Set XAI_API_KEY or GROK_API_KEY, or log into xAI in Pi (`pi` auth).",
	};
}

export function resolveXaiBaseUrl(env: NodeJS.ProcessEnv = process.env): string {
	const raw = (env.XAI_API_BASE_URL || env.GROK_API_BASE_URL || "https://api.x.ai/v1").trim();
	const cleaned = raw.replace(/\/+$/, "");
	if (cleaned.endsWith("/v1")) return cleaned;
	if (cleaned.endsWith("/responses")) return cleaned.replace(/\/responses$/, "");
	return `${cleaned}/v1`;
}

export function resolveSearchModel(env: NodeJS.ProcessEnv = process.env, override?: string): string {
	return (
		override?.trim() ||
		env.XAI_WEB_SEARCH_MODEL?.trim() ||
		env.GROK_MODEL?.trim() ||
		env.XAI_MODEL?.trim() ||
		"grok-4-1-fast-reasoning"
	);
}

export function isGrokCliEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
	const flag = env.XAI_WEB_SEARCH_ALLOW_GROK_CLI?.trim().toLowerCase();
	if (flag === "0" || flag === "false" || flag === "no") return false;
	return true;
}

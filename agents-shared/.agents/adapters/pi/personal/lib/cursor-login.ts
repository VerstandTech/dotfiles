import { createRequire } from "node:module";
import { homedir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const CURSOR_LOGIN_HOST = "cursor.com";

export interface InstalledCursorSdk {
	Cursor: {
		auth: {
			login(options: {
				store: null;
				signal: AbortSignal;
				apiKeyName: string;
				openBrowser: (url: string) => Promise<void>;
				onLoginUrl: (url: string) => void;
			}): Promise<{ apiKey: string }>;
		};
	};
}

export async function loadInstalledCursorSdk(
	agentDir = process.env.PI_CODING_AGENT_DIR ?? join(homedir(), ".pi", "agent"),
): Promise<InstalledCursorSdk> {
	const require = createRequire(join(agentDir, "npm", "package.json"));
	const entry = require.resolve("@cursor/sdk");
	return import(pathToFileURL(entry).href) as Promise<InstalledCursorSdk>;
}

export function assertSafeCursorLoginUrl(raw: string): string {
	let url: URL;
	try {
		url = new URL(raw);
	} catch {
		throw new Error("Refusing unsafe Cursor browser login URL");
	}
	const host = url.hostname.toLowerCase();
	const cursorHost = host === CURSOR_LOGIN_HOST || host.endsWith(`.${CURSOR_LOGIN_HOST}`);
	if (url.protocol !== "https:" || !cursorHost || url.port || url.username || url.password) {
		throw new Error("Refusing unsafe Cursor browser login URL");
	}
	return raw;
}

export function removeTrailingHiddenCustomMessages<T>(messages: readonly T[]): T[] {
	let latestUser = -1;
	for (let index = messages.length - 1; index >= 0; index -= 1) {
		if ((messages[index] as { role?: string }).role === "user") {
			latestUser = index;
			break;
		}
	}
	if (latestUser < 0) return [...messages];
	return messages.filter((message, index) => {
		if (index <= latestUser) return true;
		const candidate = message as { role?: string; display?: boolean };
		return candidate.role !== "custom" || candidate.display !== false;
	});
}

export function scrubCursorLoginError(error: unknown, secret?: string): string {
	const text = error instanceof Error ? error.message : String(error);
	const scrubbed = secret ? text.split(secret).join("[redacted]") : text;
	return scrubbed
		.replace(/\bBearer\s+[^\s,;]+/gi, "Bearer [redacted]")
		.replace(/\bcrsr_[A-Za-z0-9_-]+\b/g, "[redacted]");
}

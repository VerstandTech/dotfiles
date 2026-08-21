import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
	assertSafeCursorLoginUrl,
	loadInstalledCursorSdk,
	removeTrailingHiddenCustomMessages,
	scrubCursorLoginError,
} from "../lib/cursor-login.ts";

const LOGIN_TIMEOUT_MS = 10 * 60 * 1000;

async function openBrowser(pi: ExtensionAPI, rawUrl: string): Promise<void> {
	const url = assertSafeCursorLoginUrl(rawUrl);
	const [command, args] =
		process.platform === "darwin"
			? ["open", [url]]
			: process.platform === "win32"
				? ["rundll32.exe", ["url.dll,FileProtocolHandler", url]]
				: ["xdg-open", [url]];
	const result = await pi.exec(command, args, { timeout: 5000 });
	if (result.code !== 0) throw new Error("Could not open the Cursor login URL");
}

export default function (pi: ExtensionAPI) {
	pi.registerCommand("cursor-login", {
		description: "Sign in to Cursor in the browser and save the minted API key in Pi auth storage",
		handler: async (_args, ctx) => {
			if (!ctx.hasUI) return;
			const provider = ctx.modelRegistry.getProvider("cursor");
			if (!provider) {
				ctx.ui.notify("Install pi-cursor-sdk before using /cursor-login.", "error");
				return;
			}
			const signal = AbortSignal.timeout(LOGIN_TIMEOUT_MS);
			let mintedKey: string | undefined;
			try {
				const { Cursor } = await loadInstalledCursorSdk();
				const result = await Cursor.auth.login({
					store: null,
					signal,
					apiKeyName: "Pi Coding Agent (dotfiles)",
					openBrowser: (url) => openBrowser(pi, url),
					onLoginUrl: (url) => {
						assertSafeCursorLoginUrl(url);
						ctx.ui.notify("Complete Cursor sign-in in the browser…", "info");
					},
				});
				const key = result.apiKey.trim();
				if (!key) throw new Error("Cursor returned an empty API key");
				mintedKey = key;
				const { ModelRuntime } = await import("@earendil-works/pi-coding-agent");
				const runtime = await ModelRuntime.create({ allowModelNetwork: false });
				runtime.registerNativeProvider(provider);
				await runtime.setRuntimeApiKey("cursor", key);
				ctx.ui.notify("Cursor login saved. Reloading Pi…", "info");
				await ctx.reload();
				return;
			} catch (error) {
				const message = signal.aborted ? "Cursor login timed out." : `Cursor login failed: ${scrubCursorLoginError(error, mintedKey)}`;
				ctx.ui.notify(message, "error");
			}
		},
	});

	// pi-cursor-sdk 0.3.6 selects the last model-facing user message after conversion;
	// hidden custom messages can otherwise replace the real follow-up (#229).
	pi.on("context", (event, ctx) => {
		if (ctx.model?.provider !== "cursor") return;
		const messages = removeTrailingHiddenCustomMessages(event.messages);
		return messages.length === event.messages.length ? undefined : { messages };
	});
}

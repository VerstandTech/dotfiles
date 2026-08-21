import { describe, expect, test } from "bun:test";
import cursorLoginExtension from "./cursor-login.ts";

function harness() {
	const commands = new Map<string, any>();
	const handlers = new Map<string, any>();
	const pi: any = {
		registerCommand: (name: string, command: any) => commands.set(name, command),
		on: (event: string, handler: any) => handlers.set(event, handler),
		exec: async () => ({ code: 0, stdout: "", stderr: "" }),
	};
	cursorLoginExtension(pi);
	return { commands, handlers };
}

describe("cursor-login extension", () => {
	test("registers /cursor-login and reports a missing provider without touching auth", async () => {
		const { commands } = harness();
		const notifyCalls: unknown[][] = [];
		await commands.get("cursor-login").handler("", {
			hasUI: true,
			modelRegistry: { getProvider: () => undefined },
			ui: { notify: (...args: unknown[]) => notifyCalls.push(args) },
		});
		expect(notifyCalls).toEqual([["Install pi-cursor-sdk before using /cursor-login.", "error"]]);
	});

	test("filters trailing hidden custom messages only for Cursor models", () => {
		const { handlers } = harness();
		const context = handlers.get("context");
		const messages = [
			{ role: "user", content: "real follow-up" },
			{ role: "custom", display: false, content: "hidden" },
		];
		expect(context({ messages }, { model: { provider: "cursor" } })).toEqual({
			messages: [messages[0]],
		});
		expect(context({ messages }, { model: { provider: "openai" } })).toBeUndefined();
	});
});

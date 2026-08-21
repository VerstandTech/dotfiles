import { describe, expect, test } from "bun:test";
import {
	assertSafeCursorLoginUrl,
	loadInstalledCursorSdk,
	removeTrailingHiddenCustomMessages,
	scrubCursorLoginError,
} from "./cursor-login.ts";

describe("cursor-login", () => {
	test("loads the Cursor SDK shipped by the pinned Pi package", async () => {
		const sdk = await loadInstalledCursorSdk();
		expect(typeof sdk.Cursor.auth.login).toBe("function");
	});

	test("accepts only Cursor HTTPS login origins", () => {
		expect(assertSafeCursorLoginUrl("https://cursor.com/login")).toBe("https://cursor.com/login");
		expect(assertSafeCursorLoginUrl("https://auth.cursor.com/login")).toBe("https://auth.cursor.com/login");
		expect(assertSafeCursorLoginUrl("https://cursor.com:443/login")).toBe("https://cursor.com:443/login");
		for (const url of [
			"http://cursor.com/login",
			"https://evil.example/login",
			"https://cursor.com:8443/login",
			"https://user:password@cursor.com/login",
			"not a url",
		]) {
			expect(() => assertSafeCursorLoginUrl(url)).toThrow("Refusing unsafe Cursor browser login URL");
		}
	});

	test("removes only hidden custom messages trailing the latest real user request", () => {
		const messages = [
			{ role: "custom", display: false, content: "earlier context" },
			{ role: "user", content: "real follow-up" },
			{ role: "custom", display: false, content: "hidden permission" },
			{ role: "custom", display: true, content: "visible context" },
		];
		expect(removeTrailingHiddenCustomMessages(messages)).toEqual([
			messages[0],
			messages[1],
			messages[3],
		]);
		expect(removeTrailingHiddenCustomMessages([{ role: "custom", display: false }])).toHaveLength(1);
	});

	test("scrubs Cursor API keys and bearer values from failures", () => {
		const message = scrubCursorLoginError(new Error("Authorization Bearer crsr_secret_value"));
		expect(message).toContain("[redacted]");
		expect(message).not.toContain("crsr_secret_value");
		const opaque = scrubCursorLoginError(new Error("save failed for opaque-secret"), "opaque-secret");
		expect(opaque).toBe("save failed for [redacted]");
	});
});

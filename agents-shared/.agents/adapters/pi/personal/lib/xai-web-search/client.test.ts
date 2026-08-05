import { describe, expect, test } from "bun:test";
import { runWebSearch } from "./client.ts";

describe("runWebSearch", () => {
	test("rejects empty query", async () => {
		const result = await runWebSearch({ query: "  " }, { env: {} });
		expect(result.ok).toBe(false);
	});

	test("uses xAI responses API when fetch succeeds", async () => {
		const fetchImpl: typeof fetch = async () =>
			new Response(
				JSON.stringify({
					status: "completed",
					usage: { server_side_tool_usage_details: { web_search_calls: 1 } },
					output: [
						{
							type: "message",
							content: [
								{
									type: "output_text",
									text: "Paris is the capital.",
									annotations: [
										{ type: "url_citation", url: "https://example.com/paris", title: "Paris" },
									],
								},
							],
						},
					],
				}),
				{ status: 200, headers: { "content-type": "application/json" } },
			);

		const result = await runWebSearch(
			{ query: "capital of France" },
			{
				env: { XAI_API_KEY: "test-key", XAI_WEB_SEARCH_ALLOW_GROK_CLI: "0" },
				fetchImpl,
				whichGrok: () => null,
			},
		);

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.backend).toBe("xai-responses");
			expect(result.text).toContain("Paris");
			expect(result.sources[0]?.url).toBe("https://example.com/paris");
			expect(result.webSearchCalls).toBe(1);
			expect(result.authSource).toBe("env:XAI_API_KEY");
		}
	});

	test("falls back to grok CLI when API auth missing", async () => {
		const result = await runWebSearch(
			{ query: "latest rust release" },
			{
				env: { PI_AUTH_PATH: "/tmp/missing-auth.json", XAI_WEB_SEARCH_ALLOW_GROK_CLI: "1" },
				whichGrok: () => "/usr/bin/grok",
				runGrokCli: async () => ({ ok: true, text: "Rust 1.x from CLI" }),
			},
		);
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.backend).toBe("grok-cli");
			expect(result.text).toContain("CLI");
		}
	});
});

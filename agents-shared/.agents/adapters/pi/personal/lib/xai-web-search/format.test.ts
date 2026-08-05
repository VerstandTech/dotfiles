import { describe, expect, test } from "bun:test";
import {
	extractOutputText,
	extractSources,
	extractWebSearchCallCount,
	formatSearchReport,
} from "./format.ts";
import { resolveSearchModel, resolveXaiAuth, resolveXaiBaseUrl } from "./auth.ts";
import type { XaiResponsesPayload } from "./types.ts";

describe("resolveXaiAuth", () => {
	test("prefers XAI_API_KEY", () => {
		const auth = resolveXaiAuth({ XAI_API_KEY: "xai-test", GROK_API_KEY: "grok-test" });
		expect(auth.ok).toBe(true);
		if (auth.ok) {
			expect(auth.source).toBe("env:XAI_API_KEY");
			expect(auth.token).toBe("xai-test");
		}
	});

	test("falls back to GROK_API_KEY", () => {
		const auth = resolveXaiAuth({ GROK_API_KEY: "grok-test" });
		expect(auth.ok).toBe(true);
		if (auth.ok) expect(auth.source).toBe("env:GROK_API_KEY");
	});

	test("unavailable without credentials and missing auth file", () => {
		const auth = resolveXaiAuth({ PI_AUTH_PATH: "/tmp/definitely-missing-pi-auth.json" });
		expect(auth.ok).toBe(false);
	});
});

describe("resolveXaiBaseUrl", () => {
	test("defaults to api.x.ai/v1", () => {
		expect(resolveXaiBaseUrl({})).toBe("https://api.x.ai/v1");
	});

	test("appends /v1 when missing", () => {
		expect(resolveXaiBaseUrl({ XAI_API_BASE_URL: "https://api.x.ai" })).toBe("https://api.x.ai/v1");
	});
});

describe("resolveSearchModel", () => {
	test("uses override then env then default", () => {
		expect(resolveSearchModel({ GROK_MODEL: "env-model" }, "override")).toBe("override");
		expect(resolveSearchModel({ XAI_WEB_SEARCH_MODEL: "search-model" })).toBe("search-model");
		expect(resolveSearchModel({})).toBe("grok-4-1-fast-reasoning");
	});
});

describe("extractors", () => {
	const sample: XaiResponsesPayload = {
		status: "completed",
		usage: {
			server_side_tool_usage_details: { web_search_calls: 2 },
		},
		output: [
			{ type: "reasoning", id: "r1" },
			{
				type: "web_search_call",
				action: {
					sources: [
						{ type: "url", url: "https://example.com/a", title: "A" },
						{ type: "url", url: "https://example.com/b" },
					],
				},
			},
			{
				type: "message",
				role: "assistant",
				content: [
					{
						type: "output_text",
						text: "Answer with cite.",
						annotations: [
							{
								type: "url_citation",
								url: "https://example.com/a",
								title: "A",
							},
							{
								type: "url_citation",
								url: "https://example.com/c",
								title: "C",
							},
						],
					},
				],
			},
		],
	};

	test("extractOutputText", () => {
		expect(extractOutputText(sample)).toBe("Answer with cite.");
	});

	test("extractSources de-dupes urls", () => {
		const sources = extractSources(sample);
		expect(sources.map((s) => s.url).sort()).toEqual([
			"https://example.com/a",
			"https://example.com/b",
			"https://example.com/c",
		]);
	});

	test("extractWebSearchCallCount prefers usage details", () => {
		expect(extractWebSearchCallCount(sample)).toBe(2);
	});

	test("formatSearchReport includes sources", () => {
		const report = formatSearchReport({
			ok: true,
			backend: "xai-responses",
			model: "grok-4-1-fast-reasoning",
			text: "Hello",
			sources: [{ url: "https://example.com", title: "Example" }],
			webSearchCalls: 1,
			authSource: "env:XAI_API_KEY",
		});
		expect(report).toContain("Hello");
		expect(report).toContain("https://example.com");
		expect(report).toContain("env:XAI_API_KEY");
	});
});

import { describe, expect, test } from "bun:test";
import {
	nativeCandidates,
	openrouterCandidate,
	preferNativeModels,
	resolvePreferredModel,
	splitThinking,
	type ModelResolveContext,
} from "./model-resolve.ts";

const ctx = (auth: string[], known: string[] = []): ModelResolveContext => ({
	authenticatedProviders: new Set(auth),
	knownModels: new Set(known),
});

describe("splitThinking", () => {
	test("strips suffix", () => {
		expect(splitThinking("openai-codex/gpt-5.6-sol:high")).toEqual({
			base: "openai-codex/gpt-5.6-sol",
			thinking: "high",
		});
	});
});

describe("nativeCandidates / openrouterCandidate", () => {
	test("openrouter anthropic → anthropic", () => {
		expect(nativeCandidates("openrouter/anthropic/claude-fable-5")).toEqual([
			"anthropic/claude-fable-5",
		]);
		expect(openrouterCandidate("anthropic/claude-fable-5")).toBe(
			"openrouter/anthropic/claude-fable-5",
		);
	});

	test("openrouter openai → openai-codex first", () => {
		expect(nativeCandidates("openrouter/openai/gpt-5.6-sol")).toEqual([
			"openai-codex/gpt-5.6-sol",
			"openai/gpt-5.6-sol",
		]);
	});

	test("openrouter x-ai → xai", () => {
		expect(nativeCandidates("openrouter/x-ai/grok-4.5")).toEqual(["xai/grok-4.5"]);
		expect(openrouterCandidate("xai/grok-4.5")).toBe("openrouter/x-ai/grok-4.5");
	});
});

describe("resolvePreferredModel", () => {
	test("prefers anthropic over openrouter when authenticated", () => {
		const r = resolvePreferredModel("openrouter/anthropic/claude-fable-5", ctx(["anthropic", "openrouter"]));
		expect(r.model).toBe("anthropic/claude-fable-5");
		expect(r.source).toBe("native");
	});

	test("falls back to openrouter when anthropic missing", () => {
		const r = resolvePreferredModel(
			"openrouter/anthropic/claude-fable-5",
			ctx(["openrouter"], ["openrouter/anthropic/claude-fable-5"]),
		);
		expect(r.model).toBe("openrouter/anthropic/claude-fable-5");
		expect(r.source).toBe("openrouter");
	});

	test("prefers openai-codex for gpt sol with thinking", () => {
		const r = resolvePreferredModel(
			"openrouter/openai/gpt-5.6-sol:high",
			ctx(["openai-codex", "openrouter"]),
		);
		expect(r.model).toBe("openai-codex/gpt-5.6-sol:high");
		expect(r.source).toBe("native");
	});

	test("prefers xai for grok", () => {
		const r = resolvePreferredModel("openrouter/x-ai/grok-4.5", ctx(["xai", "openrouter"]));
		expect(r.model).toBe("xai/grok-4.5");
	});

	test("native id stays native", () => {
		const r = resolvePreferredModel("xai/grok-4.5", ctx(["xai"]));
		expect(r.model).toBe("xai/grok-4.5");
		expect(r.source).toBe("native");
	});

	test("preferNativeModels maps a list", () => {
		const out = preferNativeModels(
			[
				"openrouter/anthropic/claude-fable-5",
				"openrouter/openai/gpt-5.6-sol:high",
				"openrouter/x-ai/grok-4.5",
			],
			ctx(["anthropic", "openai-codex", "xai", "openrouter"]),
		);
		expect(out).toEqual([
			"anthropic/claude-fable-5",
			"openai-codex/gpt-5.6-sol:high",
			"xai/grok-4.5",
		]);
	});
});

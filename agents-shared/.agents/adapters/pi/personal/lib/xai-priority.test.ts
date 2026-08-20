import { describe, expect, test } from "bun:test";
import {
	applyServiceTier,
	isXaiModel,
	parsePriorityArgs,
	statusLabel,
} from "./xai-priority.ts";

describe("xai-priority", () => {
	test("isXaiModel", () => {
		expect(isXaiModel({ provider: "xai" })).toBe(true);
		expect(isXaiModel({ provider: "openai", baseUrl: "https://api.x.ai/v1" })).toBe(true);
		expect(isXaiModel({ provider: "openai-codex" })).toBe(false);
		expect(isXaiModel(undefined)).toBe(false);
	});

	test("applyServiceTier sets body field", () => {
		expect(applyServiceTier({ model: "grok-4.5" }, "priority")).toEqual({
			model: "grok-4.5",
			service_tier: "priority",
		});
		expect(applyServiceTier({ service_tier: "priority" }, "default")).toEqual({
			service_tier: "default",
		});
		expect(applyServiceTier("nope", "priority")).toBe("nope");
	});

	test("parsePriorityArgs", () => {
		expect(parsePriorityArgs("", true)).toBe(false);
		expect(parsePriorityArgs("on", false)).toBe(true);
		expect(parsePriorityArgs("off", true)).toBe(false);
		expect(parsePriorityArgs("priority", false)).toBe(true);
		expect(parsePriorityArgs("std", true)).toBe(false);
	});

	test("statusLabel", () => {
		expect(statusLabel(true)).toBe("priority");
		expect(statusLabel(false)).toBe("std");
	});
});

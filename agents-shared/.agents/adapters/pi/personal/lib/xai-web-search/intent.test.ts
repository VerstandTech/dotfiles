import { describe, expect, test } from "bun:test";
import {
	detectWebResearchIntent,
	maybeTransformForWebResearch,
	withWebResearchReminder,
} from "./intent.ts";

describe("detectWebResearchIntent", () => {
	test("matches common research phrases", () => {
		const positives = [
			"Can you research on the web about Linktree pricing?",
			"search the web for Beacons competitors",
			"web search: rust 1.88 release",
			"look up online the current Stripe fees",
			"google this for me",
			"what's the latest Next.js version",
			"current price of Creator plan",
			"as of today what is the Fed rate",
			"competitor research on later.com",
			"research competitors in link-in-bio",
		];
		for (const text of positives) {
			expect(detectWebResearchIntent(text)).toBe(true);
		}
	});

	test("ignores normal coding turns and opt-outs", () => {
		const negatives = [
			"fix the failing unit test",
			"refactor this function",
			"/web-search-status",
			"research the codebase for auth bugs",
			"no web search — just reason from the repo",
			"don't search the web, use local docs only",
		];
		for (const text of negatives) {
			expect(detectWebResearchIntent(text)).toBe(false);
		}
	});
});

describe("maybeTransformForWebResearch", () => {
	test("appends reminder when matched", () => {
		const out = maybeTransformForWebResearch("research on the web: foo");
		expect(out.matched).toBe(true);
		expect(out.text).toContain("xai_web_search");
		expect(out.text.startsWith("research on the web: foo")).toBe(true);
	});

	test("leaves non-matching text unchanged", () => {
		const src = "implement the button";
		const out = maybeTransformForWebResearch(src);
		expect(out).toEqual({ matched: false, text: src });
	});

	test("reminder is idempotent", () => {
		const once = withWebResearchReminder("research on the web");
		const twice = withWebResearchReminder(once);
		expect(twice).toBe(once);
	});
});

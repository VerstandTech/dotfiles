import { describe, expect, test } from "bun:test";
import { detectFleetIntent, maybeTransformForFleet } from "./intent.ts";

describe("detectFleetIntent", () => {
	test("matches real fleet asks", () => {
		expect(detectFleetIntent("dispatch 10 sub-agents to research X")).toBe(true);
		expect(detectFleetIntent("spawn a dozen reviewers on this diff")).toBe(true);
		expect(detectFleetIntent("launch 8 researchers on multi-agent harnesses")).toBe(true);
	});

	test("rejects false positives and opt-out", () => {
		expect(detectFleetIntent("Do not spawn 5 agents yet")).toBe(false);
		expect(detectFleetIntent("launch the insurance agents portal with 2 environments")).toBe(
			false,
		);
		expect(detectFleetIntent("launch 3 agent tests")).toBe(false);
		expect(detectFleetIntent("I want a dozen reviewers")).toBe(false); // no verb
	});
});

describe("maybeTransformForFleet", () => {
	test("appends once", () => {
		const once = maybeTransformForFleet("Please dispatch 10 sub-agents for review");
		expect(once.matched).toBe(true);
		expect(once.text).toContain("fleet_dispatch");
		expect(maybeTransformForFleet(once.text).text).toBe(once.text);
	});
});

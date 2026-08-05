import { describe, expect, test } from "bun:test";
import { detectBddIntent, maybeTransformForBdd } from "./intent.ts";

describe("detectBddIntent", () => {
	test("matches workflow phrases", () => {
		expect(detectBddIntent("Let's do TDD on this bug")).toBe(true);
		expect(detectBddIntent("write an Example Map first")).toBe(true);
		expect(detectBddIntent("add Gherkin scenarios")).toBe(true);
		expect(detectBddIntent("red-green-refactor please")).toBe(true);
	});

	test("ignores opt-out and slash commands", () => {
		expect(detectBddIntent("do TDD but bdd off")).toBe(false);
		expect(detectBddIntent("/bdd status")).toBe(false);
		expect(detectBddIntent("fix the button color")).toBe(false);
	});
});

describe("maybeTransformForBdd", () => {
	test("appends reminder once", () => {
		const once = maybeTransformForBdd("Please use BDD for this feature");
		expect(once.matched).toBe(true);
		expect(once.text).toContain("bdd_assert_red");
		const twice = maybeTransformForBdd(once.text);
		expect(twice.text).toBe(once.text);
	});
});

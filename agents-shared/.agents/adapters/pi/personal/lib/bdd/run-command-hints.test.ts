import { describe, expect, test } from "bun:test";
import { extractFailedTestHints } from "./run-command.ts";

describe("extractFailedTestHints", () => {
	test("pulls FAIL lines and test file paths", () => {
		const out = `
(fail) CreateGenerationTaskUseCase > execute > should preserve creditCost
FAIL tests/unit/foo.test.ts
expected true
`;
		const hints = extractFailedTestHints(out);
		expect(hints.length).toBeGreaterThan(0);
		expect(hints.join(" ")).toMatch(/foo\.test/);
	});
});

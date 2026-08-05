import { describe, expect, test } from "bun:test";
import { formatPrBody } from "./pr-handoff.ts";
import type { BddEvidence } from "./types.ts";

const complete: BddEvidence = {
	red: { command: "bun test a", exitCode: 1, summary: "FAIL", at: "t" },
	green: { command: "bun test a", exitCode: 0, summary: "PASS", at: "t" },
	acceptance: { ref: "tests/features/x.feature", at: "t" },
};

describe("formatPrBody", () => {
	test("includes summary and checklist", () => {
		const md = formatPrBody({ phase: "verify", evidence: complete, title: "Fix billing" });
		expect(md).toContain("## Summary");
		expect(md).toContain("Fix billing");
		expect(md).toContain("[x] Red");
		expect(md).toContain("complete");
	});

	test("marks incomplete", () => {
		const md = formatPrBody({ phase: "red", evidence: {} });
		expect(md).toContain("incomplete");
	});
});

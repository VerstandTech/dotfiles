import { describe, expect, test } from "bun:test";
import { assuranceHandoffGaps } from "./quality-gates.ts";
import type { BddEvidence } from "./types.ts";

const passedUnit = {
	id: "quality:unit",
	kind: "unit" as const,
	required: true,
	status: "passed" as const,
	command: "bun test",
	exitCode: 0,
	summary: "PASS",
};

const policy = {
	enabled: true,
	expectedPlanFingerprint: "plan-1",
	expectedRequiredGateKinds: ["unit" as const],
};

const evidence = (greenAt = "2026-07-26T10:00:00.000Z"): BddEvidence => ({
	red: { command: "bun test", exitCode: 1, summary: "FAIL", at: "2026-07-26T09:00:00.000Z" },
	green: { command: "bun test", exitCode: 0, summary: "PASS", at: greenAt },
	acceptance: { ref: "lib/bdd/assurance-handoff.test.ts", at: greenAt },
});

describe("assuranceHandoffGaps", () => {
	// R7-E1
	test("requires a gate run when assurance is enabled", () => {
		expect(
			assuranceHandoffGaps(evidence(), policy).join(" "),
		).toMatch(/gate run/i);
	});

	// R5-E1
	test("rejects gate evidence older than green", () => {
		const value = evidence("2026-07-26T12:00:00.000Z");
		value.assurance = {
			profileFingerprint: "profile-1",
			planFingerprint: "plan-1",
			startedAt: "2026-07-26T10:00:00.000Z",
			completedAt: "2026-07-26T11:00:00.000Z",
			ok: true,
			results: [passedUnit],
		};
		expect(
			assuranceHandoffGaps(value, policy).join(" "),
		).toMatch(/older|stale/i);
	});

	// R5-E2
	test("rejects a plan fingerprint mismatch", () => {
		const value = evidence();
		value.assurance = {
			profileFingerprint: "profile-1",
			planFingerprint: "old-plan",
			startedAt: "2026-07-26T10:01:00.000Z",
			completedAt: "2026-07-26T10:02:00.000Z",
			ok: true,
			results: [passedUnit],
		};
		expect(
			assuranceHandoffGaps(value, { ...policy, expectedPlanFingerprint: "new-plan" }).join(" "),
		).toMatch(/fingerprint/i);
	});

	// R7-E2
	test("accepts current passing gate evidence", () => {
		const value = evidence();
		value.assurance = {
			profileFingerprint: "profile-1",
			planFingerprint: "plan-1",
			startedAt: "2026-07-26T10:01:00.000Z",
			completedAt: "2026-07-26T10:02:00.000Z",
			ok: true,
			results: [passedUnit],
		};
		expect(assuranceHandoffGaps(value, policy)).toEqual([]);
	});

	test("rejects empty or missing required-gate results even when ok is forged true", () => {
		const value = evidence();
		value.assurance = {
			profileFingerprint: "profile-1",
			planFingerprint: "plan-1",
			startedAt: "2026-07-26T10:01:00.000Z",
			completedAt: "2026-07-26T10:02:00.000Z",
			ok: true,
			results: [],
		};
		expect(assuranceHandoffGaps(value, policy).join(" ")).toMatch(/required.*unit/i);
	});
});

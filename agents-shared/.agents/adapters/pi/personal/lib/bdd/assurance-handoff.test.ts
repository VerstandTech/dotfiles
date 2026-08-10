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

	// E27 — stale config fingerprint
	test("reports stale config fingerprint gap", () => {
		const value = evidence();
		value.assurance = {
			profileFingerprint: "profile-1",
			planFingerprint: "plan-1",
			startedAt: "2026-07-26T10:01:00.000Z",
			completedAt: "2026-07-26T10:02:00.000Z",
			ok: true,
			results: [passedUnit],
			...( { configFingerprint: "old-config" } as object),
		} as typeof value.assurance & { configFingerprint?: string };
		const gaps = assuranceHandoffGaps(value, {
			...policy,
			expectedConfigFingerprint: "current-config",
		} as typeof policy & { expectedConfigFingerprint: string });
		expect(gaps.join(" ")).toMatch(/config fingerprint|stale-config|stale config/i);
	});

	// E28 — untrusted required gate
	test("reports untrusted required gate gap", () => {
		const value = evidence();
		value.assurance = {
			profileFingerprint: "profile-1",
			planFingerprint: "plan-1",
			startedAt: "2026-07-26T10:01:00.000Z",
			completedAt: "2026-07-26T10:02:00.000Z",
			ok: true,
			results: [
				{
					...passedUnit,
					...( {
						trustTier: "interactive_untrusted",
						executorKind: "shell",
					} as object),
				} as typeof passedUnit,
			],
		};
		const gaps = assuranceHandoffGaps(value, policy as never);
		expect(gaps.join(" ")).toMatch(/untrusted|trust/i);
	});

	// Non-causal / legacy red under assurance
	test("reports non-causal red gap when red is not assurance-eligible", () => {
		const value = evidence();
		value.red = {
			command: "bun test",
			exitCode: 1,
			summary: "FAIL",
			at: "2026-07-26T09:00:00.000Z",
			...( {
				assuranceEligible: false,
				trustTier: "interactive_untrusted",
				matchMode: "legacy",
			} as object),
		} as typeof value.red;
		value.assurance = {
			profileFingerprint: "profile-1",
			planFingerprint: "plan-1",
			startedAt: "2026-07-26T10:01:00.000Z",
			completedAt: "2026-07-26T10:02:00.000Z",
			ok: true,
			results: [passedUnit],
		};
		const gaps = assuranceHandoffGaps(value, {
			...policy,
			requireCausalRed: true,
		} as typeof policy & { requireCausalRed: boolean });
		expect(gaps.join(" ")).toMatch(/causal|assurance-eligible|expected.?red|non-causal/i);
	});

	// E29 — note-only mutation is not enough when command-backed matched mutation is required
	test("reports command-backed matched mutation gap for note-only mutation", () => {
		const value = evidence();
		value.mutation = {
			proven: true,
			note: "trust me, I broke it by hand",
			at: "2026-07-26T10:03:00.000Z",
		};
		value.assurance = {
			profileFingerprint: "profile-1",
			planFingerprint: "plan-1",
			startedAt: "2026-07-26T10:01:00.000Z",
			completedAt: "2026-07-26T10:02:00.000Z",
			ok: true,
			results: [passedUnit],
		};
		const gaps = assuranceHandoffGaps(value, {
			...policy,
			requireCommandBackedMatchedMutation: true,
		} as typeof policy & { requireCommandBackedMatchedMutation: boolean });
		expect(gaps.join(" ")).toMatch(/mutation|sensitivity|command-backed|matched/i);
	});

	// E40 — commands present but matched undefined cannot satisfy handoff
	test("reports matched-mutation gap when matched is undefined despite commands", () => {
		const value = evidence();
		value.mutation = {
			proven: true,
			note: "commands present but matched omitted",
			at: "2026-07-26T10:03:00.000Z",
			failCommand: "bun test lib/bdd/run-command.test.ts",
			passCommand: "bun test lib/bdd/run-command.test.ts",
			// matched deliberately undefined
		};
		value.assurance = {
			profileFingerprint: "profile-1",
			planFingerprint: "plan-1",
			startedAt: "2026-07-26T10:01:00.000Z",
			completedAt: "2026-07-26T10:02:00.000Z",
			ok: true,
			results: [passedUnit],
		};
		const gaps = assuranceHandoffGaps(value, {
			...policy,
			requireCommandBackedMatchedMutation: true,
		} as typeof policy & { requireCommandBackedMatchedMutation: boolean });
		expect(gaps.join(" ")).toMatch(/matched|mutation|sensitivity/i);
		// Must not treat undefined matched as success merely because commands exist.
		expect(gaps.length).toBeGreaterThan(0);
	});

	// E41 — red/green config fingerprint must bind current config
	test("reports stale red or green config fingerprint gap", () => {
		const value = evidence();
		value.red = {
			...(value.red as NonNullable<BddEvidence["red"]>),
			...( {
				assuranceEligible: true,
				configFingerprint: "red-old-fp",
			} as object),
		} as BddEvidence["red"];
		value.green = {
			...(value.green as NonNullable<BddEvidence["green"]>),
			...( {
				configFingerprint: "green-old-fp",
			} as object),
		} as BddEvidence["green"];
		value.assurance = {
			profileFingerprint: "profile-1",
			planFingerprint: "plan-1",
			startedAt: "2026-07-26T10:01:00.000Z",
			completedAt: "2026-07-26T10:02:00.000Z",
			ok: true,
			results: [passedUnit],
			...( { configFingerprint: "current-config" } as object),
		} as typeof value.assurance & { configFingerprint?: string };
		const gaps = assuranceHandoffGaps(value, {
			...policy,
			expectedConfigFingerprint: "current-config",
			requireCausalRed: true,
		} as typeof policy & {
			expectedConfigFingerprint: string;
			requireCausalRed: boolean;
		});
		expect(gaps.join(" ")).toMatch(
			/stale.*(?:red|green).*config|config fingerprint.*(?:red|green)|red.*config fingerprint|green.*config fingerprint/i,
		);
	});

	// E43 — shell + forged trusted tier cannot satisfy by tier string alone
	test("reports executor-kind gap for required shell result labeled trusted", () => {
		const value = evidence();
		value.assurance = {
			profileFingerprint: "profile-1",
			planFingerprint: "plan-1",
			startedAt: "2026-07-26T10:01:00.000Z",
			completedAt: "2026-07-26T10:02:00.000Z",
			ok: true,
			results: [
				{
					...passedUnit,
					...( {
						executorKind: "shell",
						trustTier: "trusted",
					} as object),
				} as typeof passedUnit,
			],
		};
		const gaps = assuranceHandoffGaps(value, policy as never);
		expect(gaps.join(" ")).toMatch(/untrusted|executor|shell|kind/i);
	});

	// E48 — missing executor kind cannot be trusted by forged tier string alone
	test("rejects a required passing result with missing executor kind even when tier says trusted", () => {
		const value = evidence();
		value.assurance = {
			profileFingerprint: "profile-1",
			planFingerprint: "plan-1",
			startedAt: "2026-07-26T10:01:00.000Z",
			completedAt: "2026-07-26T10:02:00.000Z",
			ok: true,
			results: [
				{
					...passedUnit,
					// executorKind deliberately omitted
					...( {
						trustTier: "trusted",
					} as object),
				} as typeof passedUnit,
			],
		};
		const gaps = assuranceHandoffGaps(value, policy as never);
		expect(gaps.join(" ")).toMatch(/executor|trust|kind/i);
		expect(gaps.length).toBeGreaterThan(0);
	});
});

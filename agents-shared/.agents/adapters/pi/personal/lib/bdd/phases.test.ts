import { describe, expect, test } from "bun:test";
import {
	canTransition,
	clearCycleEvidence,
	formatHandoff,
	greenIsStale,
	handoffComplete,
	parsePhase,
	suggestedNextPhase,
} from "./phases.ts";
import type { BddEvidence } from "./types.ts";

const empty: BddEvidence = {};
const redOnly: BddEvidence = {
	red: {
		command: "bun test foo",
		exitCode: 1,
		summary: "FAIL: expected true",
		at: new Date().toISOString(),
	},
};
const redGreen: BddEvidence = {
	...redOnly,
	green: {
		command: "bun test foo",
		exitCode: 0,
		summary: "PASS",
		at: new Date().toISOString(),
	},
	acceptance: { ref: "tests/features/x.feature", at: new Date().toISOString() },
};

describe("parsePhase", () => {
	test("aliases", () => {
		expect(parsePhase("formulate")).toBe("formulation");
		expect(parsePhase("implement")).toBe("green");
		expect(parsePhase("RED")).toBe("red");
		expect(parsePhase("nope")).toBeUndefined();
	});
});

describe("canTransition", () => {
	test("always allows discovery and off", () => {
		expect(canTransition("off", "discovery", empty).ok).toBe(true);
		expect(canTransition("green", "off", redGreen).ok).toBe(true);
	});

	test("blocks green without red", () => {
		const r = canTransition("red", "green", empty);
		expect(r.ok).toBe(false);
		expect(r.reason).toMatch(/red evidence/i);
	});

	test("allows green with failing red evidence", () => {
		expect(canTransition("red", "green", redOnly).ok).toBe(true);
	});

	test("rejects red evidence that passed", () => {
		const bad: BddEvidence = {
			red: { command: "t", exitCode: 0, summary: "PASS", at: "x" },
		};
		expect(canTransition("red", "green", bad).ok).toBe(false);
	});

	test("verify needs green", () => {
		expect(canTransition("green", "verify", redOnly).ok).toBe(false);
		expect(canTransition("green", "verify", redGreen).ok).toBe(true);
	});

	test("backward always ok", () => {
		expect(canTransition("green", "red", redGreen).ok).toBe(true);
	});
});

describe("suggestedNextPhase", () => {
	test("sequence", () => {
		expect(suggestedNextPhase("off")).toBe("discovery");
		expect(suggestedNextPhase("discovery")).toBe("formulation");
		expect(suggestedNextPhase("verify")).toBeUndefined();
	});
});

describe("handoff", () => {
	test("format includes sections", () => {
		const md = formatHandoff(redGreen, "verify");
		expect(md).toContain("Red:");
		expect(md).toContain("Green:");
		expect(md).toContain("tests/features/x.feature");
	});

	test("complete check", () => {
		expect(handoffComplete(empty).ok).toBe(false);
		expect(handoffComplete(redOnly).missing).toContain("green (passing run)");
		expect(handoffComplete(redGreen).ok).toBe(true);
	});

	test("N/A acceptance without reason is incomplete", () => {
		const e = {
			...redGreen,
			acceptance: { ref: "N/A", at: "x" },
		};
		expect(handoffComplete(e).ok).toBe(false);
		expect(handoffComplete(e).missing.some((m) => /N\/A reason/i.test(m))).toBe(true);
	});

	test("review fleet without synthesis fails handoff", () => {
		const e = {
			...redGreen,
			fleetRuns: [
				{
					runId: "run-1",
					kind: "review",
					expectedCount: 3,
					at: "t",
				},
			],
		};
		expect(handoffComplete(e).ok).toBe(false);
		expect(handoffComplete(e).missing.some((m) => /synthesis/.test(m))).toBe(true);
	});

	test("review fleet with synthesisPath ok", () => {
		const e = {
			...redGreen,
			fleetRuns: [
				{
					runId: "run-1",
					kind: "review",
					expectedCount: 3,
					at: "t",
					synthesisPath: ".pi/fleet-runs/run-1/synthesis.md",
				},
			],
		};
		expect(handoffComplete(e).ok).toBe(true);
	});

	test("high-assurance handoff requires a current matching gate run", () => {
		const e: BddEvidence = {
			...redGreen,
			assurance: {
				profileFingerprint: "profile-1",
				planFingerprint: "plan-1",
				startedAt: "2099-01-01T00:00:01.000Z",
				completedAt: "2099-01-01T00:00:02.000Z",
				ok: true,
				results: [
					{
						id: "quality:unit",
						kind: "unit",
						required: true,
						status: "passed",
						summary: "PASS",
						// R11 — required passing unit must be explicit trusted argv
						...( { trustTier: "trusted", executorKind: "argv" } as object),
					} as never,
				],
			},
		};
		const policy = {
			assuranceEnabled: true,
			expectedPlanFingerprint: "plan-1",
			expectedRequiredGateKinds: ["unit" as const],
		};
		expect(handoffComplete(e, policy).ok).toBe(true);
		expect(handoffComplete(redGreen, policy).ok).toBe(false);
	});

	test("high-assurance mutation cannot be proven by note alone", () => {
		const e: BddEvidence = {
			...redGreen,
			mutation: { proven: true, note: "trust me", at: "t" },
		};
		const result = handoffComplete(e, { requireCommandBackedMutation: true });
		expect(result.ok).toBe(false);
		expect(result.missing.join(" ")).toMatch(/command-backed mutation/i);
	});

	test("high-assurance fleet synthesis requires an existing file and dispositions", () => {
		const base: BddEvidence = {
			...redGreen,
			fleetRuns: [
				{
					runId: "run-1",
					kind: "review",
					expectedCount: 3,
					at: "t",
					synthesisPath: ".pi/fleet-runs/run-1/synthesis.md",
				},
			],
		};
		const missingDisposition = handoffComplete(base, {
			requireFleetDisposition: true,
			synthesisExists: () => true,
		});
		expect(missingDisposition.ok).toBe(false);
		expect(missingDisposition.missing.join(" ")).toMatch(/disposition/i);

		const complete: BddEvidence = {
			...base,
			fleetRuns: base.fleetRuns?.map((run) => ({ ...run, noBlockers: true })),
		};
		expect(
			handoffComplete(complete, {
				requireFleetDisposition: true,
				synthesisExists: () => true,
			}).ok,
		).toBe(true);
		expect(
			handoffComplete(complete, {
				requireFleetDisposition: true,
				synthesisExists: () => false,
			}).ok,
		).toBe(false);
	});
});

describe("evidence lifecycle helpers", () => {
	test("clearCycleEvidence drops red/green", () => {
		const cleared = clearCycleEvidence({ ...redGreen, focus: "story-a" });
		expect(cleared.red).toBeUndefined();
		expect(cleared.green).toBeUndefined();
		expect(cleared.focus).toBe("story-a");
	});

	test("greenIsStale when red is newer", () => {
		const e: BddEvidence = {
			red: { command: "t", exitCode: 1, summary: "f", at: "2026-01-02T00:00:00.000Z" },
			green: { command: "t", exitCode: 0, summary: "p", at: "2026-01-01T00:00:00.000Z" },
		};
		expect(greenIsStale(e)).toBe(true);
	});
});

describe("assurance causal-red progression (BDD-01 R4/R9)", () => {
	// E13 — legacy red cannot enter green under assurance
	test("blocks green transition when only legacy non-assurance red exists under assurance", () => {
		const legacyRed: BddEvidence = {
			red: {
				command: "bun test",
				exitCode: 1,
				summary: "FAIL",
				at: new Date().toISOString(),
				...( {
					assuranceEligible: false,
					trustTier: "interactive_untrusted",
					matchMode: "legacy",
				} as object),
			} as BddEvidence["red"],
		};
		const blocked = (
			canTransition as unknown as (
				from: string,
				to: string,
				evidence: BddEvidence,
				policy?: { assuranceEnabled?: boolean },
			) => { ok: boolean; reason?: string }
		)("red", "green", legacyRed, { assuranceEnabled: true });
		expect(blocked.ok).toBe(false);
		expect(blocked.reason ?? "").toMatch(/causal|assurance|expected.?red|contract/i);
	});

	// E29 — handoff requires command-backed matched mutation under assurance
	test("high-assurance handoff rejects note-only mutation without matched fail leg", () => {
		const e: BddEvidence = {
			...redGreen,
			red: {
				...(redGreen.red as NonNullable<BddEvidence["red"]>),
				...( {
					assuranceEligible: true,
					expectedTestId:
						"rejects an unrelated failing assertion when the expected test id is absent",
					matchMode: "identity",
					configFingerprint: "cfg-1",
				} as object),
			} as BddEvidence["red"],
			mutation: {
				proven: true,
				note: "note only",
				at: "t",
			},
			assurance: {
				profileFingerprint: "profile-1",
				planFingerprint: "plan-1",
				startedAt: "2099-01-01T00:00:01.000Z",
				completedAt: "2099-01-01T00:00:02.000Z",
				ok: true,
				results: [
					{
						id: "quality:unit",
						kind: "unit",
						required: true,
						status: "passed",
						summary: "PASS",
						...( { trustTier: "trusted", executorKind: "argv" } as object),
					} as never,
				],
				...( { configFingerprint: "cfg-1" } as object),
			} as BddEvidence["assurance"],
		};
		const result = handoffComplete(e, {
			assuranceEnabled: true,
			expectedPlanFingerprint: "plan-1",
			expectedRequiredGateKinds: ["unit"],
			requireCommandBackedMutation: true,
			expectedConfigFingerprint: "cfg-1",
		} as never);
		expect(result.ok).toBe(false);
		expect(result.missing.join(" ")).toMatch(/command-backed mutation|matched mutation|sensitivity/i);
	});

	// E40 — undefined matched with commands cannot complete handoff
	test("high-assurance handoff rejects mutation with commands but undefined matched", () => {
		const e: BddEvidence = {
			...redGreen,
			red: {
				...(redGreen.red as NonNullable<BddEvidence["red"]>),
				...( {
					assuranceEligible: true,
					configFingerprint: "cfg-1",
				} as object),
			} as BddEvidence["red"],
			mutation: {
				proven: true,
				note: "commands only",
				at: "t",
				failCommand: "bun test a",
				passCommand: "bun test a",
				// matched undefined
			},
			assurance: {
				profileFingerprint: "profile-1",
				planFingerprint: "plan-1",
				startedAt: "2099-01-01T00:00:01.000Z",
				completedAt: "2099-01-01T00:00:02.000Z",
				ok: true,
				results: [
					{
						id: "quality:unit",
						kind: "unit",
						required: true,
						status: "passed",
						summary: "PASS",
						...( { trustTier: "trusted", executorKind: "argv" } as object),
					} as never,
				],
				...( { configFingerprint: "cfg-1" } as object),
			} as BddEvidence["assurance"],
		};
		const result = handoffComplete(e, {
			assuranceEnabled: true,
			expectedPlanFingerprint: "plan-1",
			expectedRequiredGateKinds: ["unit"],
			requireCommandBackedMutation: true,
			requireCommandBackedMatchedMutation: true,
			expectedConfigFingerprint: "cfg-1",
		} as never);
		expect(result.ok).toBe(false);
		expect(result.missing.join(" ")).toMatch(/matched|mutation|sensitivity/i);
	});

	// E41 — red/green fingerprint bind current config
	test("high-assurance handoff rejects stale red or green config fingerprints", () => {
		const e: BddEvidence = {
			...redGreen,
			red: {
				...(redGreen.red as NonNullable<BddEvidence["red"]>),
				...( {
					assuranceEligible: true,
					configFingerprint: "stale-red-fp",
				} as object),
			} as BddEvidence["red"],
			green: {
				...(redGreen.green as NonNullable<BddEvidence["green"]>),
				...( {
					configFingerprint: "stale-green-fp",
				} as object),
			} as BddEvidence["green"],
			assurance: {
				profileFingerprint: "profile-1",
				planFingerprint: "plan-1",
				startedAt: "2099-01-01T00:00:01.000Z",
				completedAt: "2099-01-01T00:00:02.000Z",
				ok: true,
				results: [
					{
						id: "quality:unit",
						kind: "unit",
						required: true,
						status: "passed",
						summary: "PASS",
						...( { trustTier: "trusted", executorKind: "argv" } as object),
					} as never,
				],
				...( { configFingerprint: "cfg-current" } as object),
			} as BddEvidence["assurance"],
		};
		const result = handoffComplete(e, {
			assuranceEnabled: true,
			expectedPlanFingerprint: "plan-1",
			expectedRequiredGateKinds: ["unit"],
			expectedConfigFingerprint: "cfg-current",
			requireCausalRed: true,
		} as never);
		expect(result.ok).toBe(false);
		expect(result.missing.join(" ")).toMatch(
			/stale.*(?:red|green).*config|config fingerprint.*(?:red|green)|red.*config fingerprint|green.*config fingerprint/i,
		);
	});
});

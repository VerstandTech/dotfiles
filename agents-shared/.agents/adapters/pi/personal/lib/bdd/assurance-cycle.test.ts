import { describe, expect, test } from "bun:test";
import type { BddEvidence } from "./types.ts";
import type { ProjectProfile } from "./project-profile.ts";
import type { QualityGatePlan } from "./quality-gates.ts";
import {
	assertAssuranceAction,
	buildAssuranceBlueprint,
	roleContract,
} from "./assurance-cycle.ts";

const profile: ProjectProfile = {
	version: 1,
	root: "/project",
	stacks: ["typescript"],
	packageManagers: ["bun"],
	frameworks: ["react"],
	signals: ["package.json"],
	commands: { unitTest: "bun test" },
	confidence: "high",
	fingerprint: "profile-1",
};

const plan: QualityGatePlan = {
	version: 1,
	profileFingerprint: "profile-1",
	fingerprint: "plan-1",
	gates: [],
};

const redGreen: BddEvidence = {
	red: { command: "bun test", exitCode: 1, summary: "FAIL", at: "2026-01-01T00:00:00Z" },
	green: { command: "bun test", exitCode: 0, summary: "PASS", at: "2026-01-02T00:00:00Z" },
	acceptance: { ref: "tests/acceptance.test.ts", at: "2026-01-02T00:00:00Z" },
};

describe("high-assurance role contracts", () => {
	// R6-E1, R6-E2
	test("specifier and verification roles are read-only", () => {
		expect(roleContract("specifier").writeScope).toBe("none");
		expect(roleContract("fitness-guardian").writeScope).toBe("none");
		expect(roleContract("qa").writeScope).toBe("none");
	});

	// R6-E3
	test("blueprint contains exactly one writer and never parallelizes it", () => {
		const blueprint = buildAssuranceBlueprint(profile, plan);
		const writers = blueprint.stages.flatMap((stage) =>
			stage.roles.filter((role) => roleContract(role).writeScope !== "none"),
		);
		expect(writers).toEqual(["test-designer", "implementer", "refactorer"]);
		for (const stage of blueprint.stages) {
			if (stage.roles.some((role) => roleContract(role).writeScope !== "none")) {
				expect(stage.parallel).toBe(false);
			}
		}
		expect(blueprint.stages.find((stage) => stage.id === "verify")?.roles).toEqual([
			"breaker",
			"fitness-guardian",
			"qa",
		]);
	});
});

describe("assertAssuranceAction", () => {
	test("blocks work until the workspace is confirmed", () => {
		const result = assertAssuranceAction(
			{ workspaceConfirmed: false, phase: "discovery", evidence: {}, plan },
			{ type: "delegate", role: "specifier" },
		);
		expect(result.ok).toBe(false);
		expect(result.reason).toMatch(/workspace/i);
	});

	test("allows only phase-appropriate bounded roles", () => {
		expect(
			assertAssuranceAction(
				{ workspaceConfirmed: true, phase: "discovery", evidence: {}, plan },
				{ type: "delegate", role: "specifier" },
			).ok,
		).toBe(true);
		expect(
			assertAssuranceAction(
				{ workspaceConfirmed: true, phase: "red", evidence: {}, plan },
				{ type: "delegate", role: "implementer" },
			).ok,
		).toBe(false);
		expect(
			assertAssuranceAction(
				{ workspaceConfirmed: true, phase: "verify", evidence: redGreen, plan },
				{ type: "delegate", role: "fitness-guardian" },
			).ok,
		).toBe(true);
	});

	test("blocks hard-gate execution before verify", () => {
		const result = assertAssuranceAction(
			{ workspaceConfirmed: true, phase: "green", evidence: redGreen, plan },
			{ type: "run-gates" },
		);
		expect(result.ok).toBe(false);
		expect(result.reason).toMatch(/verify/i);
	});
});

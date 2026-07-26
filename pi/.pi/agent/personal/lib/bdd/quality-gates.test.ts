import { describe, expect, test } from "bun:test";
import type { ProjectProfile } from "./project-profile.ts";
import {
	buildQualityGatePlan,
	formatQualityGatePlan,
	runQualityGatePlan,
	type GateCommandResult,
} from "./quality-gates.ts";

const profile: ProjectProfile = {
	version: 1,
	root: "/project",
	stacks: ["javascript", "typescript"],
	packageManagers: ["bun"],
	frameworks: ["react", "vite"],
	signals: ["package.json", "tsconfig.json", "vite.config.ts"],
	commands: {
		unitTest: "bun test",
		typecheck: "bun run typecheck",
		staticAnalysis: "bun run lint",
		coverage: "bun run coverage",
		doctor: "bun run doctor",
	},
	confidence: "high",
	fingerprint: "profile-fingerprint",
};

describe("buildQualityGatePlan", () => {
	// R2-E3, R3-E1
	test("is deterministic, ordered, and honors explicit command overrides", () => {
		const input = {
			profile,
			assurance: {
				enabled: true,
				requiredGateKinds: ["types", "unit", "coverage", "mutation"] as const,
				commands: { coverage: "bun run coverage:ci", mutation: "bun run mutation" },
				coverageThreshold: 95,
				mutationThreshold: 85,
			},
		};
		const first = buildQualityGatePlan(input);
		const second = buildQualityGatePlan(input);
		expect(second).toEqual(first);
		expect(first.gates.map((gate) => gate.kind)).toEqual([
			"static",
			"types",
			"unit",
			"coverage",
			"mutation",
			"doctor",
		]);
		expect(first.gates.find((gate) => gate.kind === "coverage")).toMatchObject({
			command: "bun run coverage:ci",
			source: "config",
			required: true,
			threshold: 95,
			availability: "ready",
		});
		expect(first.fingerprint).toMatch(/^[a-f0-9]{64}$/);
	});

	// R3-E2, R3-E3
	test("enabled assurance cannot disable all hard gates with an empty required list", () => {
		const plan = buildQualityGatePlan({
			profile,
			assurance: { enabled: true, requiredGateKinds: [] },
		});
		expect(plan.gates.find((gate) => gate.kind === "unit")).toMatchObject({
			required: true,
			availability: "ready",
		});
	});

	test("shows command-enforced threshold targets in plan output", () => {
		const plan = buildQualityGatePlan({
			profile,
			assurance: { enabled: true, requiredGateKinds: ["coverage"], coverageThreshold: 95 },
		});
		expect(formatQualityGatePlan(plan)).toMatch(/threshold.*95.*command-enforced/i);
	});

	test("represents unresolved required gates as blockers and advisory gates as unavailable", () => {
		const plan = buildQualityGatePlan({
			profile: { ...profile, commands: { unitTest: "bun test" } },
			assurance: {
				enabled: true,
				requiredGateKinds: ["unit", "coverage"],
				advisoryGateKinds: ["doctor"],
			},
		});
		expect(plan.gates.find((gate) => gate.kind === "coverage")).toMatchObject({
			required: true,
			availability: "unavailable",
		});
		expect(plan.gates.find((gate) => gate.kind === "doctor")).toMatchObject({
			required: false,
			availability: "unavailable",
		});
	});
});

describe("runQualityGatePlan", () => {
	const pass = (command: string): GateCommandResult => ({
		command,
		exitCode: 0,
		summary: "PASS",
	});

	// R4-E1
	test("stops after the first required failure", async () => {
		const plan = buildQualityGatePlan({
			profile,
			assurance: { enabled: true, requiredGateKinds: ["types", "unit"] },
		});
		const calls: string[] = [];
		const result = await runQualityGatePlan({
			cwd: "/project",
			plan,
			now: () => "2026-07-26T00:00:00.000Z",
			execute: async ({ command }) => {
				calls.push(command);
				if (command.includes("typecheck")) return { ...pass(command), exitCode: 1, summary: "FAIL" };
				return pass(command);
			},
		});
		expect(result.ok).toBe(false);
		expect(calls).toEqual(["bun run lint", "bun run typecheck"]);
		expect(result.results.find((gate) => gate.kind === "unit")?.status).toBe("skipped");
	});

	// R4-E2
	test("records advisory failures and continues", async () => {
		const plan = buildQualityGatePlan({
			profile,
			assurance: {
				enabled: true,
				requiredGateKinds: ["unit"],
				advisoryGateKinds: ["doctor"],
			},
		});
		const calls: string[] = [];
		const result = await runQualityGatePlan({
			cwd: "/project",
			plan,
			execute: async ({ command }) => {
				calls.push(command);
				return command.includes("doctor")
					? { ...pass(command), exitCode: 2, summary: "doctor findings" }
					: pass(command);
			},
		});
		expect(result.ok).toBe(true);
		expect(calls).toContain("bun run doctor");
		expect(result.results.find((gate) => gate.kind === "doctor")?.status).toBe("failed");
	});

	test("treats timeout and spawn errors as failures even with exit code zero", async () => {
		for (const infrastructure of [{ timedOut: true }, { spawnError: true }]) {
			const plan = buildQualityGatePlan({
				profile: { ...profile, commands: { unitTest: "bun test" } },
				assurance: { enabled: true, requiredGateKinds: ["unit"] },
			});
			const result = await runQualityGatePlan({
				cwd: "/project",
				plan,
				execute: async ({ command }) => ({ command, exitCode: 0, summary: "infra", ...infrastructure }),
			});
			expect(result.ok).toBe(false);
			expect(result.results.find((gate) => gate.kind === "unit")?.status).toBe("failed");
		}
	});

	test("fails closed when a required gate is unavailable", async () => {
		const plan = buildQualityGatePlan({
			profile: { ...profile, commands: {} },
			assurance: { enabled: true, requiredGateKinds: ["coverage"] },
		});
		const result = await runQualityGatePlan({
			cwd: "/project",
			plan,
			execute: async ({ command }) => pass(command),
		});
		expect(result.ok).toBe(false);
		expect(result.results.find((gate) => gate.kind === "coverage")?.status).toBe("unavailable");
	});
});

import { describe, expect, test } from "bun:test";
import type { ProjectProfile } from "./project-profile.ts";
import {
	assuranceHandoffGaps,
	buildQualityGatePlan,
	formatQualityGatePlan,
	runQualityGatePlan,
	type GateCommandResult,
} from "./quality-gates.ts";
import type { BddEvidence } from "./types.ts";

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

describe("gate executor model and trust (BDD-01 R6–R7)", () => {
	type ExtendedAssurance = Record<string, unknown>;

	function buildPlan(assurance: ExtendedAssurance) {
		return buildQualityGatePlan({
			profile,
			assurance: assurance as never,
		});
	}

	// E20 — interactive shell labeled untrusted
	test("labels interactive shell gates as interactive_untrusted", () => {
		const plan = buildPlan({
			enabled: true,
			trustProfile: "interactive",
			requiredGateKinds: ["unit"],
			executors: {
				unit: { kind: "shell", command: "bun test" },
			},
		});
		const unit = plan.gates.find((g) => g.kind === "unit") as unknown as {
			executorKind?: string;
			trustTier?: string;
			command?: string;
		};
		expect(unit?.command ?? "").toMatch(/bun test/);
		expect(`${unit?.executorKind ?? ""}`).toMatch(/shell|command/i);
		expect(`${unit?.trustTier ?? ""}`).toMatch(/interactive_untrusted/i);
	});

	// E21 — strict/overnight reject shell before spawn
	test("rejects shell gates before spawn under strict and overnight profiles", async () => {
		for (const trustProfile of ["strict", "overnight"] as const) {
			const plan = buildPlan({
				enabled: true,
				trustProfile,
				requiredGateKinds: ["unit"],
				commands: { unit: "bun test" },
			});
			let spawned = 0;
			const result = await runQualityGatePlan({
				cwd: "/project",
				plan,
				execute: async ({ command }) => {
					spawned += 1;
					return { command, exitCode: 0, summary: "PASS" };
				},
			});
			expect(spawned).toBe(0);
			expect(result.ok).toBe(false);
			const unit = result.results.find((g) => g.kind === "unit") as unknown as {
				status: string;
				policyRejected?: boolean;
				trustTier?: string;
				exitCode?: number;
			};
			expect(unit?.policyRejected).toBe(true);
			expect(unit?.status).not.toBe("passed");
			// Never represent rejection as exit-zero success
			expect(unit?.status === "passed" && unit?.exitCode === 0).toBe(false);
			expect(`${unit?.trustTier ?? ""} ${unit?.status}`).toMatch(
				/policy|rejected|untrusted|failed|unavailable/i,
			);
		}
	});

	// E22 — trusted argv can pass under strict
	test("allows trusted argv gate to pass under strict profile", async () => {
		const plan = buildPlan({
			enabled: true,
			trustProfile: "strict",
			requiredGateKinds: ["unit"],
			executors: {
				unit: {
					kind: "argv",
					version: 1,
					file: "bun",
					args: ["test"],
				},
			},
		});
		const unitGate = plan.gates.find((g) => g.kind === "unit") as unknown as {
			executorKind?: string;
			trustTier?: string;
			executor?: { kind?: string; file?: string; args?: string[] };
		};
		// Plan must surface argv executor + trusted tier before execution (no test-side defaults).
		expect(unitGate?.executorKind ?? unitGate?.executor?.kind).toMatch(/argv/i);
		expect(unitGate?.trustTier).toMatch(/trusted|strict/i);
		expect(unitGate?.executor?.file ?? "").toBe("bun");

		const result = await runQualityGatePlan({
			cwd: "/project",
			plan,
			execute: async (input) => {
				const command =
					typeof (input as { command?: string }).command === "string"
						? (input as { command: string }).command
						: "bun test";
				return { command, exitCode: 0, summary: "PASS" };
			},
		});
		const unit = result.results.find((g) => g.kind === "unit") as unknown as {
			status: string;
			executorKind?: string;
			trustTier?: string;
			policyRejected?: boolean;
		};
		expect(unit?.policyRejected).not.toBe(true);
		expect(unit?.status).toBe("passed");
		expect(unit?.executorKind).toMatch(/argv/i);
		expect(unit?.trustTier).toMatch(/trusted|strict/i);
		expect(result.ok).toBe(true);
	});

	// E23 / E36 — unknown internal fails closed; no fabricated FIT/SEC adapters
	test("fails closed for unknown internal check ids", async () => {
		const plan = buildPlan({
			enabled: true,
			trustProfile: "strict",
			requiredGateKinds: ["doctor"],
			executors: {
				doctor: { kind: "internal", id: "fit01.unknown-check" },
			},
		});
		const result = await runQualityGatePlan({
			cwd: "/project",
			plan,
			execute: async ({ command }) => ({ command, exitCode: 0, summary: "PASS" }),
		});
		expect(result.ok).toBe(false);
		const doctor = result.results.find((g) => g.kind === "doctor");
		expect(doctor?.status === "passed").toBe(false);
		expect(["failed", "unavailable"]).toContain(doctor?.status);
		expect(doctor?.summary ?? "").not.toMatch(/fabricated|pretend|success/i);
	});

	// E24 — executor-sensitive fingerprints
	test("plan fingerprints differ for otherwise-equal shell and argv executors", () => {
		const shellPlan = buildPlan({
			enabled: true,
			requiredGateKinds: ["unit"],
			executors: { unit: { kind: "shell", command: "bun test" } },
		});
		const argvPlan = buildPlan({
			enabled: true,
			requiredGateKinds: ["unit"],
			executors: {
				unit: { kind: "argv", version: 1, file: "bun", args: ["test"] },
			},
		});
		expect(shellPlan.fingerprint).toMatch(/^[a-f0-9]{64}$/);
		expect(argvPlan.fingerprint).toMatch(/^[a-f0-9]{64}$/);
		expect(argvPlan.fingerprint).not.toBe(shellPlan.fingerprint);
	});

	// E42 — shell executor cannot self-label trusted
	test("forces shell executor self-labeled trusted down to interactive_untrusted", () => {
		const plan = buildPlan({
			enabled: true,
			trustProfile: "interactive",
			requiredGateKinds: ["unit"],
			executors: {
				unit: { kind: "shell", command: "bun test", trustTier: "trusted" },
			},
		});
		const unit = plan.gates.find((g) => g.kind === "unit") as unknown as {
			executorKind?: string;
			trustTier?: string;
			executor?: { trustTier?: string; kind?: string };
		};
		expect(unit?.executorKind ?? unit?.executor?.kind).toMatch(/shell/i);
		expect(unit?.trustTier).toMatch(/interactive_untrusted/i);
		expect(unit?.trustTier).not.toMatch(/^trusted$/i);
		// Nested executor label must also be forced, not left as a forged trusted tier.
		if (unit?.executor?.trustTier != null) {
			expect(unit.executor.trustTier).toMatch(/interactive_untrusted/i);
		}
	});

	// E44 — strict/overnight argv kind without valid matching argv executor rejects before spawn
	test("rejects strict argv-kind gate without valid matching argv executor before spawn", async () => {
		for (const trustProfile of ["strict", "overnight"] as const) {
			const base = buildPlan({
				enabled: true,
				trustProfile,
				requiredGateKinds: ["unit"],
				executors: {
					unit: { kind: "argv", version: 1, file: "bun", args: ["test"] },
				},
			});
			// Forge: claim argv kind but strip/mismatch the argv executor so shell fallback would otherwise run.
			const forgedPlan = {
				...base,
				gates: base.gates.map((gate) =>
					gate.kind === "unit"
						? {
								...gate,
								availability: "ready" as const,
								executorKind: "argv" as const,
								command: "bun test",
								// mismatched executor shape — shell, not argv
								executor: { kind: "shell" as const, command: "bun test" },
						  }
						: gate,
				),
			};
			let spawned = 0;
			const result = await runQualityGatePlan({
				cwd: "/project",
				plan: forgedPlan as never,
				execute: async ({ command }) => {
					spawned += 1;
					return { command, exitCode: 0, summary: "PASS" };
				},
			});
			expect(spawned).toBe(0);
			expect(result.ok).toBe(false);
			const unit = result.results.find((g) => g.kind === "unit") as unknown as {
				status: string;
				policyRejected?: boolean;
				exitCode?: number;
			};
			expect(unit?.policyRejected).toBe(true);
			expect(unit?.status).not.toBe("passed");
			expect(unit?.status === "passed" && unit?.exitCode === 0).toBe(false);
		}
	});
});

describe("assurance handoff trust gaps (BDD-01 R9 via quality-gates)", () => {
	const passedUnit = {
		id: "quality:unit",
		kind: "unit" as const,
		required: true,
		status: "passed" as const,
		command: "bun test",
		exitCode: 0,
		summary: "PASS",
	};

	const baseEvidence = (): BddEvidence => ({
		red: {
			command: "bun test",
			exitCode: 1,
			summary: "FAIL",
			at: "2026-07-26T09:00:00.000Z",
		},
		green: {
			command: "bun test",
			exitCode: 0,
			summary: "PASS",
			at: "2026-07-26T10:00:00.000Z",
		},
		acceptance: { ref: "docs/plans/work-packages/BDD-01.feature", at: "2026-07-26T10:00:00.000Z" },
	});

	// E28 — untrusted required gate
	test("reports gap when required gate result is untrusted", () => {
		const value = baseEvidence();
		value.assurance = {
			profileFingerprint: "profile-1",
			planFingerprint: "plan-1",
			startedAt: "2026-07-26T10:01:00.000Z",
			completedAt: "2026-07-26T10:02:00.000Z",
			ok: true,
			results: [
				{
					...passedUnit,
					// additive trust fields the implementer must honor
					...( {
						trustTier: "interactive_untrusted",
						executorKind: "shell",
					} as object),
				} as typeof passedUnit,
			],
		};
		const gaps = assuranceHandoffGaps(value, {
			enabled: true,
			expectedPlanFingerprint: "plan-1",
			expectedRequiredGateKinds: ["unit"],
		} as never);
		expect(gaps.join(" ")).toMatch(/untrusted|trust|assurance/i);
	});

	// E27 — stale config fingerprint
	test("reports gap when assurance config fingerprint is stale", () => {
		const value = baseEvidence();
		value.assurance = {
			profileFingerprint: "profile-1",
			planFingerprint: "plan-1",
			startedAt: "2026-07-26T10:01:00.000Z",
			completedAt: "2026-07-26T10:02:00.000Z",
			ok: true,
			results: [passedUnit],
			...( {
				configFingerprint: "old-config-fp",
			} as object),
		} as BddEvidence["assurance"] & { configFingerprint?: string };
		const gaps = assuranceHandoffGaps(value, {
			enabled: true,
			expectedPlanFingerprint: "plan-1",
			expectedRequiredGateKinds: ["unit"],
			expectedConfigFingerprint: "new-config-fp",
		} as never);
		expect(gaps.join(" ")).toMatch(/config fingerprint|stale-config|stale config/i);
	});

	// E43 — shell executor kind with forged trusted tier is still untrusted
	test("reports untrusted executor-kind gap for shell result forged as trusted", () => {
		const value = baseEvidence();
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
		const gaps = assuranceHandoffGaps(value, {
			enabled: true,
			expectedPlanFingerprint: "plan-1",
			expectedRequiredGateKinds: ["unit"],
		} as never);
		expect(gaps.join(" ")).toMatch(/untrusted|executor|shell|trust/i);
	});
});

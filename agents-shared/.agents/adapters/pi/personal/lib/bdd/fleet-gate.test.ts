import { describe, expect, test } from "bun:test";
import {
	assertFleetAllowed,
	assertSubagentLaunchAllowed,
	isMultiAgentSubagentLaunch,
	normalizeFleetKind,
} from "./fleet-gate.ts";

describe("normalizeFleetKind", () => {
	test("aliases", () => {
		expect(normalizeFleetKind("research")).toBe("research");
		expect(normalizeFleetKind("code-review")).toBe("review");
		expect(normalizeFleetKind("ui")).toBe("ux");
		expect(normalizeFleetKind("nope")).toBe("unknown");
	});
});

describe("assertFleetAllowed R1/R5", () => {
	test("R5-E1: planning always allowed in green", () => {
		expect(
			assertFleetAllowed({
				phase: "green",
				enabled: true,
				kind: "review",
				planningOnly: true,
			}).allowed,
		).toBe(true);
	});

	test("R1-E1: green blocks review launch", () => {
		const r = assertFleetAllowed({
			phase: "green",
			enabled: true,
			kind: "review",
		});
		expect(r.allowed).toBe(false);
		expect(r.reason).toMatch(/verify/i);
	});

	test("R1-E2: verify allows review", () => {
		expect(
			assertFleetAllowed({
				phase: "verify",
				enabled: true,
				kind: "review",
			}).allowed,
		).toBe(true);
	});

	test("red/green/refactor ban all kinds", () => {
		for (const phase of ["red", "green", "refactor"] as const) {
			for (const kind of ["research", "review", "ux", "custom"] as const) {
				expect(
					assertFleetAllowed({ phase, enabled: true, kind }).allowed,
					`${phase}/${kind}`,
				).toBe(false);
			}
		}
	});

	test("discovery allows research only", () => {
		expect(
			assertFleetAllowed({ phase: "discovery", enabled: true, kind: "research" }).allowed,
		).toBe(true);
		expect(
			assertFleetAllowed({ phase: "discovery", enabled: true, kind: "review" }).allowed,
		).toBe(false);
	});

	test("formulation allows research + ux", () => {
		expect(
			assertFleetAllowed({ phase: "formulation", enabled: true, kind: "ux" }).allowed,
		).toBe(true);
		expect(
			assertFleetAllowed({ phase: "formulation", enabled: true, kind: "review" }).allowed,
		).toBe(false);
	});

	test("off or disabled allows all", () => {
		expect(
			assertFleetAllowed({ phase: "green", enabled: false, kind: "review" }).allowed,
		).toBe(true);
		expect(
			assertFleetAllowed({ phase: "off", enabled: true, kind: "review" }).allowed,
		).toBe(true);
	});

	test("fleet bypass allows launch; path bypass is separate (not passed)", () => {
		expect(
			assertFleetAllowed({
				phase: "green",
				enabled: true,
				kind: "review",
				fleetBypass: true,
			}).allowed,
		).toBe(true);
	});
});

describe("isMultiAgentSubagentLaunch / assertSubagentLaunchAllowed", () => {
	test("R1-E3: multi tasks blocked in red", () => {
		const params = {
			tasks: [
				{ agent: "scout", task: "a" },
				{ agent: "scout", task: "b" },
			],
		};
		expect(isMultiAgentSubagentLaunch(params)).toBe(true);
		const r = assertSubagentLaunchAllowed({
			phase: "red",
			enabled: true,
			params,
		});
		expect(r.allowed).toBe(false);
	});

	test("R1-E4: single agent allowed in red", () => {
		const params = { agent: "scout", task: "look" };
		expect(isMultiAgentSubagentLaunch(params)).toBe(false);
		expect(
			assertSubagentLaunchAllowed({
				phase: "red",
				enabled: true,
				params,
			}).allowed,
		).toBe(true);
	});

	test("count>1 is multi", () => {
		expect(
			isMultiAgentSubagentLaunch({
				tasks: [{ agent: "reviewer", task: "x", count: 3 }],
			}),
		).toBe(true);
	});

	test("chain parallel group is multi", () => {
		expect(
			isMultiAgentSubagentLaunch({
				chain: [{ parallel: [{ agent: "a", task: "1" }, { agent: "b", task: "2" }] }],
			}),
		).toBe(true);
	});

	test("management action not multi launch", () => {
		expect(isMultiAgentSubagentLaunch({ action: "status" })).toBe(false);
	});
});

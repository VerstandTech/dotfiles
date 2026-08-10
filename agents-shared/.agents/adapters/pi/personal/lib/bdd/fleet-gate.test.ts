import { describe, expect, test } from "bun:test";
import { buildFleetPlan } from "../fleet/plan.ts";
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

	test("WorkflowScript fanout is blocked during one-writer phases", () => {
		const plan = buildFleetPlan({
			kind: "research",
			topic: "R10 workflowScript one-writer",
			count: 5,
			concurrency: 2,
		});
		const params = plan.subagentParams as unknown as Record<string, unknown>;
		expect(typeof params.workflowScript).toBe("string");
		expect(String(params.workflowScript)).toContain("runs.all(");

		// Causal red signature required by CMP-02 ValidationContractV1 / R10.
		if (!isMultiAgentSubagentLaunch(params)) {
			throw new Error("WorkflowScript fleet fanout is still allowed during red");
		}

		for (const phase of ["red", "green", "refactor"] as const) {
			const blocked = assertSubagentLaunchAllowed({
				phase,
				enabled: true,
				params,
			});
			expect(blocked.allowed, `${phase} must block WorkflowScript fanout`).toBe(false);
			expect(blocked.reason ?? "").toMatch(/multi-agent|one writer|fanout/i);
		}

		// Explicit fleet bypass still works during one-writer phases.
		expect(
			assertSubagentLaunchAllowed({
				phase: "red",
				enabled: true,
				params,
				fleetBypass: true,
			}).allowed,
		).toBe(true);

		// True one-child runs.run remains allowed (not multi fanout).
		const singleChild = {
			workflowScript:
				"return runs.run('main', { agent: 'fleet-researcher', task: 'solo look' });",
			async: true as const,
			context: "fresh" as const,
		};
		expect(isMultiAgentSubagentLaunch(singleChild)).toBe(false);
		expect(
			assertSubagentLaunchAllowed({
				phase: "red",
				enabled: true,
				params: singleChild,
			}).allowed,
		).toBe(true);

		// Management / control actions stay non-launches even with other noise fields.
		expect(isMultiAgentSubagentLaunch({ action: "status" })).toBe(false);
		expect(isMultiAgentSubagentLaunch({ action: "list" })).toBe(false);
		expect(
			isMultiAgentSubagentLaunch({
				action: "schedule.create",
				workflowScript: "return runs.all([]);",
			}),
		).toBe(false);
		expect(
			assertSubagentLaunchAllowed({
				phase: "red",
				enabled: true,
				params: { action: "status" },
			}).allowed,
		).toBe(true);
	});

	test("handcrafted WorkflowScript runs.all is multi-agent fanout", () => {
		const handcrafted = {
			workflowScript: [
				"const items = [",
				"  { key: 'a', agent: 'fleet-researcher', task: 'one' },",
				"  { key: 'b', agent: 'fleet-researcher', task: 'two' },",
				"];",
				"return runs.all(items);",
			].join("\n"),
			async: true as const,
			context: "fresh" as const,
		};
		if (!isMultiAgentSubagentLaunch(handcrafted)) {
			throw new Error("WorkflowScript fleet fanout is still allowed during red");
		}
		expect(
			assertSubagentLaunchAllowed({
				phase: "green",
				enabled: true,
				params: handcrafted,
			}).allowed,
		).toBe(false);
	});
});

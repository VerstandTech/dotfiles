import { describe, expect, test } from "bun:test";
import {
	defaultAgentForKind,
	expandPersonas,
	RESEARCH_PERSONAS,
	REVIEW_PERSONAS,
	UX_PERSONAS,
} from "./personas.ts";

const CANONICAL = new Set(["fleet-researcher", "fleet-reviewer", "fleet-ux"]);

describe("expandPersonas", () => {
	test("returns exact count from library", () => {
		const p = expandPersonas("research", 5);
		expect(p).toHaveLength(5);
		expect(p[0]!.id).toBe(RESEARCH_PERSONAS[0]!.id);
	});

	test("cycles with variant suffix past library size", () => {
		const n = RESEARCH_PERSONAS.length + 3;
		const p = expandPersonas("research", n);
		expect(p).toHaveLength(n);
		expect(p[RESEARCH_PERSONAS.length]!.id).toContain("-v2");
	});

	test("rejects invalid count", () => {
		expect(() => expandPersonas("review", 0)).toThrow();
		expect(() => expandPersonas("review", 1.5)).toThrow();
	});

	test("custom kind uses provided canonical personas", () => {
		const p = expandPersonas("custom", 2, [
			{ id: "a", label: "A", angle: "aa", agent: "fleet-researcher" },
			{ id: "b", label: "B", angle: "bb", agent: "fleet-reviewer" },
		]);
		expect(p.map((x) => x.agent)).toEqual(["fleet-researcher", "fleet-reviewer"]);
	});
});

// ---------------------------------------------------------------------------
// SEC-00 review remediation — persona libraries stay contained
// ---------------------------------------------------------------------------
describe("SEC-00 review R2 > persona libraries and fallbacks are canonical", () => {
	test("research local-scout uses fleet-researcher; count 12 library is fully canonical", () => {
		expect(RESEARCH_PERSONAS.length, "research library size stays 12").toBe(12);
		const localScout = RESEARCH_PERSONAS.find((p) => p.id === "local-scout");
		expect(localScout, "local-scout persona must exist").toBeDefined();
		expect(
			localScout!.agent,
			"research local-scout must use fleet-researcher (scout override is uncontained)",
		).toBe("fleet-researcher");

		for (const persona of RESEARCH_PERSONAS) {
			expect(
				CANONICAL.has(persona.agent),
				`research persona ${persona.id} agent ${persona.agent} must be canonical`,
			).toBe(true);
		}

		const expanded = expandPersonas("research", 12);
		expect(expanded).toHaveLength(12);
		expect(expanded.every((p) => p.agent === "fleet-researcher")).toBe(true);
		expect(expanded.find((p) => p.id === "local-scout")?.agent).toBe("fleet-researcher");
	});

	test("review/ux libraries and custom fallback default to canonical fleet agents", () => {
		for (const persona of REVIEW_PERSONAS) {
			expect(persona.agent, `review ${persona.id}`).toBe("fleet-reviewer");
		}
		for (const persona of UX_PERSONAS) {
			expect(persona.agent, `ux ${persona.id}`).toBe("fleet-ux");
		}

		expect(defaultAgentForKind("research")).toBe("fleet-researcher");
		expect(defaultAgentForKind("review")).toBe("fleet-reviewer");
		expect(defaultAgentForKind("ux")).toBe("fleet-ux");
		expect(
			defaultAgentForKind("custom"),
			"custom fallback must be canonical fleet-reviewer (not bare reviewer/scout/worker)",
		).toBe("fleet-reviewer");

		const fallback = expandPersonas("custom", 3);
		expect(fallback).toHaveLength(3);
		for (const persona of fallback) {
			expect(
				persona.agent,
				`custom fallback persona ${persona.id} must be canonical`,
			).toBe("fleet-reviewer");
		}
	});
});

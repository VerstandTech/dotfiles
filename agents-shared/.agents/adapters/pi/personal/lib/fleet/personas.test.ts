import { describe, expect, test } from "bun:test";
import { expandPersonas, RESEARCH_PERSONAS } from "./personas.ts";

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

	test("custom kind uses provided personas", () => {
		const p = expandPersonas("custom", 2, [
			{ id: "a", label: "A", angle: "aa", agent: "scout" },
			{ id: "b", label: "B", angle: "bb", agent: "reviewer" },
		]);
		expect(p.map((x) => x.agent)).toEqual(["scout", "reviewer"]);
	});
});

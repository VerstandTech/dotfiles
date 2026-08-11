import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const roles = [
	"specifier",
	"test-designer",
	"implementer",
	"breaker",
	"fitness-guardian",
	"refactorer",
	"qa",
] as const;

function agent(role: (typeof roles)[number]): string {
	return readFileSync(resolve(import.meta.dir, "../../agents", `bdd-${role}.md`), "utf8");
}

/** Strip markdown emphasis so isolation checks match plain carrier text. */
function plainCarrier(text: string): string {
	return text.replace(/\*\*([^*]+)\*\*/g, "$1").replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, "$1");
}

describe("packaged high-assurance agents", () => {
	test("every bounded role has a fresh-context agent definition", () => {
		for (const role of roles) {
			const text = agent(role);
			expect(text).toContain(`name: bdd-${role}`);
			expect(text).toContain("defaultContext: fresh");
			expect(text).toContain("inheritSkills: false");
			expect(plainCarrier(text)).toMatch(/Do not (run|launch|delegate to) subagents/i);
		}
	});

	test("read-only roles have no edit or write tools", () => {
		for (const role of ["specifier", "breaker", "fitness-guardian", "qa"] as const) {
			const frontmatter = agent(role).split("---")[1] ?? "";
			const tools = frontmatter.match(/^tools:\s*(.+)$/m)?.[1] ?? "";
			expect(tools).not.toMatch(/\b(edit|write)\b/);
			expect(frontmatter).toContain("acceptanceRole: read-only");
		}
	});

	test("writer roles are serial and explicitly scoped", () => {
		expect(agent("test-designer")).toMatch(/only specification and test paths/i);
		expect(agent("implementer")).toMatch(/must not modify tests/i);
		expect(agent("refactorer")).toMatch(/behavior must remain unchanged/i);
	});

	test("test designer contract locks writable paths, plain no-delegation, and layered oracles", () => {
		const text = agent("test-designer");
		// R4 — only specification/test paths are writable; production and deploy paths forbidden.
		expect(text).toMatch(/only specification and test paths/i);
		expect(text).toMatch(/production implementation/i);
		// R5 — plain carrier must include run, launch, and delegate; fleets are in scope.
		// Markdown emphasis alone must not be the only machine-checked form.
		expect(text).toMatch(/Do not run, launch, or delegate to subagents or fleets/);
		// R6 — layered oracle responsibilities (selective by risk).
		for (const phrase of ["contracts/invariants", "fuzz", "differential", "golden-master"]) {
			expect(text).toContain(phrase);
		}
	});
});

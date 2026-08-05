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

describe("packaged high-assurance agents", () => {
	test("every bounded role has a fresh-context agent definition", () => {
		for (const role of roles) {
			const text = agent(role);
			expect(text).toContain(`name: bdd-${role}`);
			expect(text).toContain("defaultContext: fresh");
			expect(text).toContain("inheritSkills: false");
			expect(text).toMatch(/Do not (run|launch|delegate to) subagents/i);
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
});

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

const role01OwnedRoles = [
	"specifier",
	"test-designer",
	"implementer",
	"breaker",
	"refactorer",
	"qa",
] as const;

const role01Skills = [
	"bdd-tdd",
	"caid",
	"trajectory",
	"ship",
	"herdr-delivery-supervisor",
] as const;

const ROLE01_FAILURE = "ROLE01_ROLE_CONTRACT_MISSING";

const launchProfiles = {
	specifier: { tools: "read, grep, find, ls", maxTokens: 120_000, maxCostUsd: 3, maxDurationMs: 600_000 },
	"test-designer": { tools: "read, grep, find, ls, edit, write, bash", maxTokens: 180_000, maxCostUsd: 5, maxDurationMs: 900_000 },
	implementer: { tools: "read, grep, find, ls, edit, write, bash", maxTokens: 180_000, maxCostUsd: 5, maxDurationMs: 900_000 },
	breaker: { tools: "read, grep, find, ls", maxTokens: 120_000, maxCostUsd: 3, maxDurationMs: 600_000 },
	refactorer: { tools: "read, grep, find, ls, edit, write, bash", maxTokens: 120_000, maxCostUsd: 3, maxDurationMs: 600_000 },
	qa: { tools: "read, grep, find, ls", maxTokens: 120_000, maxCostUsd: 3, maxDurationMs: 600_000 },
} as const;

function agent(role: (typeof roles)[number]): string {
	return readFileSync(resolve(import.meta.dir, "../../agents", `bdd-${role}.md`), "utf8");
}

function skill(name: (typeof role01Skills)[number]): string {
	return readFileSync(resolve(import.meta.dir, "../../skills", name, "SKILL.md"), "utf8");
}

function frontmatter(text: string): string {
	return text.split("---")[1] ?? "";
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
			const metadata = frontmatter(agent(role));
			const tools = metadata.match(/^tools:\s*(.+)$/m)?.[1] ?? "";
			expect(tools).not.toMatch(/\b(edit|write)\b/);
			expect(metadata).toContain("acceptanceRole: read-only");
		}
	});

	test("writer roles are serial and explicitly scoped", () => {
		expect(agent("test-designer")).toMatch(/only specification and test paths/i);
		expect(agent("implementer")).toMatch(/must not modify tests/i);
		expect(agent("refactorer")).toMatch(/behavior must remain unchanged/i);
	});

	test("test designer contract locks writable paths, plain no-delegation, and layered oracles", () => {
		const text = agent("test-designer");
		// BASE-01 R4 — only specification/test paths are writable; production and deploy paths forbidden.
		expect(text).toMatch(/only specification and test paths/i);
		expect(text).toMatch(/production implementation/i);
		// BASE-01 R5 — plain carrier must include run, launch, and delegate; fleets are in scope.
		// Markdown emphasis alone must not be the only machine-checked form.
		expect(text).toMatch(/Do not run, launch, or delegate to subagents or fleets/);
		// BASE-01 R6 — layered oracle responsibilities (selective by risk).
		for (const phrase of ["contracts/invariants", "fuzz", "differential", "golden-master"]) {
			expect(text).toContain(phrase);
		}
	});

	test(`${ROLE01_FAILURE}: owned roles require bounded V1 request and result contracts`, () => {
		for (const role of role01OwnedRoles) {
			const text = agent(role);
			const metadata = frontmatter(text);
			const expected = launchProfiles[role];
			const message = `${ROLE01_FAILURE}: bdd-${role}`;

			expect(text, `${message} missing version`).toMatch(/Role contract v1/i);
			expect(text, `${message} missing request`).toContain("RoleRequestV1");
			expect(text, `${message} missing result`).toContain("RoleResultV1");
			expect(text, `${message} missing schema`).toContain("schemaVersion: 1");
			for (const field of [
				"taskId",
				"goal",
				"locked inputs",
				"ownedPaths",
				"forbiddenPaths",
				"commands",
				"evidenceRefs",
				"changedPaths",
				"residualRisks",
				"status",
			] as const) {
				expect(text, `${message} missing ${field}`).toContain(field);
			}
			expect(text, `${message} missing ambiguity stop`).toMatch(/High-risk ambiguity blocks/i);
			expect(text, `${message} missing authority boundary`).toMatch(/does not grant|no authority/i);
			expect(text, `${message} missing no-delegation`).toContain(
				"Do not run, launch, or delegate to subagents or fleets",
			);

			expect(metadata, `${message} model`).toContain("model: xai/grok-4.5");
			expect(metadata, `${message} thinking`).toContain("thinking: high");
			expect(metadata, `${message} tools`).toContain(`tools: ${expected.tools}`);
			expect(metadata, `${message} timeout`).toContain(`timeoutMs: ${expected.maxDurationMs}`);
			expect(text, `${message} token ceiling`).toContain(`maxTokens=${expected.maxTokens}`);
			expect(text, `${message} cost ceiling`).toContain(`maxCostUsd=${expected.maxCostUsd}`);
			expect(text, `${message} duration ceiling`).toContain(
				`maxDurationMs=${expected.maxDurationMs}`,
			);
		}
	});

	test(`${ROLE01_FAILURE}: role separation and reviewer no-mutation rules are explicit`, () => {
		const designer = agent("test-designer");
		const implementer = agent("implementer");
		expect(designer, `${ROLE01_FAILURE}: Test Designer production-write guard`).toContain(
			"Test Designer must not modify production implementation",
		);
		expect(implementer, `${ROLE01_FAILURE}: Implementer test-write guard`).toContain(
			"Implementer must not modify tests",
		);

		for (const role of ["specifier", "breaker", "qa"] as const) {
			const tools = frontmatter(agent(role)).match(/^tools:\s*(.+)$/m)?.[1] ?? "";
			expect(tools, `${ROLE01_FAILURE}: bdd-${role} mutation tool`).not.toMatch(
				/\b(edit|write|bash|subagent)\b/,
			);
		}
	});

	test(`${ROLE01_FAILURE}: orchestration skills validate V1 handoffs without authority claims`, () => {
		for (const name of role01Skills) {
			const text = skill(name);
			const message = `${ROLE01_FAILURE}: ${name}`;
			expect(text, `${message} boundary`).toMatch(/Role contract boundary \(V1\)/i);
			expect(text, `${message} request`).toContain("RoleRequestV1");
			expect(text, `${message} result`).toContain("RoleResultV1");
			expect(text, `${message} validation`).toMatch(/validat(?:e|ed|ion)/i);
			expect(text, `${message} authority`).toMatch(/does not grant|grant no/i);
		}
	});
});

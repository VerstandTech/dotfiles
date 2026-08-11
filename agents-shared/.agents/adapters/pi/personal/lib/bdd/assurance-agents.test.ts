import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ROLE_WRITE_SCOPE_MATRIX } from "../contracts/limits.ts";
import { roleContract } from "./assurance-cycle.ts";

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
const ROLE01_MATRIX_FAILURE = "ROLE01_ROLE_MATRIX_DRIFT";

const launchProfiles = {
	specifier: { tools: ["read", "grep", "find", "ls"], maxTokens: 120_000, maxCostUsd: 3, maxDurationMs: 600_000 },
	"test-designer": { tools: ["read", "grep", "find", "ls", "edit", "write", "bash"], maxTokens: 180_000, maxCostUsd: 5, maxDurationMs: 900_000 },
	implementer: { tools: ["read", "grep", "find", "ls", "edit", "write", "bash"], maxTokens: 180_000, maxCostUsd: 5, maxDurationMs: 900_000 },
	breaker: { tools: ["read", "grep", "find", "ls"], maxTokens: 120_000, maxCostUsd: 3, maxDurationMs: 600_000 },
	refactorer: { tools: ["read", "grep", "find", "ls", "edit", "write", "bash"], maxTokens: 120_000, maxCostUsd: 3, maxDurationMs: 600_000 },
	qa: { tools: ["read", "grep", "find", "ls"], maxTokens: 120_000, maxCostUsd: 3, maxDurationMs: 600_000 },
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

function frontmatterValue(text: string, key: string): string {
	const matches = [...frontmatter(text).matchAll(new RegExp(`^${key}:\\s*(.+)$`, "gm"))];
	if (matches.length !== 1 || !matches[0]?.[1]) {
		throw new Error(`${ROLE01_MATRIX_FAILURE}: expected exactly one ${key} field`);
	}
	return matches[0][1].trim();
}

function parseBudgetCeiling(text: string): {
	maxTokens: number;
	maxCostUsd: number;
	maxDurationMs: number;
} {
	const matches = [
		...text.matchAll(
			/budget ceiling maxTokens=(\d+), maxCostUsd=(\d+(?:\.\d+)?), maxDurationMs=(\d+)/g,
		),
	];
	if (matches.length !== 1) {
		throw new Error(`${ROLE01_MATRIX_FAILURE}: expected exactly one numeric budget ceiling`);
	}
	return {
		maxTokens: Number(matches[0]![1]),
		maxCostUsd: Number(matches[0]![2]),
		maxDurationMs: Number(matches[0]![3]),
	};
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

			expect(frontmatterValue(text, "model"), `${message} model`).toBe("xai/grok-4.5");
			expect(frontmatterValue(text, "thinking"), `${message} thinking`).toBe("high");
		}
	});

	test(`${ROLE01_MATRIX_FAILURE}: frontmatter launch profiles and live role matrices stay exact`, () => {
		for (const role of role01OwnedRoles) {
			const expected = launchProfiles[role];
			const text = agent(role);
			const message = `${ROLE01_MATRIX_FAILURE}: bdd-${role}`;
			const actualTools = frontmatterValue(text, "tools").split(",").map((tool) => tool.trim());
			const timeoutMs = Number(frontmatterValue(text, "timeoutMs"));
			const budget = parseBudgetCeiling(text);

			expect(actualTools, `${message} frontmatter tools`).toEqual(expected.tools);
			expect(timeoutMs, `${message} timeoutMs`).toBe(expected.maxDurationMs);
			expect(Number.isSafeInteger(timeoutMs), `${message} timeout must be an integer`).toBe(true);
			expect(budget, `${message} budget ceiling`).toEqual({
				maxTokens: expected.maxTokens,
				maxCostUsd: expected.maxCostUsd,
				maxDurationMs: expected.maxDurationMs,
			});
			expect(budget.maxDurationMs, `${message} timeout/budget drift`).toBe(timeoutMs);
		}

		for (const role of ["breaker", "qa"] as const) {
			const expected = ["read", "grep", "find", "ls"];
			expect(roleContract(role).tools, `${ROLE01_MATRIX_FAILURE}: ${role} roleContract`).toEqual(expected);
			expect(
				ROLE_WRITE_SCOPE_MATRIX[role].tools,
				`${ROLE01_MATRIX_FAILURE}: ${role} contract matrix`,
			).toEqual(expected);
		}
	});

	test(`${ROLE01_MATRIX_FAILURE}: specifier request declares no-write scope`, () => {
		const text = agent("specifier");
		expect(text, `${ROLE01_MATRIX_FAILURE}: missing no-write`).toMatch(/no-write/i);
		expect(text, `${ROLE01_MATRIX_FAILURE}: missing exact write scope`).toContain("writeScope: none");
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

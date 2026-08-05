import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
	HIGH_ASSURANCE_PLAYBOOK,
	formatHighAssurancePlaybookReference,
} from "./playbook.ts";

const packageRoot = join(import.meta.dir, "../..");
const readPackageFile = (path: string) => readFileSync(join(packageRoot, path), "utf8");

describe("canonical high-assurance playbook", () => {
	test("contains the complete July 2026 v1.0 structure", () => {
		const playbook = readPackageFile("docs/high-assurance-playbook.md");
		expect(playbook).toContain("# High-Assurance Multi-Agent Software Development Playbook");
		expect(playbook).toContain("**Achieving Process Determinism with AI Coding Agents**");
		expect(playbook).toContain("*Version 1.0 — July 2026*");
		for (let section = 1; section <= 13; section += 1) {
			expect(playbook).toMatch(new RegExp(`^## ${section}\\. `, "m"));
		}
		for (const subsection of [
			"### 13.1 Trajectory & Process Evaluation",
			"### 13.2 Cost, Latency & Resource Budgets",
			"### 13.3 Shared Persistent Context & Project Memory",
			"### 13.4 Security & Supply-Chain Gates",
			"### 13.5 Explicit Human-in-the-Loop Approval Seams",
			"### 13.6 Documentation & Decision Artifacts as Pipeline Outputs",
			"### 13.7 Chaos & Resilience Testing",
			"### 13.8 Agent Skill, Prompt & Schema Regression Suite",
		]) {
			expect(playbook).toContain(subsection);
		}
		expect(playbook).toContain("The process itself becomes the primary source of determinism.");
		expect(playbook).toContain("*Document generated and refined collaboratively, July 2026.*");
	});

	test("keeps Pi implementation claims separate from the normative playbook", () => {
		const profile = readPackageFile("docs/high-assurance-pi-implementation.md");
		expect(profile).toContain("# Pi Implementation Profile for the High-Assurance Playbook");
		expect(profile).toContain("## Enforced now");
		expect(profile).toContain("## Configurable through deterministic project commands");
		expect(profile).toContain("## Roadmap / not yet enforced");
		expect(profile).toContain("never installs");
	});
});

describe("playbook discovery surfaces", () => {
	test("returns deterministic versioned paths and policy", () => {
		expect(HIGH_ASSURANCE_PLAYBOOK).toEqual({
		version: "1.0",
		published: "July 2026",
		canonicalPath: "docs/high-assurance-playbook.md",
		implementationPath: "docs/high-assurance-pi-implementation.md",
	});
		const output = formatHighAssurancePlaybookReference();
		expect(output).toContain("High-Assurance Multi-Agent Software Development Playbook v1.0");
		expect(output).toContain(HIGH_ASSURANCE_PLAYBOOK.canonicalPath);
		expect(output).toContain(HIGH_ASSURANCE_PLAYBOOK.implementationPath);
		expect(output).toContain("never installs");
		expect(output).toContain("configured local commands");
	});

	test("is linked and operationalized by extensions and skills", () => {
		const bddSkill = readPackageFile("skills/bdd-tdd/SKILL.md");
		const shipSkill = readPackageFile("skills/ship/SKILL.md");
		const readme = readPackageFile("extensions/README.md");
		const extension = readPackageFile("extensions/bdd-mode.ts");
		for (const content of [bddSkill, shipSkill, readme]) {
			expect(content).toContain("docs/high-assurance-playbook.md");
			expect(content).toContain("docs/high-assurance-pi-implementation.md");
		}
		expect(bddSkill).toContain("schema-constrained handoffs");
		expect(bddSkill).toContain("Human merge authority");
		expect(shipSkill).toContain("Plan approval");
		expect(shipSkill).toContain("Findings approval");
		expect(shipSkill).toContain("Diff approval");
		expect(readme).toContain("`/bdd playbook`");
		expect(readme).toContain("`bdd_playbook`");
		expect(extension).toContain('name: "bdd_playbook"');
		expect(extension).toContain('cmd === "playbook"');
	});
});

describe("bounded roles reflect the layered oracle model", () => {
	test("test design, fitness, and QA cover their independent playbook responsibilities", () => {
		const designer = readPackageFile("agents/bdd-test-designer.md");
		const guardian = readPackageFile("agents/bdd-fitness-guardian.md");
		const qa = readPackageFile("agents/bdd-qa.md");
		for (const phrase of ["contracts/invariants", "fuzz", "differential", "golden-master"]) {
			expect(designer).toContain(phrase);
		}
		for (const phrase of [
			"complexity/CRAP",
			"duplication",
			"supply-chain",
			"semantic stability",
			"cost/latency",
			"formal",
			"replay",
		]) {
			expect(guardian).toContain(phrase);
		}
		expect(qa).toContain("bounded chaos");
		expect(qa).toContain("human exploratory testing");
	});
});

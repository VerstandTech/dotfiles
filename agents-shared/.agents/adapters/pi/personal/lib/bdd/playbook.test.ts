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
	test("contains the complete August 2026 v1.2 structure", () => {
		const playbook = readPackageFile("docs/high-assurance-playbook.md");
		expect(playbook).toContain("# High-Assurance Multi-Agent Software Development Playbook");
		expect(playbook).toContain("**Achieving Process Determinism with AI Coding Agents**");
		expect(playbook).toContain("*Version 1.2 — August 2026*");
		expect(playbook).toContain("## Changelog (1.0 → 1.2)");
		for (let section = 1; section <= 20; section += 1) {
			expect(playbook).toMatch(new RegExp(`^## ${section}\\. `, "m"));
		}
		expect(playbook).toContain("## Closing");
		expect(playbook).toContain("The process itself is the primary source of determinism.");
		expect(playbook).toContain("*VerstandTech · Document refined collaboratively · August 2026 · v1.2*");
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
	test("reports the canonical v1.2 runtime metadata", () => {
		expect(HIGH_ASSURANCE_PLAYBOOK.version).toBe("1.2");
		expect(HIGH_ASSURANCE_PLAYBOOK.published).toBe("August 2026");
		expect(HIGH_ASSURANCE_PLAYBOOK.canonicalPath).toBe("docs/high-assurance-playbook.md");
		expect(HIGH_ASSURANCE_PLAYBOOK.implementationPath).toBe(
			"docs/high-assurance-pi-implementation.md",
		);
		expect(HIGH_ASSURANCE_PLAYBOOK).toEqual({
			version: "1.2",
			published: "August 2026",
			canonicalPath: "docs/high-assurance-playbook.md",
			implementationPath: "docs/high-assurance-pi-implementation.md",
		});
		const output = formatHighAssurancePlaybookReference();
		expect(output).toContain("High-Assurance Multi-Agent Software Development Playbook v1.2");
		expect(output).toContain("Published: August 2026");
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

describe("secondary package operator docs", () => {
	test("secondary package docs advertise only current canonical metadata", () => {
		const cheatsheet = readPackageFile("docs/bdd-fleet-cheatsheet.md");
		const exampleMap = readPackageFile("docs/high-assurance-example-map.md");
		const roadmap = readPackageFile("docs/agentic-bdd-roadmap.md");
		const canonicalPlaybook = readPackageFile("docs/high-assurance-playbook.md");

		// Reject exact stale current-policy claims first (causal red signature).
		expect(cheatsheet).not.toContain("Canonical v1.0 policy");
		expect(roadmap).not.toContain("Canonical v1.0 policy");
		expect(exampleMap).not.toContain(
			"The July 2026 playbook is canonical and versioned",
		);
		expect(exampleMap).not.toContain("all thirteen numbered sections");
		expect(exampleMap).not.toMatch(/sections 1[–-]13/);

		// E14 — /bdd playbook row advertises current canonical policy only.
		expect(cheatsheet).toMatch(
			/\| `\/bdd playbook` \| Canonical v1\.2 policy \+ honest Pi implementation profile \|/
		);

		// E15 — package Example Map current canonical rule tracks August 2026 / v1.2 / 1–20.
		expect(exampleMap).toMatch(/August 2026/);
		expect(exampleMap).toMatch(/\bv1\.2\b/);
		expect(exampleMap).toMatch(/sections 1[–-]20/);

		// E16 — shipped roadmap layer advertises current canonical policy only.
		expect(roadmap).toContain(
			"Canonical v1.2 policy + separate enforced/configurable/roadmap implementation profile",
		);

		// Historical v1.0 remains allowed in the canonical changelog, not as current policy.
		expect(canonicalPlaybook).toContain("## Changelog (1.0 → 1.2)");
		expect(canonicalPlaybook).toContain("*Version 1.2 — August 2026*");
	});
});

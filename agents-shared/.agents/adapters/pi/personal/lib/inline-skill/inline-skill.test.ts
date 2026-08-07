import { describe, expect, test } from "bun:test";
import {
	applyTokenCompletion,
	buildSkillBlock,
	expandInlineSkills,
	extractInlineSkillToken,
	filterSkills,
	skillsFromCommands,
	stripSkillFrontmatter,
	type SkillRef,
} from "./inline-skill.ts";

const skills: SkillRef[] = [
	{
		name: "bdd-tdd",
		description: "BDD then TDD workflow",
		filePath: "/skills/bdd-tdd/SKILL.md",
		baseDir: "/skills/bdd-tdd",
	},
	{
		name: "ship",
		description: "Ship a story end to end",
		filePath: "/skills/ship/SKILL.md",
		baseDir: "/skills/ship",
	},
	{
		name: "caid",
		description: "Isolated multi-agent worktrees",
		filePath: "/skills/caid/SKILL.md",
		baseDir: "/skills/caid",
	},
];

const byName = new Map(skills.map((s) => [s.name, s]));
const bodies = new Map([
	["bdd-tdd", "# BDD\nDo the map."],
	["ship", "# Ship\nGo."],
	["caid", "# CAID\nIsolate."],
]);

describe("extractInlineSkillToken", () => {
	test("ignores line-start slash commands", () => {
		expect(extractInlineSkillToken("/skill:bdd")).toBeNull();
		expect(extractInlineSkillToken("/sk")).toBeNull();
		expect(extractInlineSkillToken("  /skill:x")).toBeNull();
	});

	test("detects mid-line progressive /skill prefixes", () => {
		expect(extractInlineSkillToken("please /s")?.prefix).toBe("/s");
		expect(extractInlineSkillToken("please /skill")?.kind).toBe("slash");
		expect(extractInlineSkillToken("please /skill:bd")?.nameQuery).toBe("bd");
	});

	test("$ trigger works at line start and mid-line", () => {
		expect(extractInlineSkillToken("$")?.kind).toBe("dollar");
		expect(extractInlineSkillToken("$bd")?.nameQuery).toBe("bd");
		expect(extractInlineSkillToken("use $skill:ship")?.nameQuery).toBe("ship");
		expect(extractInlineSkillToken("use $")?.kind).toBe("dollar");
	});

	test("@skill progressive, not bare @path", () => {
		expect(extractInlineSkillToken("@skill:")?.kind).toBe("at-skill");
		expect(extractInlineSkillToken("@skill:bd")?.nameQuery).toBe("bd");
		expect(extractInlineSkillToken("@sk")?.kind).toBe("at-skill");
		// @src should NOT match (would steal file completion) — @s matches progressive
		// but @src has trailing c which fails $
		expect(extractInlineSkillToken("@src/foo")).toBeNull();
		expect(extractInlineSkillToken("@file")).toBeNull();
	});

	test("does not match unrelated slash paths", () => {
		expect(extractInlineSkillToken("open /Users/foo")).toBeNull();
		expect(extractInlineSkillToken("run /sudo")).toBeNull();
	});
});

describe("filterSkills", () => {
	test("filters by name prefix", () => {
		const items = filterSkills(skills, "bd");
		expect(items.map((i) => i.value)).toEqual(["/skill:bdd-tdd"]);
	});

	test("empty query returns skills as /skill:name", () => {
		const items = filterSkills(skills, "");
		expect(items.length).toBe(3);
		expect(items.every((i) => i.value.startsWith("/skill:"))).toBe(true);
	});
});

describe("expandInlineSkills", () => {
	const read = (s: SkillRef) => bodies.get(s.name) ?? null;

	test("pure start form with args matches built-in shape", () => {
		const { text, expanded } = expandInlineSkills(
			"/skill:ship do the thing",
			byName,
			read,
		);
		expect(expanded).toEqual(["ship"]);
		expect(text).toContain('<skill name="ship"');
		expect(text).toContain("do the thing");
	});

	test("mid-prompt /skill expansion keeps surrounding text", () => {
		const { text, expanded } = expandInlineSkills(
			"Please follow /skill:bdd-tdd carefully for this bug.",
			byName,
			read,
		);
		expect(expanded).toEqual(["bdd-tdd"]);
		expect(text.startsWith("Please follow ")).toBe(true);
		expect(text.endsWith(" carefully for this bug.")).toBe(true);
	});

	test("expands $skill: and @skill: forms", () => {
		const a = expandInlineSkills("go $skill:ship now", byName, read);
		expect(a.expanded).toEqual(["ship"]);
		expect(a.text).toContain('<skill name="ship"');
		expect(a.text).not.toContain("$skill:");

		const b = expandInlineSkills("go @skill:caid now", byName, read);
		expect(b.expanded).toEqual(["caid"]);
		expect(b.text).not.toContain("@skill:");
	});

	test("bare $name expands only for known skills", () => {
		const a = expandInlineSkills("use $ship please", byName, read);
		expect(a.expanded).toEqual(["ship"]);
		expect(a.text).toContain('<skill name="ship"');

		const b = expandInlineSkills("echo $HOME", byName, read);
		expect(b.expanded).toEqual([]);
		expect(b.missing).toEqual([]);
		expect(b.text).toContain("$HOME");
	});

	test("readBody null leaves text and records missing", () => {
		const r = expandInlineSkills("x /skill:ship y", byName, () => null);
		expect(r.text).toContain("/skill:ship");
		expect(r.missing).toEqual(["ship"]);
		expect(r.expanded).toEqual([]);
	});

	test("multiple mentions", () => {
		const { expanded } = expandInlineSkills(
			"use /skill:ship and $skill:caid together",
			byName,
			read,
		);
		expect(expanded.sort()).toEqual(["caid", "ship"]);
	});

	test("unknown skill left intact", () => {
		const { text, missing } = expandInlineSkills(
			"try /skill:nope now",
			byName,
			read,
		);
		expect(text).toContain("/skill:nope");
		expect(missing).toEqual(["nope"]);
	});
});

describe("applyTokenCompletion", () => {
	test("replaces mid-line $ prefix with /skill:name", () => {
		const lines = ["use $bd here"];
		const cursorCol = "use $bd".length;
		const result = applyTokenCompletion(
			lines,
			0,
			cursorCol,
			"/skill:bdd-tdd",
			"$bd",
		);
		expect(result.lines[0]).toBe("use /skill:bdd-tdd here");
	});

	test("replaces mid-line /sk prefix", () => {
		const lines = ["use /sk here"];
		const cursorCol = "use /sk".length;
		const result = applyTokenCompletion(
			lines,
			0,
			cursorCol,
			"/skill:ship",
			"/sk",
		);
		expect(result.lines[0]).toBe("use /skill:ship here");
	});
});

describe("skillsFromCommands", () => {
	test("maps skill commands", () => {
		const refs = skillsFromCommands([
			{
				name: "skill:bdd-tdd",
				description: "BDD",
				source: "skill",
				sourceInfo: { path: "/x/SKILL.md", baseDir: "/x" },
			},
			{ name: "goal", source: "extension", sourceInfo: { path: "/e.ts" } },
		]);
		expect(refs).toEqual([
			{
				name: "bdd-tdd",
				description: "BDD",
				filePath: "/x/SKILL.md",
				baseDir: "/x",
			},
		]);
	});
});

describe("buildSkillBlock / frontmatter", () => {
	test("includes location and body", () => {
		const block = buildSkillBlock(skills[0]!, "# Hi");
		expect(block).toContain('name="bdd-tdd"');
		expect(block).toContain("# Hi");
	});

	test("strips yaml fence", () => {
		expect(stripSkillFrontmatter("---\nname: x\n---\n\n# Hello\n").trim()).toBe(
			"# Hello",
		);
		expect(stripSkillFrontmatter("# only")).toBe("# only");
	});
});

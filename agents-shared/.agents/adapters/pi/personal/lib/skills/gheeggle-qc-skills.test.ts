import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dir, "../../../../../../..");
const skills = resolve(root, "agents-shared/.agents/skills");
const approved = [
  "add-linear-feature",
  "qc-user-story-to-linear-issue",
  "voyager-qc-task-implementation",
] as const;

function skillText(name: (typeof approved)[number]): string {
  const directory = resolve(skills, name);
  const path = resolve(directory, "SKILL.md");
  expect(existsSync(path), `missing ${name}/SKILL.md`).toBe(true);
  const text = readFileSync(path, "utf8");
  expect(text).toMatch(new RegExp(`^name:\\s*${name}\\s*$`, "m"));
  expect(existsSync(resolve(directory, "agents/openai.yaml"))).toBe(true);
  return text.toLowerCase();
}

describe("GHEEGGLE-SKILLS-01 repository contract", () => {
  test("pins the approved skill set in a versioned manifest", () => {
    const path = resolve(skills, "gheeggle-qc-skills.manifest.json");
    expect(existsSync(path), "missing versioned Gheeggle skill manifest").toBe(true);
    expect(JSON.parse(readFileSync(path, "utf8"))).toEqual({
      version: 1,
      skills: approved,
    });
  });

  test("retains complete skill resources and safety evidence", () => {
    for (const name of approved) skillText(name);

    const linearScripts = resolve(skills, "add-linear-feature/scripts");
    expect(existsSync(resolve(linearScripts, "validate_features.py"))).toBe(true);
    expect(existsSync(resolve(linearScripts, "test_validate_features.py"))).toBe(true);

    const qc = skillText("qc-user-story-to-linear-issue");
    expect(qc).toContain("mandatory approval gate");
    expect(qc).toContain("explicit user approval");
    const qcReferences = resolve(skills, "qc-user-story-to-linear-issue/references");
    expect(existsSync(resolve(qcReferences, "issue-template.md"))).toBe(true);
    expect(existsSync(resolve(qcReferences, "mcp-coverage-template.md"))).toBe(true);

    const voyager = skillText("voyager-qc-task-implementation");
    for (const phrase of [
      "deterministic seeds",
      "rewardkit",
      "provenance",
      "focused harbor",
      "final-head ci evidence",
    ]) {
      expect(voyager).toContain(phrase);
    }
    const voyagerReferences = resolve(skills, "voyager-qc-task-implementation/references");
    expect(existsSync(resolve(voyagerReferences, "authoring.md"))).toBe(true);
    expect(existsSync(resolve(voyagerReferences, "validation-and-ci.md"))).toBe(true);
  });
});

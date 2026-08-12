import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const STORES = new Map<string, { red?: { command: string; exitCode: number; summary: string }; green?: { command: string; exitCode: number; summary: string } }>();

function path(value: unknown): value is string {
  return typeof value === "string" && value.startsWith("/") && !value.includes("\\") && !value.split("/").includes("..");
}

export function bindWorktreeEvidenceV1(input: Readonly<{ worktreePath: string; parentPath: string; evidence: { red?: { command: string; exitCode: number; summary: string }; green?: { command: string; exitCode: number; summary: string } } }>) {
  if (!path(input.worktreePath) || !path(input.parentPath) || input.worktreePath === input.parentPath) return Object.freeze({ ok: false as const, code: "unknown" as const });
  const evidence = structuredClone(input.evidence);
  STORES.set(input.worktreePath, evidence);
  const storePath = join(input.worktreePath, ".pi", "bdd-evidence.json");
  mkdirSync(join(input.worktreePath, ".pi"), { recursive: true });
  writeFileSync(storePath, `${JSON.stringify(evidence)}\n`);
  return Object.freeze({ ok: true as const, worktreePath: input.worktreePath, storePath });
}

export function readWorktreeEvidenceV1(input: Readonly<{ worktreePath: string }>) {
  if (!path(input.worktreePath)) return Object.freeze({ ok: false as const, code: "unknown" as const });
  if (STORES.has(input.worktreePath)) return Object.freeze({ ok: true as const, evidence: structuredClone(STORES.get(input.worktreePath)) });
  try {
    const stored = JSON.parse(readFileSync(join(input.worktreePath, ".pi", "bdd-evidence.json"), "utf8"));
    return Object.freeze({ ok: true as const, evidence: stored });
  } catch {
    return Object.freeze({ ok: false as const, code: "unknown" as const });
  }
}

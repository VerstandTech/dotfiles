import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

type Api = typeof import("./worktree-evidence");
let api: Api;
try { api = await import("./worktree-evidence"); }
catch { api = { bindWorktreeEvidenceV1: () => { throw new Error("CLOSE01_WORKTREE_EVIDENCE_MISSING"); }, readWorktreeEvidenceV1: () => { throw new Error("CLOSE01_WORKTREE_EVIDENCE_MISSING"); } } as unknown as Api; }

describe("CLOSE-01 worktree-bound BDD evidence", () => {
  test("CLOSE01_WORKTREE_EVIDENCE_MISSING: recorded red/green stay bound to the recording worktree", () => {
    const worktree = "/tmp/closeout-worktree";
    const parent = "/tmp/closeout-parent";
    const recorded = api.bindWorktreeEvidenceV1({
      worktreePath: worktree,
      parentPath: parent,
      evidence: {
        red: { command: "bun test red", exitCode: 1, summary: "CLOSE01_WORKTREE_EVIDENCE_MISSING" },
        green: { command: "bun test green", exitCode: 0, summary: "0 fail" },
      },
    });
    expect(recorded.ok).toBe(true);
    expect(api.readWorktreeEvidenceV1({ worktreePath: worktree }).evidence.red?.summary).toBe("CLOSE01_WORKTREE_EVIDENCE_MISSING");
    expect(api.readWorktreeEvidenceV1({ worktreePath: parent }).ok).toBe(false);
    expect(api.readWorktreeEvidenceV1({ worktreePath: parent }).code).toBe("unknown");
  });

  test("CLOSE01_WORKTREE_DISK_BINDING: evidence is stored under the recording worktree, not the parent checkout", () => {
    const worktree = "/tmp/closeout-disk-worktree";
    const result = api.bindWorktreeEvidenceV1({
      worktreePath: worktree,
      parentPath: "/tmp/closeout-disk-parent",
      evidence: { red: { command: "bun test red", exitCode: 1, summary: "disk" } },
    });
    expect(result.storePath).toBe(`${worktree}/.pi/bdd-evidence.json`);
  });

  test("CLOSE01_WORKTREE_DISK_WRITE: binder writes closed evidence under the recording worktree", () => {
    const worktree = mkdtempSync(join(tmpdir(), "close01-evidence-"));
    const parent = mkdtempSync(join(tmpdir(), "close01-parent-"));
    try {
      const result = api.bindWorktreeEvidenceV1({
        worktreePath: worktree,
        parentPath: parent,
        evidence: { red: { command: "bun test red", exitCode: 1, summary: "disk-write" } },
      });
      expect(result.ok).toBe(true);
      expect(existsSync(`${worktree}/.pi/bdd-evidence.json`)).toBe(true);
      const stored = JSON.parse(readFileSync(`${worktree}/.pi/bdd-evidence.json`, "utf8"));
      expect(stored.red.summary).toBe("disk-write");
      expect(existsSync(`${parent}/.pi/bdd-evidence.json`)).toBe(false);
    } finally {
      rmSync(worktree, { recursive: true, force: true });
      rmSync(parent, { recursive: true, force: true });
    }
  });
});

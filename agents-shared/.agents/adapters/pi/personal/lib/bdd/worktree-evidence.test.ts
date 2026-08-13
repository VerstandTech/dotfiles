import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { planOpsEvidenceV1 } from "../closeout/closeout-plan.ts";

type Api = typeof import("./worktree-evidence");
let api: Api;
try { api = await import("./worktree-evidence"); }
catch {
	api = {
		bindWorktreeEvidenceV1: () => { throw new Error("CLOSE01_WORKTREE_EVIDENCE_MISSING"); },
		readWorktreeEvidenceV1: () => { throw new Error("CLOSE01_WORKTREE_EVIDENCE_MISSING"); },
	} as unknown as Api;
}

const packageRoot = join(import.meta.dir, "../..");
const bddModeSource = () => readFileSync(join(packageRoot, "extensions/bdd-mode.ts"), "utf8");

function closedEvidence(label: string) {
	return {
		red: { command: `bun test ${label}-red`, exitCode: 1, summary: `${label}-red` },
		green: { command: `bun test ${label}-green`, exitCode: 0, summary: `${label}-green` },
	};
}

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

describe("ISSUE-29 bdd-mode worktree evidence wiring", () => {
	test("ISSUE29_BDD_MODE_WIRES_WORKTREE_STORE: assert and handoff call the worktree binder", () => {
		const source = bddModeSource();
		// Keep the expected-red identity in the assertion so bun reports it on fail.
		expect(source.includes("ISSUE29_BDD_MODE_WIRES_WORKTREE_STORE") || source.includes("bindWorktreeEvidenceV1")).toBe(true);
		expect(source).toMatch(/bindWorktreeEvidenceV1/);
		expect(source).toMatch(/readWorktreeEvidenceV1/);
		expect(source).toMatch(/resolveRecordingWorktreeV1|resolveWorktreeIdentityV1/);
		const persistIdx = source.indexOf("function persist(");
		expect(persistIdx).toBeGreaterThanOrEqual(0);
		expect(source.slice(persistIdx, persistIdx + 1_200)).toMatch(/bindWorktreeEvidenceV1/);
		const redIdx = source.indexOf('name: "bdd_assert_red"');
		const greenIdx = source.indexOf('name: "bdd_assert_green"');
		const handoffIdx = source.indexOf('name: "bdd_handoff"');
		expect(source.slice(redIdx, greenIdx)).toMatch(/bindWorktreeEvidenceV1|persistWorktreeEvidence|syncWorktreeEvidence/);
		expect(source.slice(greenIdx, handoffIdx)).toMatch(/bindWorktreeEvidenceV1|persistWorktreeEvidence|syncWorktreeEvidence/);
		expect(source.slice(handoffIdx, handoffIdx + 2_500)).toMatch(/readWorktreeEvidenceV1|handoffWorktreeEvidenceV1/);
	});

	test("ISSUE29_HANDOFF_SURVIVES_PARENT_VERIFY: worktree handoff keeps recorded red/green after empty parent session", () => {
		const worktree = mkdtempSync(join(tmpdir(), "issue29-worktree-"));
		const parent = mkdtempSync(join(tmpdir(), "issue29-parent-"));
		try {
			const recorded = api.bindWorktreeEvidenceV1({
				worktreePath: worktree,
				parentPath: parent,
				evidence: closedEvidence("issue29-survive"),
			});
			expect(recorded.ok).toBe(true);
			const parentSession = { evidence: {} };
			const handoff = api.handoffWorktreeEvidenceV1({
				cwd: worktree,
				parentPath: parent,
				sessionEvidence: parentSession.evidence,
			});
			expect(handoff.ok).toBe(true);
			expect(handoff.evidence?.red?.command).toBe("bun test issue29-survive-red");
			expect(handoff.evidence?.green?.command).toBe("bun test issue29-survive-green");
			expect(existsSync(`${parent}/.pi/bdd-evidence.json`)).toBe(false);
		} finally {
			rmSync(worktree, { recursive: true, force: true });
			rmSync(parent, { recursive: true, force: true });
		}
	});

	test("ISSUE29_PARENT_CANNOT_CLAIM_OR_CLEAR: parent persist/handoff leave the worktree store alone", () => {
		const worktree = mkdtempSync(join(tmpdir(), "issue29-claim-wt-"));
		const parent = mkdtempSync(join(tmpdir(), "issue29-claim-parent-"));
		try {
			expect(api.bindWorktreeEvidenceV1({
				worktreePath: worktree,
				parentPath: parent,
				evidence: closedEvidence("issue29-claim"),
			}).ok).toBe(true);
			const parentBind = api.bindWorktreeEvidenceV1({
				worktreePath: parent,
				parentPath: parent,
				evidence: closedEvidence("parent-claim"),
			});
			expect(parentBind.ok).toBe(false);
			expect(parentBind.code).toBe("unknown");
			const parentHandoff = api.handoffWorktreeEvidenceV1({
				cwd: parent,
				parentPath: parent,
				sessionEvidence: {},
			});
			expect(parentHandoff.ok).toBe(false);
			expect(parentHandoff.code).toBe("unknown");
			expect(parentHandoff.evidence?.red).toBeUndefined();
			expect(parentHandoff.evidence?.green).toBeUndefined();
			const stored = JSON.parse(readFileSync(`${worktree}/.pi/bdd-evidence.json`, "utf8"));
			expect(stored.red.summary).toBe("issue29-claim-red");
			expect(existsSync(`${parent}/.pi/bdd-evidence.json`)).toBe(false);
		} finally {
			rmSync(worktree, { recursive: true, force: true });
			rmSync(parent, { recursive: true, force: true });
		}
	});

	test("ISSUE29_MISSING_IDENTITY_UNKNOWN: unresolvable worktree identity is never empty success", () => {
		const missing = api.resolveRecordingWorktreeV1({
			cwd: "relative/not/a/worktree",
			parentPath: "/tmp/issue29-parent",
		});
		expect(missing.ok).toBe(false);
		expect(missing.code).toBe("unknown");
		const handoff = api.handoffWorktreeEvidenceV1({
			cwd: "relative/not/a/worktree",
			parentPath: "/tmp/issue29-parent",
			sessionEvidence: { red: { command: "invented", exitCode: 1, summary: "no" } },
		});
		expect(handoff.ok).toBe(false);
		expect(handoff.code).toBe("unknown");
		expect(handoff.missing).toContain("unknown");
	});

	test("ISSUE29_RESOLVE_PARENT_UNKNOWN: parent checkout identity stays unknown", () => {
		const parent = "/tmp/issue29-resolve-parent";
		const resolved = api.resolveRecordingWorktreeV1({ cwd: parent, parentPath: parent });
		expect(resolved.ok).toBe(false);
		expect(resolved.code).toBe("unknown");
	});

	test("ISSUE29_OPS01_HISTORICAL_STAYS_MISSING: reconstruction does not invent red/green", () => {
		const result = planOpsEvidenceV1({
			packageId: "OPS-01",
			merged: true,
			rootGreen: true,
			historicalRedGreenAvailable: false,
			acceptanceRef: "docs/plans/work-packages/OPS-01.feature",
		});
		expect(result).toMatchObject({
			ok: true,
			status: "recorded",
			red: "missing",
			green: "missing",
		});
	});
});

import { describe, expect, test } from "bun:test";
import {
	caidBranchName,
	caidCardId,
	caidWorktreePath,
	defaultIsolationForRole,
	detectCaidCollisions,
	emptyCaidBoard,
	formatCaidHandoff,
	isCaidRole,
	planCaidAssignment,
	recommendCaidTarget,
	upsertCaidAssignment,
} from "./caid.ts";
import type { WorktreeBoardState } from "./types.ts";

describe("CAID role helpers", () => {
	test("isCaidRole accepts known roles", () => {
		expect(isCaidRole("test-designer")).toBe(true);
		expect(isCaidRole("hacker")).toBe(false);
	});

	test("strict isolation for test-designer and breaker", () => {
		expect(defaultIsolationForRole("test-designer")).toBe("worktree+fresh-pi");
		expect(defaultIsolationForRole("breaker")).toBe("worktree+fresh-pi");
		expect(defaultIsolationForRole("implementer")).toBe("worktree");
		expect(defaultIsolationForRole("orchestrator")).toBe("shared");
	});

	test("branch and card id are slug-safe", () => {
		expect(caidBranchName("Auth Login!", "test-designer")).toBe(
			"caid/Auth-Login/test-designer",
		);
		expect(caidCardId("Auth Login!", "implementer")).toBe("Auth-Login--implementer");
	});
});

describe("planCaidAssignment", () => {
	test("plans isolated worktree under .worktrees/caid", () => {
		const a = planCaidAssignment("/repo", {
			taskId: "billing-fix",
			role: "test-designer",
			goal: "Write failing tests for invoice rounding",
		});
		expect(a.isolation).toBe("worktree+fresh-pi");
		expect(a.path).toBe("/repo/.worktrees/caid/billing-fix/test-designer");
		expect(a.branch).toContain("test-designer");
		expect(a.handoffMarkdown).toContain("CAID Handoff");
		expect(a.handoffMarkdown).toContain("Write failing tests");
		expect(a.suggestedSkills).toContain("bdd-tdd");
	});

	test("shared isolation uses repo root", () => {
		const a = planCaidAssignment("/repo", {
			taskId: "x",
			role: "orchestrator",
			goal: "Coordinate",
			isolation: "shared",
		});
		expect(a.path).toBe("/repo");
	});

	test("rejects path escape", () => {
		expect(() =>
			planCaidAssignment("/repo", {
				taskId: "x",
				role: "implementer",
				goal: "y",
				path: "/tmp/evil",
			}),
		).toThrow(/under repo root/);
	});
});

describe("detectCaidCollisions", () => {
	test("flags designer + implementer on same path", () => {
		const issues = detectCaidCollisions([
			{
				taskId: "t1",
				role: "test-designer",
				isolation: "worktree",
				path: "/repo/wt",
				branch: "b1",
				cardId: "c1",
				status: "active",
				updatedAt: "t",
			},
			{
				taskId: "t1",
				role: "implementer",
				isolation: "worktree",
				path: "/repo/wt",
				branch: "b2",
				cardId: "c2",
				status: "active",
				updatedAt: "t",
			},
		]);
		expect(issues.some((i) => /Test Designer and Implementer/.test(i))).toBe(true);
	});

	test("ignores done assignments", () => {
		const issues = detectCaidCollisions([
			{
				taskId: "t1",
				role: "test-designer",
				isolation: "worktree",
				path: "/repo/wt",
				branch: "b1",
				cardId: "c1",
				status: "done",
				updatedAt: "t",
			},
			{
				taskId: "t1",
				role: "implementer",
				isolation: "worktree",
				path: "/repo/wt",
				branch: "b2",
				cardId: "c2",
				status: "active",
				updatedAt: "t",
			},
		]);
		expect(issues).toHaveLength(0);
	});
});

describe("upsertCaidAssignment + format", () => {
	test("upserts by taskId+role", () => {
		let board = emptyCaidBoard("/repo");
		const a = planCaidAssignment("/repo", {
			taskId: "feat",
			role: "implementer",
			goal: "impl",
		});
		board = upsertCaidAssignment(board, a, "active");
		expect(board.assignments).toHaveLength(1);
		const a2 = planCaidAssignment("/repo", {
			taskId: "feat",
			role: "implementer",
			goal: "impl again",
		});
		board = upsertCaidAssignment(board, a2, "done");
		expect(board.assignments).toHaveLength(1);
		expect(board.assignments[0]!.status).toBe("done");
	});
});

describe("recommendCaidTarget", () => {
	const board: WorktreeBoardState = {
		repoRoot: "/repo",
		maxBusyWriters: 2,
		cards: [
			{
				id: "main",
				path: "/repo",
				branch: "main",
				busy: "idle",
				updatedAt: "t",
			},
		],
	};

	test("reuses main for shared orchestrator", () => {
		const r = recommendCaidTarget(board, emptyCaidBoard("/repo"), {
			taskId: "t",
			role: "orchestrator",
			goal: "coord",
		});
		expect(r.kind).toBe("reuse");
		if (r.kind === "reuse") expect(r.cardId).toBe("main");
	});

	test("creates for test-designer", () => {
		const r = recommendCaidTarget(board, emptyCaidBoard("/repo"), {
			taskId: "t",
			role: "test-designer",
			goal: "tests",
		});
		expect(r.kind).toBe("create");
		if (r.kind === "create") {
			expect(r.assignment.path).toContain("test-designer");
		}
	});
});

describe("formatCaidHandoff", () => {
	test("includes red lines and role contract", () => {
		const md = formatCaidHandoff({
			taskId: "t",
			role: "test-designer",
			goal: "g",
			isolation: "worktree+fresh-pi",
			branch: "b",
			path: "/p",
			artifactRefs: ["docs/spec.md"],
			constraints: ["no impl"],
			suggestedSkills: ["bdd-tdd"],
		});
		expect(md).toContain("docs/spec.md");
		expect(md).toContain("Human retains final merge authority");
		expect(md).toContain("Write tests only");
	});
});

describe("caidWorktreePath", () => {
	test("nests under .worktrees/caid", () => {
		expect(caidWorktreePath("/repo", "Auth", "qa")).toBe(
			"/repo/.worktrees/caid/Auth/qa",
		);
	});
});

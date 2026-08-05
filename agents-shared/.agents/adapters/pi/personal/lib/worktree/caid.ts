/**
 * CAID — Centralized Asynchronous Isolated Delegation.
 *
 * Assigns high-assurance roles to dedicated git worktrees so Test Designer,
 * Implementer, Critic, etc. never share a writable tree. Pure helpers;
 * worktree creation and board registry updates stay in new-worktree/registry.
 */

import { basename, join, resolve } from "node:path";
import { assertPathUnderRepo, defaultWorktreePath, slugifyBranch } from "./new-worktree.ts";
import type { WorktreeBoardState, WorktreeCard } from "./types.ts";

/** Roles eligible for CAID isolation (playbook separation of powers). */
export const CAID_ROLES = [
	"specifier",
	"test-designer",
	"implementer",
	"breaker",
	"fitness-guardian",
	"refactorer",
	"qa",
	"orchestrator",
] as const;

export type CaidRole = (typeof CAID_ROLES)[number];

/** Isolation strength for a delegated task. */
export type CaidIsolation = "shared" | "worktree" | "worktree+fresh-pi";

export interface CaidTaskSpec {
	/** Stable task / feature id (slug-safe). */
	taskId: string;
	role: CaidRole;
	/** Human-readable goal for the handoff document. */
	goal: string;
	/** Preferred isolation; defaults by role. */
	isolation?: CaidIsolation;
	/** Optional branch name; derived from taskId+role when omitted. */
	branch?: string;
	/** Optional explicit worktree path under repo root. */
	path?: string;
	/** Start point for new branch (default HEAD). */
	startPoint?: string;
	/** Artifact paths the agent may read (handoff refs). */
	artifactRefs?: string[];
	/** Red lines / constraints. */
	constraints?: string[];
	/** Skills the next agent should load. */
	suggestedSkills?: string[];
}

export interface CaidAssignment {
	taskId: string;
	role: CaidRole;
	isolation: CaidIsolation;
	branch: string;
	path: string;
	/** Registry card id suggestion */
	cardId: string;
	goal: string;
	artifactRefs: string[];
	constraints: string[];
	suggestedSkills: string[];
	/** Markdown handoff body for Herdr/Pi spawn */
	handoffMarkdown: string;
	createdAt: string;
}

export interface CaidRegistryEntry {
	taskId: string;
	role: CaidRole;
	isolation: CaidIsolation;
	path: string;
	branch: string;
	cardId: string;
	status: "planned" | "active" | "done" | "failed";
	agentRunId?: string;
	updatedAt: string;
}

export interface CaidBoardFile {
	version: 1;
	/** Absolute repo root */
	repoRoot: string;
	assignments: CaidRegistryEntry[];
}

/** Roles that must not share a writable worktree with the Implementer. */
export const STRICT_ISOLATION_ROLES: readonly CaidRole[] = [
	"test-designer",
	"breaker",
	"fitness-guardian",
	"qa",
];

export function defaultIsolationForRole(role: CaidRole): CaidIsolation {
	if (STRICT_ISOLATION_ROLES.includes(role)) return "worktree+fresh-pi";
	if (role === "implementer" || role === "refactorer") return "worktree";
	if (role === "orchestrator") return "shared";
	return "worktree";
}

export function isCaidRole(value: string): value is CaidRole {
	return (CAID_ROLES as readonly string[]).includes(value);
}

export function caidBranchName(taskId: string, role: CaidRole): string {
	const task = slugifyBranch(taskId);
	return `caid/${task}/${role}`;
}

export function caidCardId(taskId: string, role: CaidRole): string {
	return `${slugifyBranch(taskId)}--${role}`;
}

export function caidWorktreePath(repoRoot: string, taskId: string, role: CaidRole): string {
	const branch = caidBranchName(taskId, role);
	// Prefer .worktrees/caid/<task>/<role> layout for board clarity
	const path = join(resolve(repoRoot), ".worktrees", "caid", slugifyBranch(taskId), role);
	return assertPathUnderRepo(repoRoot, path);
}

export function planCaidAssignment(
	repoRoot: string,
	spec: CaidTaskSpec,
	now?: string,
): CaidAssignment {
	const isolation = spec.isolation ?? defaultIsolationForRole(spec.role);
	const branch = spec.branch ?? caidBranchName(spec.taskId, spec.role);
	const path =
		spec.path != null
			? assertPathUnderRepo(repoRoot, spec.path)
			: isolation === "shared"
				? resolve(repoRoot)
				: caidWorktreePath(repoRoot, spec.taskId, spec.role);
	const cardId = caidCardId(spec.taskId, spec.role);
	const at = now ?? new Date().toISOString();
	const artifactRefs = spec.artifactRefs ?? [];
	const constraints = spec.constraints ?? [];
	const suggestedSkills = spec.suggestedSkills ?? defaultSkillsForRole(spec.role);

	const handoffMarkdown = formatCaidHandoff({
		taskId: spec.taskId,
		role: spec.role,
		goal: spec.goal,
		isolation,
		branch,
		path,
		artifactRefs,
		constraints,
		suggestedSkills,
	});

	return {
		taskId: spec.taskId,
		role: spec.role,
		isolation,
		branch,
		path,
		cardId,
		goal: spec.goal,
		artifactRefs,
		constraints,
		suggestedSkills,
		handoffMarkdown,
		createdAt: at,
	};
}

export function defaultSkillsForRole(role: CaidRole): string[] {
	switch (role) {
		case "test-designer":
			return ["bdd-tdd", "trajectory"];
		case "implementer":
			return ["bdd-tdd", "ship"];
		case "breaker":
			return ["bdd-tdd"];
		case "fitness-guardian":
			return ["bdd-tdd", "trajectory"];
		case "qa":
			return ["bdd-tdd"];
		case "specifier":
			return ["bdd-tdd"];
		case "refactorer":
			return ["bdd-tdd"];
		case "orchestrator":
			return ["caid", "bdd-tdd", "agentic-fleet"];
		default:
			return ["bdd-tdd"];
	}
}

export function formatCaidHandoff(input: {
	taskId: string;
	role: CaidRole;
	goal: string;
	isolation: CaidIsolation;
	branch: string;
	path: string;
	artifactRefs: string[];
	constraints: string[];
	suggestedSkills: string[];
}): string {
	const refs =
		input.artifactRefs.length > 0
			? input.artifactRefs.map((r) => `- \`${r}\``).join("\n")
			: "- _(none — discover from board / AGENTS.md)_";
	const constraints =
		input.constraints.length > 0
			? input.constraints.map((c) => `- ${c}`).join("\n")
			: "- Follow high-assurance playbook isolation rules for this role.";
	const skills =
		input.suggestedSkills.length > 0
			? input.suggestedSkills.map((s) => `- \`${s}\``).join("\n")
			: "- _(none)_";

	return [
		`# CAID Handoff — ${input.role} · ${input.taskId}`,
		``,
		`## Goal`,
		input.goal,
		``,
		`## Isolation`,
		`- mode: \`${input.isolation}\``,
		`- branch: \`${input.branch}\``,
		`- worktree: \`${input.path}\``,
		``,
		`## Artifact refs (do not duplicate content)`,
		refs,
		``,
		`## Constraints`,
		constraints,
		``,
		`## Suggested skills`,
		skills,
		``,
		`## Role contract`,
		roleContractSnippet(input.role),
		``,
		`## Red lines`,
		`- Do not modify tests if you are Implementer/Refactorer.`,
		`- Do not modify production code if you are Test Designer / Specifier / Breaker / Guardian / QA.`,
		`- Do not claim gates passed without command-backed evidence.`,
		`- Human retains final merge authority.`,
		``,
	].join("\n");
}

function roleContractSnippet(role: CaidRole): string {
	const map: Record<CaidRole, string> = {
		specifier: "Produce specs, Gherkin, properties, contracts only. No production code.",
		"test-designer":
			"Write tests only from locked specs. Prefer public interfaces; avoid implementation internals. Prove red.",
		implementer: "Minimum production change to satisfy locked tests. Never edit tests.",
		breaker: "Adversarial read-only review. Hunt weak assertions and mutation survivors.",
		"fitness-guardian": "Run deterministic fitness/gates evidence. Reject structural violations.",
		refactorer: "Improve structure under green behavior. Keep all gates green.",
		qa: "Scripted QA, budgets, concurrency, recovery. Read-only production tree.",
		orchestrator: "Deterministic control flow only. Never implement features as the orchestrator LLM.",
	};
	return map[role];
}

/**
 * Detect collusion risk: same worktree path assigned to conflicting roles.
 */
export function detectCaidCollisions(assignments: CaidRegistryEntry[]): string[] {
	const byPath = new Map<string, CaidRegistryEntry[]>();
	for (const a of assignments) {
		if (a.status === "done" || a.status === "failed") continue;
		const path = resolve(a.path);
		const list = byPath.get(path) ?? [];
		list.push(a);
		byPath.set(path, list);
	}
	const issues: string[] = [];
	for (const [path, list] of byPath) {
		if (list.length < 2) continue;
		const roles = list.map((a) => a.role);
		const hasDesigner = roles.includes("test-designer");
		const hasImplementer = roles.includes("implementer") || roles.includes("refactorer");
		if (hasDesigner && hasImplementer) {
			issues.push(
				`Test Designer and Implementer share worktree ${path} (roles: ${roles.join(", ")})`,
			);
		}
		const writers = list.filter((a) =>
			a.role === "implementer" || a.role === "refactorer" || a.role === "test-designer",
		);
		if (writers.length > 1) {
			issues.push(`Multiple writer roles on ${path}: ${writers.map((w) => w.role).join(", ")}`);
		}
	}
	return issues;
}

export function upsertCaidAssignment(
	board: CaidBoardFile,
	assignment: CaidAssignment,
	status: CaidRegistryEntry["status"] = "planned",
): CaidBoardFile {
	const path = resolve(assignment.path);
	const rest = board.assignments.filter(
		(a) => !(a.taskId === assignment.taskId && a.role === assignment.role),
	);
	const entry: CaidRegistryEntry = {
		taskId: assignment.taskId,
		role: assignment.role,
		isolation: assignment.isolation,
		path,
		branch: assignment.branch,
		cardId: assignment.cardId,
		status,
		updatedAt: assignment.createdAt,
	};
	return {
		version: 1,
		repoRoot: resolve(board.repoRoot),
		assignments: [...rest, entry],
	};
}

export function emptyCaidBoard(repoRoot: string): CaidBoardFile {
	return { version: 1, repoRoot: resolve(repoRoot), assignments: [] };
}

/** Map a CAID assignment onto a worktree board card patch. */
export function caidToCardPatch(assignment: CaidAssignment): Partial<WorktreeCard> & {
	path: string;
	id: string;
	label: string;
	bddPhase?: string;
} {
	return {
		id: assignment.cardId,
		path: assignment.path,
		label: `CAID ${assignment.role}: ${assignment.taskId}`,
		bddPhase: roleToBddPhaseHint(assignment.role),
	};
}

function roleToBddPhaseHint(role: CaidRole): string | undefined {
	switch (role) {
		case "specifier":
			return "discovery";
		case "test-designer":
			return "red";
		case "implementer":
			return "green";
		case "refactorer":
			return "refactor";
		case "breaker":
		case "fitness-guardian":
		case "qa":
			return "verify";
		default:
			return undefined;
	}
}

/**
 * Recommend which existing board card to use, or plan a new worktree.
 */
export function recommendCaidTarget(
	board: WorktreeBoardState,
	caid: CaidBoardFile,
	spec: CaidTaskSpec,
): { kind: "reuse"; cardId: string; path: string } | { kind: "create"; assignment: CaidAssignment } {
	const planned = planCaidAssignment(board.repoRoot, spec);
	if (planned.isolation === "shared") {
		const main = board.cards.find((c) => c.id === "main") ?? board.cards[0];
		if (main) return { kind: "reuse", cardId: main.id, path: main.path };
	}
	const existing = caid.assignments.find(
		(a) =>
			a.taskId === spec.taskId &&
			a.role === spec.role &&
			(a.status === "planned" || a.status === "active"),
	);
	if (existing) {
		const card = board.cards.find((c) => c.id === existing.cardId || c.path === existing.path);
		if (card) return { kind: "reuse", cardId: card.id, path: card.path };
	}
	return { kind: "create", assignment: planned };
}

export function formatCaidBoard(board: CaidBoardFile): string {
	const lines = [
		`# CAID board · ${basename(board.repoRoot)}`,
		``,
		`- assignments: ${board.assignments.length}`,
		``,
	];
	for (const a of board.assignments) {
		lines.push(
			`- **${a.role}** \`${a.taskId}\` [${a.status}/${a.isolation}] \`${a.branch}\` → ${a.path}`,
		);
	}
	const collisions = detectCaidCollisions(board.assignments);
	if (collisions.length) {
		lines.push(``, `## Collisions`, ...collisions.map((c) => `- ⚠️ ${c}`));
	}
	return lines.join("\n");
}

/** Re-export path helper used by CAID for worktree-board integration. */
export { defaultWorktreePath, slugifyBranch };

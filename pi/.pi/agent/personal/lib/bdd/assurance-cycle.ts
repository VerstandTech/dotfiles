import type { BddEvidence, BddPhase } from "./types.ts";
import type { ProjectProfile } from "./project-profile.ts";
import type { QualityGatePlan } from "./quality-gates.ts";

export const ASSURANCE_ROLES = [
	"specifier",
	"test-designer",
	"implementer",
	"breaker",
	"fitness-guardian",
	"refactorer",
	"qa",
] as const;

export type AssuranceRole = (typeof ASSURANCE_ROLES)[number];
export type WriteScope = "none" | "tests" | "production";

export interface RoleContract {
	role: AssuranceRole;
	allowedPhases: BddPhase[];
	writeScope: WriteScope;
	tools: string[];
	objective: string;
	handoff: string;
}

const ROLE_CONTRACTS: Record<AssuranceRole, RoleContract> = {
	specifier: {
		role: "specifier",
		allowedPhases: ["discovery"],
		writeScope: "none",
		tools: ["read", "grep", "find", "ls"],
		objective: "Turn goals into rules, examples, questions, contracts, and executable specification proposals.",
		handoff: "Structured specification only; no tests or production edits.",
	},
	"test-designer": {
		role: "test-designer",
		allowedPhases: ["formulation", "red"],
		writeScope: "tests",
		tools: ["read", "grep", "find", "ls", "edit", "write", "bash"],
		objective: "Independently encode acceptance, unit, property, and trajectory tests from locked specifications.",
		handoff: "Failing tests with a focused red command; production paths untouched.",
	},
	implementer: {
		role: "implementer",
		allowedPhases: ["green"],
		writeScope: "production",
		tools: ["read", "grep", "find", "ls", "edit", "write", "bash"],
		objective: "Make the minimum production change that satisfies locked tests and contracts.",
		handoff: "Changed production files and green evidence; tests unchanged.",
	},
	breaker: {
		role: "breaker",
		allowedPhases: ["verify"],
		writeScope: "none",
		tools: ["read", "grep", "find", "ls", "bash"],
		objective: "Find weak assertions, surviving mutants, adversarial cases, and contract violations.",
		handoff: "Evidence-backed findings and reproduction commands only.",
	},
	"fitness-guardian": {
		role: "fitness-guardian",
		allowedPhases: ["verify"],
		writeScope: "none",
		tools: ["read", "grep", "find", "ls", "bash"],
		objective: "Run deterministic structural, coverage, doctor, architecture, and security gates.",
		handoff: "Gate results, thresholds, blockers, and residual risks; no code edits.",
	},
	refactorer: {
		role: "refactorer",
		allowedPhases: ["refactor"],
		writeScope: "production",
		tools: ["read", "grep", "find", "ls", "edit", "write", "bash"],
		objective: "Improve structure without changing behavior while every locked test remains green.",
		handoff: "Structural diff plus re-run green evidence.",
	},
	qa: {
		role: "qa",
		allowedPhases: ["verify"],
		writeScope: "none",
		tools: ["read", "grep", "find", "ls", "bash"],
		objective: "Exercise scripted user flows, performance budgets, concurrency, and jitter scenarios.",
		handoff: "Observed behavior, commands, artifacts, and unresolved defects.",
	},
};

export function roleContract(role: AssuranceRole): RoleContract {
	return ROLE_CONTRACTS[role];
}

export interface AssuranceStage {
	id: "workspace" | "discovery" | "formulation" | "green" | "refactor" | "verify" | "human";
	roles: AssuranceRole[];
	parallel: boolean;
	gate: string;
}

export interface AssuranceBlueprint {
	version: 1;
	profileFingerprint: string;
	planFingerprint: string;
	stages: AssuranceStage[];
}

export function buildAssuranceBlueprint(
	profile: ProjectProfile,
	plan: QualityGatePlan,
): AssuranceBlueprint {
	return {
		version: 1,
		profileFingerprint: profile.fingerprint,
		planFingerprint: plan.fingerprint,
		stages: [
			{ id: "workspace", roles: [], parallel: false, gate: "Human confirms branch/worktree and one writer." },
			{ id: "discovery", roles: ["specifier"], parallel: false, gate: "Example Map recorded." },
			{ id: "formulation", roles: ["test-designer"], parallel: false, gate: "Focused test fails for the intended reason." },
			{ id: "green", roles: ["implementer"], parallel: false, gate: "Locked red command passes." },
			{ id: "refactor", roles: ["refactorer"], parallel: false, gate: "Behavior remains green." },
			{ id: "verify", roles: ["breaker", "fitness-guardian", "qa"], parallel: true, gate: "Required deterministic gates pass and findings are dispositioned." },
			{ id: "human", roles: [], parallel: false, gate: "Human exploratory review and merge authority." },
		],
	};
}

export type AssuranceAction =
	| { type: "delegate"; role: AssuranceRole }
	| { type: "run-gates" }
	| { type: "handoff" };

export interface AssuranceCycleSnapshot {
	workspaceConfirmed: boolean;
	phase: BddPhase;
	evidence: BddEvidence;
	plan: QualityGatePlan;
}

export function assertAssuranceAction(
	snapshot: AssuranceCycleSnapshot,
	action: AssuranceAction,
): { ok: boolean; reason?: string } {
	if (!snapshot.workspaceConfirmed) {
		return { ok: false, reason: "Assurance workflow requires explicit workspace/one-writer confirmation." };
	}
	if (action.type === "delegate") {
		const contract = roleContract(action.role);
		if (!contract.allowedPhases.includes(snapshot.phase)) {
			return {
				ok: false,
				reason: `Role ${action.role} is not allowed in BDD phase ${snapshot.phase}; allowed: ${contract.allowedPhases.join(", ")}.`,
			};
		}
		if (action.role === "implementer" && (!snapshot.evidence.red || snapshot.evidence.red.exitCode === 0)) {
			return { ok: false, reason: "Implementer requires proven red evidence." };
		}
		return { ok: true };
	}
	if (action.type === "run-gates" && snapshot.phase !== "verify") {
		return { ok: false, reason: "Deterministic assurance gates execute only in verify." };
	}
	if (action.type === "handoff" && !snapshot.evidence.assurance?.ok) {
		return { ok: false, reason: "Handoff requires a passing assurance gate run." };
	}
	return { ok: true };
}

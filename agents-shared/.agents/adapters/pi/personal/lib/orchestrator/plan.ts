import { parseRoleRequestV1, type RoleRequestV1 } from "../contracts/index.ts";
import { planCaidLifecycleV1 } from "../worktree/caid-lifecycle.ts";
import {
	deepFreeze,
	exactKeys,
	isPlainRecord,
	publicError,
	result,
	safeInput,
	validAbsolutePath,
	validStableId,
	validVersion,
	type PlainRecord,
} from "./internal.ts";

const PRIMITIVE = "assurance_plan_role" as const;
const PLAN_KEYS = ["schemaVersion", "planId", "repoRoot", "request", "assignment", "caid"] as const;
const ASSIGNMENT_KEYS = ["taskId", "role", "phase", "isolation", "branch", "path", "cardId"] as const;
const TASK_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

export type ValidPlan = Readonly<{
	schemaVersion: 1;
	planId: string;
	repoRoot: string;
	request: RoleRequestV1;
	assignment: Readonly<{
		taskId: string;
		role: string;
		phase: string;
		isolation: string;
		branch: string;
		path: string;
		cardId: string;
	}>;
	caid: Readonly<{
		taskId: string;
		role: string;
		phase: string;
		isolation: string;
		branch: string;
		path: string;
		cardId: string;
	}>;
}>;

function buildPlan(repoRoot: string, request: RoleRequestV1): ValidPlan | undefined {
	if (!validAbsolutePath(repoRoot) || !TASK_ID.test(request.taskId)) return undefined;
	const planned = planCaidLifecycleV1({
		repoRoot,
		taskId: request.taskId,
		role: request.role,
		goal: request.goal,
	});
	if (!planned.ok || !isPlainRecord(planned.plan)) return undefined;
	const source = planned.plan;
	const cardId = source.cardId;
	const branch = source.branch;
	const path = source.path;
	const isolation = source.isolation;
	if (
		!validStableId(cardId) ||
		typeof branch !== "string" || branch.length === 0 || branch.length > 128 ||
		!validAbsolutePath(path) ||
		(isolation !== "shared" && isolation !== "worktree" && isolation !== "worktree+fresh-pi")
	) return undefined;
	const planId = `orc01-${cardId}`;
	if (!validStableId(planId)) return undefined;
	const assignment = {
		taskId: request.taskId,
		role: request.role,
		phase: request.phase,
		isolation,
		branch,
		path,
		cardId,
	};
	return deepFreeze({
		schemaVersion: 1 as const,
		planId,
		repoRoot,
		request,
		assignment: { ...assignment },
		caid: { ...assignment },
	});
}

export function validatePlan(value: unknown): ValidPlan | undefined {
	const normalized = safeInput(value);
	if (!normalized.ok) return undefined;
	const plan = normalized.value;
	if (!exactKeys(plan, PLAN_KEYS) || !validVersion(plan.schemaVersion)) return undefined;
	if (!isPlainRecord(plan.assignment) || !isPlainRecord(plan.caid)) return undefined;
	if (!exactKeys(plan.assignment, ASSIGNMENT_KEYS) || !exactKeys(plan.caid, ASSIGNMENT_KEYS)) return undefined;
	if (!validAbsolutePath(plan.repoRoot)) return undefined;
	const parsed = parseRoleRequestV1(plan.request);
	if (!parsed.ok) return undefined;
	const expected = buildPlan(plan.repoRoot, parsed.value);
	if (!expected || plan.planId !== expected.planId || plan.repoRoot !== expected.repoRoot) return undefined;
	for (const key of ASSIGNMENT_KEYS) {
		if (plan.assignment[key] !== expected.assignment[key] || plan.caid[key] !== expected.caid[key]) return undefined;
	}
	return expected;
}

export function planRole(input: unknown) {
	const normalized = safeInput(input);
	if (!normalized.ok) return publicError(PRIMITIVE, normalized.code);
	const value = normalized.value;
	if (!exactKeys(value, ["schemaVersion", "repoRoot", "request"])) {
		return publicError(PRIMITIVE, "ORC01_INVALID_INPUT");
	}
	if (!validVersion(value.schemaVersion)) {
		return publicError(PRIMITIVE, "ORC01_UNSUPPORTED_VERSION");
	}
	if (!validAbsolutePath(value.repoRoot)) return publicError(PRIMITIVE, "ORC01_INVALID_INPUT");
	const parsed = parseRoleRequestV1(value.request);
	if (!parsed.ok) return publicError(PRIMITIVE, "ORC01_ROLE_REQUEST_INVALID");
	const plan = buildPlan(value.repoRoot, parsed.value);
	if (!plan) return publicError(PRIMITIVE, "ORC01_ROLE_REQUEST_INVALID");
	return result(PRIMITIVE, true, "planned", "ORC01_ROLE_PLANNED", { plan });
}

export function planRequest(plan: ValidPlan): RoleRequestV1 {
	return plan.request;
}

export function planRecord(plan: ValidPlan): PlainRecord {
	return plan as unknown as PlainRecord;
}

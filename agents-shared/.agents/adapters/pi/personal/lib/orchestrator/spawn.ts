import {
	callAdapter,
	deepFreeze,
	exactKeys,
	isPlainRecord,
	publicError,
	result,
	safeInput,
	validAbsolutePath,
	validBoundedString,
	validFingerprint,
	validInteger,
	validSha,
	validStableId,
	validVersion,
	type PlainRecord,
} from "./internal.ts";
import { validatePlan, type ValidPlan } from "./plan.ts";

const PRIMITIVE = "assurance_spawn_role" as const;
const PROFILES = new Set(["interactive", "strict", "overnight"]);

type SpawnAdapters = Readonly<{
	openWorktree: (request: Readonly<PlainRecord>) => unknown;
	registerRole: (request: Readonly<PlainRecord>) => unknown;
	acquireLease: (request: Readonly<PlainRecord>) => unknown;
	startRole: (request: Readonly<PlainRecord>) => unknown;
	releaseLease: (request: Readonly<PlainRecord>) => unknown;
	unregisterRole: (request: Readonly<PlainRecord>) => unknown;
}>;

function validateSpawnFacts(value: PlainRecord, plan: ValidPlan, candidateSha: string): string | undefined {
	const facts = value.facts;
	if (!isPlainRecord(facts) || !exactKeys(facts, ["bdd", "workspace", "security", "budget", "approval"])) {
		return "ORC01_INVALID_INPUT";
	}
	for (const key of ["bdd", "workspace", "security", "budget", "approval"]) {
		if (!isPlainRecord(facts[key])) return "ORC01_INVALID_INPUT";
	}
	const bdd = facts.bdd as PlainRecord;
	if (!exactKeys(bdd, ["authority", "phase", "spawnPermitted", "current", "planId", "evidenceFingerprint"])) return "ORC01_BDD_AUTHORITY_REQUIRED";
	if (bdd.authority !== "bdd-mode" || bdd.current !== true || !validFingerprint(bdd.evidenceFingerprint)) return "ORC01_BDD_AUTHORITY_REQUIRED";
	if (bdd.planId !== plan.planId) return "ORC01_BDD_AUTHORITY_REQUIRED";
	if (bdd.phase !== plan.request.phase) return "ORC01_BDD_PHASE_MISMATCH";
	if (bdd.spawnPermitted !== true) return "ORC01_BDD_SPAWN_BLOCKED";

	const workspace = facts.workspace as PlainRecord;
	if (!exactKeys(workspace, [
		"authority", "confirmed", "repoRoot", "path", "boardFingerprint", "writerState",
		"pathWriterCount", "busyWriterCount", "maxBusyWriters",
	])) return "ORC01_WRITER_AUTHORITY_REQUIRED";
	if (workspace.authority !== "worktree-board") return "ORC01_WRITER_AUTHORITY_REQUIRED";
	if (workspace.confirmed !== true) return "ORC01_WORKSPACE_UNCONFIRMED";
	if (workspace.repoRoot !== plan.repoRoot || workspace.path !== plan.assignment.path || !validFingerprint(workspace.boardFingerprint)) {
		return "ORC01_WORKSPACE_STALE";
	}
	if (!validInteger(workspace.pathWriterCount, 0, 64) || !validInteger(workspace.busyWriterCount, 0, 64) || !validInteger(workspace.maxBusyWriters, 1, 64)) {
		return "ORC01_WRITER_AUTHORITY_REQUIRED";
	}
	if (workspace.writerState === "unknown") return "ORC01_WRITER_AUTHORITY_REQUIRED";
	const needsWriter = plan.request.writeScope !== "none";
	if (workspace.writerState === "conflict") return "ORC01_SECOND_WRITER";
	if (needsWriter && (workspace.writerState === "held" || workspace.pathWriterCount > 0)) return "ORC01_SECOND_WRITER";
	if (!needsWriter && workspace.writerState !== "available" && workspace.writerState !== "held") return "ORC01_WRITER_AUTHORITY_REQUIRED";
	if (needsWriter && workspace.writerState !== "available") return "ORC01_WRITER_AUTHORITY_REQUIRED";
	if (needsWriter && workspace.busyWriterCount >= workspace.maxBusyWriters) return "ORC01_WRITER_CAPACITY";

	const security = facts.security as PlainRecord;
	const budget = facts.budget as PlainRecord;
	const approval = facts.approval as PlainRecord;
	const authorityKeys = ["authority", "profile", "status", "current", "planId", "fingerprint"] as const;
	if (!exactKeys(security, authorityKeys) || !exactKeys(budget, authorityKeys)) return "ORC01_INVALID_INPUT";
	if (!exactKeys(approval, [...authorityKeys, "candidateSha"])) return "ORC01_APPROVAL_REQUIRED";
	if (!PROFILES.has(String(security.profile)) || !PROFILES.has(String(budget.profile)) || !PROFILES.has(String(approval.profile))) return "ORC01_PROFILE_MISMATCH";
	if (security.profile !== budget.profile || budget.profile !== approval.profile) return "ORC01_PROFILE_MISMATCH";
	for (const fact of [security, budget, approval]) {
		if (fact.current !== true || fact.planId !== plan.planId || !validFingerprint(fact.fingerprint)) {
			if (fact === approval) return "ORC01_APPROVAL_STALE";
			return fact === security ? "ORC01_SECURITY_REQUIRED" : "ORC01_BUDGET_REQUIRED";
		}
	}
	if (security.authority !== "security-policy" || security.status !== "passed") return "ORC01_SECURITY_REQUIRED";
	if (budget.authority !== "cost-budget" || (budget.status !== "ok" && budget.status !== "warn")) return "ORC01_BUDGET_REQUIRED";
	if (approval.authority !== "apr-01" || approval.candidateSha !== candidateSha) return "ORC01_APPROVAL_STALE";
	const profile = security.profile;
	if (profile === "strict" || profile === "overnight") {
		if (approval.status !== "approved") return "ORC01_APPROVAL_REQUIRED";
	} else if (approval.status !== "approved" && approval.status !== "not-required") {
		return approval.status === "stale" ? "ORC01_APPROVAL_STALE" : "ORC01_APPROVAL_REQUIRED";
	}
	return undefined;
}

function adaptersAvailable(value: unknown): value is SpawnAdapters {
	if (!value || typeof value !== "object") return false;
	for (const name of ["openWorktree", "registerRole", "acquireLease", "startRole", "releaseLease", "unregisterRole"]) {
		if (typeof (value as Record<string, unknown>)[name] !== "function") return false;
	}
	return true;
}

function partial(compensated: boolean) {
	return publicError(PRIMITIVE, "ORC01_SPAWN_PARTIAL_FAILURE", "partial-failure", {
		cleanupRequired: true,
		operatorRecoveryRequired: true,
		compensated,
	});
}

function validOpen(value: PlainRecord | undefined, plan: ValidPlan): value is PlainRecord {
	return Boolean(
		value && value.ok === true &&
		(value.status === "opened" || value.status === "existing") &&
		validStableId(value.worktreeId) && validStableId(value.paneId) &&
		value.path === plan.assignment.path,
	);
}

function validRegistration(value: PlainRecord | undefined): value is PlainRecord {
	return Boolean(value && value.ok === true && validStableId(value.registrationId));
}

function validLease(value: PlainRecord | undefined, mode: "writer" | "read-only"): value is PlainRecord {
	return Boolean(value && value.ok === true && validStableId(value.leaseId) && value.mode === mode);
}

function validStart(value: PlainRecord | undefined, paneId: string): value is PlainRecord {
	return Boolean(
		value && value.ok === true && validStableId(value.agentId) && validStableId(value.paneId) &&
		validStableId(value.sessionId) && value.paneId === paneId,
	);
}

async function rollback(callback: unknown, request: PlainRecord): Promise<boolean> {
	const value = await callAdapter(callback, deepFreeze(request));
	return value?.ok === true && Object.keys(value).every((key) => key === "ok");
}

export async function spawnRole(input: unknown, adapters: unknown) {
	const normalized = safeInput(input);
	if (!normalized.ok) return publicError(PRIMITIVE, normalized.code);
	const value = normalized.value;
	if (!exactKeys(value, ["schemaVersion", "plan", "candidateSha", "facts"])) return publicError(PRIMITIVE, "ORC01_INVALID_INPUT");
	if (!validVersion(value.schemaVersion)) return publicError(PRIMITIVE, "ORC01_UNSUPPORTED_VERSION");
	const plan = validatePlan(value.plan);
	if (!plan) return publicError(PRIMITIVE, "ORC01_PLAN_INVALID");
	if (!validSha(value.candidateSha)) return publicError(PRIMITIVE, "ORC01_INVALID_INPUT");
	const preflightCode = validateSpawnFacts(value, plan, value.candidateSha);
	if (preflightCode) return publicError(PRIMITIVE, preflightCode);
	if (!adaptersAvailable(adapters)) return publicError(PRIMITIVE, "ORC01_SPAWN_ADAPTER_UNAVAILABLE", "unavailable");

	const base = deepFreeze({
		planId: plan.planId,
		candidateSha: value.candidateSha,
		request: plan.request,
		assignment: plan.assignment,
	});
	const opened = await callAdapter(adapters.openWorktree, base);
	if (!validOpen(opened, plan)) {
		return opened?.ok === false && opened.partial === false
			? publicError(PRIMITIVE, "ORC01_WORKTREE_OPEN_UNAVAILABLE", "unavailable")
			: partial(false);
	}
	const openContext = deepFreeze({
		...base,
		worktree: {
			worktreeId: opened.worktreeId,
			paneId: opened.paneId,
			path: opened.path,
			status: opened.status,
		},
	});
	const registered = await callAdapter(adapters.registerRole, openContext);
	if (!validRegistration(registered)) return partial(false);
	const registeredContext = deepFreeze({
		...openContext,
		registrationId: registered.registrationId,
	});
	const mode = plan.request.writeScope === "none" ? "read-only" : "writer";
	const leased = await callAdapter(adapters.acquireLease, deepFreeze({ ...registeredContext, mode }));
	if (!validLease(leased, mode)) {
		if (leased?.ok === true && validStableId(leased.leaseId)) {
			const released = await rollback(adapters.releaseLease, {
				planId: plan.planId,
				leaseId: leased.leaseId,
			});
			const unregistered = await rollback(adapters.unregisterRole, {
				planId: plan.planId,
				registrationId: registered.registrationId,
			});
			return partial(released && unregistered);
		}
		if (leased?.ok === false && leased.partial === false) {
			const compensated = await rollback(adapters.unregisterRole, {
				planId: plan.planId,
				registrationId: registered.registrationId,
			});
			return partial(compensated);
		}
		return partial(false);
	}
	const leasedContext = deepFreeze({
		...registeredContext,
		leaseId: leased.leaseId,
		mode,
	});
	const started = await callAdapter(adapters.startRole, leasedContext);
	if (!validStart(started, opened.paneId as string)) {
		if (started?.ok !== false || started.partial !== false) return partial(false);
		const released = await rollback(adapters.releaseLease, {
			planId: plan.planId,
			leaseId: leased.leaseId,
		});
		const unregistered = await rollback(adapters.unregisterRole, {
			planId: plan.planId,
			registrationId: registered.registrationId,
		});
		return partial(released && unregistered);
	}
	return result(PRIMITIVE, true, "spawned", "ORC01_ROLE_SPAWNED", {
		ids: {
			planId: plan.planId,
			worktreeId: opened.worktreeId,
			registrationId: registered.registrationId,
			leaseId: leased.leaseId,
			agentId: started.agentId,
			paneId: started.paneId,
			sessionId: started.sessionId,
		},
	});
}

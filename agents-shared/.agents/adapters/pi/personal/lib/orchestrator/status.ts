import {
	exactKeys,
	isPlainRecord,
	publicError,
	result,
	safeInput,
	validFingerprint,
	validInteger,
	validVersion,
	type PlainRecord,
} from "./internal.ts";

const PRIMITIVE = "assurance_status" as const;
const PHASES = new Set(["discovery", "formulation", "red", "green", "refactor", "verify", "unknown"]);
const COMPONENT_ORDER = ["bdd", "herdr", "worktree", "fleet", "trajectory", "budget"] as const;
type ComponentState = "ready" | "active" | "blocked" | "unknown";

function component(name: string, status: ComponentState, code: string) {
	return { name, status, code };
}

function validateFacts(value: PlainRecord): Array<{ name: string; status: ComponentState; code: string }> | undefined {
	const facts = value.facts;
	if (!isPlainRecord(facts) || !exactKeys(facts, COMPONENT_ORDER)) return undefined;
	for (const name of COMPONENT_ORDER) if (!isPlainRecord(facts[name])) return undefined;
	const bdd = facts.bdd as PlainRecord;
	const herdr = facts.herdr as PlainRecord;
	const worktree = facts.worktree as PlainRecord;
	const fleet = facts.fleet as PlainRecord;
	const trajectory = facts.trajectory as PlainRecord;
	const budget = facts.budget as PlainRecord;
	if (
		!exactKeys(bdd, ["authority", "phase", "spawnPermitted", "evidenceFingerprint"]) ||
		bdd.authority !== "bdd-mode" || typeof bdd.phase !== "string" || !PHASES.has(bdd.phase) ||
		typeof bdd.spawnPermitted !== "boolean" || !validFingerprint(bdd.evidenceFingerprint)
	) return undefined;
	if (
		!exactKeys(herdr, ["authority", "status"]) || herdr.authority !== "herdr" ||
		typeof herdr.status !== "string" || !new Set(["idle", "working", "blocked", "done", "unknown", "unavailable"]).has(herdr.status)
	) return undefined;
	if (
		!exactKeys(worktree, ["authority", "writerState", "pathWriterCount", "busyWriterCount", "maxBusyWriters"]) ||
		worktree.authority !== "worktree-board" ||
		typeof worktree.writerState !== "string" || !new Set(["available", "held", "conflict", "unknown"]).has(worktree.writerState) ||
		!validInteger(worktree.pathWriterCount, 0, 64) || !validInteger(worktree.busyWriterCount, 0, 64) ||
		!validInteger(worktree.maxBusyWriters, 1, 64)
	) return undefined;
	if (
		!exactKeys(fleet, ["authority", "status"]) || fleet.authority !== "agentic-fleet" ||
		typeof fleet.status !== "string" || !new Set(["idle", "running", "blocked", "done", "unknown", "unavailable"]).has(fleet.status)
	) return undefined;
	if (
		!exactKeys(trajectory, ["authority", "status"]) || trajectory.authority !== "trajectory" ||
		typeof trajectory.status !== "string" || !new Set(["pass", "fail", "invalid", "unknown", "unavailable"]).has(trajectory.status)
	) return undefined;
	if (
		!exactKeys(budget, ["authority", "status", "profile"]) || budget.authority !== "cost-budget" ||
		typeof budget.status !== "string" || !new Set(["ok", "warn", "exceeded", "unknown", "unavailable"]).has(budget.status) ||
		typeof budget.profile !== "string" || !new Set(["interactive", "strict", "overnight"]).has(budget.profile)
	) return undefined;

	const components = [];
	components.push(
		bdd.phase === "unknown"
			? component("bdd", "unknown", "ORC01_BDD_UNKNOWN")
			: bdd.spawnPermitted
				? component("bdd", "ready", "ORC01_BDD_READY")
				: component("bdd", "blocked", "ORC01_BDD_BLOCKED"),
	);
	components.push(
		herdr.status === "blocked"
			? component("herdr", "blocked", "ORC01_HERDR_BLOCKED")
			: herdr.status === "unknown" || herdr.status === "unavailable"
				? component("herdr", "unknown", "ORC01_HERDR_UNKNOWN")
				: herdr.status === "working"
					? component("herdr", "active", "ORC01_HERDR_ACTIVE")
					: component("herdr", "ready", "ORC01_HERDR_READY"),
	);
	const writerBlocked = worktree.writerState === "held" || worktree.writerState === "conflict" || worktree.pathWriterCount > 0 || worktree.busyWriterCount >= worktree.maxBusyWriters;
	components.push(
		worktree.writerState === "unknown"
			? component("worktree", "unknown", "ORC01_WRITER_UNKNOWN")
			: writerBlocked
				? component("worktree", "blocked", "ORC01_WRITER_BLOCKED")
				: component("worktree", "ready", "ORC01_WRITER_READY"),
	);
	components.push(
		fleet.status === "blocked"
			? component("fleet", "blocked", "ORC01_FLEET_BLOCKED")
			: fleet.status === "unknown" || fleet.status === "unavailable"
				? component("fleet", "unknown", "ORC01_FLEET_UNKNOWN")
				: fleet.status === "running"
					? component("fleet", "active", "ORC01_FLEET_ACTIVE")
					: component("fleet", "ready", "ORC01_FLEET_READY"),
	);
	components.push(
		trajectory.status === "fail" || trajectory.status === "invalid"
			? component("trajectory", "blocked", "ORC01_TRAJECTORY_BLOCKED")
			: trajectory.status === "unknown" || trajectory.status === "unavailable"
				? component("trajectory", "unknown", "ORC01_TRAJECTORY_UNKNOWN")
				: component("trajectory", "ready", "ORC01_TRAJECTORY_READY"),
	);
	components.push(
		budget.status === "exceeded"
			? component("budget", "blocked", "ORC01_BUDGET_BLOCKED")
			: budget.status === "unknown" || budget.status === "unavailable"
				? component("budget", "unknown", "ORC01_BUDGET_UNKNOWN")
				: component("budget", "ready", budget.status === "warn" ? "ORC01_BUDGET_WARN" : "ORC01_BUDGET_READY"),
	);
	return components;
}

export function status(input: unknown) {
	const normalized = safeInput(input);
	if (!normalized.ok) return publicError(PRIMITIVE, normalized.code);
	const value = normalized.value;
	if (!exactKeys(value, ["schemaVersion", "facts"])) return publicError(PRIMITIVE, "ORC01_INVALID_INPUT");
	if (!validVersion(value.schemaVersion)) return publicError(PRIMITIVE, "ORC01_UNSUPPORTED_VERSION");
	const components = validateFacts(value);
	if (!components) return publicError(PRIMITIVE, "ORC01_INVALID_INPUT");
	const hasBlocked = components.some((entry) => entry.status === "blocked");
	const hasUnknown = components.some((entry) => entry.status === "unknown");
	const outcome = hasBlocked ? "blocked" : hasUnknown ? "unknown" : "ready";
	const code = outcome === "blocked" ? "ORC01_STATUS_BLOCKED" : outcome === "unknown" ? "ORC01_STATUS_UNKNOWN" : "ORC01_STATUS_READY";
	return result(PRIMITIVE, outcome === "ready", outcome, code, { components });
}

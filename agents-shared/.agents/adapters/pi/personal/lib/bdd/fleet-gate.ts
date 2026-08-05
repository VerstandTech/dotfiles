/**
 * Phase × fleet policy (pure). Used by bdd-mode enforcement and fleet_dispatch mirror.
 *
 * Locked roadmap:
 * - Ban fleets in red / green / refactor
 * - discovery: research
 * - formulation: research + ux
 * - verify: review + ux (+ custom treated as review-like)
 * - off / bdd disabled: allow
 * - fleet bypass ≠ path bypass
 * - fleet_plan never blocked (callers should not pass plan as launch)
 */

import type { BddPhase } from "./types.ts";

export type FleetKindGate = "research" | "review" | "ux" | "custom" | "unknown";

export interface FleetGateInput {
	phase: BddPhase;
	/** BDD mode enabled */
	enabled: boolean;
	/** Fleet-specific bypass (not path/bash bypass) */
	fleetBypass?: boolean;
	kind: FleetKindGate;
	/** true for fleet_plan / planning-only */
	planningOnly?: boolean;
}

export interface FleetGateResult {
	allowed: boolean;
	reason?: string;
}

const ALLOWED: Record<Exclude<BddPhase, "off">, ReadonlySet<FleetKindGate>> = {
	discovery: new Set(["research"]),
	formulation: new Set(["research", "ux"]),
	red: new Set(),
	green: new Set(),
	refactor: new Set(),
	verify: new Set(["review", "ux", "custom"]),
};

export function normalizeFleetKind(raw: unknown): FleetKindGate {
	const k = String(raw ?? "")
		.trim()
		.toLowerCase();
	if (k === "research" || k === "researchers" || k === "res") return "research";
	if (k === "review" || k === "reviews" || k === "code-review" || k === "cr") return "review";
	if (k === "ux" || k === "ui" || k === "product") return "ux";
	if (k === "custom") return "custom";
	return "unknown";
}

/**
 * Whether a fleet *launch* is allowed in this BDD phase.
 * Planning-only is always allowed.
 */
export function assertFleetAllowed(input: FleetGateInput): FleetGateResult {
	if (input.planningOnly) {
		return { allowed: true };
	}
	if (!input.enabled || input.phase === "off") {
		return { allowed: true };
	}
	if (input.fleetBypass) {
		return { allowed: true };
	}

	const allow = ALLOWED[input.phase];
	if (!allow) {
		return { allowed: true };
	}

	if (input.kind === "unknown") {
		return {
			allowed: false,
			reason:
				`BDD ${input.phase}: unknown fleet kind blocked. Use research|review|ux. ` +
				`Or /bdd verify before review fleets, or /bdd fleet-bypass <reason>.`,
		};
	}

	if (!allow.has(input.kind)) {
		const allowedList = [...allow].join(", ") || "(none)";
		return {
			allowed: false,
			reason:
				`BDD ${input.phase}: fleet kind "${input.kind}" blocked. ` +
				`Allowed here: ${allowedList}. ` +
				(input.phase === "red" || input.phase === "green" || input.phase === "refactor"
					? `Finish ${input.phase} with a single writer, then /bdd verify for review fleets.`
					: `Switch phase or /bdd fleet-bypass <reason>.`),
		};
	}

	return { allowed: true };
}

/**
 * Detect multi-agent fanout on the raw `subagent` tool (parallel tasks / counts / chain parallel).
 * Single-agent launches are allowed during gated phases.
 */
export function isMultiAgentSubagentLaunch(params: unknown): boolean {
	if (!params || typeof params !== "object") return false;
	const p = params as Record<string, unknown>;

	// Management actions are not launches
	if (typeof p.action === "string" && p.action.length > 0) return false;

	if (Array.isArray(p.tasks)) {
		if (p.tasks.length > 1) return true;
		if (p.tasks.length === 1) {
			const t = p.tasks[0] as Record<string, unknown> | undefined;
			const count = typeof t?.count === "number" ? t.count : 1;
			if (count > 1) return true;
		}
	}

	if (Array.isArray(p.chain)) {
		for (const step of p.chain) {
			if (!step || typeof step !== "object") continue;
			const s = step as Record<string, unknown>;
			if (Array.isArray(s.parallel)) {
				if (s.parallel.length > 1) return true;
				if (s.parallel.length === 1) {
					const t = s.parallel[0] as Record<string, unknown> | undefined;
					const count = typeof t?.count === "number" ? t.count : 1;
					if (count > 1) return true;
				}
			}
		}
	}

	return false;
}

/** Block multi-agent subagent in red/green/refactor when BDD is on. */
export function assertSubagentLaunchAllowed(input: {
	phase: BddPhase;
	enabled: boolean;
	fleetBypass?: boolean;
	params: unknown;
}): FleetGateResult {
	if (!input.enabled || input.phase === "off" || input.fleetBypass) {
		return { allowed: true };
	}
	if (!isMultiAgentSubagentLaunch(input.params)) {
		return { allowed: true };
	}
	if (input.phase === "red" || input.phase === "green" || input.phase === "refactor") {
		return {
			allowed: false,
			reason:
				`BDD ${input.phase}: multi-agent subagent fanout blocked (one writer). ` +
				`Use a single subagent, or /bdd verify then fleet_dispatch, or /bdd fleet-bypass <reason>.`,
		};
	}
	return { allowed: true };
}

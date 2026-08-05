/**
 * Fleet run identity + on-disk plan manifest + session ledger helpers (P0.2).
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { FleetRunRecord } from "../bdd/types.ts";
import type { FleetPlan } from "./plan.ts";

export const FLEET_RUN_RECORD_TYPE = "fleet-run-record";

export interface RunIdentity {
	runId: string;
	asyncDir?: string;
	asyncId?: string;
}

function isRecord(v: unknown): v is Record<string, unknown> {
	return Boolean(v) && typeof v === "object" && !Array.isArray(v);
}

function pickString(obj: Record<string, unknown>, keys: string[]): string | undefined {
	for (const k of keys) {
		const v = obj[k];
		if (typeof v === "string" && v.trim()) return v.trim();
	}
	return undefined;
}

/** Deep-ish search for runId/asyncDir in RPC tool result payloads. */
export function extractRunIdentity(rpcData: unknown): RunIdentity | undefined {
	const candidates: Record<string, unknown>[] = [];
	if (isRecord(rpcData)) {
		candidates.push(rpcData);
		if (isRecord(rpcData.details)) candidates.push(rpcData.details);
		if (isRecord(rpcData.data)) {
			candidates.push(rpcData.data);
			if (isRecord(rpcData.data.details)) candidates.push(rpcData.data.details);
		}
	}

	let runId: string | undefined;
	let asyncDir: string | undefined;
	let asyncId: string | undefined;

	for (const c of candidates) {
		runId ??= pickString(c, ["runId", "id", "asyncId"]);
		asyncDir ??= pickString(c, ["asyncDir", "dir"]);
		asyncId ??= pickString(c, ["asyncId"]);
	}

	// Fallback: parse bracketed id from status text
	if (!runId && isRecord(rpcData) && typeof rpcData.text === "string") {
		const m =
			rpcData.text.match(/\[([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\]/i) ??
			rpcData.text.match(/\brun[:\s]+([0-9a-f-]{8,})/i);
		if (m?.[1]) runId = m[1];
	}

	if (!runId) return undefined;
	return { runId, asyncDir, asyncId };
}

export function buildFleetRunRecord(input: {
	identity: RunIdentity;
	kind: string;
	expectedCount: number;
	at?: string;
}): FleetRunRecord {
	return {
		runId: input.identity.runId,
		asyncDir: input.identity.asyncDir,
		kind: input.kind,
		expectedCount: input.expectedCount,
		at: input.at ?? new Date().toISOString(),
	};
}

/** Merge by runId (later wins for overlapping fields). */
export function mergeFleetRuns(
	existing: FleetRunRecord[] | undefined,
	incoming: FleetRunRecord,
): FleetRunRecord[] {
	const list = [...(existing ?? [])];
	const idx = list.findIndex((r) => r.runId === incoming.runId);
	if (idx === -1) return [...list, incoming];
	list[idx] = { ...list[idx], ...incoming };
	return list;
}

export interface SessionBranchEntry {
	type?: string;
	customType?: string;
	data?: unknown;
}

/** Collect fleet-run-record custom entries from a session branch. */
export function collectFleetRunsFromBranch(branch: SessionBranchEntry[]): FleetRunRecord[] {
	const byId = new Map<string, FleetRunRecord>();
	for (const entry of branch) {
		if (entry.type !== "custom" || entry.customType !== FLEET_RUN_RECORD_TYPE) continue;
		const d = entry.data;
		if (!isRecord(d) || typeof d.runId !== "string") continue;
		const rec: FleetRunRecord = {
			runId: d.runId,
			asyncDir: typeof d.asyncDir === "string" ? d.asyncDir : undefined,
			kind: typeof d.kind === "string" ? d.kind : "unknown",
			expectedCount: typeof d.expectedCount === "number" ? d.expectedCount : 0,
			at: typeof d.at === "string" ? d.at : new Date(0).toISOString(),
			synthesisPath: typeof d.synthesisPath === "string" ? d.synthesisPath : undefined,
			blockersAccepted: Array.isArray(d.blockersAccepted)
				? d.blockersAccepted.filter((x): x is string => typeof x === "string")
				: undefined,
			deferred: Array.isArray(d.deferred)
				? (d.deferred as FleetRunRecord["deferred"])
				: undefined,
		};
		byId.set(rec.runId, { ...byId.get(rec.runId), ...rec });
	}
	return [...byId.values()];
}

/**
 * Merge branch ledger + evidence.fleetRuns (evidence wins on same runId for synthesis fields).
 */
export function mergeEvidenceFleetRuns(
	evidenceRuns: FleetRunRecord[] | undefined,
	branchRuns: FleetRunRecord[],
): FleetRunRecord[] {
	let out: FleetRunRecord[] = [];
	for (const r of branchRuns) out = mergeFleetRuns(out, r);
	for (const r of evidenceRuns ?? []) out = mergeFleetRuns(out, r);
	return out;
}

export function fleetRunDir(cwd: string, runId: string): string {
	// sanitize path segments
	const safe = runId.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 128);
	return join(cwd, ".pi", "fleet-runs", safe);
}

export function writePlanManifest(
	cwd: string,
	runId: string,
	plan: FleetPlan,
	identity: RunIdentity,
	io: {
		mkdir?: (p: string) => void;
		write?: (p: string, body: string) => void;
	} = {},
): { dir: string; planPath: string } {
	const mkdir = io.mkdir ?? ((p: string) => mkdirSync(p, { recursive: true }));
	const write = io.write ?? ((p: string, body: string) => writeFileSync(p, body, "utf8"));
	const dir = fleetRunDir(cwd, runId);
	mkdir(dir);
	const planPath = join(dir, "plan.json");
	const body = {
		runId,
		asyncDir: identity.asyncDir,
		asyncId: identity.asyncId,
		kind: plan.kind,
		topic: plan.topic,
		count: plan.count,
		concurrency: plan.concurrency,
		context: plan.context,
		async: plan.async,
		tasks: plan.tasks.map((t) => ({
			agent: t.agent,
			label: t.label,
			personaId: t.personaId,
			model: t.model,
			output: t.output,
		})),
		warnings: plan.warnings,
		recordedAt: new Date().toISOString(),
	};
	write(planPath, `${JSON.stringify(body, null, 2)}\n`);
	return { dir, planPath };
}

/** Handoff gaps for review fleets missing synthesis (R3). */
export function fleetHandoffGaps(runs: FleetRunRecord[] | undefined): string[] {
	if (!runs?.length) return [];
	const missing: string[] = [];
	for (const r of runs) {
		// Research fleets optional synthesis; review/custom require it
		const needsSynthesis = r.kind === "review" || r.kind === "custom" || r.kind === "ux";
		if (!needsSynthesis) continue;
		if (!r.synthesisPath?.trim()) {
			missing.push(`fleet synthesis for run ${r.runId} (kind=${r.kind})`);
		}
	}
	return missing;
}

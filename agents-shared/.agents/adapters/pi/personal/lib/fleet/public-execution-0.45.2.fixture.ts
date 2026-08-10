/**
 * Test-only public-execution contract fixture.
 *
 * PINNED: pi-subagents@0.45.2
 * SOURCE: pi-subagents/src/extension/public-execution.ts
 *   (installed copy observed at ~/.pi/agent/npm/node_modules/pi-subagents@0.45.2)
 *
 * This is NOT production code. Plan/rpc tests must import this shared fixture
 * instead of maintaining independent cutover mirrors. Behavior below is a
 * faithful transcription of the 0.45.2 removed-field / action / direct /
 * workflowScript rules so the oracle stays pinned even when the package is
 * not importable from the adapter workspace.
 */

import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/** Exact cutover message from pi-subagents 0.45.2 public-execution.ts. */
export const PI_SUBAGENTS_VERSION_PIN = "0.45.2" as const;

export const PUBLIC_CUTOVER_MESSAGE =
	"Legacy top-level chain and parallel inputs were removed; use workflowScript." as const;

export const DIRECT_EXECUTION_REMOVED_MESSAGE =
	'Direct execution was removed. Use workflowScript: "return runs.run(\'main\', { agent, task })".' as const;

export const WORKFLOW_REQUIRES_SCRIPT_MESSAGE =
	'Execution requires a non-empty workflowScript. Direct execution was removed; use workflowScript: "return runs.run(\'main\', { agent, task })".' as const;

export const WORKFLOW_MUST_OMIT_ACTION_MESSAGE =
	"workflowScript execution must omit action; only schedule.create accepts action with workflowScript." as const;

export const FORBIDDEN_PUBLIC_EXECUTION_KEYS = [
	"action",
	"tasks",
	"chain",
	"parallel",
	"concurrency",
	"chainDir",
	"agent",
	"task",
	"step",
] as const;

export interface PublicSubagentExecutionParams {
	action?: unknown;
	agent?: unknown;
	task?: unknown;
	step?: unknown;
	tasks?: unknown;
	chain?: unknown;
	parallel?: unknown;
	concurrency?: unknown;
	chainDir?: unknown;
	workflowScript?: unknown;
	resume?: unknown;
	clarify?: unknown;
	[key: string]: unknown;
}

export type PublicSubagentExecutionMode = "workflow" | "management";

export type PublicSubagentExecutionNormalization<T> =
	| { ok: true; params: T }
	| { ok: false; error: string; mode: PublicSubagentExecutionMode };

/**
 * Faithful 0.45.2 mirror of normalizePublicSubagentExecution.
 * Source-annotated pin — keep in lockstep with the package version above.
 */
export function normalizePublicSubagentExecutionFixture<
	T extends PublicSubagentExecutionParams,
>(params: T): PublicSubagentExecutionNormalization<T> {
	const action = params.action;
	if (action !== undefined && (typeof action !== "string" || !action.trim())) {
		return {
			ok: false,
			error:
				"action must be a non-empty management/control action, or omit action and use workflowScript.",
			mode: "management",
		};
	}
	const normalizedAction = typeof action === "string" ? action.trim() : undefined;
	if (params.clarify !== undefined) {
		return {
			ok: false,
			error: "Public workflowScript execution does not support clarify UI.",
			mode: "workflow",
		};
	}
	if (params.resume !== undefined) {
		return {
			ok: false,
			error:
				"Top-level resume execution is not available. Put resume on a workflowScript runs.run/runs.all item.",
			mode: "workflow",
		};
	}
	const hasLegacyOrchestration =
		params.tasks !== undefined ||
		params.chain !== undefined ||
		params.parallel !== undefined ||
		params.concurrency !== undefined ||
		params.chainDir !== undefined;
	if (hasLegacyOrchestration) {
		return {
			ok: false,
			error: PUBLIC_CUTOVER_MESSAGE,
			mode: normalizedAction ? "management" : "workflow",
		};
	}
	if (normalizedAction !== undefined) {
		const legacyAction = normalizedAction.toLowerCase();
		if (legacyAction === "single") {
			return {
				ok: false,
				error: DIRECT_EXECUTION_REMOVED_MESSAGE,
				mode: "workflow",
			};
		}
		if (
			legacyAction === "parallel" ||
			legacyAction === "tasks" ||
			legacyAction === "chain"
		) {
			return {
				ok: false,
				error: PUBLIC_CUTOVER_MESSAGE,
				mode: "workflow",
			};
		}
		if (normalizedAction === "schedule.create") {
			if (
				params.agent !== undefined ||
				params.task !== undefined ||
				params.step !== undefined
			) {
				return {
					ok: false,
					error:
						"schedule.create requires workflowScript and does not accept direct agent, task, or step execution fields.",
					mode: "management",
				};
			}
			if (
				typeof params.workflowScript !== "string" ||
				!params.workflowScript.trim()
			) {
				return {
					ok: false,
					error: "schedule.create requires a non-empty workflowScript.",
					mode: "management",
				};
			}
			return { ok: true, params: { ...params, action: normalizedAction } };
		}
		if (params.workflowScript !== undefined) {
			return {
				ok: false,
				error: WORKFLOW_MUST_OMIT_ACTION_MESSAGE,
				mode: "management",
			};
		}
		return { ok: true, params: { ...params, action: normalizedAction } };
	}
	if (
		params.agent !== undefined ||
		params.task !== undefined ||
		params.step !== undefined
	) {
		return {
			ok: false,
			error: DIRECT_EXECUTION_REMOVED_MESSAGE,
			mode: "workflow",
		};
	}
	if (
		typeof params.workflowScript !== "string" ||
		!params.workflowScript.trim()
	) {
		return {
			ok: false,
			error: WORKFLOW_REQUIRES_SCRIPT_MESSAGE,
			mode: "workflow",
		};
	}
	return { ok: true, params };
}

/** Known local install path for the real 0.45.2 module (no network / package install). */
export function resolveInstalledPiSubagentsPublicExecutionPath(): string | null {
	const candidate = join(
		homedir(),
		".pi/agent/npm/node_modules/pi-subagents/src/extension/public-execution.ts",
	);
	return existsSync(candidate) ? candidate : null;
}

export type RealNormalizeFn = <T extends PublicSubagentExecutionParams>(
	params: T,
) => PublicSubagentExecutionNormalization<T>;

/**
 * Best-effort load of the installed real validator. Returns null when the
 * package is not present locally — tests must still pass via the pinned fixture.
 */
export async function tryLoadRealNormalizePublicSubagentExecution(): Promise<RealNormalizeFn | null> {
	const path = resolveInstalledPiSubagentsPublicExecutionPath();
	if (!path) return null;
	try {
		const mod = (await import(path)) as {
			normalizePublicSubagentExecution?: RealNormalizeFn;
		};
		return typeof mod.normalizePublicSubagentExecution === "function"
			? mod.normalizePublicSubagentExecution
			: null;
	} catch {
		return null;
	}
}

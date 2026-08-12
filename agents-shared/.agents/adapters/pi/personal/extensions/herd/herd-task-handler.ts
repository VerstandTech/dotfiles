// /herd-task command orchestration (DESIGN.md §7.8): validate → worktree create
// → extract pane id → agent start. Dependency-injected exec for unit tests.
// Traces: docs/pi-herdr-example-map.md R3, R6, R7 · docs/pi-herdr-acceptance.md Slice 4

import { buildTaskLaunch, isValidAgentName } from "./herd-task.ts";
import type { ExecFn } from "./herd-source.ts";

export type TaskFailureCode = "invalid-name" | "create-failed" | "missing-pane" | "start-failed";

export type TaskResult =
  | { ok: true; paneId: string; message: string }
  | { ok: false; code: TaskFailureCode; paneId?: string; message: string };

/**
 * Extract the pane id from a `herdr worktree create` envelope (0.7.5 emits the
 * JSON envelope by default; schema type `worktree_created`).
 * Tolerant precedence (R3-E4): result.root_pane (the schema-blessed field)
 * → result.pane → result.worktree.
 * Per herdr's skill guidance: parse IDs from JSON, never predict them.
 */
export function extractPaneId(createJson: unknown): string | null {
  if (typeof createJson !== "object" || createJson === null) return null;
  const result = (createJson as { result?: unknown }).result;
  if (typeof result !== "object" || result === null) return null;
  const r = result as Record<string, unknown>;
  for (const key of ["root_pane", "pane", "worktree"] as const) {
    const node = r[key];
    if (typeof node === "object" && node !== null) {
      const id = (node as { pane_id?: unknown }).pane_id;
      if (typeof id === "string" && id.length > 0) return id;
    }
  }
  return null;
}

function fail(code: TaskFailureCode, paneId?: string): TaskResult {
  return Object.freeze({
    ok: false,
    code,
    ...(paneId ? { paneId } : {}),
    message: `⚠ herd-task: ${code}`,
  });
}

/**
 * Run the worktree-first task launch (R3): validate the name before touching
 * the environment (R3-E3), create the worktree/pane, then start pi in it.
 * Any create failure stops the chain (R3-E5). Messages are icon + text (R6).
 */
export async function runHerdTask(
  name: string,
  deps: { cwd: string; exec: ExecFn; base?: string },
): Promise<TaskResult> {
  if (!isValidAgentName(name)) {
    return fail("invalid-name");
  }

  let createOut: string;
  try {
    const createArgv = deps.base !== undefined
      ? buildTaskLaunch({ name, cwd: deps.cwd, base: deps.base })
      : buildTaskLaunch({ name, cwd: deps.cwd });
    createOut = (await deps.exec(createArgv)).stdout;
  } catch {
    return fail("create-failed");
  }

  let paneId: string | null = null;
  try {
    paneId = extractPaneId(JSON.parse(createOut));
  } catch {
    paneId = null;
  }
  if (paneId === null) {
    return fail("missing-pane");
  }

  try {
    await deps.exec(["herdr", "agent", "start", name, "--kind", "pi", "--pane", paneId]);
  } catch {
    return fail("start-failed", paneId);
  }

  return { ok: true, paneId, message: `✓ ${name} → ${paneId}` };
}

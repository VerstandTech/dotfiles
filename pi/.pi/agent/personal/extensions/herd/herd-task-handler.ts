// /herd-task command orchestration (DESIGN.md §7.8): validate → worktree create
// → extract pane id → agent start. Dependency-injected exec for unit tests.
// Traces: docs/pi-herdr-example-map.md R3, R6, R7 · docs/pi-herdr-acceptance.md Slice 4

import { buildTaskLaunch, isValidAgentName } from "./herd-task.ts";
import type { ExecFn } from "./herd-source.ts";

export type TaskResult =
  | { ok: true; paneId: string; message: string }
  | { ok: false; message: string };

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

function fail(message: string): TaskResult {
  return { ok: false, message: `⚠ ${message}` };
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
    return fail(`invalid name ${JSON.stringify(name)} (must match [a-z][a-z0-9_-]{0,31})`);
  }

  let createOut: string;
  try {
    const createArgv = deps.base !== undefined
      ? buildTaskLaunch({ name, cwd: deps.cwd, base: deps.base })
      : buildTaskLaunch({ name, cwd: deps.cwd });
    createOut = (await deps.exec(createArgv)).stdout;
  } catch (err) {
    return fail(`worktree create failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  let paneId: string | null = null;
  try {
    paneId = extractPaneId(JSON.parse(createOut));
  } catch {
    paneId = null;
  }
  if (paneId === null) {
    return fail(`worktree create returned no pane id (output not parsed)`);
  }

  try {
    await deps.exec(["herdr", "agent", "start", name, "--kind", "pi", "--pane", paneId]);
  } catch (err) {
    return fail(`agent start failed on ${paneId}: ${err instanceof Error ? err.message : String(err)}`);
  }

  return { ok: true, paneId, message: `✓ ${name} → ${paneId}` };
}

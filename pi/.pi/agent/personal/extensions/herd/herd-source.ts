// Dependency-injected data source for the herd widget (DESIGN.md §7.7).
// Q3 decision: CLI-per-tick (`herdr agent list --json`) + TTL cache — the simple start.
// Traces: docs/pi-herdr-example-map.md R2, R5 · docs/pi-herdr-acceptance.md Slice 4

import { formatHerdRows, type HerdView } from "./herd-status.ts";

export type ExecFn = (argv: string[]) => Promise<{ stdout: string; stderr: string }>;

export interface HerdSourceDeps {
  exec: ExecFn;
  env: Record<string, string | undefined>;
  now?: () => number;
  ttlMs?: number;
}

export interface HerdSource {
  getView(): Promise<HerdView | null>;
}

const DEFAULT_TTL_MS = 2000;

/**
 * Create a polling herd source. Inert outside herdr (R5-E3/R2-E2: never execs
 * when HERDR_ENV ≠ 1). Failures return null and are NOT cached (R5-E5), so the
 * next call retries instead of sticking on a stale absence.
 */
export function createHerdSource(deps: HerdSourceDeps): HerdSource {
  const now = deps.now ?? Date.now;
  const ttlMs = deps.ttlMs ?? DEFAULT_TTL_MS;
  let cachedAt = -Infinity;
  let cached: HerdView | null = null;

  return {
    async getView(): Promise<HerdView | null> {
      if (deps.env.HERDR_ENV !== "1") return null;

      const t = now();
      if (t - cachedAt < ttlMs) return cached;

      let view: HerdView | null = null;
      try {
        const { stdout } = await deps.exec(["herdr", "agent", "list", "--json"]);
        view = formatHerdRows(JSON.parse(stdout));
      } catch {
        view = null; // graceful absence: socket missing, garbage output, etc.
      }

      if (view !== null) {
        cached = view;
        cachedAt = t;
      }
      return view;
    },
  };
}

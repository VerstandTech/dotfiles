// Dependency-injected data source for the herd widget (DESIGN.md §7.7).
// Q3 decision: CLI-per-tick (`herdr agent list` — JSON envelope is the default
// output on herdr 0.7.5; there is no --json flag) + TTL cache — the simple start.
// Traces: docs/pi-herdr-example-map.md R2, R5 · docs/pi-herdr-acceptance.md Slice 4

import { formatHerdRows, withoutSelf, type HerdView } from "./herd-status.ts";

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

// Q3 amended (2026-07-28, flicker/perf slice): 5s TTL halves CLI-spawn rate;
// publish-on-change in the adapter (R7-E2) makes the extra staleness invisible.
const DEFAULT_TTL_MS = 5000;

/**
 * Create a polling herd source. Inert outside herdr (R5-E3/R2-E2: never execs
 * when HERDR_ENV ≠ 1). Failures return null and are NOT cached (R5-E5), so the
 * next call retries instead of sticking on a stale absence.
 */
export function createHerdSource(deps: HerdSourceDeps): HerdSource {
  const now = deps.now ?? Date.now;
  const ttlMs = deps.ttlMs ?? DEFAULT_TTL_MS;
  let cachedAt = -Infinity;
  let hasOutcome = false;
  // Last SUCCESSFUL outcome — null included: "alone / no siblings" is a stable
  // state that must be cached (R5-E6), otherwise polling respawns the CLI every tick.
  let cached: HerdView | null = null;
  // Last non-empty view, for stale-while-revalidate (R5-E5).
  let lastGood: HerdView | null = null;

  return {
    async getView(): Promise<HerdView | null> {
      if (deps.env.HERDR_ENV !== "1") return null;

      const t = now();
      if (hasOutcome && t - cachedAt < ttlMs) return cached;

      try {
        const { stdout } = await deps.exec(["herdr", "agent", "list"]);
        const view = formatHerdRows(
          withoutSelf(JSON.parse(stdout), deps.env.HERDR_PANE_ID),
        );
        cached = view;
        hasOutcome = true;
        cachedAt = t;
        if (view !== null) lastGood = view;
        return view;
      } catch {
        // Graceful absence (R5-E2) + stale-while-revalidate (R5-E5): keep the
        // last good view on transient failure — the widget never hide/show
        // flickers on a hiccup. Failures are NOT cached; the next tick retries.
        return lastGood;
      }
    },
  };
}

type IntervalHandle = Parameters<typeof clearInterval>[0];

export interface ClaimPollerDeps {
  /** Registry host; defaults to globalThis, which survives pi /reload module
   *  replacement — that is what makes the claim reload-safe. */
  host?: Record<string, unknown>;
  setIntervalFn?: (fn: () => void, ms: number) => IntervalHandle;
  clearIntervalFn?: (handle: IntervalHandle) => void;
}

const POLL_REGISTRY_KEY = "__herdPollers";

/**
 * Start an interval guarded by a process-wide registry (R7-E3). pi /reload
 * creates a fresh module instance, but globalThis survives — so if a previous
 * poller under the same key is still registered (e.g. its session_shutdown
 * cleanup never ran), it is cleared before the new one starts: pollers can
 * never stack. Returns a disposer that clears ONLY its own registration.
 */
export function claimPoller(
  key: string,
  tick: () => void,
  intervalMs: number,
  deps: ClaimPollerDeps = {},
): () => void {
  const host = deps.host ?? (globalThis as unknown as Record<string, unknown>);
  const setIv = deps.setIntervalFn ?? ((fn, ms) => setInterval(fn, ms));
  const clearIv = deps.clearIntervalFn ?? ((h) => clearInterval(h));
  const registry = (host[POLL_REGISTRY_KEY] ??= {}) as Record<
    string,
    IntervalHandle | undefined
  >;
  if (registry[key] !== undefined) clearIv(registry[key]);
  const timer = setIv(tick, intervalMs);
  registry[key] = timer;
  return () => {
    if (registry[key] === timer) {
      clearIv(timer);
      registry[key] = undefined;
    }
  };
}

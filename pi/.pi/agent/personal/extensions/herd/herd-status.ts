// Pure parsing/formatting core for the herd widget (DESIGN.md §7.7).
// No I/O — the extension adapter shells out to `herdr agent list` and passes JSON here.
// Traces: docs/pi-herdr-example-map.md R1, R5, R6 · docs/pi-herdr-acceptance.md Slice 1

export type HerdState = "idle" | "working" | "blocked" | "done" | "unknown";

export interface HerdAgent {
  name: string;
  state: HerdState;
  meta?: string;
}

export interface HerdView {
  summary: string;
  rows: string[];
}

const ICON: Record<HerdState, string> = {
  blocked: "⚠",
  working: "●",
  idle: "○",
  done: "✓",
  unknown: "?",
};

// Blocked is the loudest signal (DESIGN.md principle 7): blocked → working → idle → unknown → done.
const ORDER: Record<HerdState, number> = {
  blocked: 0,
  working: 1,
  idle: 2,
  unknown: 3,
  done: 4,
};

const VALID_STATES = new Set<string>(["idle", "working", "blocked", "done", "unknown"]);

/** Map herdr's AgentStatus to HerdState; unrecognized values degrade to "unknown"
 *  (forward-compat: a new herdr status must never blank the widget). */
function toState(value: unknown): HerdState {
  return typeof value === "string" && VALID_STATES.has(value)
    ? (value as HerdState)
    : "unknown";
}

/**
 * Normalize one herdr 0.7.5 AgentInfo ({ agent_status, name?, display_agent?,
 * agent?, pane_id, ... }) into a HerdAgent. Display name falls back
 * name → display_agent → agent (kind) → pane_id; meta is the pane id.
 * Returns null only when there is no usable name at all.
 */
function toHerdAgent(value: unknown): HerdAgent | null {
  if (typeof value !== "object" || value === null) return null;
  const a = value as Record<string, unknown>;
  const name = [a.name, a.display_agent, a.agent, a.pane_id].find(
    (v): v is string => typeof v === "string" && v.length > 0,
  );
  if (name === undefined) return null;
  const meta =
    typeof a.pane_id === "string" && a.pane_id !== name ? a.pane_id : undefined;
  return { name, state: toState(a.agent_status), meta };
}

/**
 * Parse `herdr agent list` output (0.7.5: JSON CLI envelope by default,
 * `{ id, result: { type: "agent_list", agents: [...] } }`; a bare `{ agents }`
 * object is also accepted) into sorted, plain-text rows.
 * Unparseable agents are dropped, not fatal; returns null when there is
 * nothing meaningful to show (R5-E2 graceful absence).
 */
export function formatHerdRows(payload: unknown): HerdView | null {
  if (typeof payload !== "object" || payload === null) return null;
  const top = payload as Record<string, unknown>;
  const container = (
    typeof top.result === "object" && top.result !== null ? top.result : top
  ) as { agents?: unknown };
  const agents = container.agents;
  if (!Array.isArray(agents) || agents.length === 0) return null;
  const parsed = agents
    .map(toHerdAgent)
    .filter((a): a is HerdAgent => a !== null);
  if (parsed.length === 0) return null;

  const sorted = [...parsed].sort((a, b) => ORDER[a.state] - ORDER[b.state]);

  const rows = sorted.map(
    (a) => `${ICON[a.state]} ${a.name}${a.meta ? ` ${a.meta}` : ""}`,
  );

  // Summary stays attention-focused (R5-E1): only actionable states (working,
  // blocked, idle, unknown). `done` is history — visible in rows, not the summary.
  const count = (s: HerdState) => sorted.filter((a) => a.state === s).length;
  const parts: string[] = [];
  if (count("working") > 0) parts.push(`● ${count("working")} working`);
  if (count("blocked") > 0) {
    const names = sorted
      .filter((a) => a.state === "blocked")
      .map((a) => a.name)
      .join(", ");
    parts.push(`⚠ ${count("blocked")} blocked (${names})`);
  }
  if (count("idle") > 0) parts.push(`○ ${count("idle")} idle`);
  if (count("unknown") > 0) parts.push(`? ${count("unknown")} unknown`);

  return { summary: parts.join("  "), rows };
}

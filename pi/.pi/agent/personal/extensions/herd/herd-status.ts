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

function isHerdAgent(value: unknown): value is { name: string; state: string; meta?: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { name?: unknown }).name === "string" &&
    typeof (value as { state?: unknown }).state === "string" &&
    VALID_STATES.has((value as { state: string }).state)
  );
}

/**
 * Parse a `herdr agent list`-shaped payload into sorted, plain-text rows.
 * Returns null when there is nothing meaningful to show (R5-E2 graceful absence).
 */
export function formatHerdRows(payload: unknown): HerdView | null {
  if (typeof payload !== "object" || payload === null) return null;
  const agents = (payload as { agents?: unknown }).agents;
  if (!Array.isArray(agents) || agents.length === 0) return null;
  if (!agents.every(isHerdAgent)) return null;

  const sorted = [...agents].sort(
    (a, b) => ORDER[a.state as HerdState] - ORDER[b.state as HerdState],
  );

  const rows = sorted.map(
    (a) => `${ICON[a.state as HerdState]} ${a.name}${a.meta ? ` ${a.meta}` : ""}`,
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

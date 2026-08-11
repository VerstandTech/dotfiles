# Acceptance Scenarios — pi × herdr Orchestration TUI

**Phase:** formulation · **Focus:** `pi-herdr-orchestration-tui`
**Traces to:** `docs/pi-herdr-example-map.md` (R1–R7, E-ids below)
**Harness:** no Gherkin in `~/dotfiles/pi` → scenarios are expressed as tagged `bun test` specs (`tests/*.test.ts`, comments reference E-ids). Recorded as acceptance coverage per bdd-tdd skill fallback rule.

**Compatibility (CMP-01):** Supported runtime is **Herdr 0.8.x** (tested **0.8.0**, protocol **19**, schema version **1**). Legacy **0.7.5** wording below that describes envelope shape is parser-fixture history only — not a current runtime claim. Task launches on 0.8 emit explicit `--no-focus` and never `--focus` / `--json`.

**Test command (red & green):** `cd ~/dotfiles/pi && bun test`

---

## Slice 1 — `herd-status` (pure parsing/formatting core of the herd widget)

Module: `.pi/agent/personal/extensions/herd/herd-status.ts` (pure, no I/O — testable without a live herdr server).

### Scenario R5-E1 — blocked sorts first, rows are icon + text
**Given** a `herdr agent list` JSON envelope (`{ id, result: { type: "agent_list", agents: [...] } }` — Herdr emits JSON by default on supported 0.8.x and on legacy 0.7.5 fixtures; `AgentInfo` fields: `agent_status`, `name`/`display_agent`/`agent`, `pane_id`; extra 0.8 fields are ignored) with agents in states working (2), blocked (1, named `api`), done (1)
**When** `formatHerdRows(payload)` runs
**Then** the blocked row is first, each row is `<icon> <name> <dim metadata>`, icons are `⚠` blocked, `●` working, `○` idle, `✓` done
**And** the summary line reads `● 2 working  ⚠ 1 blocked (api)`.

### Scenario R5-E2 — graceful absence
**Given** no herdr session (CLI unavailable / empty payload / non-JSON output)
**When** `formatHerdRows` runs
**Then** it returns `null` (widget hides itself; never an error row).

### Scenario R1-E1 — state vocabulary honored
**Given** payloads containing each of `idle | working | blocked | done | unknown`
**When** rows are formatted
**Then** each maps to its DESIGN.md §5.7 token (`working→accent`, `blocked→warning`, `idle→dim`, `done→success`) and `unknown` renders dim with `?` icon — never asserted as done.

### Scenario R6-E1 — never color-only
**When** any row is rendered
**Then** state is recoverable from text alone (icon glyph + name present without ANSI codes).

## Slice 2 — `herd-task` launcher argument builder (worktree-first)

Module: `.pi/agent/personal/extensions/herd/herd-task.ts` (pure builder → CLI argv; executor is a thin shell-out).

### Scenario R3-E1 — task launch wraps native worktree create
**Given** task `story-123` on repo cwd `/x/repo`
**When** `buildTaskLaunch({ name: "story-123", cwd: "/x/repo", base: "develop" })` runs
**Then** argv = `herdr worktree create --cwd /x/repo --branch story-123 --base develop --label story-123 --no-focus` (Herdr **0.8** surface: `--workspace/--cwd/--branch/--base/--path/--label/--focus/--no-focus`)
**And** when `base` is omitted, **no `--base` flag is emitted** — herdr/git resolve the repo's own default branch (generic for any project; no hardcoded `develop`)
**And** a follow-up step starts `pi` in the new pane via `herdr agent start story-123 --kind pi --pane <id from JSON>`.

### Scenario R3-E2 — name validation
**Given** names `Story X`, `-bad`, `x`.repeat(33), `ok_name-1`
**When** validated
**Then** only `ok_name-1` passes (`[a-z][a-z0-9_-]{0,31}`, herdr's own rule).

### Scenario R7-E1 — detach-safe by default
**When** any launcher argv is built
**Then** it includes explicit `--no-focus` (Herdr **0.8** `worktree create` supports `--focus` and `--no-focus`; detach-safe launches always pass `--no-focus`) and never includes `--focus` or `--json` (the JSON envelope is the default CLI output; IDs are parsed from it, never derived).

## Slice 4 — wiring: herd widget source + `/herd-task` handler

Modules: `.pi/agent/personal/extensions/herd/herd-source.ts` (polling/cache/env gating) and `.pi/agent/personal/extensions/herd/herd-task-handler.ts` (command orchestration). Both dependency-injected (`exec`, `now`, `env`) so they unit-test without a live herdr server. The pi-facing entry files stay thin untested adapters (manual verification in a live session).

### Scenario R5-E3 — source is inert outside herdr
**Given** `env.HERDR_ENV` is not `"1"`
**When** `source.getView()` is called
**Then** it returns `null` and `exec` is never invoked (R2-E2: no herdr commands outside herdr).

### Scenario R5-E4 — TTL cache (Q3 decision: CLI-per-tick + cache)
**Given** a source with `ttlMs = 2000` inside herdr
**When** `getView()` is called twice within the window, then once after it
**Then** `exec` runs exactly twice (first + after expiry), and the cached view is returned between.

### Scenario R5-E5 — graceful absence on failure + stale-while-revalidate
**Given** `exec` rejects, times out, or returns garbage
**When** `getView()` is called
**Then** before any success it returns `null` (widget hides; never throws, never an error row) and the failure does **not** poison the cache (next call retries)
**And** after at least one success, a transient failure returns the last good view (stale-while-revalidate) — the widget never hide/show flickers on a hiccup — and the next tick still retries (failure is never cached).

### Scenario R5-E6 — sibling agents only (self-filter)
**Given** `env.HERDR_PANE_ID = w1:p1` and a payload listing `w1:p1` (self — its `agent_status` flaps working↔idle as the user reads and the agent works) plus sibling `w1:p2`
**When** `getView()` runs
**Then** the view contains only the sibling — the caller's own pane never renders (the widget's purpose is sibling agents; a flapping self row is flicker, not signal. Live evidence 2026-07-28: `state_change_seq` advanced 2→6 within one session)
**And** when only self is present the outcome is `null` (widget hides) — and that empty outcome IS cached for the TTL: alone is a stable success state, not a failure, so polling stays at TTL rate instead of respawning the CLI every tick.

### Scenario R7-E2 — publish-on-change + serialized polls (TUI perf)
**Given** a widget adapter driven by the polling source
**Then** `setWidget` is called only when the rendered lines actually change (`sameLines(herdLines(view))` gate in the adapter) — an unchanged poll causes no TUI re-layout
**And** polls are serialized: a tick arriving while the previous refresh is in flight is dropped, and the exec timeout (1500ms) is shorter than the poll interval (2500ms), so slow CLI calls (measured 157–362ms, 2026-07-28) can never pile up.

### Scenario R7-E3 — poll lifecycle: real shutdown event + reload-safe claim
**Given** pi emits `session_shutdown` (reason `quit|reload|new|resume|fork`) before tearing down an extension runtime — and NEVER emits `session_end` (docs/extensions.md §509; binding cleanup to `session_end` means clearInterval never runs, so every /reload orphans a poller)
**When** the widget/footer adapter registers its poll
**Then** cleanup is bound to `session_shutdown`, so no poller survives a reload or session switch
**And** `claimPoller(key, tick, ms)` additionally records its timer in a globalThis registry that survives module reloads: a new claim under the same key clears the previous timer even when the old instance's cleanup never ran — pollers can never stack (each stacked poller = one extra `herdr agent list` spawn + a `setWidget` fight every 2.5s. Live evidence 2026-07-28: flicker = orphaned pre-self-filter poller painting `○ 1 idle / pi w1:p1` while the fixed poller hid the widget; herdr server log shows `timed out reading api request` bursts from stacked/slow pollers)
**And** disposing clears only its own registration — a stale dispose must not kill a newer claim; distinct keys (herd:widget / herd:footer) coexist.

### Scenario R2-E3 — correct CLI invocation and parsing
**When** the source executes
**Then** argv is `herdr agent list` (Herdr 0.8.x and legacy 0.7.5 fixtures: no flags; JSON envelope is the default output) and stdout is parsed through `formatHerdRows`, which unwraps the `{ id, result }` envelope.

### Scenario R3-E3 — `/herd-task` validates before touching the environment
**Given** an invalid task name
**When** `runHerdTask("Bad Name", ...)` is called
**Then** it returns a failure result and `exec` is never invoked.

### Scenario R3-E4 — `/herd-task` orchestrates worktree → agent start
**Given** `runHerdTask("story-123", { cwd })` and a successful create
**When** exec is called
**Then** first argv equals `buildTaskLaunch(...)`; the pane id is extracted from the create envelope (schema type `worktree_created`; tolerant precedence: `result.root_pane.pane_id` — the schema-blessed field — → `result.pane.pane_id` → `result.worktree.pane_id`); second argv is `herdr agent start story-123 --kind pi --pane <id>`; result reports the pane id.

### Scenario R3-E5 — create failure stops the chain
**Given** the worktree-create exec fails or returns an envelope with no pane id
**Then** no `agent start` is attempted; result is a failure with the create stderr/parse note.

### Scenario R6-E2 — handler results are plain text
**Then** success/failure messages are icon + text (e.g. `✓ story-123 → w1:p2`, `⚠ invalid name …`), no ANSI.

- `herdr integration install pi` — official lifecycle hooks ✅ (installed `~/.pi/agent/extensions/herdr-agent-state.ts`, herdr-managed)
- Vendored skill at `.pi/agent/personal/skills/herdr/SKILL.md` ✅ (Q7, 2026-07-28)
- `package.json` with `bun test` ✅ (Q4)
- `.pi/bdd.json` — generic project adapter ✅ (any repo opts in by adding its own; absence → inference/defaults)

---

## API contract (frozen by the red tests)

```ts
// extensions/herd/herd-status.ts
type HerdState = "idle" | "working" | "blocked" | "done" | "unknown";  // = herdr AgentStatus enum
interface HerdAgent { name: string; state: HerdState; meta?: string }
// input: Herdr CLI envelope { id, result: { agents: AgentInfo[] } } (bare {agents} accepted).
// Dual-era: legacy 0.7.5 fixtures and current 0.8.0 envelopes (extra fields ignored).
// AgentInfo → HerdAgent: state ← agent_status (unrecognized → "unknown", never fatal);
// name ← name ?? display_agent ?? agent ?? pane_id; meta ← pane_id.
formatHerdRows(payload: unknown): { summary: string; rows: string[] } | null

// extensions/herd/herd-task.ts
isValidAgentName(name: string): boolean
buildTaskLaunch(opts: { name: string; cwd: string; base?: string }): string[] // argv

// extensions/herd/herd-source.ts (Slice 4 + flicker/perf slice)
type ExecFn = (argv: string[]) => Promise<{ stdout: string; stderr: string }>;
// DEFAULT_TTL_MS = 5000 (Q3 amended: publish-on-change makes staleness invisible;
// halves CLI-spawn rate). Caches successful OUTCOMES including empty (R5-E6);
// failures are never cached and return the last good view (R5-E5).
createHerdSource(deps: { exec: ExecFn; env: Record<string, string|undefined>;
  now?: () => number; ttlMs?: number }): { getView(): Promise<HerdView|null> }

// extensions/herd/herd-status.ts (flicker/perf slice helpers)
withoutSelf(payload: unknown, selfPaneId: string | undefined): unknown // R5-E6
herdLines(view: HerdView | null): string[] | null                      // R7-E2
sameLines(a: string[] | null, b: string[] | null): boolean             // R7-E2

// extensions/herd/herd-task-handler.ts (Slice 4)
type TaskResult = { ok: true; paneId: string; message: string }
                | { ok: false; message: string };
extractPaneId(createJson: unknown): string | null
runHerdTask(name: string, deps: { cwd: string; exec: ExecFn; base?: string })
  : Promise<TaskResult>

// extensions/herd/herd-footer.ts (Slice 5)
interface FooterInput { model?: string; thinking?: string; branch?: string | null;
  herd?: HerdView | null; width: number }
renderHerdFooter(input: FooterInput): string[]   // always exactly 2 lines
```

## Slice 5 — herd footer (DESIGN.md §7.1)

Module: `.pi/agent/personal/extensions/herd/herd-footer.ts` (pure renderer). Entry: `.pi/agent/personal/extensions/herd/herd-footer-command.ts` (`/footer` toggle adapter, mirrors pi's custom-footer example).

### Scenario F-1 — two-line contract, model right-aligned
**Given** model `kimi-k3`, thinking level `high`, branch `main`, herd view with 1 blocked agent
**When** `renderHerdFooter(input, width)` runs
**Then** it returns exactly 2 lines: line 1 = dim keybinding hints; line 2 = herd summary left, `kimi-k3 · thinking high (main)` right, separated by padding (ample width)
**And** at tight widths the model/thinking/branch segment survives intact while the herd summary truncates first (P4: state is persistent; the herd widget shows the same summary, so truncation is redundancy-safe).

### Scenario F-2 — graceful degradation
**Given** herd view `null` and/or branch `null`
**Then** missing parts are simply omitted (no placeholder text, no error glyphs).

### Scenario F-3 — narrow-terminal truncation
**Given** width smaller than the combined content
**Then** each line is ≤ width visible columns, truncated middle-first via `truncateToWidth`; never throws, never overflows.

### Scenario R6-E3 — thinking level carries meaning in text
**Then** the thinking segment includes the level word (e.g. `high`), not only a ramp color (color applied by the entry adapter via `theme.fg("thinkingHigh", …)`).

## Mutation/sensitivity plan (verify phase)

- ✅ Slice 1: sort flip → R5-E1 failed; name-cap removal → R3-E2 failed; base drop → 2 failed. All restored.
- ✅ Slice 4: cache bypass → R5-E4 failed; env gate removed → R5-E3 failed; precedence flip → R3-E4 failed. All restored.
- ✅ Legacy 0.7.5 parser-contract alignment (historical): envelope unwrap removed from `formatHerdRows` → 10 failed / 22 pass across status+source+footer suites. Restored → 32/32 green. Current runtime matrix is Herdr 0.8.0 / protocol 19 / schema 1 (CMP-01).
- Slice 5 candidates: 2-line contract broken (return 1 line) → F-1 must fail; truncation removed → F-3 must fail.
- Flicker/perf slice: self-filter bypass (`withoutSelf` call removed from herd-source) → R5-E6 must fail.
- Poller-lifecycle slice: prior-claim clear removed from `claimPoller` → R7-E3 stack test must fail.
- Record via `bdd_assert_mutation` or attested evidence with captured output.

## CRAP-risk notes

- Slices 1–2: pure functions, cyclomatic complexity ≤ 4 each; every branch has a direct test.
- Slice 4: injected-dependency modules; branches = env gate, TTL hit/miss, exec failure, 3-envelope pane-id extraction, invalid name, create failure — each with a direct test. Complexity ≤ 5 per function.
- Flicker/perf slice: new branches = stale-hit (lastGood set/unset), empty-outcome cache, self-filter envelope/bare/passthrough, sameLines null/length/element paths — each with a direct test. `withoutSelf` keeps the container-vs-envelope branch count at 2; `sameLines` ≤ 4.
- Poller-lifecycle slice: `claimPoller` branches = prior-registered? + dispose-owns-registration? — each with a direct test (injected fake timers, no real clock).
- The pi-facing entry files (`herd-widget.ts`, `herd-task.ts` extension entries) stay thin untested adapters — verified manually in a live herdr session (acceptance N/A for automation: requires interactive TUI + running herdr server).

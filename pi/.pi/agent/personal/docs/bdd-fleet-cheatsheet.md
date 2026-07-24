# BDD + Fleet cheatsheet (operator guide)

Quick reference for the Pi personal package.  
**Reload after pulls:** `/reload` in Pi.

Related:
- Roadmap / design decisions: [`agentic-bdd-roadmap.md`](./agentic-bdd-roadmap.md)
- Skill: `/skill:bdd-tdd` · `/skill:agentic-fleet`
- Config: project `.pi/bdd.json` · user `~/.pi/agent/fleet.json`

---

## Why you saw this error

```text
Cannot enter green without red evidence (a failing test run).
Stay in red, run the failing suite, call bdd_assert_red.
```

```text
Cannot enter verify without red evidence (a failing test run).
```

**Meaning:** BDD mode will not advance to **green** or **verify** until a **failing** test command has been recorded.

| You tried | Machine needs first |
|-----------|---------------------|
| `/bdd green` | `bdd_assert_red` (exit ≠ 0, not timeout/127) |
| `/bdd verify` | red **and** (for verify) green evidence |
| Implement in `src/` during red | Stay on tests until red is proven |

This is intentional TDD: **no “implementation phase” without a failing test on the books.**

### Correct sequence (minimal)

```text
/bdd red
# write/update failing test
bdd_assert_red   # or: bdd_assert_red with append: "path/to/test.ts"
# → must FAIL for the right reason

/bdd green
# implement minimum
bdd_assert_green   # defaults to same command as red; must PASS and cover red

/bdd verify
# optional: fleet review (see below)
/bdd handoff
```

### Check state anytime

```text
/bdd status
# or tool: bdd_status
```

Shows phase, red/green exits, acceptance, config path.

---

## Phase machine (what each phase allows)

| Phase | Purpose | Writes | Fleets |
|-------|---------|--------|--------|
| **off** | Normal Pi | all | all |
| **discovery** | Example Map | docs/config only | research only |
| **formulation** | Gherkin / scenarios | docs + features + tests | research, ux |
| **red** | Failing tests | tests/features only | **none** |
| **green** | Min implementation | impl after red evidence | **none** |
| **refactor** | Cleanup, stay green | code | **none** |
| **verify** | Regression + review | code | **review, ux** |

### Path / bash gates

- **edit/write** blocked by path class per phase.
- **Mutating bash** blocked in discovery / formulation / red (redirects, `rm`, `git commit`, etc.).
- Escape (paths only): `/bdd bypass <reason>` — logged; cleared on phase change.
- Escape (fleets only): `/bdd fleet-bypass <reason>` — does **not** open path gates.

---

## Red / green evidence rules

### Red (`bdd_assert_red`)

Must **fail** with a real test failure:

| Rejected | Why |
|----------|-----|
| exit 0 | Not red |
| exit 124 / timeout | Hang ≠ failing assertion |
| exit 126/127 / spawn error | Missing binary / infra |
| (soft) empty noise | Prefer FAIL/assert lines in output |

### Green (`bdd_assert_green`)

- Default command = **last red command**.
- **`strictGreenCoversRed` default ON** — green must **cover** red:
  - exact same command, or
  - broader suite (`bun test a.test.ts` red → `bun test` green), or
  - same runner + still includes red focus path.
- **Rejected examples:** `bun -e '1'`, `bun test other.test.ts` after red on `a.test.ts`, `npm run build`.
- Opt out in project config:

```json
{
  "version": 1,
  "strictGreenCoversRed": false,
  "commands": { "unitTest": "bun test" }
}
```

### Verify

Needs **red** (failing) **and** **green** (passing).  
Then you may run review fleets.

---

## Fleet rules (with BDD on)

| You want | When | Command |
|----------|------|---------|
| Research swarm | discovery (or off) | `/fleet research 3 <topic>` |
| Code review swarm | **verify** (or off) | `/fleet review 3 <scope>` |
| UX personas | formulation or verify | `/fleet ux 3 <flow>` |
| Plan only | any phase | `/fleet plan review 3 …` or `fleet_plan` |

**Blocked while phase is red / green / refactor:**

- `fleet_dispatch`
- multi-agent `subagent({ tasks: [...] })` (2+ tasks or `count>1`)

**Still allowed in red/green:** single `subagent` (one scout/worker).

Native models preferred over OpenRouter when authenticated (`anthropic/…`, `openai-codex/…`, `xai/…`).

### Run ledger (P0.2)

On successful dispatch the extension:

1. Extracts **runId** / **asyncDir** from pi-subagents RPC  
2. Writes **`.pi/fleet-runs/<runId>/plan.json`**  
3. Appends a session **fleet-run-record** and merges into BDD `evidence.fleetRuns`

After a **review/ux** fleet finishes:

1. Write synthesis to e.g. `.pi/fleet-runs/<runId>/synthesis.md`  
2. Record it:

```text
bdd_record_evidence
  fleetRunId: <runId>
  fleetSynthesisPath: .pi/fleet-runs/<runId>/synthesis.md
```

Without `synthesisPath`, **`bdd_handoff` fails** for that review/ux run (R3).

### Collect members (P0.3)

```text
/fleet collect <runId>
# or tool fleet_collect
```

Copies `status.json` + `output-*.log` / artifact markdown into  
`.pi/fleet-runs/<runId>/members/` and writes `collect.json`.

---

## Commands quick list

### BDD

| Command | Effect |
|---------|--------|
| `/bdd status` | Phase + evidence |
| `/bdd on` / `/bdd off` | Enable (discovery) / disable |
| `/bdd discovery\|formulation\|red\|green\|refactor\|verify` | Set phase (gates apply) |
| `/bdd next` | Advance one step (off → discovery first) |
| `/bdd init` | Write `.pi/bdd.json` template |
| `/bdd bypass <reason>` | Path/bash gates off until phase change |
| `/bdd fleet-bypass <reason>` | Fleet launch gates off until phase change |
| `/bdd handoff` | Evidence block + missing fields |
| `/bdd handoff pr` | Same + GitHub PR body |
| `/bdd doctor` · `/agentic doctor` | Diagnostics (BDD/fleet/auth/typebox/RPC) |
| `/agentic ship` · skill `ship` · `/ship` | Full recipe; **first** confirm A branch / B worktree / C stay |
| `bdd_assert_mutation` | Command-backed fail→pass mutation |
| `/fleet collect <runId>` | Snapshot member outputs |
| `/fleet review [topic]` | Review fleet (**default N=3**) |
| Project `.pi/fleet.json` | Overlay on `~/.pi/agent/fleet.json` |

### Tools

| Tool | Effect |
|------|--------|
| `bdd_status` | Same as status |
| `bdd_set_phase` | Phase + optional focus |
| `bdd_assert_red` | Run must fail → record |
| `bdd_assert_green` | Run must pass + cover red → record |
| `bdd_record_evidence` | Map / acceptance / mutation notes |
| `bdd_handoff` | Completeness report |
| `fleet_plan` / `fleet_dispatch` / `fleet_status` | Fleets (dispatch gated by phase) |

### Prompts

`/example-map` · `/formulate` · `/tdd` · `/green` · `/handoff` · `/fleet-research` · `/fleet-review` · `/fleet-ux`

---

## Typical full day

```text
1. /bdd discovery          → Example Map on issue
2. bdd_record_evidence     → exampleMapRef + counts
3. /bdd formulation        → .feature + test skeletons
4. /bdd red
5. bdd_assert_red          → FAIL
6. /bdd green
7. implement minimum
8. bdd_assert_green        → PASS (same/broader command)
9. /bdd verify
10. /fleet review 3 <diff> → optional multi-lens review
11. /bdd handoff           → paste into PR
```

Without BDD (`/bdd off`): normal Pi + fleets unrestricted.

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Can’t enter green/verify | Run `bdd_assert_red` first; check `/bdd status` |
| Green rejected (strict cover) | Re-run red’s command, or broader suite, or `strictGreenCoversRed: false` |
| Fleet blocked in green | `/bdd verify` first, or `/bdd fleet-bypass <reason>` |
| Red rejected timeout/127 | Fix runner/path; don’t treat infra as red |
| Gates feel stuck | `/bdd status`; path bypass ≠ fleet bypass; phase change clears both |
| After git pull nothing new | `/reload` |

---

## Files map

```text
~/.pi/agent/personal/          # stowed from ~/dotfiles/pi/.pi/agent/personal
  extensions/bdd-mode.ts
  extensions/agentic-fleet.ts
  lib/bdd/                     # phases, paths, fleet-gate, run-command
  lib/fleet/                   # plan, personas, model-resolve
  docs/bdd-fleet-cheatsheet.md # ← this file
  docs/agentic-bdd-roadmap.md
  skills/bdd-tdd/
  skills/agentic-fleet/
```

Project adapter: `<repo>/.pi/bdd.json`  
User fleet models/caps: `~/.pi/agent/fleet.json`

---

## Worktree board (`/wt`)

Mission-control for git worktrees (no silent `cd` of the root session).

| Command | Effect |
|---------|--------|
| `/wt` · `/wt-board` · **Ctrl+Alt+W** | Left overlay picker (not chat) |
| `/wt list` | Board **widget above editor** (no transcript) |
| `/wt list chat` | Dump board into chat (escape hatch) |
| `/wt list hide` | Clear board widget |
| `/wt status` | Focus + busy + session cwd |
| `/wt new <branch> [path]` | `git worktree add` under `.worktrees/` + registry |
| `/wt focus <id\|branch\|path>` | Focus card (footer chip); **cwd unchanged** |
| `/wt prune` | Drop stale registry entries |
| `/wt acquire\|release <id>` | Writer busy slots (max 2) |
| `/wt run ship\|review <id>` | Kick ship/review on that tree |
| `/wt open <id>` | tmux window `pi` in tree (best-effort) |
| `/wt-board` · **Ctrl+Alt+W** | Left overlay picker |

Registry: `<repo>/.pi/worktree-board.json` · Plan: [`worktree-board-plan.md`](./worktree-board-plan.md)

---

*Last updated: worktree-board v1 shipped on `feat/pi-worktree-board`.*

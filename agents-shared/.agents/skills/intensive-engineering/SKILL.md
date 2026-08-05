---
name: intensive-engineering
description: >
  Full intensive engineering loop for any non-trivial feature or bugfix: start in a git worktree
  from the base branch (skip if already in a worktree), then Gherkin/BDD first, TDD red→green
  (unit + integration + regression + E2E), parallel sub-agent implementation where safe,
  five-lens code review (performance, design patterns, QA, simplicity, UX) with cross-check and P0–P2
  remediation, CRAP analysis + refactor expert, visual server testing with screenshots, /ux-panel on those
  screenshots, then address all panel findings. Use when the user says "intensive engineering",
  "full engineering loop", "BDD+TDD+review+UX panel", runs /intensive-engineering, or wants the complete
  high-rigor delivery process (not a quick one-shot fix). Prefer this over thin implement-only flows for
  user-visible features, API contracts, or multi-file behavior changes.
---

# Intensive Engineering

End-to-end delivery discipline. **Do not skip phases.** Shortcuts need an explicit user waiver.

Orchestrator owns the loop. Sub-agents do parallel work. Track progress with a visible todo list.

## Non-negotiables

0. **Isolated worktree from base** before feature work (Phase 0a). If already inside a linked worktree, skip creation and continue.
1. **Behavior change ⇒ Gherkin first**, then **failing tests first**. Tests-after is not TDD.
2. **Watch red fail for the right reason** before writing production code.
3. **Minimum green**, then refactor while staying green.
4. **Every review finding P0–P2 is addressed** (fix or explicit deferred with reason).
5. **Visual evidence** for UI surfaces (screenshots saved under project `screenshots/` or session artifacts).
6. **Never `git add -A`**. Stage named files only. No secrets, no local-only noise (`.env`, `.playwright-mcp/`).
7. Prefer **sub-agents in parallel** for independent work; keep shared-file edits sequential.

## Phase map

| Phase | Goal | Gate to next |
|-------|------|--------------|
| 0a | Worktree isolation from base | Cwd is isolated worktree (or already was) |
| 0 | Scope, branch, inventory | Clear user-visible outcomes |
| 1 | Gherkin BDD | Features cover happy + edges |
| 2 | Gherkin 3-lens validation | Revised features (if needed) |
| 3 | RED tests | Failures prove missing behavior |
| 4 | GREEN implement | Tests pass; minimal code |
| 5 | 5-lens code review + cross-check | P0–P2 list |
| 6 | Address review findings | Re-green after fixes |
| 7 | CRAP + refactor | Complexity hotspots reduced |
| 8 | Visual run + screenshots | Captured states |
| 9 | UX panel on screenshots | Converged UX findings |
| 10 | Address UX panel | Re-visual + re-green |
| 11 | Handoff | Summary with evidence |

---

## Phase 0a — Worktree from base (before any code)

**Goal:** Protect the user's main checkout. All intensive-engineering implementation happens on a feature branch in a linked git worktree, created from the repo **base branch** (usually `develop`).

### Detect existing isolation — skip if already isolated

Run from the current cwd:

```bash
GIT_DIR=$(cd "$(git rev-parse --git-dir)" 2>/dev/null && pwd -P)
GIT_COMMON=$(cd "$(git rev-parse --git-common-dir)" 2>/dev/null && pwd -P)
SUPER=$(git rev-parse --show-superproject-working-tree 2>/dev/null || true)
```

- **Already in a linked worktree** when `GIT_DIR != GIT_COMMON` **and** `SUPER` is empty (not a submodule).
  - **Do not create another worktree.** Announce: `Already in worktree at <path> on <branch> — skipping Phase 0a.`
  - Continue the usual flow (Phase 0 onward) in this cwd. Same session re-entry / “fix all” / second intensive pass: still skip.
- **Main checkout** when `GIT_DIR == GIT_COMMON` (or inside a submodule): create isolation below.

Optional harness-native tools (`EnterWorktree`, `/worktree`, etc.): if available and you are on the main checkout, prefer them; same skip rule if already isolated.

### Create worktree from base

Detailed commands: [references/worktree-setup.md](references/worktree-setup.md).

1. **Base branch:** PR/issue base if known; else `develop` if it exists on origin/local; else `main`.
2. **Fetch base:** `git fetch origin "$BASE" --prune` (or equivalent).
3. **Feature branch name:** `feat|fix|chore/<kebab-slug>` from the task (never commit on `$BASE` / `main` / `staging` unless the user insists).
4. **Worktree path (priority):**
   - Explicit user path if given
   - Project `.worktrees/<branch>` (preferred) or `worktrees/<branch>`
   - Ensure the parent dir is **gitignored** before creating (add `.worktrees/` to `.gitignore` if missing — commit that only if the repo already tracks `.gitignore` and the user accepts a tiny hygiene commit, otherwise create the ignore entry without blocking).
5. **Create from base tip:**

```bash
git worktree add -b "$FEATURE" "$WT_PATH" "origin/$BASE"   # or "$BASE" if no origin ref
cd "$WT_PATH"
```

If the branch already exists locally/remotely, check it out in a new worktree without `-b`, or resume that branch if appropriate.

6. **Stay in the worktree cwd** for Phases 0–11 (all edits, tests, commits). Report path + branch in the Phase 0 todo/handoff.

### Failures / edge cases

| Situation | Action |
|-----------|--------|
| `git worktree add` permission/sandbox fail | State the block; ask user or fall back to in-place work on a new branch **only after announcing the loss of isolation** |
| Dirty main checkout | Do not steal uncommitted work; create worktree from clean base tip without touching dirty files |
| Already on the target feature branch in main checkout | Still prefer a worktree for isolation unless user declines; if they decline, stay put |
| Second intensive task in same session already in a worktree | **Skip Phase 0a**; optionally create a **new** branch in the same worktree only if the user wants a separate PR — default is reuse current worktree + branch |

---

## Phase 0 — Scope & branch

Run **after** Phase 0a (cwd = worktree or confirmed main fallback).

1. Restate the user-visible behavior and out-of-scope items.
2. Inventory existing patterns (routes, tests, features, UI).
3. Confirm feature branch name (`feat|fix|chore/<kebab-slug>`). Create/switch only if Phase 0a did not already create it. Never commit straight to `main`/`develop` unless the user insists.
4. Create todos for Phases 1–10 (and note worktree path).

## Phase 1 — Gherkin / BDD first

1. Write or extend `.feature` files (project convention: `features/` or `tests/features/`).
2. Cover **happy path** and **edge/error** cases (empty, invalid, auth, not found, conflict, concurrency where relevant).
3. Prefer API/acceptance language that maps to existing test harnesses.
4. If truly non-user-visible internals only, document why Gherkin is N/A and still write unit contracts.

## Phase 2 — Gherkin validation (3 parallel lenses)

Spawn **three read-only agents in one message**:

| Agent id | Lens |
|----------|------|
| `bdd-ba` | Business Analyst — completeness vs product intent |
| `bdd-qa` | QA / edge hunter — missing boundaries |
| `bdd-arch` | Architect — feasibility vs real codebase |

Prompts: [references/review-lenses.md](references/review-lenses.md) §Gherkin.

**Reconcile:** revise features; re-run affected lenses if material gaps remain. Do not pause for user approval unless requirements are contradictory.

## Phase 3 — RED (TDD)

Write tests **before** production code:

| Layer | Typical location / tool |
|-------|-------------------------|
| Unit | colocated `*_test` / `*.test.ts` / `mod tests` |
| Integration | API/repo harness (e.g. `tests/api_integration.rs`, `bun test`) |
| Regression | map to Gherkin scenarios |
| E2E / browser | Playwright / project E2E when user-visible |

**Iron law:** run tests; confirm **red for the right reason** (assertion on missing behavior, not compile/import crash). Fix harness until red is valid.

## Phase 4 — GREEN (implement)

1. Smallest change that turns red → green.
2. Prefer existing patterns, thin routes, services/repos where the project already uses them.
3. Use **parallel sub-agents** only for independent modules/files; merge carefully.
4. Run full relevant suites + typecheck/lint. All green.

## Phase 5 — Five-lens code review (parallel)

Spawn **five agents in one message** after green:

| Agent id | Lens |
|----------|------|
| `rev-perf` | Performance (hot paths, N+1, RAM/IO, concurrency) |
| `rev-patterns` | Design patterns / architecture / layering |
| `rev-qa` | QA coverage gaps, false confidence |
| `rev-simple` | Simplicity / YAGNI / delete-first |
| `rev-ux` | UX of changed surfaces (if UI/API-user-facing) |

Prompts: [references/review-lenses.md](references/review-lenses.md) §Code review.

Each returns findings as **P0 / P1 / P2** with file references and concrete fixes.

### Cross-check (orchestrator + optional second pass)

1. Merge findings; mark duplicates.
2. For contested items, either:
   - resolve with code facts, or
   - send a short cross-check pass: each agent must attack ≥1 peer claim or concede.
3. Produce a single **P0 → P1 → P2** backlog. Nothing open without fix or deferred-with-reason.

## Phase 6 — Address review findings

1. Implement all P0, then P1, then P2 (or defer P2 only with user-visible rationale).
2. Keep tests green; add tests for bugs the review uncovered.
3. Re-run suites.

## Phase 7 — CRAP analysis + refactor expert

1. Spawn a **refactor / simplicity+complexity** agent on the new/changed code.
2. Focus: high cyclomatic branches, untested error paths, dead abstractions, duplication.
3. Apply refactors that lower risk without expanding scope; stay green.

See [references/review-lenses.md](references/review-lenses.md) §CRAP.

## Phase 8 — Visual verification + screenshots

1. Run the app (or use already-running dev servers; prefer not killing the user's processes without need).
2. Exercise the changed flow manually via browser tooling (Playwright / project browser skill).
3. Capture screenshots of key states (empty, happy, error, loading if relevant).
4. Save under project `screenshots/` when the repo uses that convention (respect `.gitignore`).
5. Note any functional defects → return to Phase 3/4.

## Phase 9 — UX panel (screenshots as context)

1. Invoke the **`ux-panel`** skill (or equivalent 5-lens adversarial UX panel).
2. Attach screenshot paths + code paths in every brief.
3. Wait for independent positions → cross-exam → orchestrator synthesis.
4. Output ranked UX change list (P0–P2).

## Phase 10 — Address UX panel findings

1. Implement panel P0–P2 (same defer rules as code review).
2. Re-run tests; re-screenshot critical states if layout/interaction changed.

## Phase 11 — Handoff

Report:

- **Worktree:** path + feature branch + base used (or “skipped — already isolated”)
- **Acceptance:** Gherkin scenarios (or N/A reason)
- **Red → Green:** commands + outcomes
- **Review:** P0–P2 count addressed / deferred
- **CRAP/refactor:** what simplified
- **Visual:** screenshot paths + what was checked
- **UX panel:** top changes applied
- **How to verify:** URL/path click-through for the user
- **Git:** branch, commit(s), push only if user asked

---

## Sub-agent choreography tips

- Prefer **one message, many agents** for parallel phases (2, 5, 9).
- Capability: validation/review agents **read-only** when possible.
- Give each agent: absolute paths **inside the worktree**, scope boundary, required output shape, peer names for debate phases.
- If an agent idles without output, resume/nudge once; then proceed with partial set and note the gap.
- Keep sub-agents on the same worktree cwd; do not spawn implementers against the main checkout while Phase 0a isolated.

## When NOT to use this skill

- Typos, one-line config, pure dependency bumps with no behavior change.
- User explicitly asks for a quick/dirty path.
- Exploratory spike that will be thrown away (label as spike; no permanent code without RED later).

## Related skills

- `issue-to-pr` — issue-scoped BDD→PR with project-specific conventions
- `ux-panel` — Phase 9 panel mechanics
- `test-feature` / browser skills — Phase 8 visual automation
- `post-pr-merge` — after merge: back to base, remove worktree/branch
- Project TDD/superpowers skills — deepen Phase 3–4 if present

---
name: issue-to-pr
description: >
  Turn one GitHub issue into an open PR and route final readiness through pr-finalization,
  using an isolated issue-linked
  worktree, persona-driven Gherkin, multi-lens validation, and strict multi-layer red/green
  TDD. Covers user confusion/recovery paths, unit/integration/acceptance/regression/E2E tests,
  implementation, project visual verification, named commits, verified push, and SHA-bound
  delivery through pr-finalization. Use for "solve this issue", "issue-to-pr",
  "/issue-to-pr", "take issue X to a PR", "implement issue #N", or an issue URL requesting
  a full implementation-to-PR pass. Never merges automatically.
---

# issue-to-pr

Drive one issue from intake to an open PR without skipping:

1. **Persona-driven Gherkin** (predict simplification / confusion / recovery before code)
2. **Red → Green → Refactor** at **every** relevant test layer
3. SHA-bound visual/CI/review evidence through `pr-finalization`

You orchestrate; sub-agents validate Gherkin in parallel. Do **not** implement product code until Gherkin is reconciled **and** the red suite is written and proven red for the right reasons.

## Non-negotiables (this repo)

Read `references/project-conventions.md` **before starting**. Load-bearing rules:

- **Always work in a git worktree for the issue** (see Step 0). If the session is **already** inside a linked worktree, skip creation and continue.
- **Branch names must include the GitHub issue number** so work links on GitHub (`<type>/<issue-number>-<kebab-slug>`).
- **Branch off `develop`, never commit to `develop`/`main`.** PRs target `develop` by default.
- **Gherkin before tests; tests before implementation.** No tests-after. No “implement then document.”
- **Behavior change ⇒ failing test FIRST**, confirmed failing for the *right reason* (assertion, not import/setup).
- **Browser/E2E URL is `megazord.olhaminha.bio`, never `localhost:3000`.** Don't restart the user's dev server; ask them to.
- **Never `git add -A`.** Stage named files only.
- **Never leak local filesystem paths** into commits/PRs/generated files.
- Runtime is **Bun**: `bun test`, `bun run typecheck`, `bun run gherkin:generate`.
- Generated Gherkin under `tests/features/_generated/**` **is committed**.
- **GitHub Issues are the system of record** (`gh issue`). Do not use `bd` / beads / TodoWrite as task tracking for this workflow (session progress checklists are fine).
- **Every evidence claim is SHA-bound.** Record the commit that produced each red, green, visual, remote, review-thread, and CI result. A push or commit invalidates final evidence for the previous SHA.
- **Final delivery runs through `pr-finalization`.** Do not call the PR merge-ready or hand it off from this skill alone, and never merge automatically.

## Workflow order (hard)

```
Intake + worktree + issue-linked branch
  → Persona walkthrough → Gherkin → Multi-lens validation
  → RED (unit · integration · acceptance · regression · E2E as applicable)
  → GREEN (minimum implementation)
  → Candidate commit / push / PR
  → pr-finalization (review loop · final visual · CI/thread/SHA gates)
  → SHA-bound handoff
```

Never reorder to “code first, tests later.”

---

### Step 0 — Intake, worktree & issue-linked branch

#### 0A — Resolve the issue

1. Resolve the issue reference:
   - Bare number / `#N` / GitHub URL → `gh issue view <n> --comments`.
   - Legacy `olhaminha.bio-*` beads id → only if still present; prefer the linked GitHub issue.
   - If ambiguous, ask.
2. Extract **user-visible behavior**, acceptance criteria, Example Map (rules/examples/questions), constraints, and plan/tier limits that matter. If thin, explore cited code first (`Explore` agent for multi-file scope).
3. Claim work: `gh issue edit <n> --add-assignee @me` (and `in-progress` label if the repo uses it). Comment a one-line plan if useful.

Capture for the rest of the run:

- `ISSUE_NUMBER` — digits only (e.g. `2444`)
- `TYPE` — `feat|fix|hotfix|chore` from issue kind
- `SLUG` — short kebab of the title (3–6 words, no issue number repeated)

#### 0B — Detect existing worktree (skip if already isolated)

```bash
GIT_DIR=$(git rev-parse --git-dir)
GIT_COMMON=$(git rev-parse --git-common-dir)
# Submodule guard: if this prints a path, you are in a submodule — treat as normal repo (create worktree).
git rev-parse --show-superproject-working-tree 2>/dev/null
```

- If `GIT_DIR` ≠ `GIT_COMMON` **and** you are **not** in a submodule → **already in a linked worktree**. Do **not** nest another worktree. Ensure the current branch still matches the issue-linked naming rules below (rename/create only if the branch has no issue number). Then **skip to Step 1**.
- Otherwise → create a worktree (0C).

#### 0C — Branch name (must link the GitHub issue)

**Required pattern:**

```text
<type>/<issue-number>-<kebab-slug>
```

Examples:

| Issue | Branch |
|-------|--------|
| #2444 scroll shell | `feat/2444-single-scrollport-layout` |
| #2448 publish capacity | `feat/2448-publish-capacity-meters` |
| Bug on Socials | `fix/2450-list-filter-empty-state` |

Rules:

- **Always include the numeric issue id** as the first path segment after `type/` (GitHub + humans can associate branch ↔ issue).
- Do **not** put a bare `#` in the branch name (awkward to shell-escape); the digits are enough. Linkage is completed by PR body `Closes #<n>` and commit messages that mention `#<n>`.
- Slug from the issue title; lowercase; hyphens; no spaces.
- Confirm you are **never** committing on `develop` / `main`.

#### 0D — Create worktree + branch from `develop`

From the **main repo root** (not inside an existing worktree):

```bash
# 1) Refresh base
git fetch origin develop
git rev-parse origin/develop   # sanity

# 2) Worktree directory (prefer project .worktrees/, must be gitignored)
#    Prefer .worktrees/ if present; else create it and ensure ignored.
mkdir -p .worktrees
git check-ignore -q .worktrees || {
  echo ".worktrees/" >> .gitignore   # only if not already ignored by a broader rule;
  # Prefer editing existing ignore policy if the repo already documents worktrees — do not
  # force-commit a drive-by .gitignore change without need. If .worktrees is already ignored, skip.
}

BRANCH="<type>/<issue-number>-<kebab-slug>"   # e.g. feat/2444-single-scrollport-layout
WT_PATH=".worktrees/${BRANCH}"                # e.g. .worktrees/feat/2444-single-scrollport-layout

# 3) Create branch + worktree at origin/develop
git worktree add -b "$BRANCH" "$WT_PATH" origin/develop

# 4) All subsequent file edits, tests, commits happen inside WT_PATH
cd "$WT_PATH"
```

If a worktree or branch for this issue **already exists** (`git worktree list`, `git branch --list "*/${ISSUE_NUMBER}-*"`):

- Reuse it: `cd` into that worktree path and continue (do not create a second one).
- If the branch exists but has no worktree, `git worktree add "$WT_PATH" "$BRANCH"`.

If `git worktree add` fails (permissions/sandbox): report the error, fall back to a normal branch in the current clone only after telling the user isolation failed — still use the **issue-linked branch name**.

Optional: after worktree create, if the project needs install: `bun install` only when `node_modules` is missing in the worktree and the user environment expects a local install (many monorepos share nothing — follow project norms; don't thrash if already linked).

#### 0E — Confirm ready

Before Step 1:

- [ ] `pwd` is the worktree path (or skipped because already in a worktree)
- [ ] `git branch --show-current` matches `<type>/<issue-number>-…`
- [ ] Branch is **not** `develop` / `main`
- [ ] `git status` clean enough to start (or WIP is intentional for this issue only)

---

### Step 1 — Persona walkthrough → Gherkin (before any product code)

**Goal:** Scenarios that a real LookMyBio user would live through—including where they get stuck—so Gherkin forces simplify / clarify / recover work, not only the engineer happy path.

#### 1A — Load who we build for

Read **`references/persona-gherkin.md`** (method + confusion catalog) and, in-repo when available:

- `marketing/reference/audiences.md` — segments A–E, JTBD, pains, fluency
- `marketing/reference/product-truth.md` — what the product actually does (never invent capabilities)
- `docs/bdd/example-mapping.md` + `docs/bdd/gherkin-conventions.md` — formulation rules

Pick **1–2 primary personas** for this issue (default beachhead: **B solopreneur/coach** and/or **E Brazilian creator/MEI**). Note secondary if the surface is freemium (A) or local SMB (C).

For each persona, write a short **role card** (private notes, not necessarily committed):

| Field | Prompt |
|-------|--------|
| Who | Segment, goals, language (en / pt-BR), mobile vs desktop bias |
| Job today | What they are trying to finish in one sitting |
| Fluency | Low / med / high digital IQ; tolerance for jargon, density, multi-step flows |
| Constraints | Time-poor, plan tier (Free vs Creator+), credits, connected platforms |
| Success | Observable outcome they would screenshot or brag about |
| Confusion risks | What wording, empty states, gates, or chrome would make them bounce |

#### 1B — Cognitive walkthrough (act as the user)

Walk the intended flow **in character**. For every step of the issue's workflow, ask:

1. **Goal** — What am I trying to do right now (not what the system is doing)?
2. **Discoverability** — Would I find the control without training? What do I click first by mistake?
3. **Meaning** — Do I understand the label, icon, badge, remaining quota, error in my language?
4. **Feedback** — After I act, do I know if it worked, is loading, or failed—and what to do next?
5. **Recovery** — If I fail (wrong plan, 0 credits, no connection, cap hit, empty library), can I fix it without support?
6. **Anxiety** — What would scare me (publish to wrong account, lose credits, look unprofessional)?
7. **Simplify** — What should the product hide, default, rename, or block earlier so I never hit this edge?

Capture findings as **candidate scenarios** (not implementation todos):

- Happy path (job completed)
- First-run / empty / zero-connection / free-tier walls
- Confused path (wrong mental model → still safe or guided)
- Error + recovery (actionable copy, not only HTTP status)
- Permission / plan / quota gates
- Mobile / touch / keyboard dual-path when the issue is UI
- pt-BR wording risk when the issue ships user-facing strings
- Regression of adjacent jobs (calendar, create, providers) the epic marks non-goals for *change* but still must not break

Trace candidates back to Example Map rules (`R#` / `R#-E#`). If the issue has no map, draft one in the issue comment or feature header before formulating.

#### 1C — Write `.feature` files

Under `tests/features/<domain>/`:

1. Follow `docs/bdd/gherkin-conventions.md` (tags, harnesses, ubiquitous language).
2. Prefer **observable user outcomes** in `Then` (UI state, DTO fields the user cares about, blocked action with reason)—not internal private method names.
3. Title scenarios by **behavior + outcome**, not implementation.
4. Include a feature-header comment listing unit/E2E coverage that lives elsewhere when relevant.
5. Run `bun run gherkin:generate` (commit generated artifacts later with the feature).

If the change is **genuinely not user-visible**, document the N/A reason and skip to Step 3 with unit/integration/regression only—still persona-check any operator-facing errors/logs if they surface in product UI.

**Quality bar for Step 1:** If a junior marketer / nano creator with medium patience would need a Loom to use the feature, the Gherkin is incomplete until confusion/recovery scenarios exist (or the product is simplified so those scenarios become impossible).

---

### Step 2 — Multi-lens validation (parallel)

Dispatch **four agents in a single message**. Full prompts + reconciliation: `references/gherkin-validation.md`.

| Lens | Focus |
|------|--------|
| **Persona / UX** | Fluency, JTBD fit, confusion/recovery, copy clarity, mobile/pt-BR; forces simplify vs document |
| **Business Analyst** | Every AC / Example Map rule maps to a scenario; outcomes are user-observable |
| **QA / Edge-Case** | Boundaries, authz, concurrency, idempotency, empty/max, failure modes |
| **Architect** | Feasibility in *this* codebase; correct test layer; reuse existing services/DI |

Reconcile: **blockers + majors must be fixed** in the features. Prefer simplify the product when persona and QA both flag the same confusion. Re-run `bun run gherkin:generate`. If revisions were material, re-run only the affected lens once. **Do not** pause for user approval here unless a product question is unresolved in the Example Map (then comment on the issue and ask).

---

### Step 3 — Red: failing tests at every applicable layer

**Do not implement product behavior yet.** Map each reconciled scenario (and each new branch the design needs) to the **lowest correct layer**, then write tests that fail first.

| Layer | When | How |
|-------|------|-----|
| **Unit** | Pure domain rules, mappers, validators, hooks, reducers, small UI pure helpers | `bun test <path>` — mock at package boundaries (see conventions) |
| **Integration** | Repos, services, Mongo, queues, rate-limit remaining, oRPC wiring | `RUN_MONGO_TESTS=1` / `bun run test:integration` as appropriate |
| **Acceptance** | User-visible rules expressed in Gherkin (use-case / domain / orpc harness) | `bun run gherkin:test --tags '…'` or generated suite for the feature |
| **Regression** | Adjacent non-goals must stay green; prior bugs for this surface; architectural token guards | Re-run related existing tests + dashboard `_architectural/` if dashboard UI |
| **E2E** | Multi-step browser journeys, auth, visual affordances that unit can't prove | Playwright against **`megazord.olhaminha.bio`** with test credentials |

**Coverage mandate:** every new branch, error path, permission check, validator boundary, queue/retry state, and user-recovery path gets a **direct** test at the right layer (CRAP risk). Persona confusion scenarios that only exist as “copy must say X” still need an assertion (string key / role text / disabled reason).

**Acceptance harnesses that `new` a use case:** after every rebase onto `develop`, re-open the **production constructor** and match arity/arg order.

**Prove red correctly:**

1. Run each new/changed test file.
2. Confirm failure is an **assertion / missing behavior**, not import/compile/setup.
3. Mutation/sensitivity: temporarily wrong expectation or missing branch still fails; restore.
4. A red that only errors is **not** a valid red—fix the test harness first.

Bind red evidence to an immutable commit:

1. Stage only the new/changed test and acceptance paths by name.
2. Commit the tests-only red state before production implementation; do not push the red-only commit by itself unless the user asks.
3. Require `git status --porcelain` to be empty, set `RED_SHA=$(git rev-parse HEAD)`, and rerun the focused red command at that commit.
4. Record `RED_SHA`, command, exit code, and the causal failure. A dirty run is only `dirty@RED_SHA` plus exact paths and cannot satisfy evidence. A timeout, import/setup error, or unrelated pre-existing failure is not valid red evidence.

If repository policy forbids a red commit, stop and document the policy conflict; do not label mutable working-tree output "SHA-bound."

---

### Step 4 — Green: implement the minimum

Only after Step 3 reds are honest:

1. Implement the **smallest** change that satisfies the tests, DDD layers (Domain → Application → Infrastructure → UI), existing services/DI tokens.
2. Prefer **product simplification** called out by persona scenarios (clearer empty state, earlier gate, better default) over piling more chrome.
3. Loop until reds go green; then full relevant suites + `bun run typecheck` + lint.
4. Dashboard TSX → also `bun test tests/unit/app/dashboard/_architectural/`.
5. Refactor while staying green.
6. Rebase onto the current target branch before creating the green candidate when needed; rerun affected acceptance tests.
7. Stage named in-scope files, commit the minimum implementation, require `git status --porcelain` to be empty, and set `GREEN_SHA=$(git rev-parse HEAD)`.
8. Rerun green/local gates on that clean committed SHA. Any dirty output is `dirty@GREEN_SHA` plus exact paths and cannot satisfy finalization.

Marketing/copy claims must stay inside `marketing/reference/product-truth.md` reality.

---

### Step 5 — Green-candidate visual verification

Only after Step 4 produced a clean committed `GREEN_SHA`, invoke **`/visual-app-verify`** (or project `visual-app-verify` / `dev-browser-visual-testing`) against **`megazord.olhaminha.bio`**. Walk the **persona happy path + one confusion/recovery path** from the Gherkin.

- Tunnel 530 / Unauthorized → ask user to restore tunnel; localhost only with explicit agreement.
- Collapsed UI must still **look expandable** (chevron/label/focus)—not pointer-only.
- Require a clean tree and record `VISUAL_SHA=GREEN_SHA`. This remains preliminary evidence; any later runtime/user-visible commit invalidates it, and `pr-finalization` reruns project visual verification on the stable final PR head.
- If visual verification reveals a defect, return to Step 4, commit the fix, rerun clean green gates, then repeat Step 5.

---

### Step 6 — Loop on failure

On any gate failure, return to the **earliest** broken step (often Gherkin or red honesty). Use systematic debugging, not guess-fixes. After ~3 unproductive cycles on the same gate, stop and report the blocker with evidence.

---

### Step 7 — Push, PR, finalization

Run **inside the issue worktree** with clean `HEAD == GREEN_SHA`.

1. If the target branch changed after Step 4, return to Step 4 for rebase, clean committed green evidence, and Step 5 visual verification. Do not rebase and reuse stale evidence here.
2. Push the **issue-linked branch**: `git push -u origin HEAD`. Verify `REMOTE_SHA=$(git ls-remote origin <branch> | awk '{print $1}')` equals `GREEN_SHA`.
3. **Confirm PR base with the user** (default `develop`) — only required human checkpoint.
4. `gh pr create --base <confirmed> --head <branch>` with: what/why, **`Closes #<issue-number>`**, SHA-tagged red/green evidence, acceptance scenarios, persona notes, worktree/branch name, no local paths.
5. Invoke **`pr-finalization`**. Pass the PR number, issue worktree, clean `RED_SHA`/`GREEN_SHA` evidence, acceptance paths, persona journeys, and preliminary visual notes. If finalization pushes another commit, update the candidate and rerun every invalidated final gate.

---

### Step 8 — SHA-bound handoff

Use the structured report returned by `pr-finalization`. Mandatory:

- **Final PR head SHA** and verified matching remote SHA.
- **Personas used** and top confusion risks addressed (or simplified away).
- **Red**: tests-only `RED_SHA`, command, exit code, and causal failure per major layer.
- **Green/local**: final candidate SHA, command, and pass; label replacement CI evidence separately from a local pass.
- **Acceptance coverage**: `.feature` paths/scenarios (or N/A reason) and tested SHA.
- **Test matrix**: unit / integration / acceptance / regression / E2E — what ran, what N/A, and SHA for each result.
- **CRAP-risk mitigation**: new branches/error paths with direct tests.
- **Final visual**: SHA, URL/journeys, artifact links, or explicit unavailable/N/A reason.
- **Review/CI**: zero unresolved threads and required-check conclusions queried for the same final SHA.
- **PR link** + `Closes #N`; do not claim the issue is closed until GitHub confirms the PR merged.
- **Branch + worktree**: issue-linked branch name; note if worktree was created or reused/skipped.
- **Outcome**: reproduce the `pr-finalization` outcome verbatim; this skill does not issue an independent readiness label. Never merge automatically.

Any evidence whose recorded SHA differs from the final PR head is stale and must be rerun or reported as stale—not carried into the handoff as passing.

---

## References

| File | When |
|------|------|
| `references/project-conventions.md` | Step 0 — commands, URLs, CI gotchas |
| `references/persona-gherkin.md` | Step 1 — personas, walkthrough, confusion → scenario catalog |
| `references/gherkin-validation.md` | Step 2 — four-lens prompts + reconciliation |
| In-repo `marketing/reference/audiences.md` | Segment JTBD / fluency |
| In-repo `marketing/reference/product-truth.md` | Capability truth before claims |
| In-repo `docs/bdd/gherkin-conventions.md` | Feature authoring rules |
| In-repo `docs/bdd/example-mapping.md` | Rules → examples → scenarios |

---
name: post-pr-merge
description: >
  Use when a PR is merged or the user wants post-merge / post-task cleanup:
  "PR merged", "post-pr-merge", "go back to develop and clean up",
  "pull latest and remove worktrees", "clean up after merge",
  leftover dev servers / bun visual scripts / next-server / browser automation
  consuming memory or battery, or runs /post-pr-merge.
  Not for creating PRs or addressing review feedback
  (use pr-review-loop / issue-to-pr for those).
---

# Post-PR Merge Cleanup

Run this **only after** a PR is merged (or the user confirms it is), or when the user asks for **post-task process cleanup**. Goal: leave the primary checkout clean on the latest integration branch, with no leftover worktrees, feature branches, **or orphaned task processes** (dev servers, visual scripts, browser automation).

## Defaults

| Setting | Default | Override |
|---|---|---|
| Integration branch | `develop` if it exists, else `main` | User says e.g. "back to main" |
| Remote | `origin` | Rarely needed |
| Scope of git cleanup | Only the finalized PR's `FEATURE` worktree/branch | Bulk merged-branch cleanup requires an explicit request, preview, and confirmation |
| Scope of process cleanup | Task leftovers + servers **bound to removed worktrees / feature paths** | User says "kill all next/dev" or "process audit only" |

## Phase 0 — Confirm context

1. Identify the **main checkout** (the non-worktree repo root). Prefer the workspace path the user is in; if the shell is inside a worktree, `cd` to the main worktree path from `git worktree list` (first entry without `.worktrees/` / `.claude/worktrees/`).
2. Require the finalization handoff values `PR_NUMBER` and `EXPECTED_HEAD_SHA` (the clean finalized candidate). Resolve current GitHub identity:
   ```bash
   gh pr view "$PR_NUMBER" --json number,url,state,headRefName,headRefOid,baseRefName,mergedAt,mergeCommit
   ```
   Require `state=MERGED`, non-null `mergedAt`/`mergeCommit.oid`, and `headRefOid == EXPECTED_HEAD_SHA`. The merge commit may differ after squash/rebase merge; record both. If the PR head differs, report **stale/overtaken** and stop destructive cleanup until the user explicitly confirms the newer merged head.
3. Capture and keep bound through Phase 6:
   - `PR_NUMBER`, `PR_URL`, `EXPECTED_HEAD_SHA`, observed `PR_HEAD_SHA`, `MERGE_COMMIT_SHA`, `MERGED_AT`
   - `BASE` = PR `baseRefName`
   - `FEATURE` = PR `headRefName` (never infer another branch when PR metadata exists)
   - `FEATURE_WORKTREE` plus exact neutral review handoff `REVIEW_FIX_WORKTREE` / `REVIEW_FIX_LOCAL_BRANCH` from `pr-review-loop` (when present)
   - `ISSUE_OR_SLUG` = issue number / branch slug for matching task-owned processes

Re-query the same identity immediately before worktree/branch deletion. A changed/missing/unknown response stops cleanup; network/auth errors are not evidence of merge or deletion.

**Process-only mode:** If the user only wants battery/process cleanup (no merge), skip Phases 1–4 and run Phase 5 only, still listing what you kill.

## Phase 0.5 — Serialize shared-checkout cleanup

The main checkout, integration branch, worktree registry, and task-owned ports are shared resources. Exactly one persistent cleanup driver must own them from before Phase 1 until Phase 6 finishes.

Use **only** `scripts/cleanup-lock-driver.sh`, documented in `references/commands.md`, as the lock recipe. It launches the cleanup plan in a dedicated session/process group and holds ownership through Phase 6. Its ready-file handshake proves the process-group identity before cancellation: a startup `INT`/`TERM` waits for helper readiness or proven exit, then signals the entire known group. It releases only after all descendants are proven quiescent; otherwise it retains the lock and exits unknown (75).

If the lock exists, inspect and coordinate with its owner. Never clear it unless the recorded process/session is proven gone. A failed/aborted driver must not be followed by another cleanup until lock release and child termination are verified.

## Phase 1 — Return to integration branch

```bash
cd <MAIN_CHECKOUT>
git status -sb
git fetch origin
git checkout "$BASE"
git pull --ff-only origin "$BASE"
```

Rules:
- Prefer `--ff-only`. If pull cannot fast-forward, stop and show the situation (do not force-reset unless the user asks).
- If the working tree is dirty on the feature branch and would block checkout, report it and ask before `stash` / discard.

## Phase 2 — Remove related worktrees

```bash
git worktree list
```

For each worktree path that is **not** the main checkout:

| Condition | Action |
|---|---|
| Exact `FEATURE_WORKTREE` from the finalization handoff | Remove only after registered, non-main, clean, and `HEAD == EXPECTED_HEAD_SHA` |
| Exact neutral `REVIEW_FIX_WORKTREE` from `pr-review-loop` | Same checks; branch must equal `REVIEW_FIX_LOCAL_BRANCH` |
| Any other merged/unrelated branch or worktree | **Leave it** by default |

Remove:

```bash
git worktree remove --force <path>   # --force OK for merged PR leftovers
# If remove fails with "Directory not empty":
rm -rf <path>
git worktree prune
```

Also prune empty parents (`.worktrees/`, `.claude/worktrees/`) when empty.

**Before removing either handed-off worktree:** prove its absolute path is registered by `git worktree list --porcelain`, is not the main checkout/current cwd, `git -C <path> status --porcelain` is empty, its checked-out branch matches the handed-off branch, and `git -C <path> rev-parse HEAD == EXPECTED_HEAD_SHA`. Any mismatch/dirty path stops cleanup. Note the path for Phase 5 process cleanup.

**Self-removal guard:** a worker whose own `pwd -P` is the worktree being removed must not delete it. When Herdr supervision is active, conditionally delegate the pre-delete report and pane lifecycle to `herdr-delivery-supervisor`; that Pi-specific skill is the sole authority for its report schema. A supervisor or different cleanup pane performs removal from the main checkout.

## Phase 3 — Delete local feature branch(es)

From the main checkout (never delete a branch checked out elsewhere):

```bash
for branch in "$FEATURE" "${REVIEW_FIX_LOCAL_BRANCH:-}"; do
  [[ -n "$branch" ]] || continue
  git show-ref --verify --quiet "refs/heads/$branch" && git branch -D -- "$branch"
done
```

Delete only the exact `FEATURE` and handed-off neutral review-fix local branch by default. Bulk deletion of any others requires explicit request, preview, and confirmation. Never bulk-delete unmerged/protected branches.

## Phase 4 — Remote branch

Classify remote deletion as one of `absent`, `success`, `failure`, or `unknown` using the authoritative recipe in `references/commands.md`.

- `absent`: exact `git ls-remote --exit-code --heads origin refs/heads/$FEATURE` returned 2 before deletion.
- `success`: the exact lookup returned 0, deletion was attempted, and the same lookup then returned 2.
- `failure`: the post-delete exact lookup still returned 0.
- `unknown`: the exact lookup returned anything other than 0/2, including auth/network/timeout failures.

Never infer absence from metadata/API 404, redirect errors away, or append `|| true`. Delete only after an exact lookup returns 0. On `failure`/`unknown`, stop destructive remote cleanup and report the exact error. Run `git fetch --prune` only after classified `absent`/`success`.

## Phase 5 — Kill leftover task processes (memory / battery)

**Always run this after merge cleanup** (or alone in process-only mode). Orphaned visual scripts and worktree `next-server` processes routinely spin at high CPU for hours.

### 5.1 Audit first (print, do not kill yet)

```bash
# High-signal leftovers
ps -axo pid,pcpu,pmem,rss,etime,command | rg -i \
  'next-server|next dev|bun run dev|visual-|tmp-visual|v[0-9]+-|agent-browser|dev-browser|playwright.*browser|chromium|cloudflared' \
  | rg -v 'rg -i'

# Ports commonly used by local app servers
lsof -iTCP -sTCP:LISTEN -P -n 2>/dev/null | rg ':(3000|3001|3010|3011|4000|5173|8080|9222)\b' || true
```

Group findings into kill tiers (table below). Show the user a short list of PIDs you will kill when anything is ambiguous.

### 5.2 Kill tiers

| Tier | What | Default action |
|---|---|---|
| **A — always kill** | Stuck **visual / headed / agent test** scripts: `bun /tmp/visual-*.mjs`, `bun tmp/visual-*.mjs`, `bun tmp/v*-*.mjs`, `bun tmp-visual-*.mjs`, long-running `bun …visual…` with no active user intent | Kill |
| **A — always kill** | Processes whose **command line or cwd** contains a **worktree path you just removed** (or still under `.worktrees/` / `.claude/worktrees/` for this feature) — `next-server`, `next dev`, `bun run dev`, postcss child, etc. | Kill process group |
| **A — always kill** | Orphan **Playwright / Chromium / agent-browser / dev-browser** browsers left by automation (not the user's daily Chrome/Firefox app) | Kill |
| **B — kill if tied to this task** | `next-server` / `next dev` on ports from this task (often `:3000` worktree, sometimes `:3010`) when command path matches repo worktree or feature slug | Kill |
| **B — kill if duplicate** | Extra `cloudflared tunnel run` for the **same** tunnel when more than one is running after this task | Kill extras; keep one if still needed for active tunnel work |
| **C — leave alone** | User's interactive **Chrome / Firefox / Safari** (normal browser apps) | Leave |
| **C — leave alone** | **MCP servers** for the **current** agent session (`playwright-mcp`, figma, serena, shadcn, n8n, context7, …) | Leave |
| **C — leave alone** | `tsserver` / `typescript-language-server` for open editors | Leave |
| **C — leave alone** | Unrelated `next-server` on main checkout the user still wants, Docker/VMs, WezTerm, system processes | Leave unless user asked for full process cleanup |

### 5.3 Safe kill commands

Prefer **process groups** so Turbopack/postcss children die with the parent:

```bash
# Tier A — visual / tmp test scripts (examples; resolve real PIDs from audit)
kill -- -$(ps -o pgid= -p <PID> | tr -d ' ') 2>/dev/null || kill <PID>
# If still alive after 2s:
kill -9 <PID> 2>/dev/null || true

# Tier A/B — next/bun tied to a removed worktree path
# Match by path fragment from WORKTREE_PATHS / feature slug:
pgrep -fl 'next-server|next dev|bun run dev' 
# For each matching PID whose command contains the worktree path:
kill -- -$(ps -o pgid= -p <PID> | tr -d ' ') 2>/dev/null || kill <PID>

# Automation browsers (not Google Chrome.app daily use)
pgrep -fl 'agent-browser|dev-browser|ms-playwright|playwright.*chromium|headless_shell' 
# kill matching PIDs / groups
```

**Never** `killall node` or `killall bun` — that destroys MCP servers, editors, and unrelated work.

### 5.4 Temp file leftovers (optional)

After killing scripts, remove obvious one-shot artifacts from this task if present and unused:

```bash
# Only paths clearly from visual/agent runs — do not wipe unrelated /tmp
rm -f /tmp/visual-*.mjs /tmp/tmp-visual-*.mjs 2>/dev/null || true
# Repo-local only if not tracked and from this task:
# rm -f tmp/visual-*.mjs tmp/v*-*.mjs tmp-visual-*.mjs
```

Do not delete tracked files or user data under `tmp/` without checking `git status`.

### 5.5 Re-audit

```bash
ps -axo pid,pcpu,pmem,rss,etime,command | rg -i \
  'next-server|next dev|bun run dev|visual-|tmp-visual|agent-browser|dev-browser' \
  | rg -v 'rg -i' || echo "No leftover task processes found."
lsof -iTCP -sTCP:LISTEN -P -n 2>/dev/null | rg ':(3000|3001|3010|3011)\b' || echo "No app ports 3000/3010 listening."
```

If anything **Tier B** remains and might still be intentional, report it instead of force-killing.

## Conditional Herdr delegation

When `HERDR_ENV=1` and a supervised worker/pane is involved, invoke `herdr-delivery-supervisor` before deleting any worker worktree and after cleanup for pane lifecycle. Do not duplicate or reinterpret its handoff schema here. Without that skill or a proven idle/exited writer, retain ownership/lock and do not remove the worktree.

## Phase 6 — Verify git state

Print a short status block:

```bash
git status -sb
git branch -vv
git worktree list
git log -3 --oneline
```

Success criteria:
- On `$BASE`, in sync with `origin/$BASE` (or clearly ahead only if user pushed more)
- No worktree remains for `$FEATURE`
- Local `$FEATURE` branch is gone
- Working tree clean (or only pre-existing unrelated dirt the user already knew about)
- No Tier A leftover processes; no `next-server` still bound to removed worktree paths
- Persistent cleanup driver held the lock continuously through this verification; its normal exit then released it
- Under Herdr, no live pane remains rooted in a deleted worktree

## Safety

- Never `git reset --hard` or wipe uncommitted work without an explicit user ask.
- Never delete `main` / `develop` / `staging`.
- Never remove a worktree whose branch is **not** merged and is not the PR feature branch, unless the user requested a full cleanup.
- Do not touch other remotes or force-push.
- Never blanket-kill `node` / `bun` / `Chrome` / MCP servers for the live session.
- When in doubt on a process: **list PID + command + ask**, then kill only confirmed leftovers.
- Do not print full `cloudflared` tokens from `ps` output in the handoff (redact tokens).

## Handoff

One short summary:

- PR number/URL, `EXPECTED_HEAD_SHA`, observed PR head SHA, merge commit SHA, and merged timestamp; explicitly mark stale/overtaken if they differed
- Base branch + tip SHA
- Worktrees removed
- Branches deleted (local / remote) and remote result classification (`absent|success|failure|unknown`)
- **Processes killed** (PID + short command) and **ports freed**
- Shared cleanup lock owner/release result
- Herdr pane lifecycle: worker report captured; stale pane rehomed/closed/retained by supervisor
- Anything left intentionally (e.g. unrelated worktree, main `:3010` server, one cloudflared, current MCP set)

## Triggers (examples)

- "PR merged. Go back to develop, pull, clean worktrees and the branch."
- "/post-pr-merge"
- "cleanup after merge"
- "kill leftover bun/next processes after the task"
- "clean up memory/battery from visual tests / next-server"

## Reference

Detailed command recipes: `references/commands.md`

---
name: pr-review-loop
description: >
  Address open PR review feedback end-to-end and return a SHA-bound
  ready-for-finalization or blocked result. Use for "check PR comments", "fix review
  feedback", "address review threads", or when pr-finalization delegates review repair.
  Fetches human and bot threads with retry/fallback discovery, classifies runtime and
  user-visible fixes, works in isolation, tests, pushes/verifies, and replies/resolves
  fail-closed. Reports timeouts and branch/merge races honestly. Not for final merge
  readiness decisions or performing a new code review.
---

# PR Review Loop

End-to-end workflow for closing out an open PR: fix every actionable comment, ship, reply, resolve, and confirm CI for one immutable PR head. The loop terminates only when (a) every review thread is resolved or explicitly deferred, (b) every required check is successful, (c) local and remote head SHAs match, and (d) a final rediscovery proves those results still describe the same SHA.

**Freeze merge throughout the loop.** Never merge automatically and never tell the user the PR is ready while discovery is partial, a wait timed out, required checks are pending, visual evidence was invalidated, or the PR head changed after evidence collection.

## When to invoke

User-facing triggers (from the description) all map to one of two intents:

1. **"Fix the comments"** — humans + bots have left review feedback. Address each one, push, reply, resolve.
2. **Delegated finalization repair** — `pr-finalization` asks this skill to clear actionable feedback and return a stable review/CI snapshot.

Either path runs the same loop. Stop only at **ready-for-finalization**, **blocked/unknown**, or **already merged**. Final readiness labels belong exclusively to `pr-finalization`.

## The loop (overview)

```
1. Discover    → fetch PR meta + every review thread + CI checks
2. Classify    → severity per comment, group by file, dedupe overlapping requests
3. Plan        → present a short triage summary; ask the user before fixing if scope is non-trivial
4. Implement   → in an isolated worktree, write code + tests, run verification
5. Push & verify → push, then `git ls-remote` to confirm the remote tip matches local HEAD
6. Reply & resolve → one inline reply per thread referencing the fix commit, then resolve via GraphQL
7. CI check    → poll checks for the candidate SHA; failure or a new push goes back to 1
8. Rediscover  → prove PR head, remote tip, threads, and required checks still agree
```

Run discovery + CI check in parallel where possible — they're independent.

## Phase 1: Discover

Use `scripts/pr-state.sh <pr-number>` to fetch a fail-closed snapshot. It cursor-paginates threads, aggregates paginated issue comments, queries required checks, then proves `headRefOid` was unchanged before/after and emits `snapshot.verified=true` plus `snapshot.check_head_sha`. A drift exit is unknown, not an old-head snapshot.

Network discovery is fail-closed:

1. Let the script retry transient `gh` failures with bounded backoff.
2. If the script is unavailable or one endpoint keeps failing, run the independent REST/GraphQL fallbacks in [`references/gh-commands.md`](references/gh-commands.md).
3. If any required surface is still unavailable, classify discovery as **unknown**, keep merge frozen, and report which endpoint failed. Never turn a network error into an empty thread/check list.

Do not skip threads because they look stale—resolved threads are filtered server-side. Capture `state`, `mergedAt`, `headRefName`, `headRefOid`, and `mergeCommit` before touching a branch. If the PR is already merged, do not push/reply/resolve new work; jump to **Races and terminal state**.

For each thread, capture:
- `databaseId` (numeric, used for replies)
- thread `id` (`PRRT_*`, used for the resolve mutation)
- `author.login` (humans vs bots — see [`references/triage.md`](references/triage.md))
- `body` (the actual feedback)
- `path` + `line` (so you know which file to open)
- `isResolved` (skip if already true)

## Phase 2: Classify

Read [`references/triage.md`](references/triage.md) for the full taxonomy. Quick rules:

- **Blocker / P0 / `[issue]`** — must fix before merge.
- **Suggestion / P1 / `[suggestion]`** — fix unless there's a strong reason not to.
- **Nit / P2 / `[nit]`** — fix if cheap; defer with a follow-up issue if not.
- **Question / P3 / `[question]`** — answer in a reply; only edit code if the answer requires it.

Bots speak in their own dialect (Codex P0–P3 badges, Copilot category prefixes, **verstand-agent-reviewer** quality/simplicity panels). Treat their findings on the same severity ladder, but discount confidence: bots produce more false positives.

**Dedupe before fixing.** Two reviewers often flag the same line **and** agent panels often post **duplicate threads** for the same consolidation request (e.g. two comments both saying “merge three switch statements”). Group by `path` + semantic intent. **One fix → multiple replies** citing the same commit.

**Cheap bot-panel batch:** if ≥3 findings are all pure nits/simplifications with no auth/billing/schema risk (dead string types, inline trivial helpers, missing unit for a pure helper, i18n leftover English), implement the batch without waiting for user confirmation — still list them in the final handoff.

For every accepted fix, also classify delivery impact:

- **Runtime/user-visible** — changes production code, rendered UI/copy, API behavior, auth/billing, migrations, runtime config, generated runtime assets, or browser-observable flows.
- **Non-runtime** — tests, comments, types with no emitted/runtime effect, or documentation only.

Any runtime/user-visible commit invalidates visual evidence for every earlier SHA. Set `visualEvidence=invalidated` in the ledger and require project visual verification during `pr-finalization` before readiness. Do not decide this from file extension alone; a config or generated-file change can be runtime-visible.

## Phase 3: Plan (only if scope warrants it)

For ≤2 trivial fixes, just go. For ≥3 fixes or any blocker, post a one-paragraph triage summary back to the user before editing — list each thread, its severity, and the proposed fix. Wait for confirmation if any fix is non-obvious or touches a sensitive surface (auth, billing, migrations).

## Phase 4: Implement

Reuse a caller-provided worktree when it is safe: it must be registered by `git worktree list --porcelain`, point at the PR head branch (or exact `headRefOid`), contain no unrelated dirty paths, and not be the shared main checkout. Record its absolute path and branch.

Otherwise use the neutral, idempotent location `.worktrees/pr-<N>-fixes` and local branch `pr-<N>-fixes`:

```bash
git fetch origin <pr-branch>
WT_PATH=".worktrees/pr-<N>-fixes"
LOCAL_FIX_BRANCH="pr-<N>-fixes"
# Reuse an already registered matching worktree only when clean and the current
# PR head is its HEAD or an ancestor. If path/branch exists with another identity,
# is registered elsewhere, or contains unrelated dirt, stop instead of resetting it.
git worktree add -b "$LOCAL_FIX_BRANCH" "$WT_PATH" <PR_HEAD_SHA>  # only when absent
cd "$WT_PATH"
```

Never force/reset an existing neutral branch or path. Push with `git push origin HEAD:<pr-branch>`. Include caller/neutral worktree path, local branch, and remote PR branch in the `post-pr-merge` cleanup handoff.

Implement each fix. After every logical group of edits, run the project's verification triad:

- **tests** (`bun test`, `pnpm test`, `npm test`, `pytest`, etc. — look at `package.json` scripts or repo conventions)
- **typecheck** (`bunx tsc --noEmit`, `tsc --noEmit`, `pyright`, `mypy`)
- **lint** (`biome check`, `eslint`, `ruff`)

If the project has a pre-push hook that runs the same checks, you'll catch it twice — but pre-push runs against ALL files and can be slow; running incrementally during implementation is faster feedback.

**Never claim a fix is done without running the relevant test.** Evidence before assertions. A run with any `git status --porcelain` output is `dirty@<HEAD>` plus the exact dirty paths; it cannot satisfy finalization. Commit named in-scope paths, require a clean tree, then rerun the command on the committed SHA. Unrelated dirt blocks use of that worktree.

## Phase 5: Push and verify

`git push origin HEAD:<pr-branch>` is **not** sufficient confirmation. Pre-push hooks can exit 0 without actually pushing in pathological cases. Always:

```bash
CANDIDATE_SHA=$(git rev-parse HEAD)
REMOTE_SHA=$(git ls-remote origin "refs/heads/<pr-branch>" | awk 'NR==1{print $1}')
test "$REMOTE_SHA" = "$CANDIDATE_SHA"
```

Only then is the push verified. Every push starts a new candidate: invalidate prior CI, thread-discovery, and final visual evidence unless each source explicitly reports the new SHA. Re-enter discovery before declaring termination.

If the branch disappears or a push is rejected while the loop runs, do not recreate it immediately. Rediscover the PR first; GitHub may have merged the PR or auto-deleted the branch.

## Phase 6: Reply and resolve

For each thread, post one inline reply that:
1. Confirms the fix landed (cite the commit SHA, e.g. `Fixed in 5b6d7253e.`)
2. States *what* changed in one sentence
3. Adds *why* if the user proposed an alternative you didn't take

Follow the fail-closed recipe in `references/gh-commands.md`. Maintain `VERIFIED_REPLIED_THREADS` containing only IDs whose reply call returned valid JSON for the expected parent comment. A timeout/nonzero/invalid response makes that reply unknown and the thread remains unresolved.

Resolve **only** `VERIFIED_REPLIED_THREADS`, using `scripts/resolve-threads.sh`. The script requires GraphQL `errors` to be empty, the returned ID to match, and `isResolved=true`; otherwise it exits nonzero. Rediscover threads after mutation before reporting success.

## Phase 7: CI check

```bash
gh pr checks <pr-number>
```

Query checks and confirm they belong to `CANDIDATE_SHA`. If anything is `pending`, wait with a bounded timeout appropriate to the workflow, then rediscover (see [`references/ci-debugging.md`](references/ci-debugging.md)).

A timeout, interrupted watch, rate limit, or transport error means **unknown**—neither pass nor failure. It does not satisfy the gate and must not be reported as "CI timed out/fails." Rediscover once; if status remains unavailable, stop blocked/unknown.

**Do not declare “review loop done” when threads are resolved but required checks are red, pending, stale, or unknown.** Threads empty ≠ mergeable.

If a check **failed**:

1. Identify the failing run: `gh run view <run-id> --log-failed | tail -200` (or `rg` the log for `error:` / `fail)`).
2. Reproduce locally if possible. Don't speculate about the failure cause from the title alone.
3. **macOS-pass / CI-fail patterns for this monorepo** (see also `issue-to-pr` conventions):
   - `ReferenceError: sessionStorage is not defined` / `localStorage is not defined` → free identifier bug; use `globalThis.*` (Linux Bun).
   - Architectural token fails (`rounded-lg`, `duration-200`) → dashboard `_architectural` suite.
   - `is not a function` in acceptance steps after rebase → harness constructor arity drift.
4. Treat the failure as a new "review comment" — go back to Phase 4, fix, push (**ls-remote verify**), then re-poll Phase 7.
5. The loop terminates only when required checks for `CANDIDATE_SHA` pass, every thread is resolved/deferred, remote head still equals `CANDIDATE_SHA`, and a final rediscovery observes no newer head.

For deep debugging of CI failures (matrix builds, flake detection, log spelunking), see [`references/ci-debugging.md`](references/ci-debugging.md).

## Termination criteria

All must hold for the same `CANDIDATE_SHA`:

- Local evidence was rerun on a clean committed tree; `dirty@SHA` evidence is invalid.
- Remote branch tip equals local candidate SHA.
- Unresolved review thread list is empty (or only threads the user explicitly deferred with reasons).
- Every required check has a successful/skipped conclusion for that SHA. `mergeStateStatus: BLOCKED` while checks run is not done.
- Runtime/user-visible fixes have their older visual evidence marked invalidated; readiness is deferred to `pr-finalization` until replacement visual evidence is captured when available.
- Final rediscovery returns the same open PR head SHA.

If a gate fails after 3 fix-and-push cycles, stop blocked and brief the user. A bug you cannot reproduce locally or a reviewer who keeps moving goalposts deserves a human conversation, not unbounded autonomous attempts.

## Races and terminal state

- **Already merged:** stop mutation immediately. Fetch `mergedAt`, `mergeCommit.oid`, and the last observed PR head. Report that readiness was overtaken by merge and whether evidence covered the merged head; do not retroactively claim unobserved gates passed. Route confirmed-merge cleanup to `post-pr-merge` through `pr-finalization`.
- **Open PR, deleted/missing head branch:** report remote SHA as missing and readiness blocked. Do not claim a successful push or recreate the branch without user confirmation; a fork permission change or force-delete may be involved.
- **State changes during reply/resolve:** rediscover before the next mutation. A merged/closed PR ends the review-fix loop; preserve unsent work and report it.
- **Timeout/rate limit/network failure:** report the affected surface as unknown. Empty output is not proof of zero threads or checks.

## Structured final report

Always return this shape to `pr-finalization` or the user:

```markdown
## PR Review Loop Report
- PR: <url> — state: OPEN | MERGED | CLOSED
- Candidate SHA: <full sha | unknown>
- Remote head: <full sha | missing | unknown> — match: yes | no | unknown
- Fix commits: <sha + thread ids + runtime/user-visible yes/no>
- Worktree cleanup handoff: <absolute worktree path; local branch; remote PR branch>
- Local evidence: <clean command/result/SHA | dirty@SHA + exact paths; never relabel CI as local>
- Visual evidence: valid@<sha> | invalidated-by-<sha> | unavailable/not-run
- Threads: <resolved/deferred/unresolved counts> — observed at <snapshot.check_head_sha | unknown>
- Required CI: <check/state/bucket/link/workflow> — fenced by <snapshot.check_head_sha | unknown>
- Discovery fallbacks/retries: <used/not used + failures>
- Outcome: ready-for-finalization | blocked/unknown | already-merged
- Residual risks: <none or explicit list>
```

`ready-for-finalization` is the only success label from this skill. It is not final readiness or permission to merge; `pr-finalization` owns those decisions.

## Anti-patterns

- **Replying without committing the fix first.** Reviewers see "fixed in <sha>" and click — if the SHA isn't on the branch yet, you've lied.
- **Resolving without replying.** Reviewers can't tell if a resolved thread was addressed or dismissed. Always reply *then* resolve.
- **Skipping `git ls-remote`.** A successful-looking `git push` plus a backgrounded pre-push hook is the most common way to ship "I pushed it" claims that aren't true.
- **Marking a comment "won't fix" without a reason.** If you're declining a suggestion, the reply must say *why* (link to a rule, an incident, or a constraint). Otherwise the thread reopens.
- **Treating bot comments as gospel.** Codex/Copilot generate confident-sounding false positives. Read the actual code before fixing.
- **Skipping CI verification.** "All threads resolved" does not satisfy `ready-for-finalization`; CI is also required.

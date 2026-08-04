---
name: pr-finalization
description: >
  Compose the final delivery loop for an existing pull request: run pr-review-loop,
  rerun project visual verification when available, and require review-thread, CI,
  remote-head, and immutable-SHA agreement before reporting readiness. Use after opening
  a PR, after review fixes, or when asked to finalize/prepare a PR for human merge. Never
  merges automatically; after GitHub confirms a merge, routes cleanup to post-pr-merge.
---

# PR Finalization

Produce one honest delivery verdict for one immutable PR head SHA. This is a thin composition skill: delegate review repair to **`pr-review-loop`**, visual journeys to the project's existing visual-verification skill/harness, and confirmed-merge cleanup to **`post-pr-merge`**.

## Invariants

- Never merge automatically. Final authority stays with the human/repository merge policy.
- Bind every local, visual, review-thread, remote, and CI result to a full commit SHA backed by a clean committed tree. Any dirty run is `dirty@<SHA>` plus exact paths and cannot satisfy finalization.
- A commit, force-push, review-fix push, or changed PR head invalidates final evidence for every older SHA.
- Keep merge frozen while any required gate is failed, pending, stale, partial, timed out, or unknown.
- Treat timeout/network failure as unknown—not pass or failure.
- Do not call replacement CI evidence a local pass.

## Inputs

Resolve and retain:

- PR number/URL and repository
- local issue/PR worktree and head branch, when available
- candidate local SHA and remote PR `headRefOid`
- red/green commands with their SHAs
- acceptance paths and project-required gates
- runtime/user-visible impact and visual journeys/artifacts already attempted

If local and remote heads differ, stop or reconcile before using local evidence. If `git status --porcelain` is non-empty, record `dirty@HEAD` with exact paths, commit only in-scope changes through the owning workflow, and rerun; never promote dirty evidence.

## Finalization loop

### 1. Establish the candidate

Fetch PR state, `headRefOid`, branch, merge state, required checks, and unresolved threads. Set `CANDIDATE_SHA` only from a successful response. When a local worktree is in scope, require local `HEAD`, remote branch tip, and PR `headRefOid` to match and require an empty `git status --porcelain` before accepting local evidence.

If the PR is already merged, skip all open-PR mutation. Preserve the prior `FINALIZED_CANDIDATE_SHA`, fetch actual PR `headRefOid`, `mergedAt`, and `mergeCommit.oid`, and continue to **After confirmed merge** without claiming unobserved pre-merge gates passed.

### 2. Run `pr-review-loop`

Invoke `pr-review-loop` for the PR and consume its structured report.

- If it pushes a commit, replace `CANDIDATE_SHA`, invalidate CI/thread/final-visual evidence, and repeat from Step 1.
- If it reports blocked/unknown, stop with that outcome.
- If it reports already merged, continue to confirmed-merge handling.
- Continue only when its remote SHA, thread discovery, and required checks describe the same candidate.

### 3. Run final project visual verification when available

Determine availability from discovered skills, repository instructions, and existing scripts—do not invent a second visual stack.

For runtime/user-visible changes, rerun the project's visual skill/harness on `CANDIDATE_SHA`, including the primary happy path and one relevant error/confusion/recovery path. Record:

- full SHA
- environment/URL
- exact journey
- result and artifact/screenshot links
- blocker or N/A reason

Prior visual evidence invalidated by a review fix cannot be reused. For any runtime/user-visible change with an available harness, **`pass@CANDIDATE_SHA` is mandatory**; failed, unavailable, invalidated, stale, timed-out, or unknown evidence blocks readiness. `N/A` is allowed only when the change is genuinely non-visual or no harness genuinely exists, and must include the explicit reason and residual risk. Never convert harness failure/unavailability into N/A when the harness is available.

Visual verification must not edit production files. If it reveals a defect, return to the owning implementation workflow, push the fix, and restart at Step 1.

### 4. Re-query hard gates

After visual verification, fetch fresh PR state and require all of these for `CANDIDATE_SHA`:

- PR remains open and `headRefOid` is unchanged
- remote branch tip equals the candidate
- unresolved review threads are zero, except explicit documented deferrals
- every repository-required CI check is successful/skipped and reports this head
- branch protection/merge state has no unexplained blocker
- required visual evidence is valid for this candidate

If a reviewer, bot, CI repair, or user pushes a new head at any point, invalidate the ledger and restart. Bound autonomous repair to three fix-and-push cycles; then return blocked with evidence.

### 5. Report; do not merge

```markdown
## PR Finalization Report
- PR: <url> — state: OPEN | MERGED | CLOSED
- Final candidate SHA: <full sha | unknown>
- Local/remote/PR head: <sha/sha/sha> — match: yes | no | unknown
- Review loop: <report summary; thread counts; fix SHAs>
- Local evidence: <clean command/result/SHA | dirty@SHA + exact paths (invalid) | not-run>
- Replacement CI evidence: <check/url/SHA or none> (not a local pass)
- Visual: <pass@SHA + URL/journeys/artifacts | N/A reason | invalid/unknown>
- Required CI: <check/conclusion/url/SHA>
- Threads: <resolved/deferred/unresolved counts observed at SHA>
- Evidence invalidations/retries: <what changed and loops used>
- Outcome: READY FOR HUMAN MERGE | BLOCKED/UNKNOWN | ALREADY MERGED | ALREADY MERGED — STALE/OVERTAKEN
- Residual risks: <none or explicit list>
```

`READY FOR HUMAN MERGE` is a report, not permission or an instruction to run `gh pr merge`.

## After confirmed merge

Query GitHub again for `number,url,state,headRefName,headRefOid,baseRefName,mergedAt,mergeCommit`. Compare actual merged PR `headRefOid` with `FINALIZED_CANDIDATE_SHA`:

- Equal: invoke **`post-pr-merge`** with `EXPECTED_HEAD_SHA=FINALIZED_CANDIDATE_SHA`, PR identity, base/head branches, merge commit, worktree/local-branch cleanup handoff, and any Herdr ownership.
- Different: report **ALREADY MERGED — STALE/OVERTAKEN**, name both SHAs, and do not claim the finalized gates covered the merged head. Do not start destructive cleanup without explicit user confirmation of that newer identity.
- Query unavailable: report unknown and do not clean up.

Let `post-pr-merge` recheck the same identity and serialize main-checkout cleanup.

When a Herdr worker occupies the worktree being deleted, require its pre-delete report; the supervisor removes the worktree from another pane and then rehomes or closes the stale worker pane.

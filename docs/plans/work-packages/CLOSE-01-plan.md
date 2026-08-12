# CLOSE-01 — Post-E2E closeout

One PR. Isolated worktree: `/Users/leonardoribeiro/worktrees/dotfiles-closeout01`.
Branch: `feat/pi-herdr-closeout01`. Human merge only.

## Goal

Close the five leftovers after the 23-package merge so the high-assurance
stack can be reviewed, adopted, and handed off without invented evidence.

## Tracked items

| ID | Item | Status | Evidence |
|---|---|---|---|
| C1 | BDD worktree evidence binding | done | Worktree-local binder returns `.pi/bdd-evidence.json` and refuses parent identity |
| C2 | Live child-delegation startup | in progress | Test files excluded from extension globs; import.meta.dir path fix applied |
| C3 | OPS-01 evidence reconciliation | done | Planner records acceptance and leaves lost red/green missing |
| C4 | Cross-machine/live package acceptance | done | Planner-only; blocked without named approved target |
| C5 | Post-E2E review fleet + remediation | in progress | Operator approved 2026-08-12; three-person architecture/security/operator review dispatched |

Status values: `not started` · `in progress` · `blocked` · `done`.

## Implementation order

1. **C1 first.** External-worktree `bdd_assert_*` evidence must persist in the
   worktree that recorded it. Without this, later closeout handoffs remain
   incomplete by construction.
2. **C2 next.** Full child Pi must load the personal package without
   `approval-seams.test.ts` or undefined-path `agentic-fleet.ts` failures.
   Live `pi-subagents` spawn is a hermetic negative/positive fixture plus a
   bounded live probe; no product fleet until C5 approval.
3. **C3.** Reconstruct OPS-01 package evidence from merged commits and current
   main. Record acceptance/mutation/handoff honestly; do not fabricate lost
   historical red/green.
4. **C4.** Add conservative live-acceptance planners and operator docs for
   second-machine install, selected-product adoption, disable, rollback, and
   restow. Do not mutate this machine's real HOME or a product repo unless
   the operator explicitly approves a named target.
5. **C5 last.** Ask for explicit operator approval plus current backend and
   security evidence. Only then dispatch a three-person Grok review fleet
   (architecture, security, operator). Remediate accepted P0–P2 with new
   red/green slices. Do not treat a missing approval as success.

## Non-goals

- No automatic merge, lease release, cleanup execution, budget increase, or
  live fleet without current human approval.
- No install into this machine's real HOME as a side effect of tests.
- No product-repo adoption without a named, approved target.
- No generic public package extraction.

## Acceptance

- C1–C4 have causal reds, covering greens, and recorded evidence.
- C5 is either executed with approval and synthesis, or explicitly blocked
  with the missing approval named.
- Root tests pass on the immutable candidate.
- Independent review is GO or remaining findings are accepted/deferred with
  reasons.
- PR is opened; human merge only.

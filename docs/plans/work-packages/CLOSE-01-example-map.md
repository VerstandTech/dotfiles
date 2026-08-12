# CLOSE-01 Example Map — Post-E2E closeout

## Scope

Close the five leftovers after the 23-package merge: worktree-bound BDD
evidence, live child-delegation startup, OPS-01 evidence reconciliation,
conservative live-package acceptance, and an operator-gated review fleet.

## Rules and representative examples

### R1 — Evidence binds to the recording worktree
- E1: `bdd_assert_red` / `bdd_assert_green` recorded in an isolated worktree
  remain readable from that worktree after later parent-session VERIFY.
- E2: A parent checkout session cannot overwrite, clear, or claim another
  worktree's red/green as its own.
- E3: Missing worktree identity fails closed as `unknown`, never as empty
  success.

### R2 — Handoff reports recorded evidence or an honest gap
- E4: `bdd_handoff` in the recording worktree includes the recorded red and
  green commands.
- E5: If evidence is unavailable, handoff says `unknown`/`missing` and never
  invents fields.

### R3 — Personal package discovery excludes tests as extensions
- E6: `./extensions/*.ts` plus an explicit test exclusion does not load
  `approval-seams.test.ts`.
- E7: A `*.test.ts` file remaining under `extensions/` is not a loaded
  extension.

### R4 — Full child Pi starts without undefined-path fleet failure
- E8: Packaged `pi --list-models` / discovery from a staged HOME does not
  emit `The "path" argument must be of type string`.
- E9: `agentic-fleet.ts` resolves its own module directory from a real file
  URL, not `import.meta.dir`.

### R5 — Live child delegation is proven or honestly blocked
- E10: A bounded `pi-subagents` spawn through the loaded personal package
  either starts a child or returns a stable non-echoing refusal.
- E11: Extension-load failure is `child-startup-unavailable`, not success.
- E12: Live product fleets still require operator approval.

### R6 — OPS-01 evidence is reconstructed, not invented
- E13: OPS-01 acceptance path, mutation note, and current root-green fact
  are recorded from existing merged artifacts.
- E14: Lost historical red/green remain `missing`/`unknown`.

### R7 — Live package acceptance is planner-only unless approved
- E15: Second-machine, product-repo, disable, rollback, and restow plans
  are documented and tested as planners.
- E16: Missing named target or human approval returns
  `operator-approval-required`.
- E17: Tests never mutate this machine's real HOME.

### R8 — Review fleet is gated
- E18: Without current operator approval and backend/security evidence,
  C5 remains `blocked`.
- E19: With approval, a three-person architecture/security/operator review
  is dispatched and synthesized.
- E20: Accepted P0–P2 findings become new red/green slices before PR.

### R9 — One writer, no invented authority
- E21: CLOSE-01 cannot merge, raise budgets, release foreign leases, or
  execute cleanup.
- E22: Unrelated worktrees and the three intentional local config files
  remain untouched.

## Questions

- Q1: Which product repository is the approved C4 adoption target? Ask
  before any product-repo mutation.
- Q2: Which second machine/environment is the approved C4 live target?
- Q3: May C5 dispatch a live three-person Grok review in this session?

## Non-goals

- No generic public package extraction.
- No overnight/strict live dogfood unless separately approved.
- No fabrication of lost historical BDD evidence.

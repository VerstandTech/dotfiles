# E2E-01 Example Map — Golden high-assurance workflow

## Scope

A deterministic, harmless fixture proves the merged v1 high-assurance components compose without granting new authority. The fixture models the workflow; it does not start live agents, install packages, access the network, mutate a real project, merge a PR, or execute cleanup.

## Rules and representative examples

### R1 — Input is closed and versioned
- E1: `schemaVersion: 1` with only declared fields is accepted.
- E2: Unknown keys, arrays, accessors, prototypes, cycles, control characters, or oversized values are refused with stable non-echoing codes.

### R2 — The positive story is complete and ordered
- E3: discovery → formulation → causal red → covering green → verify completes.
- E4: Missing, duplicate, reordered, or success-after-failed phase events fail.

### R3 — Test and implementation authority are isolated
- E5: Designer and implementer use different role IDs, context IDs, and worktree realpaths.
- E6: Shared identity, path collision, absent ownership, or ambiguous lease fails closed.

### R4 — RED is causal and GREEN covers the same behavior
- E7: A named failing test and matching failure signature precede implementation.
- E8: Missing red, unrelated red, implementation-before-red, or non-covering green fails.

### R5 — Security is proven before model, persistence, or forwarding
- E9: Secret-shaped fixture data is rejected or represented only by already-redacted evidence.
- E10: Raw secret content, unsafe path, policy weakening, missing security result, or failed scanner blocks the story.

### R6 — Blockers are explicit and non-passing
- E11: A simulated blocker produces `blocked`, no completion, no handoff, and no cleanup.
- E12: Timeout, unavailable backend, malformed result, and stale observation are `unknown`/blocked, never success.

### R7 — Budget facts are current and bounded
- E13: Current usage below hard limits allows the modeled spawn.
- E14: Missing usage, stale usage, hard exceed, or absent high-count approval blocks dispatch.
- E15: After human confirmation, facts are refreshed before the modeled spawn.

### R8 — Fitness evidence is current and fingerprint-bound
- E16: Required BDD, unit, integration, security, trajectory, decision, and budget gates pass at one candidate fingerprint.
- E17: Stale, skipped, unavailable, failed, mixed-fingerprint, or unrecorded gates fail closed.

### R9 — Trajectory is contiguous and clean
- E18: Positive events have contiguous positive sequence numbers and no anti-pattern hits.
- E19: Secret preview, missing red, false completion, test/implementation collusion, or success after failure blocks.

### R10 — Review synthesis is dispositioned
- E20: Independent review exists, has no blockers, and all non-blockers have explicit disposition.
- E21: Missing synthesis, undispositioned findings, reviewer/implementer identity collision, or P0/P1 blocks.

### R11 — Human approval binds the exact diff
- E22: Current human approval binds candidate fingerprint, action, risk, effect, and paths.
- E23: Model boolean, project file, stale approval, different fingerprint, path, action, risk, or effect cannot approve.

### R12 — Cleanup is planner-only and conservative
- E24: Cleanup succeeds only after merged commit, remote/head agreement, green gates, released lease, and no live owned process.
- E25: Missing merge, dirty worktree, active lease/process, failed gate, stale remote, or foreign resource refuses cleanup.
- E26: The fixture never executes cleanup.

### R13 — No auto-merge or invented authority
- E27: Positive output is `ready-for-human-merge`, never `merged`.
- E28: Any claimed automatic merge, PR, approval, lease release, cleanup execution, or budget increase is refused.

### R14 — Negative fixtures are first-class
- E29: blocker, secret, budget, stale-state, worktree collision, cleanup-refusal, and startup-unavailable fixtures each fail for one named invariant.
- E30: A negative fixture that passes or fails for the wrong invariant fails the golden suite.

### R15 — Replay is deterministic and immutable
- E31: Same fixture bytes produce the same canonical result fingerprint.
- E32: Outputs are deeply frozen and input mutation after evaluation cannot change results.

### R16 — Full child startup failure is observable, not bypassed
- E33: The known extension-load startup failure is normalized to `child-startup-unavailable`.
- E34: `pi -ne` may support advisory verification but cannot make full-child acceptance pass.

### R17 — Operator-controlled live acceptance remains separate
- E35: Live fleet, file sink, purge, strict/overnight, real cleanup, network, or installation steps return `operator-approval-required` in the hermetic fixture.
- E36: No environment variable or fixture boolean supplies that approval.

### R18 — Mutations prove the golden story
- E37: Remove red, alter fingerprint, weaken security, omit usage, reuse identity, insert secret, fake merge, or enable cleanup execution and a named E2E test fails.

## Questions resolved

1. Is this a live orchestration test? No; it is a deterministic compositional fixture.
2. Does it create worktrees or agents? No; it validates explicit facts describing isolated roles.
3. Can `pi -ne` satisfy full-child startup? No.
4. Can it merge or clean up? No; output stops at human-merge readiness or refusal.
5. Are missing facts false? No; limited evidence is `unknown` and non-passing.
6. Does it replace component tests? No; it proves cross-component invariants and retains component tests.

## Open questions

- Q1: Should a later operator-approved suite run the same fixture through live Herdr? Deferred; separate acceptance package/change.
- Q2: Should the extension loader exclude `*.test.ts` package globs? Likely yes, but startup repair is out of E2E-01 fixture scope unless required to make the merged runtime start.
- Q3: Is the `agentic-fleet.ts` undefined-path failure inside this repository or the installed runtime? Diagnose during red/green; do not hide it.

## Non-goals

- No live fleet, live Herdr pane, network, package installation, purge, real filesystem cleanup, PR creation, or merge.
- No second orchestrator FSM, approval store, budget model, fitness model, or redaction implementation.
- No mutation of ambient configuration or unrelated worktrees.

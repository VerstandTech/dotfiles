# ISSUE-29 Example Map — Bind BDD red/green to the recording worktree

## Scope

Wire `bdd_assert_red`, `bdd_assert_green`, and `bdd_handoff` to the
CLOSE-01 worktree store (`<worktree>/.pi/bdd-evidence.json`) so isolated
worktree evidence survives a later parent-session VERIFY. Parent checkouts
must not claim or clear another worktree's records. Missing identity stays
`unknown` / `missing`. Lost historical red/green, including OPS-01, stay
uninvented.

## Rules and representative examples

### R1 — Assert tools persist to the recording worktree store
- E1: `bdd_assert_red` in a linked worktree writes red to
  `<worktree>/.pi/bdd-evidence.json`.
- E2: `bdd_assert_green` writes covering green to the same store.
- E3: The parent checkout store is not created or updated by those asserts.

### R2 — Handoff reads the recording worktree store
- E4: After session-branch red/green are gone, worktree `bdd_handoff` still
  reports the stored commands.
- E5: Handoff includes the recorded red and green; it does not invent fields.

### R3 — Parent checkout cannot claim or clear
- E6: Parent `bdd_handoff` does not report another worktree's red/green as
  its own.
- E7: Parent persist, cycle-clear, or VERIFY does not delete or overwrite
  `<worktree>/.pi/bdd-evidence.json`.
- E8: Binding with `worktreePath === parentPath` remains `unknown`.

### R4 — Missing worktree identity fails closed
- E9: Unresolvable cwd or git facts return `unknown`, never empty success.
- E10: Relative, escaped, or non-absolute paths return `unknown`.
- E11: Handoff with unknown identity lists `unknown`/`missing` and `ok: false`.

### R5 — Historical evidence is not fabricated
- E12: OPS-01 historical red/green stay `missing`.
- E13: An absent store is `missing`/`unknown`, never invented commands.

### R6 — Session branch is secondary, not authoritative across checkouts
- E14: Restore in the recording worktree overlays disk red/green onto session
  state.
- E15: `bdd-mode` persist/restore/handoff call the worktree binder rather than
  only `appendEntry`.

## Questions

- Q1: May the main checkout write its own `.pi/bdd-evidence.json`? No —
  `bindWorktreeEvidenceV1` already refuses `worktreePath === parentPath`.
  Main-checkout sessions keep session-branch persistence only.
- Q2: May a new discovery cycle in the *same* worktree rewrite that store?
  Yes. A parent checkout session must not.

## Non-goals

- Inventing missing historical package-turn evidence (OPS-01).
- Mutating other worktrees or the main checkout except via this branch.
- Merge, approval, lease transfer, cleanup, or raising fleet spawn caps.

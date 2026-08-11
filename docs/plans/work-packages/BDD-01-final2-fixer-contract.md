# BDD-01 Final Executor-Kind Fixer Contract (Corrected)

- **Objective:** make corrected E48 green with no legacy missing-kind exception.
- **Owned worktree:** `/Users/leonardoribeiro/worktrees/dotfiles-bdd01-final2-fix` on `feat/pi-herdr-bdd01-final2-fix`.
- **Owned production path:** `agents-shared/.agents/adapters/pi/personal/lib/bdd/quality-gates.ts` only.
- **Forbidden:** tests/features/docs/other production/config/package/locks, installs, merge/push, cleanup, delegation/fleets.
- **Model:** `xai/grok-4.5`, thinking high; 300000 ms; one follow-up max.

Required passing assurance results are trusted only when `executorKind` is explicitly `argv` or `internal` and tier is not untrusted/policy-rejected. Shell, missing, and unknown kinds always create an executor/trust gap, with or without a tier. Do not preserve a missing-kind legacy exception: locked valid fixtures now declare argv/internal explicitly.

Run focused, `bun test lib/bdd`, `bun test lib`, and root aggregate. Commit only the owned file. End `BDD01 FINAL2 FIX COMPLETE`.

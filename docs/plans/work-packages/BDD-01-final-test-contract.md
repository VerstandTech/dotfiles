# BDD-01 Final Hardening Test Contract

- **Objective:** lock E48: a required passing assurance result with missing executor kind cannot be trusted by a forged tier string.
- **Owned worktree:** `/Users/leonardoribeiro/worktrees/dotfiles-bdd01-final-tests` on `feat/pi-herdr-bdd01-final-tests`.
- **Owned paths:** `agents-shared/.agents/adapters/pi/personal/lib/bdd/assurance-handoff.test.ts`, `docs/plans/work-packages/BDD-01.feature`.
- **Forbidden:** all production/other tests/config/package/locks, merge/push, installs, cleanup, delegation/fleets.
- **Model:** `xai/grok-4.5`, thinking high.
- **Context budget:** stop before 80%; wall timeout 300000 ms; at most one follow-up.

Add a test named `rejects a required passing result with missing executor kind even when tier says trusted` and E48 acceptance. It must build otherwise-current passing assurance evidence whose required unit result omits `executorKind`, sets `trustTier:"trusted"`, and prove `assuranceHandoffGaps` reports an executor/trust gap. Existing argv/internal passing fixtures remain green.

Focused command: `cd agents-shared/.agents/adapters/pi/personal && bun test lib/bdd/assurance-handoff.test.ts`.
Expected red: current handoff gaps are empty. No production edits. Commit allowed artifacts and end `BDD01 FINAL TEST DESIGN COMPLETE`.

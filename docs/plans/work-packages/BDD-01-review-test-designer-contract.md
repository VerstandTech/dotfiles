# BDD-01 Adversarial Review Test Designer Contract

- **Objective:** lock causal red tests for all accepted correctness/security P0–P1 findings from the two independent BDD-01 reviews.
- **Owned worktree:** `/Users/leonardoribeiro/worktrees/dotfiles-bdd01-review-tests` on `feat/pi-herdr-bdd01-review-tests`.
- **Owned paths:** `docs/plans/work-packages/BDD-01.feature`; tests only in `lib/bdd/{run-command,quality-gates,assurance-handoff,phases,bdd-mode-contract}.test.ts`.
- **Forbidden:** all production, config/package/settings/locks, unrelated tests/docs, merge/push, installs, cleanup, subagents/fleets.
- **Model:** `xai/grok-4.5`, thinking high.
- **Tool scope:** minimum read plus test/feature edit/write and focused bash.
- **Context budget:** checkpoint at 60%; stop and report before 80%.
- **Wall timeout:** 900000 ms.
- **Maximum follow-up resumes:** 2.
- **Report:** changed paths, focused/broader commands, exact causal failures, finding→oracle map, SHA/status, blockers, residual risks.

Read BDD-01 Example Map R1/R4–R9/R11–R12 and E37–E47 plus both review reports available in Herdr history/contract summary. Lock these regressions without production edits:

1. short unrelated hint contained inside expected id is rejected;
2. assurance `bdd_assert_green` cannot progress from legacy/non-causal red (minimal stable extension source contract if no executable harness exists);
3. mutation `matched` is true only for assurance-eligible expected assertion; undefined/legacy/unrelated cannot satisfy handoff;
4. current config fingerprint binds red, green, and assurance evidence;
5. shell executor cannot self-label trusted; shell required result gaps by executor kind even with forged tier;
6. strict/overnight argv kind without a valid matching argv executor rejects before spawn;
7. `trust:"trusted"` without argv rejects before shell fallback;
8. cwd symlink escape rejects using realpath with no spawn;
9. `policyRejected:true` rejects red even at non-126 exit;
10. extend BDD-01.feature with E37–E47.

Primary focused command remains:

```bash
cd agents-shared/.agents/adapters/pi/personal
bun test lib/bdd/run-command.test.ts lib/bdd/quality-gates.test.ts
```

Expected primary red id: `rejects a short unrelated hint contained inside the expected test id`. Red must be assertion failure against current reverse-substring matching, not import/setup/timeout noise. Run the broader changed-test set, commit only allowed artifacts, and end exactly `BDD01 REVIEW TEST DESIGN COMPLETE`.

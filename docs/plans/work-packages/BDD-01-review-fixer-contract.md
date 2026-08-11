# BDD-01 Adversarial Review Fixer Contract

- **Objective:** fix every accepted BDD-01 correctness/security P0–P1 under locked E37–E47 tests.
- **Owned worktree:** `/Users/leonardoribeiro/worktrees/dotfiles-bdd01-review-fix` on `feat/pi-herdr-bdd01-review-fix`.
- **Owned production paths:** `agents-shared/.agents/adapters/pi/personal/lib/bdd/{types,run-command,config,quality-gates,phases}.ts` and minimum `extensions/bdd-mode.ts` wiring.
- **Forbidden:** all tests/features/Example Maps/contracts docs, other libraries/extensions/agents/skills, package/settings/locks, installs, merge/push, cleanup, subagents/fleets.
- **Model:** `xai/grok-4.5`, thinking high.
- **Tool scope:** minimum read/edit plus focused bash; no delegation.
- **Context budget:** checkpoint at 60%; stop and report before 80%.
- **Wall timeout:** 900000 ms.
- **Maximum follow-up resumes:** 2.
- **Report:** finding-by-finding fixes, changed paths, focused/broader/full/root results, SHA/status, blockers, residual risks.

Read locked E37–E47 tests and fix all findings:

1. remove reverse-substring expected-id matching; short unrelated hints must not prove causality;
2. direct `bdd_assert_green` under assurance requires `red.assuranceEligible === true` before recording green/phase transition;
3. mutation `matched` is true only for assurance-eligible expected assertion; assurance refuses legacy fail-leg; handoff requires strict `matched === true`;
4. bind expected current config fingerprint to red, green, and assurance evidence/gaps;
5. force all shell executors to `interactive_untrusted`; ignore self-labeled trusted shell config;
6. required shell results gap by executor kind even with forged trusted tier;
7. strict/overnight argv kind without a valid matching argv executor policy-rejects before spawn; no shell fallthrough;
8. trusted `runCommand` without a valid argv spec policy-rejects before spawn;
9. trusted cwd validation uses realpaths and rejects symlink escape/failure without spawn;
10. `policyRejected:true` always rejects red regardless of exit code/hints;
11. preserve all previously green R1–R10 behavior and do not claim SEC-01 sandbox guarantees.

Run:

```bash
cd agents-shared/.agents/adapters/pi/personal
bun test lib/bdd/run-command.test.ts lib/bdd/quality-gates.test.ts
bun test lib/bdd/run-command.test.ts lib/bdd/quality-gates.test.ts lib/bdd/assurance-handoff.test.ts lib/bdd/phases.test.ts lib/bdd/bdd-mode-contract.test.ts
bun test lib/bdd
bun test lib
cd ../../../../..
bash scripts/test-root.sh
```

Commit only owned production paths. End exactly `BDD01 REVIEW FIX COMPLETE`.

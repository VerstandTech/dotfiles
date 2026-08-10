# BASE-01 Review-Remediation Test Designer Contract

- **Objective:** lock a causal red for the accepted P1: secondary package/operator docs still advertise stale v1.0 canonical metadata.
- **Owned worktree:** `/Users/leonardoribeiro/worktrees/dotfiles-base01-review-tests` on `feat/pi-herdr-base01-review-tests`.
- **Owned paths:** `agents-shared/.agents/adapters/pi/personal/lib/bdd/playbook.test.ts`, `docs/plans/work-packages/BASE-01.feature`.
- **Forbidden:** all production docs under `personal/docs/**`, `lib/bdd/playbook.ts`, all agents, unrelated tests/config/package/locks, merge/push, cleanup, subagents/fleets.
- **Model:** `xai/grok-4.5`, thinking high.
- **Tool scope:** minimum read plus test/acceptance edits and focused bash.
- **Context budget:** checkpoint at 60%; stop and report before 80%.
- **Wall timeout:** 600000 ms.
- **Maximum follow-up resumes:** 2.
- **Report:** changed paths, focused command, exact causal red, fixture/current-vs-history distinction, SHA/status, blockers, residual risks.

Read BASE-01 Example Map R11/E14–E16 and the prior independent review. Add a test named `secondary package docs advertise only current canonical metadata` that:

1. checks `docs/bdd-fleet-cheatsheet.md` describes `/bdd playbook` as canonical v1.2;
2. checks `docs/high-assurance-example-map.md` current canonical rule says August 2026/v1.2/sections 1–20;
3. checks `docs/agentic-bdd-roadmap.md` shipped layer says canonical v1.2 policy;
4. rejects the exact stale current-policy claims without globally banning historical v1.0 changelog references;
5. preserves all existing BASE-01 tests unchanged in strength.

Extend `BASE-01.feature` with the R11/E14–E16 acceptance scenario. Run:

```bash
cd agents-shared/.agents/adapters/pi/personal
bun test lib/bdd/playbook.test.ts
```

Expected red: the named test fails on `Canonical v1.0 policy` and/or the July/sections 1–13 current rule, not setup/import noise. Commit only allowed artifacts. End exactly `BASE01 REVIEW TEST DESIGN COMPLETE`.

# BASE-01 Review Finding Fixer Contract

- **Objective:** repair the accepted P1 secondary-document canonical metadata drift under locked R11/E14–E16 tests.
- **Owned worktree:** `/Users/leonardoribeiro/worktrees/dotfiles-base01-review-fix` on `feat/pi-herdr-base01-review-fix`.
- **Owned production docs:** `agents-shared/.agents/adapters/pi/personal/docs/bdd-fleet-cheatsheet.md`, `docs/high-assurance-example-map.md`, `docs/agentic-bdd-roadmap.md`.
- **Forbidden:** all tests/features, canonical `docs/high-assurance-playbook.md`, runtime/agent/skill/extension code, unrelated docs, package/settings/locks, merge/push, cleanup, subagents/fleets.
- **Model:** `xai/grok-4.5`, thinking high.
- **Tool scope:** minimum read/edit plus focused bash.
- **Context budget:** checkpoint at 60%; stop and report before 80%.
- **Wall timeout:** 600000 ms.
- **Maximum follow-up resumes:** 2.
- **Report:** exact changed paths/claims, focused/full/root results, SHA/status, blockers, residual risks.

## Minimum green

1. Fleet cheatsheet `/bdd playbook` row says `Canonical v1.2 policy + honest Pi implementation profile`.
2. High-assurance Example Map R8/current E8 claims say August 2026, v1.2, and sections 1–20. Preserve the separation between normative target and current enforcement.
3. Agentic BDD roadmap shipped-layer bullet says `Canonical v1.2 policy + separate enforced/configurable/roadmap implementation profile`.
4. Keep legitimate v1.0 changelog/history references clearly historical; do not globally erase history.
5. Do not edit tests or the canonical playbook.

Run:

```bash
cd agents-shared/.agents/adapters/pi/personal
bun test lib/bdd/playbook.test.ts
bun test lib
cd ../../../../..
bash scripts/test-root.sh
```

Commit only the three owned docs. End exactly `BASE01 REVIEW FIX COMPLETE`.

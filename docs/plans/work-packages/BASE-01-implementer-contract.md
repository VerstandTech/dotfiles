# BASE-01 Implementer Worker Contract

- **Objective:** make the locked BASE-01 red tests green with the smallest truthful production repair.
- **Owned worktree:** `/Users/leonardoribeiro/worktrees/dotfiles-base01-implementer` on `feat/pi-herdr-base01-impl`.
- **Owned production paths:** `agents-shared/.agents/adapters/pi/personal/lib/bdd/playbook.ts`, `agents-shared/.agents/adapters/pi/personal/agents/bdd-test-designer.md`.
- **Forbidden:** every `*.test.ts`, `docs/plans/work-packages/BASE-01.feature`, `docs/high-assurance-playbook.md`, other agent/skill/extension files, package/settings/lock files, merge/push, shared-main cleanup, destructive git, subagents/fleets.
- **Model:** `xai/grok-4.5`, thinking high.
- **Tool scope:** minimum read/edit plus focused bash; no delegation.
- **Context budget:** checkpoint at 60%; stop and report before 80% rather than broadening scope.
- **Wall timeout:** 600000 ms.
- **Maximum follow-up resumes:** 2.
- **Report:** commands, exact changed paths, focused/full/root results, commit SHA, git status, blockers, residual risks.

## Minimum green

1. Change `HIGH_ASSURANCE_PLAYBOOK` runtime metadata to `version: "1.2"` and `published: "August 2026"`; keep canonical/implementation paths and no-auto-install output unchanged.
2. Strengthen only `bdd-test-designer.md`:
   - explicit plain sentence `Do not run, launch, or delegate to subagents or fleets`;
   - explicit statement that only specification and test paths are writable;
   - explicit selective `contracts/invariants`, `fuzz`, `differential`, and `golden-master` responsibilities;
   - preserve fresh context, CAID separation, forbidden production/dependency/threshold/deployment edits, existing tools, and red-only handoff.
3. Do not edit or downgrade the canonical v1.2 playbook.
4. Do not change tests to obtain green.

Run:

```bash
cd agents-shared/.agents/adapters/pi/personal
bun test lib/bdd/playbook.test.ts lib/bdd/assurance-agents.test.ts
bun test lib
cd ../../../../..
bash scripts/test-root.sh
```

Commit only the two owned production files. End the report exactly `BASE01 IMPLEMENTATION COMPLETE`.

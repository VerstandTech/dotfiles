# BASE-01 Test Designer Worker Contract

- **Objective:** formulate BASE-01 acceptance and lock a causal red for stale v1.0 runtime metadata plus the incomplete bounded Test Designer role contract.
- **Owned worktree:** `/Users/leonardoribeiro/worktrees/dotfiles-base01-tests` on `feat/pi-herdr-base01-tests`.
- **Owned paths:** `docs/plans/work-packages/BASE-01.feature`, `agents-shared/.agents/adapters/pi/personal/lib/bdd/playbook.test.ts`, `agents-shared/.agents/adapters/pi/personal/lib/bdd/assurance-agents.test.ts`, and this contract only if a report correction is needed.
- **Forbidden:** `lib/bdd/playbook.ts`, every `agents/bdd-*.md`, `docs/high-assurance-playbook.md`, package/settings/lock files, unrelated tests, merge/push, shared-main cleanup, destructive git, subagents/fleets.
- **Model:** `xai/grok-4.5`, thinking high.
- **Tool scope:** minimum read plus test/acceptance edit/write and focused bash; no delegation.
- **Context budget:** checkpoint at 60%; stop and report before 80% rather than broadening scope.
- **Wall timeout:** 600000 ms.
- **Maximum follow-up resumes:** 2.
- **Report:** changed paths, focused command, exact failing test ids/signatures, oracle map, git status, commit SHA, blockers, residual risks.

## Locked behavior

Read `BASE-01-example-map.md` first. Treat the canonical document as the normative v1.2/August 2026 source. Do not rewrite it backward.

1. Replace stale v1.0/13-section assertions with v1.2 structure: title, v1.2/August metadata, changelog, sections 1–20, current closing claim, and current discovery surfaces.
2. Add a focused test named `reports the canonical v1.2 runtime metadata` that expects `HIGH_ASSURANCE_PLAYBOOK.version === "1.2"`, `published === "August 2026"`, unchanged paths, and formatted output with current values. This must causally fail against current `playbook.ts` with expected `1.2`, received `1.0`.
3. Keep all meaningful v1.2 playbook structure checks; do not reduce assertions merely to make the suite green.
4. Make Test Designer contract checks explicit and robust: only specification/test paths writable; plain no run/launch/delegate to subagents/fleets; contracts/invariants, fuzz, differential, and golden-master responsibilities. Preserve all existing role isolation/tool checks.
5. Add persona-driven Gherkin covering R1–R10/E1–E13.
6. No production edits and no live fleet.

Focused command:

```bash
cd agents-shared/.agents/adapters/pi/personal
bun test lib/bdd/playbook.test.ts lib/bdd/assurance-agents.test.ts
```

Commit only allowed test/acceptance artifacts. End the report exactly `BASE01 TEST DESIGN COMPLETE`.

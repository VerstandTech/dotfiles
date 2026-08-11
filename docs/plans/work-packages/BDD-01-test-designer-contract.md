# BDD-01 Test Designer Worker Contract

- **Objective:** formulate BDD-01 and lock causal red tests for expected-red identity plus trusted gate execution/model/evidence.
- **Owned worktree:** `/Users/leonardoribeiro/worktrees/dotfiles-bdd01-tests` on `feat/pi-herdr-bdd01-tests`.
- **Owned paths:** `docs/plans/work-packages/BDD-01.feature`; tests only under `agents-shared/.agents/adapters/pi/personal/lib/bdd/{run-command,quality-gates,config,assurance-handoff,phases}*.test.ts`; optionally one clearly named `bdd-mode-contract.test.ts` under `lib/bdd/` for minimal extension wiring.
- **Forbidden:** every production `.ts`/agent/skill/doc except the new feature, package/settings/locks, unrelated tests, merge/push, cleanup, installs, subagents/fleets.
- **Model:** `xai/grok-4.5`, thinking high.
- **Tool scope:** minimum read plus test/feature edit/write and focused bash.
- **Context budget:** checkpoint at 60%; stop and report before 80% rather than broadening scope.
- **Wall timeout:** 900000 ms.
- **Maximum follow-up resumes:** 2.
- **Report:** changed paths, focused and broader red commands, exact intended failures, oracle matrix, SHA/status, blockers, residual risks.

## Required formulation

Read `BDD-01-example-map.md` and implement acceptance/tests for R1–R10/E1–E36. Preserve all existing timeout/infra/green-coverage/gate-order assertions.

Primary focused command:

```bash
cd agents-shared/.agents/adapters/pi/personal
bun test lib/bdd/run-command.test.ts lib/bdd/quality-gates.test.ts
```

Primary expected causal red:

- test id: `rejects an unrelated failing assertion when the expected test id is absent`
- failure demonstrates current `validateRedResult` returns `ok: true` for a non-zero unrelated assertion even when an expected-red contract is supplied
- no missing import/module/type error/setup/timeout/command-not-found red

Lock these families:

1. red classifier precedence, reason/cause codes, identity/signature hit/miss, setup/import rejection, legacy non-assurance labels;
2. trusted argv uses `shell:false`, validated file/args/cwd, scrubbed allowlisted env, output/time bounds, policy rejection without spawn;
3. shell interactive untrusted versus strict/overnight pre-spawn rejection;
4. gate executor/result shapes for shell/argv/internal, unknown internal fail-closed, executor-sensitive fingerprints;
5. dual command config and trust profile parsing plus deterministic config fingerprints and malformed strict config errors;
6. assurance handoff gaps for non-causal red, untrusted required gate, stale config fingerprint, and missing command-backed matched mutation;
7. minimal extension source contract for expectedTestId/expectedFailureSignature/matchMode recording, without relying solely on brittle incidental formatting;
8. feature scenarios for all rules and representative examples.

Do not import nonexistent production exports in a way that causes module/setup failure. Exercise additive behavior through current exports with `as unknown as` inputs or stable source-contract assertions so red remains behavioral. Commit only allowed artifacts. End exactly `BDD01 TEST DESIGN COMPLETE`.

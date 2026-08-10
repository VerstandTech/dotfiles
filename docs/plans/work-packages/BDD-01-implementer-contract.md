# BDD-01 Implementer Worker Contract

- **Objective:** make the locked BDD-01 causal-red/gate-trust tests green with one coherent additive implementation.
- **Owned worktree:** `/Users/leonardoribeiro/worktrees/dotfiles-bdd01-implementer` on `feat/pi-herdr-bdd01-impl`.
- **Owned production paths:** `agents-shared/.agents/adapters/pi/personal/lib/bdd/{types,run-command,config,quality-gates,phases}.ts` and the minimum required `extensions/bdd-mode.ts` wiring.
- **Forbidden:** every test/feature/Example Map, contracts/security/fleet/trajectory/decisions/approvals packages, agents/skills/docs, package/settings/locks, merge/push, shared-main cleanup, destructive git, installs, subagents/fleets.
- **Model:** `xai/grok-4.5`, thinking high.
- **Tool scope:** minimum read/edit plus focused bash; no delegation.
- **Context budget:** checkpoint at 60%; stop and report before 80% rather than broadening scope.
- **Wall timeout:** 1200000 ms; supervisor waits in bounded 600000 ms intervals.
- **Maximum follow-up resumes:** 2.
- **Report:** changed paths, focused/broader/full/root results, exact API/migration decisions, SHA/status, blockers, residual risks.

## Locked green contract

Read `BDD-01-example-map.md`, `BDD-01.feature`, and all six locked BDD-01 test files. Do not change tests.

Implement the additive V1 behavior exactly as the tests require:

1. expected-red identity/signature classifier with deterministic precedence/reason codes; legacy interactive is recordable but `assuranceEligible:false`;
2. trusted argv runner with `shell:false`, executable/arg/cwd validation, scrubbed allowlisted env, output/time bounds, and pre-spawn policy rejection;
3. dual shell/argv/internal gate command specs and interactive/strict/overnight trust behavior;
4. executor/trust/policy fields in plans and results; unknown internal checks fail closed; executor participates in fingerprints;
5. dual command/trust config parsing and deterministic `fingerprintConfig`; malformed strict config fails explicitly;
6. red/green/assurance config binding and handoff gaps for non-causal red, stale config, untrusted required gates, and unmatched/note-only mutation;
7. minimal `bdd_assert_red` and mutation tool parameters/recording for expectedTestId, expectedFailureSignature, matchMode; strict behavior must not silently change ordinary non-assurance projects;
8. preserve existing APIs and timeout/infra/green-coverage/gate-order behavior where tests require compatibility;
9. no CON-01 schema package, SEC-01 sandbox/egress, FIT-01 internal adapters, or fabricated security guarantees.

Run:

```bash
cd agents-shared/.agents/adapters/pi/personal
bun test lib/bdd/run-command.test.ts lib/bdd/quality-gates.test.ts
bun test lib/bdd/run-command.test.ts lib/bdd/quality-gates.test.ts lib/bdd/config.test.ts lib/bdd/assurance-handoff.test.ts lib/bdd/phases.test.ts lib/bdd/bdd-mode-contract.test.ts
bun test lib/bdd
bun test lib
cd ../../../../..
bash scripts/test-root.sh
```

Commit only owned production paths. End exactly `BDD01 IMPLEMENTATION COMPLETE`.

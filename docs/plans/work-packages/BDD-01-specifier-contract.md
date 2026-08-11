# BDD-01 Specifier Contract

- **Objective:** specify the minimum complete Wave 0 BDD-01 contract for causal-red identity and trusted deterministic gate execution without preempting CON-01, SEC-01, or FIT-01.
- **Checkout:** read-only `/Users/leonardoribeiro/worktrees/dotfiles-pi-herdr-high-assurance` at current clean integration SHA.
- **Writable paths:** none.
- **Forbidden:** edits/writes/commits, installs, merge/push, settings, cleanup, subagents/fleets, live dispatch.
- **Model:** `xai/grok-4.5`, thinking high.
- **Tool scope:** read-only code/tests/docs and non-mutating focused test execution.
- **Context budget:** checkpoint at 60%; stop and report before 80%.
- **Wall timeout:** 600000 ms.
- **Maximum follow-up resumes:** 2.
- **Report:** current gaps, proposed V1 types/APIs/config, exact acceptance rules/examples, backwards-compatible migration, test matrix, ownership boundaries, blockers/residual risks.

Inspect `lib/bdd/{run-command,config,types,quality-gates}*`, `extensions/bdd-mode.ts`, current tests/templates, and the BDD-01 plan section. Specify:

1. an expected-red contract matching required test id/hint and failure signature while rejecting unrelated assertion, setup/import, timeout, spawn, 126/127, or missing expected identity;
2. how `bdd_assert_red` receives/records the contract and why legacy interactive behavior remains explicitly non-assurance rather than falsely machine-matched;
3. validated argv execution with `shell:false`, allowlisted environment, bounded output/timeouts, and deterministic policy rejection for strict/overnight gate execution;
4. backwards-compatible interactive shell strings, visibly labeled untrusted/non-assurance;
5. canonical gate execution/result shapes supporting command and internal executors without implementing future SEC-01 sandbox or FIT-01 adapters;
6. config integrity/fingerprint behavior and evidence invalidation on policy/command changes;
7. green coverage and assertion-sensitivity requirements needed for final handoff;
8. exact Test Designer red matrix and safe production ownership.

Do not implement. End exactly `BDD01 SPECIFICATION COMPLETE`.

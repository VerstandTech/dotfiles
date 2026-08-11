# BDD-01 Independent Review Contracts

Both reviewers are read-only, use `xai/grok-4.5` with high thinking, may run only non-mutating focused tests/snippets, must stop before 80% context, have 600000 ms initial wall time and at most two focused follow-ups, and must not edit/write/commit/install/merge/push/clean/delegate/launch fleets.

## Reviewer A — Correctness and contract integrity

- **Checkout:** current clean integration SHA in `/Users/leonardoribeiro/worktrees/dotfiles-pi-herdr-high-assurance`.
- **Objective:** verify BDD-01 implementation and locked tests satisfy R1–R10/E1–E36 without parallel state models or compatibility regressions.
- **Inspect:** `types.ts`, `run-command.ts`, `config.ts`, `quality-gates.ts`, `phases.ts`, `bdd-mode.ts`, all BDD-01 tests/feature.
- **Adversarial checks:** classifier precedence/false matches/multi-fail behavior; setup heuristics; extension recording and assurance green/mutation gating; config and plan fingerprint stability; gate ordering/results; internal fail-closed; timestamp staleness; existing non-assurance behavior; source-contract test realism.
- **Report:** only P0/P1 findings with exact path/symbol/reproduction/minimum test+fix, GO/BLOCKED, passed checks, residual P2 risks. End `BDD01 CORRECTNESS REVIEW COMPLETE`.

## Reviewer B — Command-execution security and trust

- **Checkout:** same clean integration SHA, read-only.
- **Objective:** attack the trusted argv, environment, cwd, strict/overnight, shell-untrusted, config-integrity, and policy-rejection boundaries without assuming SEC-01 features exist.
- **Adversarial checks:** executable/arg/NUL/metacharacter handling; PATH execution; cwd absolute/relative/symlink escape; env secret-pattern bypasses and required-runtime preservation; output/time/process cleanup; no-spawn policy rejection; shell strict bypass; forged trust/result fields; required interactive shell handoff; malformed config/prototype/unknown kinds; internal id behavior; error/status honesty.
- **Boundary:** do not demand sandbox/egress/secret-file controls assigned to SEC-01, but flag BDD-01 claims that overstate those guarantees.
- **Report:** only P0/P1 findings with exact reproduction/minimum test+fix, GO/BLOCKED, passed checks, residual risks. End `BDD01 SECURITY REVIEW COMPLETE`.

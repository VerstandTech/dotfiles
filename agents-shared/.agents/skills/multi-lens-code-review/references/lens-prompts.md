# Multi-lens review — agent prompts

Inject into every agent: task summary, absolute paths of changed files, Gherkin/ADR paths if any, “cite file:line or measured numbers.”

---

## Performance (`rev-perf`)

Hot paths, N+1, unbounded memory, full-buffer reads, extra serial IO/RTT on fire-and-forget writers, index fit for range queries, double scans (daily then events).

## Simplicity (`rev-simple`)

YAGNI, dead code, write-only surfaces, double normalize, Gherkin re-testing pure unit policy, tautological assertions, redundant flags.

## Design patterns (`rev-patterns`)

Layering (route/use-case/repo), ownership of write shape, port completeness, dual-writer contracts, DTO bleed, taxonomy duplication, prefer-path policy placement.

## QA (`rev-qa`)

Feature scenarios without real assertions, false-confidence steps, untested integration seams (lean-read wiring, procedure pass-through), mutation sensitivity, gaps vs ADR.

## Code quality (`rev-quality`)

Naming, magic numbers, weak types, comments that lie, inconsistent patterns, error handling, casts, sentinel values that mislead UI (e.g. `0` meaning unavailable).

## Security (`rev-security`)

Path injection (`./$` in Mongo keys), document bloat DoS, profile isolation, authz on procedures, untrusted client input, reserved overflow keys, PII in free-text maps.

## CRAP (`rev-crap`)

Estimate branch count vs tested branches on new/changed functions. High CRAP = complex + untested. Prefer extract pure helpers over more nested tests.

## Data integrity (`rev-data`)

Metric glossary (what each number means), dual-pipeline divergence, reconciliation rules, hybrid/ship-forward undercount, timezone date keys, top-N bias, overloaded “other” buckets.

## UX / API contract (`rev-ux`, optional)

Empty states, false zeros, missing dims, silent path switch (`dataSource` missing), copy that over-promises vs rollup shape.

---

## Cross-check pass (optional)

Given a numbered list of contested findings, each agent:

1. Attacks ≥1 peer claim with reasoning or code checks
2. Concedes where convinced
3. Casts FINAL vote: keep / drop / amend

Orchestrator resolves: **code facts > measured numbers > a11y vetoes > merge compatible > majority**.

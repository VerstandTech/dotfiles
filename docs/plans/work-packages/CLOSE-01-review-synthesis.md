# CLOSE-01 review synthesis

Reviewers ran in Herdr tab `wB:tP` as `close01-arch`, `close01-sec`, and `close01-ops`.

## Agreements

- C1 is not actually worktree-disk persisted. `bindWorktreeEvidenceV1` returns a `storePath` string but keeps an in-memory map and is not wired into `bdd-mode`.
- C2 only asserts a glob string. There is no loader proof that `approval-seams.test.ts` is not loaded, and no bounded live child-start result.
- C4/C5 ready paths trust caller booleans / any non-empty `approvedTarget`. Missing named approval or backend evidence must stay blocked.
- Lost OPS red/green must remain missing. Acceptance cannot be minted from unbound caller flags alone.

## Ranked accepted findings

| ID | Sev | Finding | Action |
|---|---|---|---|
| F1 | P0 | C1 binder does not write `.pi/bdd-evidence.json` and is unused by bdd-mode | Persist + wire |
| F2 | P1 | C2 has no discovery/startup proof beyond package.json text | Add loader/path tests and bounded spawn classification |
| F3 | P1 | Live-package / review-fleet ready paths are caller-asserted | Require named target + explicit approval facts |
| F4 | P2 | OPS reconstruction trusts caller `merged`/`rootGreen` | Bind to explicit artifact refs or keep recorded-but-unbound honest |
| F5 | P2 | Closeout does not refuse invented merge/cleanup/budget claims | Add explicit authority-refusal planner |

Security also reported possible secret leakage in the in-memory binder; treating as covered by F1 (no ambient/secret collection, persist only closed evidence).

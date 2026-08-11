# CMP-01 Regression Test Designer Handoff

Role: fresh isolated Test Designer in BDD formulation after independent review.

Use only the public contracts and reproductions in `CMP-01-example-map.md` E13–E16. Do not inspect or change the implementation body of `herd-compat.ts`.

## Allowed changes

- extend `docs/plans/work-packages/CMP-01.feature` with E13–E16
- extend `pi/tests/herd-compat.test.ts`
- add normalized fixtures/provenance under `pi/tests/fixtures/herdr/**`

All production modules, Pi compatibility docs, skills, packages/settings, existing thresholds, and other tests are read-only.

## Required regression oracles

1. Multi-line status:
   - `pi: current (v7)` plus `omp: not installed` must report Pi installed.
   - no `pi:` line must report absent/unclear.
   - sibling lines must never determine Pi state.
2. Runtime version:
   - `0.8.0`, `0.8.42`, and optionally normalized `v0.8.0` with protocol 19/schema 1 are compatible.
   - `0.7.5`, `0.9.0`, `1.0.0` are incompatible even with protocol 19/schema 1.
   - missing/malformed version is unknown, never compatible.
3. Skill provenance:
   - capture installed `herdr 0.8.0` `herdr --skill` normalized SHA-256 and metadata.
   - compare the vendored body after removing only the local footer and normalizing the documented `--kind pi` adaptation back to upstream `--kind codex`.
   - a footer version string alone cannot satisfy the test.
   - fixture contains no live session ids, paths, or secrets.

Focused command:

```bash
cd pi && bun test tests/herd-compat.test.ts
```

Expected causal red includes:

- `Pi integration status isolation > E13` false-absent
- `Herdr runtime version policy > E15` false-compatible

The suite must load normally; no setup/import/timeout failure. Run the focused command, commit only allowed test/acceptance artifacts, and report SHA plus concise red output. End with `REGRESSION DESIGN COMPLETE`.

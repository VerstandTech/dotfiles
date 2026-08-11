---
name: trajectory
description: >-
  Trajectory and process supervision for multi-agent runs: redacted recording,
  anti-pattern detection, assertion evaluation, golden suite fixtures. Use when
  scoring agent paths, adding process gates, or /skill:trajectory.
---

# Trajectory / process supervision

Outcome-only metrics hide unsafe paths. This skill scores **how** agents reach
green: tool sequences, phase order, false completion, collusion signals — and
records observations only after RED-01 succeeds.

## Role contract boundary (V1)

Record a role launch/handoff only from a validated CON-01 `RoleRequestV1` / `RoleResultV1` pair with `schemaVersion: 1`. The request locks task/focus, artifact refs, owned/forbidden paths, tools/model/thinking, and budget; the result preserves exact status, SHA/dirty state, changed files or finding refs, commands/evidence, blockers, residual risks/questions, and usage. High-risk ambiguity, mismatch, or unvalidated legacy Markdown blocks a completion event rather than being normalized.

Persist only bounded references after RED-01 succeeds; never copy raw role transcripts into trajectory data. A trajectory event or valid role result does not grant approval, a writer lease, a BDD phase transition, assurance, cleanup, PR, merge, or release authority. No role may delegate unless a separate validated orchestrator contract and actual capability explicitly allow it; default is none.

## Library

| Path | Purpose |
|------|---------|
| `lib/trajectory/types.ts` | Run, event, assertion, golden suite types |
| `lib/trajectory/anti-patterns.ts` | Deterministic anti-pattern detectors |
| `lib/trajectory/evaluate.ts` | Metrics, assertions, golden suite eval, run validation |
| `lib/trajectory/record.ts` | Pure recorder, buffer, sequence restore, retention planner |
| `lib/trajectory/golden-suite.v1.json` | Committed positive/negative golden suite |
| `lib/trajectory/fixtures/**` | Exact accepted and rejected run fixtures |
| `extensions/trajectory-logger.ts` | Thin Pi adapter (session/tool/event-bus) |

## Record a run

Use the pure recorder (or the Pi extension). RED-01 runs before every sink and
digest. Callers never supply persisted `seq`.

```ts
import { createTrajectoryRecorderV1 } from "../lib/trajectory/record.ts";

const recorder = createTrajectoryRecorderV1({
  now: () => "2026-08-11T21:00:00.000Z",
  appendSessionEntry: (type, value) => pi.appendEntry(type, value),
});
await recorder.record({
  schemaVersion: 1,
  kind: "phase_change",
  data: { phase: "red" },
});
```

Optional file NDJSON persistence is **disabled by default** and requires an
explicit trusted-project flag (`--trajectory-file`) plus a safe fixed-root
writer. Session custom entry type: `assurance-trajectory-event-v1`.
Event-bus channel: `assurance:trajectory`.

Suggested path when file persistence is approved:
`.pi/trajectories/<session-id>-<segment>.ndjson`.

## Evaluate

```ts
import { evaluateTrajectory } from "../lib/trajectory/evaluate.ts";

const evaluation = evaluateTrajectory(run, [
  {
    id: "red-green",
    description: "red before green tools",
    requiredTools: ["bdd_assert_red", "bdd_assert_green"],
    matchMode: "subset",
    forbidSuccessAfterFailedGate: true,
  },
]);
```

`ok` is false if any assertion fails, the run is invalid, **or** any
**error**-severity anti-pattern hits. Invalid runs report `status: "invalid"`
and `INVALID_TRAJECTORY`.

## Anti-patterns (error-level)

| Code | Meaning |
|------|---------|
| `SUCCESS_AFTER_FAILED_GATE` | Success with unresolved required gate failure (same gate id can recover) |
| `FALSE_COMPLETION` | Handoff/done before later gate failure resolved |
| `TEST_AND_IMPL_SAME_AGENT` | Same actor writes test and production path classes |
| `MISSING_RED_BEFORE_GREEN` | Green phase without prior red |
| `SECRET_IN_PREVIEW` | Secret-shaped payload in trajectory (markers stripped first) |
| `INVALID_TRAJECTORY` | Non-contiguous/hostile/malformed run envelope |

Warnings include unbounded loops, empty handoffs, impl-before-tests, bypass without reason.

## Golden suite

1. Committed suite: `golden-suite.v1.json` + `fixtures/*.json`.
2. Entries may set `expectedOk` and `requiredAntiPatterns`.
3. On prompt/skill/role changes, re-run `bun test lib/trajectory`.
4. Fail CI when error-level regressions appear.
5. E2E-01 may read fixtures; it must not rewrite them.

## Pair with

- Fitness Guardian / verify phase (FIT-01 owns canonical gate integration)
- Overnight rhythm re-runs (`docs/overnight-rhythm.md`)
- CAID handoff events (`kind: "handoff"`)
- RED-01 before every sink

## Tests

```bash
cd ~/dotfiles/agents-shared/.agents/adapters/pi/personal && bun test lib/trajectory
```

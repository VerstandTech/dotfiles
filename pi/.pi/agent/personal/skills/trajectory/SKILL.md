---
name: trajectory
description: >-
  Trajectory and process supervision for multi-agent runs: anti-pattern
  detection, assertion evaluation, golden suite stubs. Use when scoring agent
  paths, adding process gates, or /skill:trajectory.
---

# Trajectory / process supervision

Outcome-only metrics hide unsafe paths. This skill scores **how** agents reach
green: tool sequences, phase order, false completion, collusion signals.

## Library

| Path | Purpose |
|------|---------|
| `lib/trajectory/types.ts` | Run, event, assertion, golden suite types |
| `lib/trajectory/anti-patterns.ts` | Deterministic anti-pattern detectors |
| `lib/trajectory/evaluate.ts` | Metrics, assertions, golden suite eval |
| `lib/trajectory/golden-suite.stub.json` | Starter golden suite (replace fixtures with real runs) |

## Record a run

Append-only event log (never store secrets in `preview` / `data`):

```json
{
  "version": 1,
  "runId": "…",
  "taskId": "billing-round",
  "goal": "…",
  "startedAt": "…",
  "events": [
    { "seq": 1, "at": "…", "kind": "phase_change", "data": { "phase": "red" } },
    { "seq": 2, "at": "…", "kind": "tool_call", "tool": "bdd_assert_red", "agent": "test-designer" }
  ],
  "outcome": "success"
}
```

Suggested path: `.pi/trajectories/<date>/<taskId>-<runId>.json`.

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

`ok` is false if any assertion fails **or** any **error**-severity anti-pattern hits.

## Anti-patterns (error-level)

| Code | Meaning |
|------|---------|
| `SUCCESS_AFTER_FAILED_GATE` | Outcome success with failed gate events |
| `FALSE_COMPLETION` | Handoff/done before later gate failure resolved |
| `TEST_AND_IMPL_SAME_AGENT` | Same agent writes tests and production paths |
| `MISSING_RED_BEFORE_GREEN` | Green phase without prior red |
| `SECRET_IN_PREVIEW` | Secret-shaped payload in trajectory |

Warnings include unbounded loops, empty handoffs, impl-before-tests, bypass without reason.

## Golden suite

1. Copy `golden-suite.stub.json` → project `.pi/trajectory-golden.json`.
2. Record successful (and known-bad) runs under `fixtures/`.
3. On prompt/skill/role changes, re-run `evaluateGoldenSuite`.
4. Fail CI when error-level regressions appear.

## Pair with

- Fitness Guardian / verify phase
- Overnight rhythm re-runs (`docs/overnight-rhythm.md`)
- CAID handoff events (`kind: "handoff"`)

## Tests

```bash
cd ~/dotfiles/pi/.pi/agent/personal && bun test lib/trajectory
```

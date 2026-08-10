# CMP-02 Adversarial Review Test Designer Handoff

Role: fresh isolated Test Designer. Production is read-only.

Read the updated CMP-02 Example Map (R10–R14/E13–E19), feature, initial tests, and the independent review findings below.

## Independent BLOCKED findings to lock

- P0: `isMultiAgentSubagentLaunch` misses generated WorkflowScript `runs.all`, bypassing red/green/refactor one-writer policy.
- P1: unsafe `outputDir` and persona ids can escape output paths.
- P1: direct `buildFleetWorkflowScript(..., NaN|Infinity)` emits null batch size and can loop forever.
- P1: plan/rpc tests use separate test-local schema mirrors instead of a shared fixture pinned to 0.45.2 or real validator.
- P1: partial child failures are not asserted through all batches.

## Allowed changes

- extend `docs/plans/work-packages/CMP-02.feature`
- extend `lib/bdd/fleet-gate.test.ts`
- extend `lib/fleet/plan.test.ts` and `lib/fleet/rpc.test.ts`
- create one clearly named test-only shared public-execution fixture under `lib/fleet/`, pinned and source-annotated to pi-subagents 0.45.2, and replace duplicate local mirrors in tests

Do not edit `fleet-gate.ts`, `plan.ts`, `rpc.ts`, extension code, settings, package config, or any other production path.

## Required causal oracles

Focused command:

```bash
cd agents-shared/.agents/adapters/pi/personal && bun test lib/bdd/fleet-gate.test.ts lib/fleet/plan.test.ts lib/fleet/rpc.test.ts
```

Primary expected red:

- test id contains `WorkflowScript fanout is blocked during one-writer phases`
- message contains `WorkflowScript fleet fanout is still allowed during red`

Also lock:

1. Generated five-member WorkflowScript is blocked in red, green, refactor; explicit fleet bypass still works; a true one-child `runs.run` is allowed; management actions stay non-launches.
2. `outputDir` contract accepts `.pi/fleet-runs` and safe nested relative dirs but rejects empty, absolute POSIX, absolute Windows, `.`/`..`, traversal segments, slash/backslash traversal, and NUL before spawn.
3. Malicious custom persona ids (separators, `..`, absolute-looking, Unicode/punctuation) retain internal persona identity but produce safe single filename segments under the accepted outputDir; member index keeps outputs unique.
4. Direct `buildFleetWorkflowScript` with NaN, ±Infinity, 0, negative, and fractional concurrency executes under a bounded timeout, uses finite positive integer batch sizes, and returns all results. Avoid a test that itself can hang indefinitely.
5. Replace per-file cutover mirrors with one test-only contract fixture that names/pins pi-subagents 0.45.2 and faithfully covers its exact removed-field/action/direct/workflowScript behavior. If a deterministic real-validator integration is available without external installs, add it; do not add network/package changes.
6. Mock child failures at members 2 and 4 (`ok:false`, error data), assert all 5 results retained in order and batches remain 2,2,1.
7. No live fleet execution.

Commit only allowed artifacts. Report SHA, test list, focused red summary, and changed paths. End exactly `CMP02 REVIEW TEST DESIGN COMPLETE`.

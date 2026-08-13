# OPS-01 package-turn handoff

Current reconstruction for GitHub issue #26 / CLOSE-01 leftover C3.
This document records only facts that existing merged artifacts can prove.
It does not invent the omitted original package-turn red/green.

## BDD/TDD Handoff Evidence

- **Phase:** verify (current reconstruction; original package-turn never completed)
- **Focus:** OPS-01 package-turn evidence without fabrication
- **Example Map:** `docs/plans/work-packages/OPS-01-example-map.md` (R18/E108/Q24)
- **Red:** _(missing)_
- **Green:** _(missing)_
- **Mutation check:** not command-backed for the original package-turn. Named mutation oracles exist in `docs/plans/work-packages/OPS-01.feature` (timeout-to-success, dirty-cleanup-ready, stale-sequence completion, raw-error forwarding, cleanup planner execution, second poller). Q24 also names timeout-to-success, dirty cleanup-ready, raw error forwarding, and duplicate notification. No original fail/pass command pair was recorded.
- **Acceptance:** `docs/plans/work-packages/OPS-01.feature` — merged acceptance path; current focused tests still pass against that path. This is not a substitute for the missing historical red/green.
- **CRAP mitigation:** planner-only cleanup/notification/recovery; timeout stays `unknown`; hostile inputs refuse without echo; no second poller.
- **Fleet runs:** _(none for this reconstruction)_
- **Assurance:** _(not run for the original package-turn)_
- **Historical package-turn red/green remain missing / unknown.** A later passing suite cannot backfill those fields.

## What merged artifacts prove

### Merge and commit trail

OPS-01 landed on `main` through PR #21 (`feat/pi-herdr-ops01`), merge commit `ee32cc2` (2026-08-12). The first-parent history contains these short subjects only:

| Short SHA | Subject | Date |
|---|---|---|
| `5973e92` | `test(ops-01): prove operator control red` | 2026-08-12 09:42 -0300 |
| `9f29c56` | `feat(ops-01): add bounded operator controls` | 2026-08-12 09:51 -0300 |
| `1896ac4` | `fix(ops-01): preserve notification history integrity` | 2026-08-12 09:57 -0300 |
| `7aa3396` | `style(ops-01): clean notification status diff` | 2026-08-12 10:03 -0300 |
| `ee32cc2` | `Merge pull request #21 from VerstandTech/feat/pi-herdr-ops01` | 2026-08-12 10:04 -0300 |

`5973e92` added `operator-control.test.ts`, `OPS-01.feature`, and `OPS-01-example-map.md`. The commit subject says it was intended as red. This reconstruction did not replay that commit against a missing implementation, so it cannot claim a recorded failing command, exit code, or causal-red signature.

`9f29c56` added `operator-control.ts`, Herdr notification/status/task-handler adapters, supervisor skill notes, and `pi/tests/herd-notification.test.ts` plus `pi/tests/herd-cleanup.test.ts`. `1896ac4` added history-integrity coverage. Those commits exist; they are not a recorded covering-green command.

### Named current tests (now-fact, not historical green)

Observed 2026-08-13 in this worktree, HEAD `642c159` (main at branch creation). These are current passing checks, not the lost package-turn green:

```text
cd agents-shared/.agents/adapters/pi/personal
bun test lib/operator/operator-control.test.ts lib/closeout/closeout-plan.test.ts
# exit 0 — 15 pass / 0 fail (before this reconstruction's extra honesty tests)
```

```text
cd pi
bun test tests/herd-notification.test.ts tests/herd-cleanup.test.ts
# exit 0 — 8 pass / 0 fail
```

Named OPS-01 tests still present:

- `OPS01_OPERATOR_CONTROL_MISSING`
- `OPS01_STALE_SEQUENCE`
- `OPS01_NOTIFICATION_BOUND`
- `OPS01_TIMEOUT_UNKNOWN`
- `OPS01_RECOVERY_PLAN`
- `OPS01_CLEANUP_BLOCKED`
- `OPS01_CLEANUP_UNKNOWN`
- `OPS01_PATH_BINDING`
- `OPS01_CLEANUP_ORDER`
- `OPS01_HOSTILE_INPUT`
- `OPS01_HISTORY_INTEGRITY`
- `OPS01_CONTRADICTORY_HISTORY`
- `OPS01_OBSERVER_HOSTILE_BOUNDARY`

Q23 still names causal red as `OPS01_OPERATOR_CONTROL_MISSING`. That name exists in current tests. The original failing run is still missing.

### E2E-01 exercise

E2E-01 landed through PR #23, merge commit `23cc979`. `evaluateGoldenWorkflowV1` calls `planCleanupV1` and labels cleanup evidence `OPS-01`. The hermetic fixture refuses cleanup execution. That proves composition, not the omitted OPS-01 package-turn red/green.

### CLOSE-01 leftover

CLOSE-01 landed through PR #24, merge commit `e0c7d52`. `planOpsEvidenceV1` records acceptance and leaves lost red/green `missing`. CLOSE-01 review synthesis F4 said reconstruction must not mint acceptance from unbound caller flags. This reconstruction therefore keeps historical red/green `missing` / `unknown` even if a caller sets `historicalRedGreenAvailable: true`.

Issue #26 is the remaining C3 package-turn handoff. CLOSE-01 C1/C2 leftovers remain issues #29 and #25 and are out of scope here.

## What remains unknown

- Original `bdd_assert_red` command, exit code, summary, and expected-red contract.
- Original `bdd_assert_green` command, exit code, and covering-green proof.
- Original command-backed mutation fail/pass pair.
- Original assurance-gate run / plan fingerprint.
- Whether `5973e92` actually failed before `9f29c56` in the recording worktree.

Missing is the honest result for those fields.

## Non-claims

- This handoff does not execute cleanup, merge, PR merge, lease release, or live fleet.
- Current passing tests are not backfilled into **Red** or **Green**.
- Caller booleans `merged` / `rootGreen` / `historicalRedGreenAvailable` are not causal evidence.

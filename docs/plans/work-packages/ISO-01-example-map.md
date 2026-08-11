# ISO-01 Example Map — CAID lifecycle, writer leases, and collision hard-fail

## Story

**As Leo, Maya, Nikhil, Sofia, and André,**
**we need one durable writer authority for CAID worktrees with realpath-bound leases, parent-owned heartbeats, and fail-closed collision/cleanup rules,**
**so Test Designer and Implementer cannot share, nest, or alias a writable path, and dirty or mismatched resources cannot be cleaned automatically.**

## Persona role-play

### A — Leo: inspectable autonomy

1. Leo plans a CAID assignment and sees explicit branch, worktree path, role, isolation mode, and lease card id before anything is created.
2. He acquires a writer only when the busy cap allows it and the path is free of nested/alias collisions.
3. A reload or parent restart preserves lease ownership until an explicit parent release; stale never auto-releases.
4. Cleanup refuses dirty, working, blocked, unknown, or SHA-mismatched worktrees without operator approval.
5. Board and CAID registry disagreement blocks mutation rather than inventing a winner.

### B — Maya: concise handoff evidence

1. Maya receives stable lifecycle codes (`lease-held`, `collision`, `stale-heartbeat`, `board-caid-mismatch`) instead of prose.
2. Handoffs name path, role, head SHA, and lease id without granting authority to the next agent.
3. Missing heartbeat token or pane binding is `unavailable` / fail-closed for strict isolation roles.
4. Concurrent acquire attempts honor the writer cap atomically across processes.
5. ISO-01 never opens PRs, merges, or advances BDD phase.

### C — Nikhil: path and identity abuse

1. Symlink, hardlink, `..`, case-fold alias, and nested worktree paths are refused for exclusive writers.
2. Parent-only mutation of `.pi/worktree-board.json` — children cannot rewrite leases.
3. Heartbeat requires matching parent-issued token, Pi session id, Herdr pane id, and worktree realpath.
4. Forged or copied lease tokens do not unlock acquire/release/cleanup.
5. Credential-looking path leaves are rejected by existing path policy before open.

### D — Sofia: understandable recovery

1. Sofia can distinguish cap-exceeded, collision, stale, dirty-block, and lock-unavailable without reading lock internals.
2. Stale age is visible; ownership remains until explicit parent action.
3. Failed atomic board replace leaves the previous board intact.
4. Recovery says whether to release, re-register, or keep blocked.
5. No timer-driven auto-delete of worktrees.

### E — André: portable contracts

1. Pure lifecycle helpers accept injected clock, realpath, lock, and board facts — no ambient authority in pure modules.
2. V1 board and CAID schemas remain closed and versioned.
3. Extension adapters stay thin over pure plan/acquire/release/cleanup planners.
4. ROLE-01/ORC-01 consume typed isolation results; ISO does not own role tool policy.
5. Existing registry helpers remain source-compatible where behavior is only strengthened.

## Rules and examples

## Rule 1 — ISO-01 owns isolation lifecycle only

ISO-01 owns CAID plan/open/register/acquire/handoff/release/cleanup *preconditions* and writer-board durability. BDD phase, role tools, budget, security, approval, Herdr control, PR, and merge remain external.

- **R1-E1:** Planning a CAID assignment does not create a worktree.
- **R1-E2:** Acquiring a lease does not change `bdd-mode` phase.
- **R1-E3:** A collision refusal does not kill a Herdr pane.
- **R1-E4:** Cleanup readiness false does not delete files.
- **R1-E5:** Handoff text is observational; it does not transfer writer busy without explicit acquire/release.
- **R1-E6:** ISO does not install dependencies or pin packages.
- **R1-E7:** ISO does not authorize overnight autonomy.
- **R1-E8:** ISO does not edit `agentic-fleet.ts` or `bdd-mode.ts`.

## Rule 2 — Closed V1 board and CAID shapes

Public helpers accept `unknown` or explicit structs, validate closed V1 fields, and return frozen detached results or stable non-echoing codes.

- **R2-E1:** Missing `version: 1` on board/CAID file → `unsupported-version`.
- **R2-E2:** Unknown field → `unknown-field`.
- **R2-E3:** Invalid busy state → `invalid-busy`.
- **R2-E4:** Invalid role → `invalid-role`.
- **R2-E5:** Non-absolute or empty path → `invalid-path`.
- **R2-E6:** Oversized id/label/path → stable bound code.
- **R2-E7:** Accessor/symbol/cycle payloads refuse without throwing ambient errors.
- **R2-E8:** Success values are detached and deeply frozen.

## Rule 3 — Realpath identity is canonical

Exclusive writer identity is the resolved realpath after symlink resolution; aliases and nests collide.

- **R3-E1:** Two cards with same realpath and different lexical paths → collision.
- **R3-E2:** Worktree path nested under another live worktree path → collision for strict roles.
- **R3-E3:** Symlink worktree root that escapes repo → refuse.
- **R3-E4:** Case-only distinct paths that resolve equal on casefold FS facts → collision when facts say equal.
- **R3-E5:** `..` segments rejected before open.
- **R3-E6:** Relative paths rejected.
- **R3-E7:** Missing realpath fact in strict mode → unavailable/refuse.
- **R3-E8:** Bare or detached main is never an exclusive Implementer writer without explicit exception policy (default deny for strict isolation roles).

## Rule 4 — One durable writer authority with caps

`maxBusyWriters` is honored; acquire is fail-closed when cap full; release is explicit.

- **R4-E1:** Cap 1, zero busy → acquire succeeds.
- **R4-E2:** Cap 1, one busy other card → acquire fails `cap-exceeded`.
- **R4-E3:** Re-acquire same id already busy → idempotent hold success.
- **R4-E4:** Release sets idle and clears run binding fields.
- **R4-E5:** Release unknown id → stable not-found without mutating others.
- **R4-E6:** Dual parallel acquires with cap 1 → at most one grant when serialized through lock.
- **R4-E7:** `maxBusyWriters` clamp rejects 0 and unbounded values.
- **R4-E8:** Parent board mutation requires lock+atomic replace; failure preserves prior bytes.

## Rule 5 — Parent-only lease mutation and heartbeat

Only the parent orchestrator mutates leases and heartbeats using a parent-issued token bound to session, pane, and realpath.

- **R5-E1:** Heartbeat with matching token/session/pane/realpath updates monotonic timestamp.
- **R5-E2:** Mismatched token → refuse, no update.
- **R5-E3:** Mismatched pane id → refuse.
- **R5-E4:** Mismatched realpath → refuse.
- **R5-E5:** Child-written board bytes without parent lock are not authoritative (load refuses or ignores untrusted generation).
- **R5-E6:** TTL is configured relative to Herdr poll interval input; pure module does not sleep.
- **R5-E7:** Stale heartbeat is classified `stale` but does not auto-release.
- **R5-E8:** Working/blocked/unknown agent status never auto-releases ownership.
- **R5-E9:** Missing heartbeat after TTL → `stale` observation only.
- **R5-E10:** Clock is injected; pure code does not read `Date.now` unless adapter supplies default explicitly at edge.

## Rule 6 — CAID lifecycle ordering

Lifecycle is plan → create/open → register → acquire → handoff → release, with assignment-history mirror.

- **R6-E1:** `planCaidLifecycle` returns branch, path, role, isolation, card id without side effects.
- **R6-E2:** Open/create records intended path only after plan validation.
- **R6-E3:** Register upserts CAID board and worktree card together or fails both logically.
- **R6-E4:** Acquire after register for strict role requires exclusive path free of collisions.
- **R6-E5:** Handoff formats frozen snapshot of assignment + head SHA input.
- **R6-E6:** Release clears busy and appends history event `released`.
- **R6-E7:** History is append-only bounded; overflow returns `history-limit` without deleting prior required fields.
- **R6-E8:** Skipping acquire and claiming handoff writer authority fails.
- **R6-E9:** Test Designer and Implementer on same path → collision.
- **R6-E10:** Shared isolation role may share only when policy allows; strict roles never share.

## Rule 7 — Board vs CAID agreement

Disagreement blocks mutation.

- **R7-E1:** CAID entry path missing on worktree board → `board-caid-mismatch`.
- **R7-E2:** Board busy without CAID assignment for strict role → mismatch/block.
- **R7-E3:** Divergent head SHA facts → block cleanup and handoff success claims.
- **R7-E4:** Focused id pointing at missing card is non-fatal for list but blocks focus-dependent actions.
- **R7-E5:** Prune removes only undiscovered idle entries; never prunes busy without explicit parent force policy (default refuse).

## Rule 8 — Conservative cleanup preconditions

Cleanup planner never deletes; it only returns allow/deny with reasons.

- **R8-E1:** Dirty worktree → deny `dirty`.
- **R8-E2:** Busy writer → deny `busy`.
- **R8-E3:** Stale but still leased → deny `leased` (stale ≠ free).
- **R8-E4:** Unknown agent status → deny `unknown-status`.
- **R8-E5:** Blocked Herdr pane fact → deny `blocked`.
- **R8-E6:** Head SHA mismatch vs expected → deny `sha-mismatch`.
- **R8-E7:** Clean idle matching SHA → allow with explicit candidate list only.
- **R8-E8:** User-owned main worktree → deny by default.
- **R8-E9:** Planner never calls `rm`/`worktree remove`.
- **R8-E10:** OPS-01 later executes cleanup only after APR-01; ISO only plans readiness.

## Rule 9 — Cross-process lock and atomic board IO

IO helpers use exclusive lock + replace; no partial boards.

- **R9-E1:** Save writes temp then rename into place.
- **R9-E2:** Lock busy → `lock-unavailable` without clobber.
- **R9-E3:** Corrupt JSON load → refuse with stable code.
- **R9-E4:** Empty file → empty board default only when explicitly allowed; otherwise refuse.
- **R9-E5:** Permissions must remain private where platform allows (adapter concern; pure planner records required mode fact).

## Rule 10 — Thin extension boundary

`worktree-board` extension adapts pure lifecycle; no second FSM.

- **R10-E1:** Commands map to pure functions with injected discovery/status.
- **R10-E2:** Extension does not spawn agents.
- **R10-E3:** Extension does not merge git.
- **R10-E4:** Disable extension leaves pure lib importable.
- **R10-E5:** Status formatting remains bounded.

## Rule 11 — Stable non-echoing failures

Failures never echo raw paths with secrets or arbitrary OS messages as authority.

- **R11-E1:** OS error mapped to `io-failed`.
- **R11-E2:** Collision code does not include full hostile path payloads beyond bounded safe display.
- **R11-E3:** No throw of user-controlled strings as primary API contract (Result types preferred).

## Rule 12 — Compatibility with existing helpers

Strengthen `acquireWriter`/`detectCaidCollisions`/`saveRegistry` without silent behavior weakening.

- **R12-E1:** Existing acquire cap still enforced.
- **R12-E2:** Collision detector gains realpath/nest checks without removing path equality checks.
- **R12-E3:** DEFAULT_MAX_BUSY_WRITERS remains finite.
- **R12-E4:** New lifecycle API is additive (`planCaidLifecycleV1`, `evaluateCleanupReadinessV1`, etc.).

## Questions (resolved)

| ID | Question | Resolution |
|----|----------|------------|
| Q1 | Does stale auto-release? | **No.** Stale is visible only. |
| Q2 | Who mutates the board? | **Parent only** with lock. |
| Q3 | Does ISO delete worktrees? | **No.** Planner only; OPS/APR later. |
| Q4 | Clock source? | **Injected** at pure boundary. |
| Q5 | Shared paths for reviewers? | Reviewer/guardian may be shared/read-only; Test Designer/Implementer strict isolation. |
| Q6 | Heartbeat fields? | Parent token + session id + pane id + realpath. |
| Q7 | Board file path? | `.pi/worktree-board.json` under repo root fact. |
| Q8 | Parallel with BUD-01? | Yes; exclusive paths; no `agentic-fleet.ts`. |

## Out of scope

- ROLE-01 tool/skill schema enforcement
- ORC-01 multi-tool façade
- OPS-01 notification spam policy and destructive cleanup execution
- FIT-01 gate integration
- Live Herdr pane control beyond consuming pane id facts
- Raising global product autonomy

## Counts

- **Rules:** 12
- **Examples:** 86
- **Questions resolved:** 8

## Traceability

- Plan package: ISO-01
- Deps: CON-01, HDR-01 (merged)
- Unlocks: ROLE-01, ORC-01, OPS-01
- Parallel peer: BUD-01 (no shared paths)

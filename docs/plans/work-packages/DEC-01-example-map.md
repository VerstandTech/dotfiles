# DEC-01 Example Map — Trusted decision-store pre-action and handoff evidence

**Package:** DEC-01
**Focus:** Requirements-as-Code must produce deterministic, path-scoped evidence before an action and at handoff.
**Dependencies:** CON-01 safe contracts and BDD-01 canonical trusted/internal gate metadata are merged.
**Rollback:** decision evidence may be advisory, but missing/stale evidence must never be represented as a passing required result.

## Scope and vocabulary

- A **snapshot** is a validated, detached, deeply frozen decision store plus its canonical JSON and SHA-256 fingerprint.
- **Source authority** is caller-supplied evidence identifying a safe repository-relative source path and whether an agent can write that source. DEC-01 performs no filesystem lookup and does not infer trust from the current process.
- An **approval fingerprint** is a human-approved fingerprint for the exact normalized snapshot.
- A **current approval** exactly matches the current snapshot fingerprint.
- A **structured constraint** is an accepted decision with an explicit `forbid` action-id rule. Natural-language prose is never parsed to create a blocker.
- A **pre-action result** is an immutable trusted `internal` result for one action id and zero or more concrete repository-relative paths.
- A **handoff result** proves the current snapshot and approval fingerprints and summarizes only stable codes and validated decision ids.

## Rule 1 — Loading is pure, bounded, detached, and fail-closed

DEC-01 validates a caller-supplied decoded value and source authority without reading files, environment variables, clocks, processes, or the network. Only plain JSON-compatible records within CON-01 limits are accepted. Unsupported prototypes, accessors, symbols, cycles, duplicate decision ids, unsupported schema versions, malformed ids/statuses/kinds, unsafe source/scope paths, and over-limit values refuse the whole snapshot with a stable code. Failures never include source values, decision prose, raw paths, canonical bytes, or partial snapshots.

### Examples

1. A version-1 plain object within all limits loads into a detached, deeply frozen snapshot.
2. Mutating the caller's input after loading cannot alter the snapshot or fingerprint.
3. An accessor-bearing record refuses with `invalid-store` without invoking the accessor.
4. A cyclic, class-instance, binary, symbol-keyed, unsupported-version, or over-limit input refuses as a whole.
5. Duplicate decision ids refuse deterministically regardless of input order.
6. An absolute, home-relative, traversal, glob-bearing source path, credential leaf, or NUL-bearing path refuses with `unsafe-source-path`.
7. Error results expose only `{ ok: false, code }` and are deeply frozen.

## Rule 2 — Fingerprints describe normalized semantics, not incidental ordering

The snapshot fingerprint is lowercase SHA-256 over canonical UTF-8 JSON. Object keys and decision records are ordered deterministically. Set-like arrays (`tags`, `scopePaths`, `relatedIds`, and structured action ids) are deduplicated and sorted. Prose and ordered alternatives remain byte-significant. Equivalent stores with reordered decisions, keys, or set-like arrays share a fingerprint; any semantic mutation changes it.

### Examples

1. Reordering decision records and object keys yields identical canonical JSON and fingerprint.
2. Reordering or duplicating tags, scope paths, related ids, or action ids yields the same normalized fingerprint.
3. Changing status, human review, enforcement, decision prose, or a governed scope changes the fingerprint.
4. A caller cannot supply or override the calculated fingerprint.
5. Fingerprinting uses no timestamp or random value.

## Rule 3 — Human approval is bound to the exact current fingerprint

A required pre-action or handoff result passes trust only when the supplied approval fingerprint equals the current snapshot fingerprint. Missing approval, malformed approval, or a mismatch produces a stable human-review-required failure. When the source is agent-writable and the fingerprint differs from the approved fingerprint, the result additionally identifies `agent-mutation-detected`. A fresh matching human approval restores eligibility; DEC-01 never fabricates approval.

### Examples

1. A matching approved fingerprint allows trust evaluation to continue.
2. A missing approval blocks with `human-review-required`.
3. A stale approval on a human-controlled source blocks with `stale-approval` and `human-review-required`.
4. A stale approval on an agent-writable source blocks with `agent-mutation-detected` and `human-review-required`.
5. Marking a changed agent-writable snapshot human-approved with its new exact fingerprint restores current approval.
6. Merely changing source-authority metadata does not rewrite the store fingerprint, but it changes trust reason codes.

## Rule 4 — Only structured accepted constraints can block actions

A blocking rule is explicit data: `effect: "forbid"` plus one or more normalized action ids. Action ids are exact, case-sensitive identifiers; prose, title words, substrings, regexes, and fuzzy matching are not executable policy. Accepted records without structured enforcement remain visible as advisory evidence only.

### Examples

1. Accepted `forbid` action `database.raw-sql.expose` blocks that exact action.
2. `database.raw-sql.expose-debug` does not match by substring.
3. A title saying "No raw SQL" without structured enforcement cannot block.
4. An accepted architecture decision without enforcement yields an advisory code, not a fabricated pass or blocker.
5. Malformed or duplicate structured action ids refuse the store rather than weakening the rule.

## Rule 5 — Path scope matching is concrete and segment-aware

Action paths must be concrete safe repository-relative references under CON-01 policy. Decision scope may be global `**`, a concrete safe prefix, or exactly one non-bare trailing `/**`. Matching is segment-aware: a concrete scope governs itself and descendants only. A scoped rule does not match an action with no paths. If any requested path falls within a governing scope, the decision matches.

### Examples

1. Scope `src/ui` matches `src/ui` and `src/ui/debug.ts` but not `src/uis/debug.ts`.
2. Scope `src/services/**` matches `src/services/billing/index.ts`.
3. Scope `**` matches every valid concrete action path and also pathless global actions.
4. A scoped rule does not govern a pathless action.
5. An unsafe action path fails closed before matching and returns no partial matched ids.
6. Absolute, traversal, glob-bearing, credential-leaf, control-character, and non-NFC action paths fail with `unsafe-action-path`.

## Rule 6 — Accepted, rejected, and superseded semantics are deterministic

Only `accepted` decisions with current human review and structured enforcement govern. `rejected`, `superseded`, `deprecated`, and `proposed` records never block. They are reported by stable validated ids in deterministic inactive/advisory collections when relevant, without interpreting their prose. An accepted record whose individual `humanReview` is not `approved` requires human review and cannot silently govern.

### Examples

1. An accepted, individually approved matching constraint blocks a forbidden action.
2. The same record marked rejected does not block and is reported inactive.
3. The same record marked superseded does not block and is reported inactive.
4. A new accepted record that supersedes the old id governs while the old record remains inactive.
5. An accepted matching record with `humanReview: pending` blocks required evaluation as `decision-review-required`, not as the policy decision itself.
6. Output ordering is by validated decision id, independent of store input order.

## Rule 7 — Pre-action evidence uses the canonical trusted internal-result vocabulary

Pre-action evaluation returns one immutable result with `executorKind: "internal"`, `trustTier: "trusted"`, a stable status, the current store fingerprint, approval fingerprint when current, normalized action id, matched/inactive ids, and stable reason codes. It never contains decision title, context, prose, consequences, source bytes, or arbitrary input-derived errors. A contradictory accepted constraint makes required status fail.

### Examples

1. A matching forbidden action returns failed status, `constraint-conflict`, and the matching decision id.
2. An unrelated approved action returns passed status with the current fingerprint.
3. Stale approval returns failed status before policy matching and no partial matched ids.
4. Invalid action id or unsafe path returns a frozen refusal with a stable code only.
5. Repeating identical evaluation produces byte-equivalent evidence.

## Rule 8 — Handoff evidence is current, complete, and non-forgeable

Handoff evaluation receives the current snapshot, the expected snapshot fingerprint captured by the orchestrator, and pre-action results for the delivery. It fails if the expected fingerprint is missing/stale, approval is not current, a result was produced for another fingerprint, any required result failed, action ids are duplicated, or the evidence list exceeds bounds. Passing handoff evidence includes the exact current fingerprint and sorted action/result summaries only.

### Examples

1. Current snapshot, current approval, matching expected fingerprint, and all passing required actions yield passing handoff evidence.
2. Store mutation after an earlier pre-action result makes handoff fail `stale-action-evidence`.
3. A stale expected fingerprint fails `stale-store-fingerprint` even when no actions were recorded.
4. Any failed required pre-action result makes handoff fail `pre-action-failed`.
5. Duplicate action ids or over-limit result arrays fail closed.
6. Handoff output is detached, deeply frozen, deterministic, and contains no decision prose.
7. A copied, reconstructed, serialized, or legacy-shaped action result is invalid; FIT-01 must re-evaluate after reload rather than promote replayed evidence.

## Rule 9 — Legacy helpers remain compatible but cannot authorize required gates

Existing CRUD/query helpers and the natural-language `checkDecisionGate` API remain available for compatibility during DEC-01. Their heuristic result is explicitly legacy/advisory and cannot be converted into trusted passing pre-action or handoff evidence. New enforcement and handoff APIs consume only validated snapshots.

### Examples

1. Existing upsert/query/supersede tests remain green.
2. A heuristic phrase match cannot satisfy the new trusted internal result.
3. An existing unstructured template loads but its unstructured accepted records are advisory until structured enforcement is added.
4. Rollback callers may display advisory warnings while required evaluation remains unavailable/failed, never passed.

## Rule 10 — Integration ownership remains serialized and later packages consume the adapter

DEC-01 owns only the decision library, tests, and package specification. It does not modify `bdd-mode.ts`, quality-gate enums, live persistence, approval authority files, or fleet entrypoints. DEC-01 publishes typed internal evidence; FIT-01 later integrates it into the canonical quality-gate plan after SEC-01. No live sink is enabled.

### Examples

1. DEC-01 changes stay under `lib/decisions/**` plus work-package docs.
2. The canonical BDD gate enum is not duplicated or edited.
3. No file watcher, timer, extension hook, or background writer is introduced.
4. Disabling DEC-01 consumption leaves existing advisory helpers but cannot claim required decision evidence passed.

## Open questions and package decisions

| # | Question | DEC-01 decision |
|---|---|---|
| Q1 | Should the library read the decision file itself? | No. V1 is pure; the caller supplies a decoded value and explicit source authority. A later serialized adapter owns atomic file access. |
| Q2 | Is source writability itself proof of mutation? | No. Mutation is a mismatch between current and human-approved fingerprints. Required evaluation still demands an exact current approval. |
| Q3 | Can natural-language decisions block? | No. Only explicit structured `forbid` action ids block. Prose remains advisory. |
| Q4 | Are action ids case-folded or fuzzy? | No. They use a bounded exact identifier grammar and exact matching. |
| Q5 | How are path globs handled? | Action paths never allow globs. Decision scope allows only global `**`, a concrete prefix, or one non-bare trailing `/**`. |
| Q6 | Does a scoped decision govern a pathless action? | No, except global `**`. |
| Q7 | What does rejected mean? | The record is inactive; rejecting a proposal does not mean the proposal's text is a prohibition. |
| Q8 | What does superseded mean? | The old record is inactive. A separately accepted, approved replacement governs. |
| Q9 | Does `accepted` alone establish trust? | No. The record requires individual human approval, and the store snapshot requires a current human-approved fingerprint. |
| Q10 | What is persisted in evidence? | Only stable codes, validated ids, action ids, trust metadata, and typed hash references. No decision prose or raw source. RED-01 remains mandatory before any future sink. |
| Q11 | Does DEC-01 add a new BDD quality-gate kind? | No. It publishes typed internal evidence; FIT-01 owns canonical integration. |
| Q12 | Are CRUD timestamps included in the fingerprint? | Existing record timestamps remain semantic store fields and therefore affect the fingerprint; DEC-01 itself never generates a time. |
| Q13 | How are semantically set-like arrays handled? | They are deduplicated and sorted before fingerprinting; ordered alternatives stay ordered. |
| Q14 | How are duplicate JSON member names handled? | V1 receives a decoded plain object, so duplicate members cannot exist at the library boundary. The future serialized loader must reject duplicate JSON member names before decoding. |
| Q15 | What is the mutation target? | Remove the agent-writable stale-fingerprint classification or allow a forbidden structured action to pass; the locked tests must fail and restoration must pass. |
| Q16 | Can pre-action evidence be serialized and replayed as trusted? | No. V1 provenance is process-local. FIT-01 must re-evaluate from a current approved snapshot after reload; copied or reconstructed evidence is rejected. |

## Coverage summary

- **Rules:** 10
- **Examples:** 55
- **Questions:** 16
- **Primary mutation target:** stale agent-writable approval or structured forbidden-action enforcement
- **Explicit exclusions:** filesystem reads/stat, extension hooks, live sinks, quality-gate enum integration, approval authority storage, fleet entrypoints, and serialized JSON duplicate-key parsing

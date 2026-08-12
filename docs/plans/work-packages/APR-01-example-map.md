# APR-01 Example Map — Human approval seams

**Package:** APR-01
**Focus:** explicit machine-local human approval for plans, findings, risky actions, and diffs.
**Dependencies:** CON-01 and ORC-01 are merged.
**Personas:** Leo (exact local authority), Maya (fast trustworthy review), Nikhil (hostile-boundary review), Sofia (clear recovery), and André (portable adapter contracts), from `docs/bdd/TARGET_PUBLIC.md`.
**Rollback:** disable the approval extension and leave ORC-01 approval unavailable; never fall back to model, prompt, project-file, merge, or cleanup authority.

## Scope and locked vocabulary

- An **APR request** is a closed V1 value for one `plan`, `findings`, `risky-action`, or `diff` decision.
- An **approval scope** binds the exact request id and kind, applicable head SHA, normalized sorted paths, plan fingerprint, action/risk/effect fingerprint, session id, lifecycle generation, creation time, and expiry time.
- A **current approval** is a durable `approved` record whose complete normalized scope matches and has not expired.
- A **durable denial** is a persisted `denied` record for one exact request and scope. It is never silently re-prompted or converted.
- The **authority store** is an explicitly injected, machine-local safe store outside the project root. The pure core performs no ambient file access.
- A **session mirror** is an observational Pi custom entry with `authority: false`; it can never be read as approval.
- An **ORC gateway** is the injected callback shape already consumed by `assurance_request_approval`. APR-01 provides it but does not register another tool.
- **TUI authority** means a current in-process Pi TUI context where a human explicitly chooses and confirms a decision. RPC, JSON, print, prompts, model output, and project files are not TUI authority.

## Rule 1 — Only an explicit human TUI choice can create authority

The core accepts no approval boolean. A new authoritative record can be produced only after the current approval-seams generation invokes injected TUI `select` and `confirm` operations and receives an explicit human decision. Prompts, model text, role handoffs, trajectory events, and project files are data, never authority.

### Examples

1. **R1-E1 (Leo):** selecting approve and confirming in the current Pi TUI can create one approved record.
2. **R1-E2 (Maya):** selecting deny and confirming in the current Pi TUI can create one denied record.
3. **R1-E3 (Nikhil):** `{ confirmed: true }` supplied by a model is rejected as an unknown field.
4. **R1-E4 (Sofia):** a prose answer saying “approved” cannot satisfy the gateway.
5. **R1-E5 (Nikhil):** a role result claiming human approval cannot create or refresh a record.
6. **R1-E6 (André):** a trajectory event named `approval` remains observational and cannot be loaded as authority.
7. **R1-E7 (Leo):** editing `.pi/approval.json` cannot create approval because project paths are refused as authority stores.

## Rule 2 — V1 requests are closed, bounded, detached, and hostile-safe

Only plain, finite, JSON-compatible objects with exact V1 keys and published bounds are accepted. Accessors, symbols, cycles, hostile proxies, unsupported prototypes, unknown fields, oversized values, and unsupported versions fail closed without invoking user code or echoing values. Valid normalized requests are detached and deeply frozen.

### Examples

1. **R2-E1 (André):** a valid plain V1 request becomes a detached deeply frozen normalized request.
2. **R2-E2 (Nikhil):** an accessor-bearing request is refused without invoking the accessor.
3. **R2-E3 (Nikhil):** a cyclic, proxy-throwing, class-instance, binary, function, bigint, symbol-keyed, or non-finite graph is refused.
4. **R2-E4 (Maya):** an unsupported schema version fails with one stable APR-01 code.
5. **R2-E5 (Sofia):** an unknown `approved`, `prompt`, `diffBody`, `sourceBody`, or `toolBody` field is refused.
6. **R2-E6 (Nikhil):** string, path-count, record-count, depth, object-key, and serialized-byte excesses fail as a whole.
7. **R2-E7 (Leo):** mutating the caller's request after validation cannot change a stored scope or returned result.

## Rule 3 — Approval kind is one of four exact values

V1 supports exactly `plan`, `findings`, `risky-action`, and `diff`. Kind is explicit in native APR requests. The ORC compatibility adapter accepts only a closed action-id convention whose first segment is one of those kinds; it never guesses from prose.

### Examples

1. **R3-E1 (Leo):** a `plan` request can be reviewed before implementation delegation.
2. **R3-E2 (Maya):** a `findings` request can record acceptance or denial of a bounded review set.
3. **R3-E3 (Nikhil):** a `risky-action` request binds action, risk, effect, and applicable SHA.
4. **R3-E4 (Sofia):** a `diff` request binds the candidate SHA and normalized changed paths.
5. **R3-E5 (André):** `merge`, `cleanup`, `security`, and arbitrary new kinds are rejected in V1.
6. **R3-E6 (Nikhil):** an ORC action containing approval prose but no exact kind prefix is unavailable, not inferred.
7. **R3-E7 (Maya):** changing only the kind makes an existing record stale for the new request.

## Rule 4 — Request identity and complete scope are exact

Every request and decision binds request id, kind, applicable head SHA, paths, plan fingerprint, action id, risk id, effect id, action fingerprint, session id, generation, creation time, and expiry time. Stored records include one deterministic scope fingerprint calculated from that complete normalized scope.

### Examples

1. **R4-E1 (Leo):** an approved diff with the same request id, SHA, paths, and fingerprints is current before expiry.
2. **R4-E2 (Nikhil):** changing the request id prevents reuse even if every other field matches.
3. **R4-E3 (Nikhil):** changing the head SHA makes the prior approval stale.
4. **R4-E4 (Maya):** adding, removing, or replacing one scoped path makes the prior approval stale.
5. **R4-E5 (Leo):** changing plan or action fingerprint makes the prior approval stale.
6. **R4-E6 (Nikhil):** changing action, risk, or effect id makes the prior approval stale even if a caller repeats an old fingerprint.
7. **R4-E7 (André):** changing session, generation, creation, or expiry facts prevents cross-lifecycle reuse.

## Rule 5 — Paths are concrete, normalized, deduplicated, and sorted

Approval paths are safe repository-relative concrete paths. V1 rejects absolute, home-relative, traversal, empty-segment, NUL, backslash, dot-segment, glob, and credential-leaf paths. Equivalent duplicate or input ordering normalizes to one sorted path set before fingerprinting and persistence.

### Examples

1. **R5-E1 (André):** `src/a.ts, src/b.ts` remains sorted and deterministic.
2. **R5-E2 (Leo):** reversed input order yields the same normalized paths and scope fingerprint.
3. **R5-E3 (Maya):** duplicate paths collapse before scope binding.
4. **R5-E4 (Nikhil):** `/tmp/a`, `~/a`, `../a`, `src/../a`, and `src\\a` are refused.
5. **R5-E5 (Nikhil):** `src/**`, `src/*.ts`, NUL-bearing values, and empty segments are refused.
6. **R5-E6 (Sofia):** `src/ui` and `src/uis` remain distinct scopes.
7. **R5-E7 (Nikhil):** obvious credential leaves such as `.env` or `auth.json` cannot become approval paths.

## Rule 6 — Time and lifecycle freshness fail closed

The pure core receives an explicit clock callback. Creation, decision, and expiry timestamps use strict RFC3339 UTC milliseconds. A decision must occur at or after creation and strictly before expiry. Approved records at or after expiry are non-passing. No timer or polling loop exists.

### Examples

1. **R6-E1 (Maya):** a decision created and checked before expiry can be current.
2. **R6-E2 (Nikhil):** a malformed, non-UTC, or non-millisecond timestamp is invalid.
3. **R6-E3 (Leo):** a clock value before request creation blocks the request.
4. **R6-E4 (Sofia):** a request checked exactly at expiry is expired and non-passing.
5. **R6-E5 (Nikhil):** a decision at or after expiry cannot be persisted as approval.
6. **R6-E6 (André):** generation starts only on `session_start`; factory import creates no usable generation.
7. **R6-E7 (Leo):** reload or session replacement invalidates the old generation without a timer.

## Rule 7 — Existing records are validated before any prompt

The store is loaded and validated before asking the human. An exact current approval returns current without re-prompting. An exact denial remains denied. A record with the same request id but changed scope is stale. An expired approval is expired. Unknown or malformed records are non-passing.

### Examples

1. **R7-E1 (Maya):** an exact current approved record returns `APR01_APPROVED` without opening UI again.
2. **R7-E2 (Sofia):** a missing record opens UI only when all current authority seams are available.
3. **R7-E3 (Nikhil):** a same-id record with changed SHA returns stale without prompting.
4. **R7-E4 (Nikhil):** a same-id record with changed path or risk returns stale without prompting.
5. **R7-E5 (Leo):** an expired approved record returns expired without silently refreshing approval.
6. **R7-E6 (André):** an unknown decision, malformed record, duplicate request id, or invalid authority marker refuses the whole store.
7. **R7-E7 (Nikhil):** record matching never trusts caller object identity or mutable references.

## Rule 8 — Denial is durable for the exact request and scope

A confirmed human denial is atomically persisted with the same authority safeguards as approval. Every later check for that exact request and scope returns denied without UI. A genuinely changed scope must use a new request id and requires a new explicit TUI decision; APR never silently treats changed scope as approved.

### Examples

1. **R8-E1 (Maya):** an exact denied request returns `APR01_DENIED` on every later check.
2. **R8-E2 (Leo):** restarting the model in the same authoritative store cannot bypass the denial.
3. **R8-E3 (Nikhil):** model retries, role retries, and prompt rewrites cannot erase denial.
4. **R8-E4 (Sofia):** canceling a dialog is blocked but is not silently stored as denial.
5. **R8-E5 (Leo):** reusing a denied request id with changed scope is stale and is not re-prompted.
6. **R8-E6 (Maya):** a new request id for a changed SHA/path/risk is a new review and must open UI.
7. **R8-E7 (Nikhil):** store capacity failure blocks the decision rather than dropping an old denial.

## Rule 9 — Headless, non-TUI, missing, or stale UI authority never approves

The extension requires the current context to have UI, be in TUI mode, and expose callable `select` and `confirm`. RPC, JSON, print, missing gateway, missing store, missing clock, inactive generation, canceled selection, thrown UI, or stale-generation completion returns blocked or unavailable.

### Examples

1. **R9-E1 (Sofia):** `ctx.hasUI === false` returns `APR01_UI_UNAVAILABLE`.
2. **R9-E2 (Nikhil):** JSON and print modes never approve.
3. **R9-E3 (Nikhil):** RPC has dialog transport but is not machine-local TUI authority in APR-01 V1.
4. **R9-E4 (André):** missing `select` or `confirm` returns unavailable before reading an approval as passing.
5. **R9-E5 (Leo):** missing injected safe store or clock returns authority missing.
6. **R9-E6 (Sofia):** Escape/cancel returns blocked with no record append.
7. **R9-E7 (Nikhil):** a UI result completing after generation disposal cannot persist or approve.

## Rule 10 — Authority persistence is explicitly machine-local and outside the project

Every store operation carries closed filesystem facts supplied by the injected safe store. The store path and verified real path must be absolute, machine-local, and outside both the lexical and verified project roots. Existing authority files must be regular, non-symlink, single-link files with mode `0600`.

### Examples

1. **R10-E1 (Leo):** a verified machine-local regular file outside the project with mode `0600` is eligible.
2. **R10-E2 (Nikhil):** a store under the project root or `.pi` is refused as non-authoritative.
3. **R10-E3 (Nikhil):** an escaped `project/../project/.pi/approval.json` path is refused.
4. **R10-E4 (Nikhil):** a lexical outside path whose verified real path enters the project is refused.
5. **R10-E5 (Nikhil):** mode `0644`, `0660`, or any mode other than exact `0600` is refused.
6. **R10-E6 (Nikhil):** symlink, hardlink count greater than one, directory, socket, FIFO, or nonregular facts are refused.
7. **R10-E7 (André):** absent-file creation is allowed only when the safe store promises mode `0600`, no-follow creation, safe parent, and atomic replacement.

## Rule 11 — Safe-store callbacks own effects and must prove atomic no-follow writes

The pure core imports no filesystem, process, environment, network, or timer capability. It calls one injected read and, for a new human decision, one compare-and-commit callback. Read and commit results are closed and revalidated. Unsupported no-follow, regular-file verification, hardlink verification, atomic replacement, or revision checking fails closed.

### Examples

1. **R11-E1 (André):** the core receives clock, lifecycle facts, UI, store, and optional trajectory callbacks explicitly.
2. **R11-E2 (Nikhil):** `read` throw, refusal, malformed response, or unsafe facts returns stable store unavailable/unsafe.
3. **R11-E3 (Leo):** commit receives an expected revision and a detached frozen next envelope.
4. **R11-E4 (Nikhil):** commit refusal or revision race never returns approved.
5. **R11-E5 (Nikhil):** commit success with unsafe post-write facts never returns approved.
6. **R11-E6 (Maya):** the committed envelope contains only bounded approval records, not prompt, diff, source, or tool bodies.
7. **R11-E7 (André):** importing core modules performs no read, write, environment lookup, network request, process launch, or timer registration.

## Rule 12 — Mirrors and trajectory are observational and closed

After durable persistence, the extension may append a Pi session custom-entry mirror marked `authority: false`. An optional trajectory callback receives only closed approval metadata: ids, kind, decision, scope fingerprint, applicable SHA, session/generation, timestamps, and stable code. Neither callback can grant authority.

### Examples

1. **R12-E1 (Maya):** a successful new decision may append one namespaced session mirror.
2. **R12-E2 (Nikhil):** the mirror explicitly says `authority: false` and `authorityScope: approval-only`.
3. **R12-E3 (Leo):** deleting or editing a session mirror does not change the machine-local authority store.
4. **R12-E4 (Nikhil):** a project copy of mirror JSON cannot be loaded as authority.
5. **R12-E5 (André):** trajectory receives no action/risk/effect text, path list, prompt, diff, source, tool body, or raw store error.
6. **R12-E6 (Nikhil):** a thrown trajectory callback returns one stable unavailable code without exposing its error.
7. **R12-E7 (Maya):** absence of the optional trajectory callback does not fabricate an observation requirement.

## Rule 13 — APR provides the ORC gateway contract without a duplicate tool

The exported gateway accepts one CON-01 `ApprovalRequestV1`, maps only the locked kind/action-id convention into the APR scope, invokes APR authority, and returns the exact durable APR wrapper expected by ORC-01. Approved and denied decisions remain structurally bound. APR registers no `assurance_request_approval` tool itself.

### Examples

1. **R13-E1 (André):** a current APR approval returns `{ ok: true, authority: "apr-01", durable: true, decision }`.
2. **R13-E2 (Maya):** a durable APR denial returns the same wrapper with CON decision `rejected`.
3. **R13-E3 (Nikhil):** the returned CON decision preserves request id, action, risk, paths, SHA, fingerprint, and valid decision time.
4. **R13-E4 (Nikhil):** a malformed or unsupported ORC request returns unavailable without invoking UI.
5. **R13-E5 (Sofia):** ORC without an injected APR gateway remains `ORC01_APPROVAL_GATEWAY_UNAVAILABLE`.
6. **R13-E6 (Leo):** APR does not edit ORC, register a same-name tool, or override tool execution.
7. **R13-E7 (André):** the gateway is exportable for explicit composition and package-local tests.

## Rule 14 — The extension is thin and lifecycle-bound

The module registers only `session_start` and `session_shutdown` lifecycle hooks needed to hold the current UI/store generation. Session start disposes the previous generation first, increments generation, captures closed session facts, and opens the injected safe store. Shutdown/reload disposal is idempotent and closes a current store at most once. No timer exists.

### Examples

1. **R14-E1 (André):** importing the extension starts no resource or authority.
2. **R14-E2 (Leo):** factory registration creates hooks but no active gateway generation.
3. **R14-E3 (Maya):** first `session_start` activates generation one only after current facts and store are available.
4. **R14-E4 (Nikhil):** repeated `session_start` disposes the previous store before generation replacement.
5. **R14-E5 (Sofia):** repeated `session_shutdown` is harmless and closes a generation at most once.
6. **R14-E6 (Leo):** reload shutdown invalidates old UI callbacks before the replacement session starts.
7. **R14-E7 (André):** no command, shortcut, flag, renderer, provider, built-in override, or tool is registered.

## Rule 15 — Results use stable non-echoing codes and bounded metadata

All public results are closed, bounded, detached, and deeply frozen. Failures expose only schema version, success flag, outcome, stable APR-01 code, and minimal safe metadata. Success metadata excludes prompt, diff, source, tool, action, risk, effect, and raw callback bodies.

### Examples

1. **R15-E1 (Sofia):** invalid input returns a stable code and one recovery class without user values.
2. **R15-E2 (Nikhil):** a synthetic secret in UI/store/trajectory errors never appears in serialized output.
3. **R15-E3 (Maya):** approved, denied, stale, expired, blocked, and unavailable are distinguishable.
4. **R15-E4 (Leo):** success reports request id, kind, scope fingerprint, applicable SHA, generation, and timestamps only.
5. **R15-E5 (Nikhil):** no result includes canonical store bytes or a partial malformed record.
6. **R15-E6 (André):** unknown internal exceptions map to one bounded unavailable result.
7. **R15-E7 (Leo):** callers cannot mutate nested result metadata after return.

## Rule 16 — Store envelopes and outputs remain bounded under hostile history

The authority envelope has a closed V1 shape, unique request ids, a fixed maximum record count, deterministic ordering, and fully validated records. Records are detached before commit and after read. Capacity or duplicate ambiguity never evicts, overwrites, or weakens a denial.

### Examples

1. **R16-E1 (André):** a valid bounded envelope with unique request ids is accepted.
2. **R16-E2 (Nikhil):** duplicate request ids refuse the entire envelope.
3. **R16-E3 (Nikhil):** unknown envelope or record fields refuse instead of being stripped.
4. **R16-E4 (Leo):** record ordering is deterministic after append.
5. **R16-E5 (Maya):** a full store blocks a new decision and retains all prior records.
6. **R16-E6 (Nikhil):** mutated data returned by a store after validation cannot alter detached authority state.
7. **R16-E7 (André):** malformed authority provenance, scope fingerprint, or decision time refuses the whole read.

## Rule 17 — Approval grants no adjacent engineering authority

APR authority answers only whether one exact approval scope is approved or denied. It cannot create or merge a PR, push, deploy, clean resources, mutate a worktree lease, advance BDD, waive security, approve a decision store, alter a budget, or establish role/handoff truth.

### Examples

1. **R17-E1 (Maya):** an approved diff still requires human merge under repository policy.
2. **R17-E2 (Leo):** an approved risky action does not execute that action.
3. **R17-E3 (Nikhil):** approval does not grant write/worktree authority owned elsewhere.
4. **R17-E4 (Sofia):** approval does not advance discovery, red, green, or verify phases.
5. **R17-E5 (Nikhil):** approval does not bypass security, redaction, or trusted-executor requirements.
6. **R17-E6 (André):** approval does not mutate trajectory, decisions, roles, fleet, Herdr, or budget authorities.
7. **R17-E7 (Leo):** extension code contains no merge, push, PR, cleanup, shell, process, network, or ambient project-file operation.

## Rule 18 — Verification proves causal red, minimum green, and authority mutations

Tests are authored before production and initially fail with named `APR01_APPROVAL_AUTHORITY_MISSING`. Green implements the pure core before the extension. Focused and full package tests pass. Mutation checks deliberately accept a model boolean, accept a changed SHA, and allow headless UI; each named test must fail before restoration.

### Examples

1. **R18-E1 (Maya):** before core production exists, the focused suite fails with `APR01_APPROVAL_AUTHORITY_MISSING`.
2. **R18-E2 (Nikhil):** the red is a causal missing-authority assertion, not timeout, import setup, dependency, or unrelated failure.
3. **R18-E3 (Leo):** minimum core green covers exact approval, stale SHA/path/risk, expiry, and durable denial.
4. **R18-E4 (André):** extension green covers ORC compatibility, lifecycle, UI, store facts, mirror non-authority, and no duplicate tool.
5. **R18-E5 (Nikhil):** accepting `confirmed: true` makes the named model-authority test fail.
6. **R18-E6 (Nikhil):** ignoring SHA drift or allowing headless UI makes its named test fail.
7. **R18-E7 (Maya):** restored focused/full/import evidence is local only; no push, PR, merge, or cleanup follows.

## Resolved questions

| ID | Question | Resolution |
|---|---|---|
| Q1 | Who can create an authoritative decision? | Only a human explicitly selecting and confirming in the current Pi TUI generation. |
| Q2 | Is RPC UI authoritative in V1? | No. V1 is machine-local TUI only; RPC is unavailable for authoritative approval. |
| Q3 | Can model booleans or prose approve? | No. Unknown fields are rejected and prose is never parsed as authority. |
| Q4 | Can a project `.pi` file be the store? | No. Lexical and verified project containment both fail closed. |
| Q5 | Which kinds exist? | Exactly `plan`, `findings`, `risky-action`, and `diff`. |
| Q6 | Is head SHA always required? | It is required for `diff` and `risky-action`; `plan` and `findings` may explicitly bind `null` when no candidate exists. ORC compatibility always supplies its candidate SHA. |
| Q7 | How are paths compared? | Safe concrete repo-relative paths are deduplicated and sorted before binding. |
| Q8 | What fingerprint is authoritative? | A deterministic scope fingerprint derived from every normalized binding fact; plan and action fingerprints also remain explicit inputs. |
| Q9 | Does an old approval survive SHA/path/plan/risk/action drift? | No. Same-id drift is stale and non-passing. |
| Q10 | Does a denial expire into a re-prompt? | No. Exact denial remains durable and non-passing; a changed scope needs a new request id and explicit review. |
| Q11 | What happens on dialog cancel? | Block with no persisted decision; cancel is not silently interpreted as denial or approval. |
| Q12 | What clock is used? | An explicit injected clock callback; the pure core never reads ambient time. |
| Q13 | Does the core read files or environment? | No. All effects and filesystem facts arrive through injected callbacks. |
| Q14 | What file mode is accepted? | Exact `0600`, with regular-file, no-symlink, single-link, no-follow, safe-parent, and atomic-write evidence as applicable. |
| Q15 | Who verifies filesystem safety? | The injected safe store performs OS operations and reports closed facts; core revalidates those facts before trusting read or commit. |
| Q16 | Can unsupported platforms use weaker persistence? | No. Unsupported safe persistence returns unavailable. |
| Q17 | Are Pi custom entries authoritative? | No. They are optional observational mirrors explicitly marked `authority: false`. |
| Q18 | What can trajectory receive? | Closed metadata only; no raw action/risk/effect, path list, prompt, diff, source, tool body, or callback error. |
| Q19 | Does trajectory failure leak its error? | No. It produces one stable unavailable code with no raw error. |
| Q20 | Does APR register `assurance_request_approval`? | No. ORC owns that tool; APR exports a compatible injected gateway. |
| Q21 | How does ORC communicate kind? | Through a strict kind-prefixed action-id convention; APR never infers kind from natural language. |
| Q22 | What lifecycle owns generation? | `session_start` creates it after disposing the prior generation; shutdown/reload disposes idempotently. |
| Q23 | Can approval merge, push, clean, advance BDD, or waive controls? | No. APR authority is approval-only and executes none of those actions. |
| Q24 | What is rollback? | Disable/remove APR's new paths and leave ORC approval unavailable; do not introduce a weaker fallback. |

## Out of scope

- Cryptographic human identity/signatures, organization-managed approval, remote approval, or immutable audit retention.
- Editing ORC, BDD gates, worktree/ISO, Herdr, budget, security, trajectory, decision, roles, or fleet owners.
- A duplicate tool, hidden phase machine, autonomous recipe, merge, PR, push, deploy, release, or cleanup path.
- Raw prompt/diff/source/tool persistence, project-root approval authority, ambient filesystem reads, network access, process access, timers, or polling in the pure core.

## Counts

- **Rules:** 18
- **Examples:** 126 (7 per rule)
- **Resolved questions:** 24

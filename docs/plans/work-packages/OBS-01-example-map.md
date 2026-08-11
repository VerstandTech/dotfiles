# OBS-01 Example Map — redacted trajectory recorder and replay fixtures

## Story

**As Leo, Maya, Nikhil, Sofia, and André,**
**we need process evidence to be captured only after RED-01, ordered without ambiguity, and replayed against deterministic anti-pattern fixtures,**
**so a current handoff can explain how an agent reached its result without persisting secrets, raw content, duplicate lifecycle state, or invented authority.**

## Persona role-play

### A — Leo: inspectable autonomy

1. Leo enables trajectory observation for one Pi session and expects every recorded event to have one process-owned sequence.
2. He reloads extensions during diagnosis and expects one replacement recorder, no duplicated subscription, timer, writer, or event.
3. He inspects a run and sees redacted metadata, safe path references, and hashes of already-redacted canonical bytes—not prompts, source bodies, or tool output.
4. A failed required gate followed by a success claim evaluates as unsafe even if the final code is green.
5. He can disable the optional file sink without disabling safe session-local evidence or changing BDD authority.

### B — Maya: concise current handoff evidence

1. Maya sees stable event kinds and anti-pattern codes rather than prose-parsed compliance claims.
2. Missing, malformed, truncated, stale, or out-of-order evidence cannot become a passing replay.
3. Advisory trajectory results remain distinct from future FIT-01 required gate authority.
4. The report identifies which deterministic fixture failed without exposing raw event content.
5. No recorder event grants PR, approval, worktree, BDD, security, or merge authority.

### C — Nikhil: the sink is an exfiltration boundary

1. Nikhil supplies credentials in keys, values, paths, encoded strings, tool inputs, tool results, errors, and custom events.
2. RED-01 succeeds before `appendEntry`, buffer insertion, filesystem append, status/report rendering, or event-bus forwarding.
3. If RED-01 refuses a hostile graph, the raw candidate is discarded and only a stable non-echoing refusal code may be recorded through a fresh safe candidate.
4. File persistence is explicit opt-in, project-trusted, append-only, bounded, and rejects symlink, hardlink, non-regular, or escaped targets.
5. Hashes are computed only from RED-01 success bytes so the recorder never creates a raw-secret hash oracle.

### D — Sofia: understandable recovery

1. Sofia can distinguish `redaction-refused`, `sequence-invalid`, `retention-limit`, `sink-unavailable`, and `writer-closed` without inspecting parser internals.
2. A logger failure never blocks ordinary interactive work by itself in OBS-01, but it remains visible and cannot be called recorded.
3. Enabling file output requires one explicit operator option; there is no hidden project write.
4. Reaching a retention ceiling stops new file persistence instead of deleting or rewriting history silently.
5. The recovery path says whether to remove unsafe configuration, explicitly purge old artifacts, or continue session-only.

### E — André: portable contracts and exact fixtures

1. André can evaluate V1 runs without Pi, clocks, environment, filesystem, network, or model access.
2. Existing V1 trajectory consumers remain source-compatible while new fields and expected fixture verdicts are additive.
3. The former stub becomes committed positive and negative fixtures under OBS-01 ownership.
4. Extension hooks are thin adapters over injected recorder, sink, clock, and session-entry boundaries.
5. FIT-01 later consumes a typed internal result; OBS-01 does not add another quality-gate enum or edit `bdd-mode.ts`.

## Rules and examples

## Rule 1 — OBS-01 has one narrow authority and composes existing owners

OBS-01 owns redacted process-event persistence and deterministic replay only. BDD phase, worktree leases, decisions, security, budget, approval, Herdr state, CI, PR, and merge authority remain external inputs or later integrations.

- **R1-E1:** A trajectory event reports phase `red`; it does not change `bdd-mode` phase.
- **R1-E2:** A worktree event names a lease id; it does not grant or transfer the `.pi/worktree-board.json` lease.
- **R1-E3:** An approval event reports an external decision reference; it cannot approve an action.
- **R1-E4:** A gate event reports `failed`; OBS-01 evaluates the path but does not rerun or override the gate.
- **R1-E5:** A gate event reports `passed`; it is not a canonical FIT-01 pass.
- **R1-E6:** A Herdr-state event reports `blocked`; it does not control a pane or resume a worker.
- **R1-E7:** A budget event reports `unknown`; it cannot increase a budget or authorize a spawn.
- **R1-E8:** A handoff event reports candidate SHA metadata; it cannot create, merge, or clean a PR.

## Rule 2 — V1 input is closed, bounded, detached, and hostile-shape safe

Every public recorder/evaluator boundary accepts `unknown`, validates a closed V1 shape without invoking getters or proxy traps intentionally, and returns frozen detached success or a stable non-echoing refusal.

- **R2-E1:** Missing `schemaVersion: 1` returns `unsupported-version` or `invalid-event`.
- **R2-E2:** Unknown event kind returns `invalid-event-kind`.
- **R2-E3:** Unknown enumerable field returns `unknown-field`.
- **R2-E4:** Accessor property returns `unsafe-accessor` without calling it.
- **R2-E5:** Symbol key returns `unsafe-key`.
- **R2-E6:** Cyclic payload returns `unsafe-cycle`.
- **R2-E7:** Sparse or oversized array returns a stable bound code.
- **R2-E8:** Oversized string, preview, path list, hash list, object, or serialized candidate returns a stable bound code.
- **R2-E9:** Non-finite number, bigint, function, binary view, class instance, Date, Map, Set, Promise, or unsupported prototype refuses.
- **R2-E10:** Mutating the source after success cannot mutate the returned event, line bytes, evaluation, or queued record.

## Rule 3 — RED-01 runs before every sink and before hashing

A candidate may reach no session entry, memory buffer, file append, event-bus emission, status summary, report, or digest until `redactForPersistence(input: unknown)` succeeds.

- **R3-E1:** Plain API key in preview is replaced before `appendEntry` receives data.
- **R3-E2:** Secret in nested metadata is removed before memory buffering.
- **R3-E3:** URI credentials in tool input are removed before canonical hashing.
- **R3-E4:** PEM data in tool result is removed before file append.
- **R3-E5:** Credential path becomes RED-01's path marker before any sink.
- **R3-E6:** Encoded credential becomes RED-01's encoded marker before any sink.
- **R3-E7:** A RED-01 refusal causes zero raw sinks and zero raw hashes.
- **R3-E8:** Refusal handling may create a new constant-only `redaction-refused` event and pass that event through RED-01 separately.
- **R3-E9:** Injected fake redactors cannot mark arbitrary raw values trusted; production uses the imported RED-01 authority while tests observe sink ordering through a wrapper.
- **R3-E10:** No `unsafe`, `force`, raw fallback, detector-disable, or “best effort” sink option exists.

## Rule 4 — Sequence is recorder-owned, monotonic, contiguous, and reload-aware

Callers never choose persisted sequence numbers. A process-local recorder assigns the next positive safe integer after validated prior entries and advances only after a record is accepted.

- **R4-E1:** Empty session begins at sequence 1.
- **R4-E2:** Three accepted records receive 1, 2, and 3 in call order.
- **R4-E3:** Caller-supplied `seq: 500` is rejected as an unknown field rather than trusted.
- **R4-E4:** A refused raw candidate does not consume a sequence unless a separate constant refusal event is accepted.
- **R4-E5:** Reload restores max validated sequence 18 and next accepted event receives 19.
- **R4-E6:** Duplicate prior sequences refuse restoration.
- **R4-E7:** Gap in prior entries refuses restoration rather than guessing whether events were lost.
- **R4-E8:** Descending, zero, negative, fractional, unsafe-integer, or repeated sequence refuses replay.
- **R4-E9:** Concurrent record requests are serialized in invocation order by one recorder queue.
- **R4-E10:** A closed recorder never reopens or reuses its sequence capability.

## Rule 5 — Event projection stores metadata, safe references, and redacted-byte hashes instead of content

Events may preserve closed status metadata, relative artifact references, and typed digest references. Prompts, messages, source bodies, command bodies, tool outputs, model payloads, and arbitrary transcripts are never stored as trajectory content.

- **R5-E1:** A tool call records tool name, call id, actor, and digest of RED-01 success bytes—not raw input.
- **R5-E2:** A tool result records tool name, error flag, usage summary when bounded, and safe digest—not content or details.
- **R5-E3:** A phase event records the closed phase name and external evidence reference.
- **R5-E4:** A gate event records closed status, gate id, executor kind, and safe evidence reference.
- **R5-E5:** An approval event records decision status and approval fingerprint/reference, never human credentials.
- **R5-E6:** A handoff event records status, candidate SHA, dirty flag, and artifact refs, not Markdown body.
- **R5-E7:** A budget event records typed counters or `unknown`, not provider request/response bodies.
- **R5-E8:** A Herdr event records stable pane/agent state and ids, not terminal scrollback.
- **R5-E9:** Artifact paths must be safe repository-relative references; absolute, credential, traversal, URI, glob, and control-character forms refuse.
- **R5-E10:** SHA-256 digest is lowercase, typed, and derived only from RED-01 canonical success bytes.

## Rule 6 — Closed V1 taxonomy covers required process observations without a second FSM

The event-kind vocabulary is additive to the existing trajectory contract and includes message metadata, tool call/result, session lifecycle, phase change, gate result, decision, handoff, error, budget, human approval, and Herdr state.

- **R6-E1:** `message` may record role/direction and safe digest only.
- **R6-E2:** `tool_call` and `tool_result` remain distinct.
- **R6-E3:** `session` records startup, reload, resume, fork, and shutdown reason.
- **R6-E4:** `phase_change` records observed external phase only.
- **R6-E5:** `gate_result` records pass/fail/unavailable/timeout/unknown metadata.
- **R6-E6:** `decision` records accepted/rejected/superseded/stale metadata without authorization.
- **R6-E7:** `handoff` records completed/blocked/failed/unknown.
- **R6-E8:** `budget` preserves numeric usage only when finite/non-negative and otherwise records `unknown`.
- **R6-E9:** `human_approval` records an external reference and decision, not UI input.
- **R6-E10:** `herdr_state` records working/blocked/idle/done/unknown/unavailable without controlling Herdr.

## Rule 7 — Session custom entries are safe, bounded, append-only observations

The extension appends one RED-01-success trajectory custom entry per accepted observation, and restoration reads only its own closed custom type.

- **R7-E1:** Startup appends one `session/startup` event.
- **R7-E2:** A tool call appends exactly one tool-call event.
- **R7-E3:** A tool result appends exactly one tool-result event.
- **R7-E4:** An `assurance:trajectory` event-bus message appends one typed custom event.
- **R7-E5:** Foreign custom entries are ignored during restoration.
- **R7-E6:** Malformed logger entries make restoration fail closed instead of being skipped silently.
- **R7-E7:** Entry count ceiling stops further append and reports `retention-limit`.
- **R7-E8:** An `appendEntry` exception returns `sink-unavailable` and does not claim persistence.
- **R7-E9:** Session entry data contains the final detached redacted event, not the raw candidate.
- **R7-E10:** Custom entries remain excluded from model context under Pi's append-entry contract.

## Rule 8 — Optional file persistence is explicit, project-trusted, and append-only

File persistence is disabled by default and can be enabled only by an explicit operator flag/config in a trusted project. It writes canonical NDJSON under a fixed `.pi/trajectories` root.

- **R8-E1:** Default extension writes no trajectory file.
- **R8-E2:** Explicit file option in an untrusted project refuses with `project-untrusted`.
- **R8-E3:** Explicit file option in a trusted project opens one session-specific `.ndjson` segment.
- **R8-E4:** Each flush appends complete newline-terminated RED-01 canonical event bytes.
- **R8-E5:** Existing bytes are never rewritten, truncated, reordered, or normalized.
- **R8-E6:** Partial/failed append returns `sink-unavailable`; it is not reported as persisted.
- **R8-E7:** A writer supports flush and idempotent close; append after close returns `writer-closed`.
- **R8-E8:** Only one writer exists for one extension lifecycle/session id.
- **R8-E9:** File names derive from a validated Pi session id, not user path text.
- **R8-E10:** File mode is private to the current user where the platform supports it.

## Rule 9 — File targets reject escape, alias, link, and file-kind ambiguity

The runtime adapter receives explicit trusted root facts and validates every existing ancestor and target before opening append-only storage.

- **R9-E1:** Canonical target outside project root refuses.
- **R9-E2:** Existing `.pi` symlink refuses.
- **R9-E3:** Existing `trajectories` symlink refuses.
- **R9-E4:** Existing target symlink refuses.
- **R9-E5:** Existing target hardlink (`nlink > 1`) refuses.
- **R9-E6:** Directory, FIFO, socket, device, or non-regular target refuses.
- **R9-E7:** Contradictory injected path/link/file-kind facts refuse.
- **R9-E8:** Missing directories may be created only at the fixed root and are re-observed before use.
- **R9-E9:** Open uses append/create/write plus no-follow semantics where supported and verifies the opened descriptor.
- **R9-E10:** Unsupported safe-open semantics disable file persistence instead of falling back unsafely.

## Rule 10 — Buffering is bounded and preserves accepted order

A process-local buffer reduces file writes but cannot hold unbounded events, reorder them, expose raw values, or outlive close.

- **R10-E1:** Buffer receives only finalized RED-01 event lines.
- **R10-E2:** Event-count threshold flushes accepted lines in sequence order.
- **R10-E3:** Byte threshold flushes before accepting an over-limit batch.
- **R10-E4:** Single line larger than segment/buffer bound refuses before enqueue.
- **R10-E5:** Explicit flush on shutdown drains once.
- **R10-E6:** Empty flush performs no sink call.
- **R10-E7:** Concurrent enqueue/flush operations serialize.
- **R10-E8:** Sink failure keeps an honest failed state and never duplicates a later retry silently.
- **R10-E9:** Close is idempotent and releases its sink exactly once.
- **R10-E10:** No background interval/timer is required; event thresholds and lifecycle hooks drive flushing.

## Rule 11 — Reload, resume, fork, and shutdown do not duplicate subscriptions or writers

Every long-lived resource begins after `session_start`, is generation-bound, and closes idempotently on `session_shutdown` for quit, reload, new, resume, or fork.

- **R11-E1:** Repeated `session_start` first closes the active recorder then starts one replacement.
- **R11-E2:** Reload shutdown unsubscribes the namespaced event bus once.
- **R11-E3:** Reload starts one new subscription, not two.
- **R11-E4:** Old generation event callback cannot append after disposal.
- **R11-E5:** Shutdown flushes and closes one file writer exactly once.
- **R11-E6:** Shutdown with no active writer is safe.
- **R11-E7:** Failure while flushing still disposes process-local resources and reports a stable code.
- **R11-E8:** Resume restores validated session sequence and records one resume event.
- **R11-E9:** Fork receives its own session id/file and recorder; it does not append to the parent writer.
- **R11-E10:** Extension uses no duplicate FSM, polling loop, or timer.

## Rule 12 — Retention is explicit, deterministic, and never silently destructive

A pure retention planner receives explicit inventory and limits. Runtime refuses excess storage or returns purge candidates; it never deletes files without a separate explicit operator action.

- **R12-E1:** Policy bounds max event line, buffer bytes, segment bytes, total bytes, segments, and session entries.
- **R12-E2:** Missing or unknown inventory refuses file persistence.
- **R12-E3:** Inventory with unsafe path, symlink, hardlink, non-regular kind, negative size, or duplicate segment refuses.
- **R12-E4:** Next append below every limit is allowed.
- **R12-E5:** Next append exceeding segment bound requests a new bounded segment.
- **R12-E6:** Segment-count or total-byte ceiling returns `retention-limit`.
- **R12-E7:** Planner may identify oldest explicit purge candidates from injected timestamps/order.
- **R12-E8:** Planner never reads clock/filesystem or deletes a segment.
- **R12-E9:** Runtime never auto-purges, even when a candidate is identified.
- **R12-E10:** Operator can disable file persistence and continue bounded session-only recording.

## Rule 13 — Replay validates the run envelope before evaluating assertions

`evaluateTrajectory` and golden-suite evaluation reject malformed, ambiguous, hostile, or non-monotonic runs instead of normalizing them into a pass.

- **R13-E1:** Unsupported run/suite version fails.
- **R13-E2:** Missing run id/task id/start time/events fails.
- **R13-E3:** Duplicate or non-contiguous sequence fails.
- **R13-E4:** Invalid ISO timestamp or decreasing event time fails when ordering is asserted.
- **R13-E5:** Unknown event kind fails.
- **R13-E6:** Oversized run/events/assertions fails.
- **R13-E7:** Unknown assertion match mode fails.
- **R13-E8:** Missing golden fixture fails its entry.
- **R13-E9:** Duplicate suite entry id/run path fails.
- **R13-E10:** Evaluation result is detached, deeply frozen, deterministically ordered, and non-echoing on refusal.

## Rule 14 — Golden suite encodes both accepted and rejected paths

The former stub is replaced by real committed fixtures and an additive expected verdict. Suite success means each good run passes and each known-bad run is rejected for the expected code.

- **R14-E1:** `happy-red-green` has red before green, covering gate pass, isolated actors, and non-empty handoff; expected pass.
- **R14-E2:** `missing-red-before-green` enters green without red; expected fail with `MISSING_RED_BEFORE_GREEN`.
- **R14-E3:** `false-completion` claims handoff before a later required gate failure; expected fail with `FALSE_COMPLETION`.
- **R14-E4:** `test-and-impl-same-agent` has one actor write test and production refs; expected fail with `TEST_AND_IMPL_SAME_AGENT`.
- **R14-E5:** `success-after-failed-gate` ends success with unresolved failed gate; expected fail with `SUCCESS_AFTER_FAILED_GATE`.
- **R14-E6:** `secret-in-preview` contains a seeded synthetic secret; expected fail with `SECRET_IN_PREVIEW`.
- **R14-E7:** Negative fixture rejected for the wrong code does not satisfy the suite.
- **R14-E8:** Good fixture with any error anti-pattern does not satisfy the suite.
- **R14-E9:** Fixtures use only synthetic credentials and deterministic explicit timestamps.
- **R14-E10:** E2E-01 may read these fixtures but never rewrites them.

## Rule 15 — Anti-pattern oracles use structured metadata before heuristic preview

Error-level process oracles are deterministic and prefer event kind, actor, tool, path refs, phase, gate status, and outcome over prose. Preview heuristics remain bounded secondary signals.

- **R15-E1:** `MISSING_RED_BEFORE_GREEN` uses structured phase changes.
- **R15-E2:** `SUCCESS_AFTER_FAILED_GATE` uses structured required gate status and final outcome.
- **R15-E3:** A later passing result for the same gate id resolves an earlier failure before success.
- **R15-E4:** Pass for a different gate id does not resolve the failure.
- **R15-E5:** `FALSE_COMPLETION` uses handoff/decision status and unresolved gate identity.
- **R15-E6:** `TEST_AND_IMPL_SAME_AGENT` uses explicit actor plus test/production path classes, not generic use of `write` alone.
- **R15-E7:** `SECRET_IN_PREVIEW` scans preview and data defensively for legacy/imported unsafe runs.
- **R15-E8:** Redaction markers themselves do not trigger `SECRET_IN_PREVIEW`.
- **R15-E9:** Warning anti-patterns remain visible but do not independently make evaluation `ok: false` in OBS-01.
- **R15-E10:** Error anti-pattern ordering follows first event sequence then stable code order.

## Rule 16 — Extension observation is thin, fail-contained, and honest

`trajectory-logger.ts` projects Pi hooks into the recorder without exposing raw payloads, mutating tool calls/results, blocking unrelated work, or claiming a sink succeeded when it did not.

- **R16-E1:** `tool_call` observation does not modify `event.input` or block execution.
- **R16-E2:** `tool_result` observation does not replace content/details or error status.
- **R16-E3:** Recorder failure sets a concise non-secret status and stops unsafe persistence.
- **R16-E4:** Session-entry success and file failure are reported as distinct sink outcomes.
- **R16-E5:** No raw candidate appears in thrown errors, UI status, console output, or return details.
- **R16-E6:** Namespaced event-bus payload is treated as untrusted unknown.
- **R16-E7:** Unknown custom kind refuses rather than becoming a message event.
- **R16-E8:** Tool IDs/names and session IDs are bounded before use.
- **R16-E9:** File option defaults false and does not read environment variables.
- **R16-E10:** Default export introduces no dependency install, network call, subprocess, socket, or model request.

## Rule 17 — OBS-01 publishes replay evidence while later packages own integration and operations

The package exposes a typed trajectory evaluation suitable for future internal gates, updates trajectory documentation, and preserves explicit residual boundaries.

- **R17-E1:** Typed result distinguishes `pass`, `fail`, `unavailable`, and `invalid` without using canonical FIT-01 gate types yet.
- **R17-E2:** FIT-01 later adapts the typed result into the sole canonical internal gate model.
- **R17-E3:** BUD-01 later emits budget events through the namespaced interface.
- **R17-E4:** DEC-01/APR-01 later emit decision/approval references without OBS reading their stores.
- **R17-E5:** HDR/ISO/ORC later emit Herdr/worktree lifecycle references without OBS controlling them.
- **R17-E6:** OPS-01 owns broader notification/retry/cleanup behavior; OBS only closes its writer.
- **R17-E7:** PKG-01 owns package installation and machine rollout.
- **R17-E8:** E2E-01 owns full live story and may not weaken unit golden fixtures.
- **R17-E9:** Live file acceptance requires separate approval because it mutates `.pi/trajectories`.
- **R17-E10:** Human PR creation and merge authority remain unchanged.

## Decisions locked for OBS-01 V1

1. `redactForPersistence` is the sole production pre-sink redactor; hashes cover only its success JSON bytes.
2. Public pure boundaries accept `unknown`, are bounded, and return stable non-echoing typed results.
3. Sequence is recorder-owned, positive, contiguous, process-local, and restored only from validated own custom entries.
4. Session custom entries are enabled by default; optional filesystem NDJSON persistence is disabled by default and requires explicit trusted-project opt-in.
5. Events contain closed metadata, safe repository-relative artifact refs, and typed SHA-256 refs; no prompt, source, command body, tool body, result body, transcript, or terminal scrollback is retained.
6. Buffering is threshold/lifecycle driven; OBS-01 adds no timer or polling loop.
7. File writes are append-only, bounded, private, fixed-root, no-follow, descriptor-verified, and never automatically purge history.
8. Retention planning is pure; reaching hard limits stops file persistence with stable recovery.
9. The extension is observational: it never mutates tools/results, advances BDD, grants leases/approvals, controls Herdr, authorizes handoff, or blocks merge.
10. The event bus channel is `assurance:trajectory`; every payload remains untrusted until validation and RED-01 success.
11. Golden suite entries add expected pass/fail and required anti-pattern codes while retaining default-pass compatibility for existing entries.
12. Structured metadata drives mandatory anti-patterns; legacy preview heuristics remain defensive secondary checks.
13. OBS-01 publishes a package-local typed evaluation; FIT-01 alone later owns required canonical gate integration.
14. Live file creation/purge is not performed during deterministic tests and requires separate operator approval.

## Questions

| ID | Question | Owner | V1 resolution |
|---|---|---|---|
| Q1 | Is file persistence enabled by default? | Operator/security | No; session entries default on, file NDJSON requires explicit trusted-project opt-in. |
| Q2 | Is `appendEntry` a persistence sink? | Security | Yes; RED-01 must succeed before it. |
| Q3 | May hashes cover raw input to avoid storing it? | Security | No; hash only RED-01 canonical success bytes to avoid a secret hash oracle. |
| Q4 | What raw tool fields are stored? | OBS-01 | None; keep bounded tool name/id/status plus redacted-byte digest and safe refs. |
| Q5 | Who owns event sequence? | Recorder | One process-local recorder; callers cannot supply persisted `seq`. |
| Q6 | Are gaps tolerated on restoration? | Reliability | No; duplicate/gap/descending evidence is invalid and cannot seed the next sequence. |
| Q7 | Does a refusal consume a sequence? | Security | Raw refusal does not; a separately constructed constant-only refusal observation may. |
| Q8 | Can file writer retry after an ambiguous partial append? | Reliability | Not automatically; enter failed state to avoid silent duplication. |
| Q9 | Are periodic flush timers required? | Performance | No; count/byte thresholds, explicit flush, and shutdown are deterministic. |
| Q10 | Does reload rely on module-global singleton state? | Pi adapter | No; lifecycle-bound recorder/subscription resources are closed and generation-guarded. |
| Q11 | How is a file named? | Pi adapter | Validated Pi session id plus bounded segment index under fixed `.pi/trajectories`. |
| Q12 | Can the adapter follow a symlinked `.pi`? | Security | No; file persistence disables on any unresolved/link/kind ambiguity. |
| Q13 | Does retention delete old files automatically? | Operator/security | No; planner exposes limits/candidates, explicit operator purge is separate. |
| Q14 | What happens at total retention limit? | Operator | Stop file persistence with `retention-limit`; session-only may continue within its own cap. |
| Q15 | Are warning anti-patterns blocking? | Product | Not in OBS-01; error codes fail evaluation, warnings remain visible. |
| Q16 | Can a later pass resolve any prior failed gate? | QA | Only a current later pass for the same stable gate id. |
| Q17 | Can prose “tests passed” count as a gate event? | Maya/QA | No; structured status/evidence only. |
| Q18 | How is test/implementation collusion classified? | QA | Explicit actor plus test/production path refs; generic write-tool use alone is insufficient. |
| Q19 | Should synthetic secret fixtures pass after recorder redaction? | Security/QA | Recorder tests prove redaction; replay's unsafe imported fixture must still fail `SECRET_IN_PREVIEW`. |
| Q20 | Does logger failure block an interactive tool? | Product | No in OBS-01 advisory rollout; it reports failure and stops claiming persistence. |
| Q21 | Does session evidence reach model context? | Pi adapter | No; use Pi custom entries, not custom messages. |
| Q22 | Can event-bus senders claim trusted data? | Security | No; every bus payload is unknown/untrusted and revalidated/redacted. |
| Q23 | Who emits phase/gate/budget/approval/Herdr observations? | Integration owners | Thin current hook projection plus future namespaced publishers; OBS never reads their authority stores. |
| Q24 | Does OBS-01 edit `bdd-mode.ts` or canonical quality gate types? | Architecture | No; FIT-01 owns that serialized integration. |
| Q25 | Is a trajectory pass merge permission? | Human governance | Never. |
| Q26 | What is live acceptance in this package? | Operator | Optional approved file-sink smoke under a disposable `.pi/trajectories` target; not required for deterministic library green. |
| Q27 | Are unsupported filesystem no-follow semantics allowed to downgrade? | Security | No; file persistence becomes unavailable. |
| Q28 | Which residual risks remain? | Security/product | Crash may lose an unflushed bounded buffer; RED heuristics are not universal; local session/file integrity is not cryptographic; inter-extension publishers land later; explicit purge/organization retention UX remains future work. |

## Out of scope

- A second BDD/orchestration finite-state machine.
- Canonical FIT-01 gate integration or edits to `bdd-mode.ts`.
- Budget enforcement, decision/approval authority, worktree leases, Herdr control, PR/CI mutation, or merge.
- Raw transcript, prompt, source, command body, tool content, result content, or terminal scrollback persistence.
- Automatic file deletion, background retention daemon, SIEM upload, cloud logging, network egress, encryption-at-rest service, or compliance guarantee.
- Dependency installation, package pinning, sandbox installation, scanner installation, or hosted storage.
- Cryptographic signer identity, tamper-evident remote ledger, cross-machine ordering, universal crash durability, or universal secret detection.

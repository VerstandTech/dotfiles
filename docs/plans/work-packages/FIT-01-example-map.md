# FIT-01 Example Map — fitness-gate integration and guardian status

**Package:** FIT-01
**Dependencies:** BDD-01, OBS-01, DEC-01, BUD-01, and SEC-01 are merged at base `ef28155ad9cb70f0251eddd422635852f8c07e26`.
**Personas:** [`docs/bdd/TARGET_PUBLIC.md`](../../bdd/TARGET_PUBLIC.md) — Leo (exact local authority), Maya (concise current evidence), Nikhil (fail-closed typed trust), Sofia (actionable recovery), and André (one portable canonical contract).
**Story:** As those operators and reviewers, we need one deterministic quality-gate model to compose command exits and typed trajectory, decision, budget, and security evidence, so required assurance cannot pass on missing, stale, untrusted, timed-out, prose-derived, or internally failed evidence while advisory findings remain visible.

## Observed baseline

- `QUALITY_GATE_KINDS` and `AssuranceGateResult` are the existing canonical plan/result vocabulary; FIT-01 must extend them rather than add another gate enum or FSM.
- BDD-01 already distinguishes `shell`, trusted `argv`, and trusted `internal` executors. Strict/overnight reject shell execution and handoff rejects required shell or missing executor metadata.
- `runQualityGatePlan` currently fails every internal id as unknown; there is no trajectory, decision, budget, or security adapter.
- Command success is already determined from exit status, timeout, and spawn failure. Threshold numbers are metadata and must remain command-enforced, never parsed from summaries.
- Assurance handoff checks plan/config freshness and required results, but run results have no exact aggregate fingerprint and handoff rendering shows counts rather than every canonical result.
- OBS-01 publishes typed `TrajectoryEvaluation`; DEC-01 publishes process-local typed decision handoff evidence; BUD-01 publishes typed budget results where missing limited usage is `unknown`; SEC-01 publishes typed slot states where missing scanners are `unknown` and current successful evidence is process-local.
- `bdd-mode.ts` is the only phase authority. FIT-01 may add a synchronous typed-evidence request seam and richer handoff rendering, but no timer, poller, store, watcher, or second state machine.
- The current fitness guardian asks the role to execute configured commands itself. The canonical parent run must instead remain authoritative; the guardian should read typed results and report blockers without mutation-capable tools.

## Canonical model lock

1. `QUALITY_GATE_KINDS` remains the only ordered gate-kind vocabulary and gains `trajectory`, `decision`, and `budget`; `security` remains the sole security kind with SEC-01 slots nested inside typed evidence.
2. `GateResult` is the canonical result interface. `AssuranceGateResult` remains only a compatibility alias, not a second shape.
3. Canonical statuses cover `passed`, `failed`, `unavailable`, `skipped`, `timeout`, and `stale`. Adapter-native statuses never become a competing gate status enum.
4. Every result produced by a run is bound to the exact plan and profile fingerprints and has stable executor/trust metadata plus a stable reason code.
5. `AssuranceEvidence.resultsFingerprint` is SHA-256 over the exact canonical result evidence. Handoff recomputes it and fails closed on missing, forged, or stale result evidence when FIT-01 strict completeness is requested.
6. Command gates pass only from exit zero without timeout, spawn failure, or policy rejection. Threshold prose is never inspected.
7. Known internal ids are `fit.trajectory.v1`, `fit.decision.v1`, `fit.budget.v1`, and `fit.security.v1`. Unknown and missing internal ids remain unavailable, with stable non-passing codes.
8. Pure adapters receive explicit facts. They do not read files, environment, clocks, extension globals, persistence, or dependency prose.

## Rules and examples

### Rule 1 — One canonical ordered gate model

FIT-01 extends the BDD-01 canonical types only. It does not define a parallel gate enum, result shape, or orchestration FSM.

- **R1-E1:** A configured `trajectory` executor appears in the ordered canonical plan after command/static fitness gates.
- **R1-E2:** A configured `decision` executor appears as the canonical `decision` kind, not `requirements`, `approval`, or another alias.
- **R1-E3:** A configured `budget` executor appears as the canonical `budget` kind.
- **R1-E4:** SEC-01 secret/SAST/SCA/license observations remain slots beneath canonical `security`, not four new quality kinds.
- **R1-E5:** Existing kinds retain deterministic relative order and existing plans without new executors do not gain fabricated gates.
- **R1-E6:** `AssuranceGateResult` resolves to the canonical `GateResult` compatibility shape and cannot drift independently.

### Rule 2 — Plan fingerprints include complete executor policy

The plan fingerprint covers ordered kinds, required/advisory policy, executor ids/specs, trust profile, thresholds, timeouts, and profile fingerprint.

- **R2-E1:** Identical profile and assurance inputs produce the same plan fingerprint.
- **R2-E2:** Changing `fit.trajectory.v1` to an unknown internal id changes the fingerprint.
- **R2-E3:** Changing a gate from advisory to required changes the fingerprint.
- **R2-E4:** Changing strict to overnight changes the fingerprint even when gate commands are equal.
- **R2-E5:** Changing a command threshold or timeout changes the fingerprint.
- **R2-E6:** Replacing trusted argv with shell or internal changes the fingerprint and cannot reuse old evidence.

### Rule 3 — Command gates are exit-defined and prose-opaque

Command executors use BDD-01 execution trust. Exit status and typed infrastructure flags determine the result; summaries never determine a metric.

- **R3-E1:** Trusted argv exit zero passes even when its summary contains the words “coverage 42 below 90.”
- **R3-E2:** Trusted argv non-zero fails even when its summary says “all thresholds passed.”
- **R3-E3:** Exit zero with `timedOut:true` yields canonical `timeout` and is non-passing.
- **R3-E4:** Exit zero with `spawnError:true` is non-passing and never becomes unavailable success.
- **R3-E5:** A policy-rejected command is failed with policy-rejected trust and never passes from exit zero.
- **R3-E6:** Threshold metadata is rendered as command-enforced and no parser extracts percentages, scores, counts, or natural-language claims.

### Rule 4 — Required gates fail closed and stop later execution

Every required non-pass halts later gates. No required unavailable, timeout, failure, stale result, or internal refusal can leave `run.ok:true`.

- **R4-E1:** A required command non-zero fails and all later gates are skipped.
- **R4-E2:** A required timeout blocks and all later gates are skipped.
- **R4-E3:** A required unavailable command blocks without invoking the command executor.
- **R4-E4:** Missing evidence for a required known internal gate returns `FIT01_REQUIRED_INTERNAL_GATE_MISSING` and blocks.
- **R4-E5:** A required stale internal envelope blocks and later gates are skipped.
- **R4-E6:** Forging top-level `ok:true` cannot satisfy handoff when any required canonical result is non-passing.

### Rule 5 — Advisory gates remain visible and do not halt

Advisory failures are evidence, not silent passes and not global blockers.

- **R5-E1:** Advisory command non-zero is recorded as failed and the next gate executes.
- **R5-E2:** Advisory command timeout is recorded as timeout and the next gate executes.
- **R5-E3:** Advisory internal evidence missing is recorded as unavailable and the next gate executes.
- **R5-E4:** Advisory trajectory fail is visible with its stable code while a later required unit gate can pass.
- **R5-E5:** Advisory budget unknown is visible and does not set run `ok:false` by itself.
- **R5-E6:** Guardian status distinguishes advisory findings from current required blockers without calling either “passed.”

### Rule 6 — Internal evidence is typed, explicit, and plan-current

Known internal adapters accept a discriminated V1 envelope bound to the exact current plan/profile. They do not inspect prose or discover ambient facts.

- **R6-E1:** A matching envelope declares version, adapter, observed time, plan fingerprint, and profile fingerprint.
- **R6-E2:** An envelope for another plan yields canonical stale evidence.
- **R6-E3:** An envelope for another profile yields canonical stale evidence.
- **R6-E4:** Adapter kind that does not match the configured internal id fails internally.
- **R6-E5:** Missing envelope is unavailable rather than failed success or skipped pass.
- **R6-E6:** Unknown internal id remains unavailable even if an envelope claims a known adapter and passed result.

### Rule 7 — Trajectory adapter accepts only a current typed pass

The trajectory adapter consumes `TrajectoryEvaluation`. It uses `status`, `ok`, and exact run identity; it never parses summaries or anti-pattern prose to invent a pass.

- **R7-E1:** `status:"pass"`, `ok:true`, and the expected run id produce a trusted internal pass.
- **R7-E2:** `status:"fail"` is failed even if a result summary contains “PASS.”
- **R7-E3:** `status:"invalid"` is failed and non-passing.
- **R7-E4:** `status:"unavailable"` is unavailable and non-passing.
- **R7-E5:** A mismatched run id is stale even when the evaluation otherwise passes.
- **R7-E6:** Missing status cannot be promoted from legacy `ok:true` to a required FIT-01 pass.

### Rule 8 — Decision adapter requires current human-approved evidence

The decision adapter consumes DEC-01 `DecisionHandoffResultV1`. A pass requires process-local trusted internal evidence bound to the exact current store and approval fingerprints.

- **R8-E1:** Current result, `status:"passed"`, trusted internal metadata, and equal expected store/approval fingerprints pass.
- **R8-E2:** Missing human approval fails because approval fingerprint is null/non-current.
- **R8-E3:** Expected approval fingerprint different from current store fingerprint is stale and non-passing.
- **R8-E4:** Result store fingerprint different from the explicit expected current fingerprint is stale.
- **R8-E5:** `status:"failed"` remains failed even if no reason prose is supplied.
- **R8-E6:** DEC refusal `{ok:false, code}` becomes internal failure/unavailable evidence, never a canonical pass.

### Rule 9 — Budget adapter preserves unknown and circuit breaks

The budget adapter consumes BUD-01 typed dimensions/status. It never treats `ok:true` alone as proof because BUD intentionally leaves `ok:true` for unknown-but-not-exceeded usage.

- **R9-E1:** Budget `status:"ok"` with no circuit break passes.
- **R9-E2:** Budget `status:"warn"` with no circuit break passes the gate while preserving warning evidence.
- **R9-E3:** Budget `status:"exceeded"` or `circuitBroken:true` fails.
- **R9-E4:** Budget refusal fails with a stable internal reason.
- **R9-E5:** Missing limited usage with `status:"unknown"` blocks a required strict gate.
- **R9-E6:** Missing limited usage with `status:"unknown"` blocks a required overnight gate and remains visible/advisory when configured advisory.

### Rule 10 — Security slots remain unavailable until every required slot is current and successful

The security adapter consumes SEC-01 typed slot states plus explicit candidate/inventory facts. It never installs tools or infers scanner success.

- **R10-E1:** All required slots successful, available evidence present, and exact candidate/inventory fingerprints pass.
- **R10-E2:** A missing slot is `unknown`/unavailable and cannot pass.
- **R10-E3:** Scanner `failed` or `aborted` fails the canonical security gate.
- **R10-E4:** Scanner `timeout` yields canonical timeout and blocks when required.
- **R10-E5:** `stale`/`untrusted` slot or mismatched candidate/inventory fingerprint is non-passing.
- **R10-E6:** An empty required-slot list cannot satisfy an overnight required security gate merely because SEC returns `available:true`.

### Rule 11 — Exact result fingerprints bind handoff evidence

Every run computes a deterministic SHA-256 over its canonical result array. Strict FIT-01 handoff validates the digest and each result’s plan/profile binding.

- **R11-E1:** Identical deterministic results produce the same lowercase 64-character results fingerprint.
- **R11-E2:** Changing status from passed to failed changes the results fingerprint.
- **R11-E3:** Changing executor kind, trust tier, reason code, or evidence fingerprint changes the results fingerprint.
- **R11-E4:** Missing results fingerprint is a strict handoff gap.
- **R11-E5:** Forged results fingerprint is a strict handoff gap.
- **R11-E6:** A result bound to another plan/profile is stale even when the top-level run fingerprints look current.

### Rule 12 — Handoff is complete only for current exact evidence

FIT-01 strict completeness composes existing causal red/config/green/mutation rules with exact plan/results evidence and all current required gate results.

- **R12-E1:** Missing assurance run blocks handoff.
- **R12-E2:** Plan fingerprint mismatch blocks handoff.
- **R12-E3:** Config fingerprint mismatch blocks handoff.
- **R12-E4:** Assurance completion not newer than latest green blocks handoff.
- **R12-E5:** Missing a configured required kind blocks even when other required kinds pass.
- **R12-E6:** Current plan/profile/config/results fingerprints plus all required trusted argv/internal passes satisfy the FIT-01 assurance portion only; human merge authority remains external.

### Rule 13 — Guardian status is concise, current, typed, and read-only

The guardian reads the canonical typed run and reports current blockers/advisories. It does not re-run commands, mutate files, install tools, change policy, delegate, or decide merge.

- **R13-E1:** A passing run reports plan and results fingerprints with zero required blockers.
- **R13-E2:** A required timeout reports gate id, status, and stable reason code in one concise blocker line.
- **R13-E3:** A required stale decision reports a current-evidence blocker without decision prose.
- **R13-E4:** Advisory failures appear in a separate concise findings section.
- **R13-E5:** Guardian role tools exclude write, edit, bash, delegation, and mutation-capable tools.
- **R13-E6:** Guardian text states the parent extension owns authoritative execution/handoff and humans retain merge authority.

### Rule 14 — `bdd-mode` integration is thin and synchronous

`bdd-mode` remains the only BDD phase/evidence authority. FIT-01 adds only a synchronous process-local evidence-request seam, canonical run invocation, and exact handoff rendering.

- **R14-E1:** `bdd_run_quality_gates` emits one namespaced request containing exact plan/profile fingerprints.
- **R14-E2:** Providers may synchronously return typed envelopes by configured internal id; no model boolean or tool parameter supplies trusted evidence.
- **R14-E3:** No response before execution means unavailable; the extension does not wait, poll, or start a timer.
- **R14-E4:** The authoritative run persists only canonical results, plan/profile/config/results fingerprints, and bounded summaries.
- **R14-E5:** `/bdd handoff` and `bdd_handoff` render every canonical result plus exact fingerprints.
- **R14-E6:** Integration introduces no second phase state, store, file watcher, background worker, or auto-merge path.

### Rule 15 — Trust metadata cannot be forged into required success

Required success remains limited to trusted argv or internal executors. Tier strings alone are insufficient.

- **R15-E1:** Required argv + trusted + passed can satisfy trust.
- **R15-E2:** Required internal + trusted + passed can satisfy trust.
- **R15-E3:** Required shell + trusted string is rejected at handoff by executor kind.
- **R15-E4:** Required missing executor kind + trusted string is rejected.
- **R15-E5:** Required argv + interactive-untrusted is rejected.
- **R15-E6:** Internal adapter output always stamps `executorKind:"internal"` and `trustTier:"trusted"`; source envelopes cannot override those fields.

### Rule 16 — Rollback, compatibility, and human authority remain explicit

New internal gates can be demoted through trusted configuration, but evidence is never rewritten to obtain green. Existing BDD-01 causal-red and trusted argv behavior remains intact.

- **R16-E1:** Removing an advisory internal executor removes only that advisory plan entry on the next fingerprint.
- **R16-E2:** Demoting a required internal gate to advisory changes the plan fingerprint and requires a fresh run.
- **R16-E3:** Rollback never changes unavailable/failed/stale evidence into passed evidence.
- **R16-E4:** Existing causal-red, config-fingerprint, matched-mutation, and argv no-shell-fallback tests remain green.
- **R16-E5:** No FIT-01 API can merge, push, approve a decision, increase a budget, install a scanner, or mutate a trajectory.
- **R16-E6:** Human review and merge remain required even when every canonical gate passes.

## Questions and resolutions

| ID | Question | Resolution |
|---|---|---|
| Q1 | Add a second fitness enum? | No. Extend `QUALITY_GATE_KINDS` only. |
| Q2 | Rename the existing result everywhere? | Introduce canonical `GateResult`; retain `AssuranceGateResult` as a compatibility alias. |
| Q3 | Add four security kinds? | No. Keep SEC slots under canonical `security`. |
| Q4 | Parse coverage/mutation/doctor text? | Never. Commands enforce thresholds through exit status. |
| Q5 | How do internal providers bind currentness? | Exact plan/profile fingerprints plus adapter-specific run/store/approval/candidate/inventory facts. |
| Q6 | Is `ok:true` enough for trajectory? | No; require typed `status:"pass"`, expected run id, and `ok:true`. |
| Q7 | Is `ok:true` enough for budget? | No; `unknown` remains non-passing despite BUD’s hard-exceed-free `ok:true`. |
| Q8 | Can a decision pass without approval? | No; exact current human-approved fingerprint is mandatory. |
| Q9 | Can missing security tools pass? | No; unknown/unavailable slots remain non-passing and no install is attempted. |
| Q10 | Does advisory failure set run `ok:false`? | No; it remains visible and execution continues. |
| Q11 | How are exact result bytes represented? | Deterministic canonical projection hashed to `resultsFingerprint`; no raw scanner/prose output is required. |
| Q12 | Does every legacy handoff immediately require a results digest? | FIT-01 strict integration does; low-assurance compatibility helpers remain additive until invoked with strict completeness. |
| Q13 | How does `bdd-mode` receive process-local evidence? | One synchronous namespaced event request with a callback; absent responders fail closed. |
| Q14 | Can event collection wait for async providers? | No in V1; providers must have current typed evidence ready synchronously. No timers. |
| Q15 | Can the model submit an internal pass as a tool argument? | No. There is no trusted model-supplied evidence parameter. |
| Q16 | Does FIT-01 persist dependency results? | Only canonical bounded gate evidence in existing BDD session state; OBS owns trajectory persistence. |
| Q17 | Does the guardian execute commands? | No. The parent canonical runner executes; the guardian reads and reports. |
| Q18 | Is a full pass merge permission? | Never. Human authority is invariant. |
| Q19 | What is the primary causal red? | A required known internal gate receives no typed envelope and fails at `FIT01_REQUIRED_INTERNAL_GATE_MISSING` rather than passing/being silently skipped. |
| Q20 | What mutation proves fail-closed behavior? | Temporarily promote required unavailable/internal failure to pass; the named FIT-01 oracle must fail, then restoration must pass. |

## ValidationContractV1

- **Focused command:** `cd agents-shared/.agents/adapters/pi/personal && bun test lib/bdd/quality-gates.test.ts lib/bdd/assurance-handoff.test.ts lib/bdd/bdd-mode-contract.test.ts`
- **Causal red test id:** `FIT01_REQUIRED_INTERNAL_GATE_MISSING blocks a required known internal gate without typed evidence`
- **Expected failure signature:** current BDD-01 runner returns the unknown-internal unavailable path and cannot consume a current typed FIT-01 envelope/result.
- **Forbidden production before red proof:** `lib/bdd/types.ts`, `lib/bdd/quality-gates.ts`, `lib/bdd/assurance-handoff.ts`, `extensions/bdd-mode.ts`, and `agents/bdd-fitness-guardian.md`.
- **Green coverage:** the exact focused command passes, followed by full `bun test`.
- **Mutation:** temporarily make required unavailable or typed internal failure return canonical `passed`; the named oracle must fail; restore and rerun green.
- **No acceptance runtime harness:** `FIT-01.feature` is the executable specification artifact; unit/contract tests are the deterministic runner because this package has no Gherkin compiler.

## Coverage summary

- **Rules:** 16
- **Examples:** 96
- **Resolved questions:** 20
- **Primary personas:** Leo and Maya
- **Adversarial persona:** Nikhil
- **Recovery persona:** Sofia
- **Compatibility persona:** André

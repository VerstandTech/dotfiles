# ORC-01 Example Map — Thin assurance orchestrator façade

## Story and approved personas

**As Leo (A), Maya (B), Nikhil (C), Sofia (D), and André (E) from `docs/bdd/TARGET_PUBLIC.md`,**
**we need one small deterministic façade that composes the existing BDD, Herdr, CAID/worktree, fleet, trajectory, budget, security, and future approval authorities,**
**so an operator or model can plan, launch, observe, and record one bounded role without gaining a second FSM, a second writer authority, or delivery authority.**

| Persona | ORC-01 need |
|---|---|
| **Leo (A)** | One inspectable six-primitive flow with exact ordering, stable identities, rollback evidence, and no hidden autonomy. |
| **Maya (B)** | Concise current status and handoff evidence that names the authority responsible for every decision. |
| **Nikhil (C)** | Closed hostile-input boundaries, fail-closed partial failures, RED-01-safe persistence, and non-echoing errors. |
| **Sofia (D)** | Stable reason codes that distinguish missing facts, blocked work, timeout uncertainty, and operator cleanup. |
| **André (E)** | Pure portable contracts behind a thin Pi adapter, additive compatibility, deterministic disposal, and no provider leakage. |

## V1 vocabulary locked by discovery

- **Primitive:** exactly one of `assurance_status`, `assurance_plan_role`, `assurance_spawn_role`, `assurance_wait_role`, `assurance_record_handoff`, or `assurance_request_approval`.
- **Authority fact:** a closed, explicit, current observation from the named owner; ORC-01 never infers the fact from prose, environment variables, project files, or another mirror.
- **Plan:** a deterministic, non-authoritative `RoleRequestV1` validation plus ISO-01 CAID lifecycle plan. Planning cannot create/open a worktree, start a role, register an assignment, acquire a lease, append state, or request approval.
- **Writer fact:** a current `.pi/worktree-board.json` authority observation for the exact planned path, including path writer count and global cap facts. CAID and Herdr identities are mirrors, not writer grants.
- **Spawn transaction:** validate all facts, open/create the planned worktree, register the role, acquire the matching writer/read-only lease, then start exactly one role. No retry occurs inside V1.
- **Compensation:** release an acquired lease and unregister an ORC-owned registration through injected rollback seams. ORC-01 never removes a worktree, closes a pane, deletes files, merges, pushes, or opens a PR.
- **Unknown:** a first-class non-success result. Timeout, malformed provider reports, stale facts, missing usage, and conflicting observations are never upgraded to success.
- **Important session state:** bounded mirrors persisted only through injected `appendEntry`; authoritative phase, writer, runtime, approval, and budget state remains with its existing owner.
- **Error code:** an ORC-01-owned stable code that contains no arbitrary input, provider error, terminal output, path body, prompt, model response, or secret.

## Rules and examples

### R1 — ORC-01 composes authorities and owns no second FSM

`bdd-mode` remains the only BDD phase/evidence authority; the worktree board remains writer authority; Herdr remains runtime authority; fleet, trajectory, budget, security, and APR retain their own state.

- **R1-E1 (Leo):** status consumes an explicit `bdd-mode` phase fact but never calls a transition helper.
- **R1-E2 (Maya):** a passing trajectory fact cannot turn `spawnPermitted: false` into true.
- **R1-E3 (Nikhil):** a Herdr `done` mirror cannot grant a writer lease.
- **R1-E4 (Sofia):** a CAID assignment without a current worktree-board fact blocks rather than becoming authority.
- **R1-E5 (André):** the library defines no discovery→verify phase transition table or persisted orchestrator phase.
- **R1-E6 (Leo):** no primitive opens a PR, pushes, merges, deploys, or changes protected branches.
- **R1-E7 (Maya):** no primitive performs destructive cleanup or transfers human merge authority.

### R2 — Every pure boundary is closed, bounded, detached, and deeply frozen

Pure functions accept only explicit values and injected callbacks; no pure module reads files, environment variables, network, clocks, timers, processes, or hidden extension state.

- **R2-E1 (Nikhil):** an unknown top-level field returns a stable invalid-input code without invoking an adapter.
- **R2-E2 (Nikhil):** accessors, symbols, cycles, hostile prototypes, and sparse arrays fail before side effects.
- **R2-E3 (André):** oversized strings, arrays, object-key counts, or serialized bytes return a bound code.
- **R2-E4 (Leo):** mutating the caller's request after success does not change the returned plan.
- **R2-E5 (Maya):** nested arrays and objects in every success/refusal result are frozen.
- **R2-E6 (Sofia):** unsupported `schemaVersion` returns one stable version code, not validator prose.
- **R2-E7 (André):** identical explicit inputs and adapter outcomes produce equivalent bounded results.

### R3 — `assurance_status` reconciles facts without mutation

Status receives explicit BDD, Herdr, worktree, fleet, trajectory, and budget facts and returns only a typed bounded read model.

- **R3-E1 (Maya):** current non-blocking facts return `ready` with six component summaries.
- **R3-E2 (Sofia):** missing or unknown BDD phase returns `unknown`, never ready.
- **R3-E3 (Leo):** worktree writer conflict returns `blocked` even when every other component passes.
- **R3-E4 (Nikhil):** budget `exceeded` or trajectory `fail` returns `blocked` without calling any mutation seam.
- **R3-E5 (André):** Herdr/fleet `working` remains an observable active state and does not invent completion.
- **R3-E6 (Maya):** any required `unavailable` component produces `unknown` with stable ordered component codes.
- **R3-E7 (Nikhil):** arbitrary source error text is absent from status output.

### R4 — `assurance_plan_role` validates one `RoleRequestV1` and remains side-effect free

Planning composes CON-01 validation and ISO-01 CAID planning for exactly one role.

- **R4-E1 (Leo):** a valid Implementer request returns one stable plan id, role assignment, and CAID plan.
- **R4-E2 (André):** missing, legacy, wrong-version, wrong-phase, wrong-tool, or wrong-write-scope requests block.
- **R4-E3 (Nikhil):** unsafe owned/forbidden/artifact paths block through CON-01 before planning.
- **R4-E4 (Maya):** the returned role, task, phase, branch, path, and card id are deterministic.
- **R4-E5 (Sofia):** no request field is guessed from chat or extension lifecycle state.
- **R4-E6 (Leo):** injected create/start/register/acquire callbacks supplied as traps are never called by plan.
- **R4-E7 (André):** planning neither appends a session entry nor emits an authoritative state change.

### R5 — Spawn requires current BDD and workspace facts before the first side effect

`assurance_spawn_role` reconstructs and validates the plan, then checks exact current BDD/workspace references.

- **R5-E1 (Leo):** `bdd-mode` authority, exact planned phase, current evidence fingerprint, and `spawnPermitted: true` allow preflight to continue.
- **R5-E2 (Sofia):** missing phase authority blocks before worktree open.
- **R5-E3 (Nikhil):** `spawnPermitted: false` blocks even when a model says the phase should advance.
- **R5-E4 (André):** phase mismatch between request and current BDD fact blocks without a second phase interpretation.
- **R5-E5 (Maya):** unconfirmed workspace blocks before any adapter callback.
- **R5-E6 (Leo):** repo root or planned path mismatch blocks as stale workspace evidence.
- **R5-E7 (Nikhil):** stale/empty BDD or board fingerprints block without echoing their values.

### R6 — Security, budget, and approval facts fail closed

Spawn requires explicit current facts from the named seams; strict and overnight never degrade to interactive behavior.

- **R6-E1 (Nikhil):** security status other than `passed` blocks before open.
- **R6-E2 (Maya):** budget `unknown`, `unavailable`, or `exceeded` blocks new spawn.
- **R6-E3 (Leo):** budget `ok` or bounded `warn` may continue only when the fact is current for the exact plan.
- **R6-E4 (Sofia):** strict profile with missing, stale, denied, or `not-required` approval blocks.
- **R6-E5 (Nikhil):** overnight profile requires a current APR-01 approval for exact plan id and candidate SHA.
- **R6-E6 (André):** security, budget, and approval profile disagreement blocks rather than selecting a profile.
- **R6-E7 (Maya):** interactive `not-required` remains an explicit current policy fact, never an omitted approval.

### R7 — Worktree board facts prevent a second writer

A current board observation for the exact planned path is mandatory for every spawn; writer roles require zero writers on that path and available global capacity.

- **R7-E1 (Leo):** writer count zero with busy count below cap allows the transaction to reach open.
- **R7-E2 (Nikhil):** writer count one on the planned path blocks even if it is labeled as the same role.
- **R7-E3 (Maya):** board state `conflict`, `held`, or `unknown` blocks a new spawn.
- **R7-E4 (André):** missing/invalid cap facts block rather than defaulting to a package constant.
- **R7-E5 (Sofia):** busy count equal to max returns a stable capacity code.
- **R7-E6 (Leo):** read-only roles still require current writer facts but acquire only a read-only lease mode.
- **R7-E7 (Nikhil):** adapter lease mode inconsistent with `RoleRequestV1.writeScope` is a partial failure, never success.

### R8 — Spawn follows one strict, observable order and starts exactly one role

After preflight, the order is open/create → register → acquire matching lease → start. The start callback is invoked at most once.

- **R8-E1 (Leo):** successful writer spawn records calls exactly `open, register, acquire, start`.
- **R8-E2 (André):** registration receives the deterministic plan/card/worktree references returned by open.
- **R8-E3 (Nikhil):** lease acquisition precedes start so a second writer cannot begin before ownership.
- **R8-E4 (Maya):** start receives one validated role request and exact pane/worktree/lease ids.
- **R8-E5 (Sofia):** successful output contains stable plan, worktree, registration, lease, agent, pane, and session ids.
- **R8-E6 (Leo):** no internal retry calls start a second time after timeout, throw, malformed output, or refusal.
- **R8-E7 (André):** arbitrary provider fields are discarded by closed adapter-result validation.

### R9 — Partial spawn failures compensate owned state and require operator recovery

Once worktree open succeeds, any later failure is `partial-failure`/`cleanup-required`; ORC rolls back only the lease/registration it owns and never destroys resources.

- **R9-E1 (Sofia):** explicit open refusal before mutation returns blocked/unavailable with zero later calls.
- **R9-E2 (Leo):** register failure after open returns cleanup-required and does not call acquire or start.
- **R9-E3 (Nikhil):** acquire failure invokes unregister once, never start, and remains cleanup-required.
- **R9-E4 (Leo):** start failure invokes release then unregister in reverse order and remains cleanup-required.
- **R9-E5 (Maya):** successful compensation is reported as compensated but never changes partial failure to success.
- **R9-E6 (Nikhil):** failed/malformed compensation reports recovery-required without provider error text.
- **R9-E7 (André):** ORC has no callback for worktree removal, pane close, file deletion, PR, merge, or force action.

### R10 — `assurance_wait_role` is explicitly bounded and timeout remains unknown

Wait receives stable current role refs and injected wait/get/read callbacks. Bounds are facts; pure code has no sleep, timer, polling process, or ambient clock.

- **R10-E1 (Leo):** max attempts and max duration are validated before the wait callback.
- **R10-E2 (André):** the wait callback receives the exact bounds and may not report usage above either bound.
- **R10-E3 (Sofia):** timeout returns `unknown` and never calls read to manufacture completion.
- **R10-E4 (Nikhil):** a timeout cannot become success even if a contradictory provider payload claims done.
- **R10-E5 (Maya):** blocked remains blocked; working or unknown at the bound remains unknown.
- **R10-E6 (Leo):** terminal wait proceeds to get, then read, exactly once and in that order.
- **R10-E7 (André):** thrown/malformed wait/get/read errors map to stable unavailable/unknown codes only.

### R11 — Wait validates the returned role result and current identity

Only a closed CON-01 `RoleResultV1` for the exact task/role can be returned as structured completion evidence.

- **R11-E1 (Maya):** completed result with matching task/role is returned as completed evidence.
- **R11-E2 (Nikhil):** wrong schema version, unknown status, hostile path, or unknown field blocks result acceptance.
- **R11-E3 (Leo):** result task mismatch blocks even if the Herdr agent is done.
- **R11-E4 (André):** result role mismatch blocks without coercing a role alias.
- **R11-E5 (Sofia):** valid `blocked`, `failed`, and `unknown` statuses remain blocked/unknown rather than completed.
- **R11-E6 (Nikhil):** read adapter returns structured result plus safe artifact ref, never raw terminal scrollback as authority.
- **R11-E7 (Maya):** missing usage remains `unknown` according to CON-01 and does not become zero.

### R12 — `assurance_record_handoff` requires exact current refs and RED-01-safe evidence

Handoff validates the plan/result and current role, task, path, head, fingerprint, and evidence refs before persistence.

- **R12-E1 (Leo):** exact plan/task/role/path/head/fingerprint/evidence refs permit RED-01 projection.
- **R12-E2 (Maya):** stale head or fingerprint blocks before append.
- **R12-E3 (Nikhil):** missing or differing evidence refs block; empty evidence cannot claim completion.
- **R12-E4 (André):** changed paths outside the request's owned paths block a completed writer handoff.
- **R12-E5 (Sofia):** dirty completed result is recordable only as blocked evidence, never successful handoff.
- **R12-E6 (Nikhil):** RED-01 refusal blocks append and no alternate raw persistence path is tried.
- **R12-E7 (Maya):** non-completed valid role statuses may be durably recorded but preserve their blocked/unknown meaning.

### R13 — Handoff persists only through one injected append callback

ORC-01 owns no file writer. The append callback receives a bounded namespaced entry whose data passed RED-01.

- **R13-E1 (André):** valid handoff calls append exactly once with `assurance:handoff:v1`.
- **R13-E2 (Nikhil):** callback data contains the RED-01-safe projection, never the raw untrusted result object.
- **R13-E3 (Maya):** append success returns a stable entry id and recorded status.
- **R13-E4 (Sofia):** explicit append refusal blocks handoff success.
- **R13-E5 (Nikhil):** thrown or malformed append result becomes unknown persistence, never a silent pass.
- **R13-E6 (Leo):** ORC does not write `.pi/handoffs`, trajectory files, board files, or decision files directly.
- **R13-E7 (André):** important session mirrors use injected `appendEntry`; event-bus notifications remain non-authoritative.

### R14 — `assurance_request_approval` is only an APR gateway façade

Approval validates `ApprovalRequestV1`, invokes one injected human/UI gateway, validates/binds the returned decision, and never invents authority.

- **R14-E1 (Sofia):** absent gateway returns `unavailable` until APR-01 lands.
- **R14-E2 (Nikhil):** model boolean, proposed decision field, or project approval file is rejected by the closed input.
- **R14-E3 (Maya):** gateway approval must be APR-01-authoritative, durable, human-provenanced, current, and structurally bound.
- **R14-E4 (Leo):** changed request id, action, risk, paths, candidate SHA, fingerprint, or expiry blocks the decision.
- **R14-E5 (Sofia):** gateway rejection remains rejected; ORC neither retries nor converts it to approval.
- **R14-E6 (Nikhil):** denial durability exists only in the gateway; ORC does not manufacture a local denial record.
- **R14-E7 (André):** gateway throw/malformed result maps to one stable unavailable code without arbitrary body text.

### R15 — The extension registers only the six V1 tools with stable output

`extensions/assurance-orchestrator/index.ts` is a thin composition adapter and introduces no recipe, convenience command, shortcut, flag, renderer, or seventh tool.

- **R15-E1 (André):** exactly six registered tool names equal the locked primitive list.
- **R15-E2 (Leo):** no `registerCommand`, `registerShortcut`, dynamic tool loading, or built-in tool override occurs.
- **R15-E3 (Nikhil):** tool parameters are closed at the wrapper and revalidated by pure functions.
- **R15-E4 (Sofia):** every semantic refusal exposes only a stable ORC-01 code and bounded typed details.
- **R15-E5 (Nikhil):** arbitrary input/error/provider/terminal text never appears in extension error content.
- **R15-E6 (Maya):** successful mutation mirrors are appended only through injected `appendEntry` and explicitly marked non-authoritative.
- **R15-E7 (André):** importing the extension with Bun performs no environment, filesystem, process, network, or background-resource access.

### R16 — Session resources and subscriptions have deterministic lifecycle

Tool definitions may register at load, but subscriptions/resources begin only after `session_start`; shutdown/reload closes them idempotently.

- **R16-E1 (Leo):** factory construction opens no resource and subscribes to no inter-extension bus channel.
- **R16-E2 (André):** session start creates one generation and one namespaced lifecycle subscription.
- **R16-E3 (Nikhil):** every event contract begins with `assurance:` and carries a bounded closed summary.
- **R16-E4 (Maya):** repeated `session_start` disposes the prior generation before replacement.
- **R16-E5 (Sofia):** repeated `session_shutdown` closes/unsubscribes each generation at most once.
- **R16-E6 (Leo):** `session_shutdown` reason `reload` disposes before the replacement `session_start`.
- **R16-E7 (André):** stale generation callbacks cannot mutate or persist state after disposal.

### R17 — Disabling ORC-01 is additive and leaves existing commands functional

The façade owns only new files and has no required hooks into BDD, fleet, herd, worktree-board, role prompts, approvals, budgets, trajectory, decisions, or security production.

- **R17-E1 (Leo):** removing/disabling the extension leaves `/bdd` and all `bdd_*` tools registered by their owner.
- **R17-E2 (André):** fleet planning/dispatch/collection remain registered by `agentic-fleet`.
- **R17-E3 (Sofia):** `/herd-task` and herd status remain functional.
- **R17-E4 (Maya):** `/wt` and the worktree board remain writer authority.
- **R17-E5 (Nikhil):** ORC-01 imports existing pure dependencies but edits none of their production files.
- **R17-E6 (Leo):** default unavailable spawn/approval adapters fail closed rather than shelling to Herdr or reading project state.
- **R17-E7 (André):** rollback is deletion of the new façade paths only; no migration of existing state is needed.

### R18 — Verification kills authority, timeout, and second-writer mutants

Focused and full tests preserve the exact six-primitives contract and prove the critical fail-closed branches causally.

- **R18-E1 (Leo):** before production exists, the focused test fails with `ORC01_ORCHESTRATOR_MISSING`.
- **R18-E2 (Maya):** the red is a missing orchestrator module/API assertion, not timeout, setup, import dependency, or unrelated baseline failure.
- **R18-E3 (Nikhil):** mutating BDD preflight to permit `spawnPermitted: false` makes the named authority test fail.
- **R18-E4 (Sofia):** mutating timeout handling to return success makes the named timeout test fail.
- **R18-E5 (Leo):** mutating path writer count enforcement to allow one existing writer makes the named second-writer test fail.
- **R18-E6 (André):** focused `bun test lib/orchestrator extensions/assurance-orchestrator` and full `bun test` pass after restore.
- **R18-E7 (Maya):** final import smoke is local evidence only; no push, PR, merge, or autonomous cleanup occurs.

## Resolved questions

| ID | Question | Resolution |
|---|---|---|
| Q1 | Does ORC-01 own a phase machine? | **No.** It consumes `bdd-mode` facts and never computes/transitions BDD phase. |
| Q2 | Does ORC-01 own writer state? | **No.** `.pi/worktree-board.json` remains authority; CAID/Herdr are mirrors. |
| Q3 | What is the complete V1 surface? | Exactly the six named primitives; no recipes or convenience aliases. |
| Q4 | Are tools and commands both registered? | **No.** V1 registers exactly six tools and zero commands to avoid duplicate primitives. |
| Q5 | Does status read ambient state? | **No.** All six component facts are explicit input. |
| Q6 | Can planning call adapters? | **No.** It validates CON-01 and composes ISO-01 pure planning only. |
| Q7 | What is spawn order? | Validate all facts → open/create → register → acquire matching lease → start once. |
| Q8 | Why acquire before start? | A writer must not begin before the board authority grants the exact-path lease. |
| Q9 | Can spawn retry? | **No.** V1 calls each forward adapter at most once. |
| Q10 | What compensation is allowed? | Reverse lease release and registration removal only; no worktree/pane/file cleanup. |
| Q11 | What follows a post-open failure? | `partial-failure` with cleanup/operator recovery required, even if compensation succeeds. |
| Q12 | Do read-only roles need current writer facts? | **Yes.** They acquire a read-only lease mode and never a writer grant. |
| Q13 | What makes timeout successful? | Nothing. Timeout remains `unknown`. |
| Q14 | Where are wait attempts implemented? | The injected bounded wait adapter receives explicit max-attempt and duration facts; pure ORC uses no timer. |
| Q15 | Is raw terminal output accepted? | **No.** Read adapters return structured unknown plus a safe artifact ref; ORC validates `RoleResultV1`. |
| Q16 | Can failed/blocked role results be recorded? | Yes as durable evidence, while their status remains blocked/failed/unknown and cannot claim handoff success. |
| Q17 | How is handoff persistence protected? | Exact current refs + RED-01 projection + one injected append callback success. |
| Q18 | Is a project file or model boolean approval? | **No.** Only the injected APR gateway can return durable authority. |
| Q19 | What happens before APR-01 exists? | `assurance_request_approval` returns unavailable when no gateway is injected. |
| Q20 | Can ORC emit events? | Yes, only bounded namespaced non-authoritative summaries; important state uses `appendEntry`. |
| Q21 | When do subscriptions/resources start? | After `session_start`; shutdown/reload disposal is idempotent. |
| Q22 | Does extension disable break current commands? | **No.** ORC owns no edits or registrations in existing extensions. |
| Q23 | Can pure modules import `node:fs`, process, env, fetch, timers, or child process? | **No.** Pure orchestration receives all effects through callbacks/facts. |
| Q24 | Does ORC create PRs, merge, push, deploy, or clean up? | **No.** Human and later owning packages retain those authorities. |

## Out of scope

- A second BDD phase/evidence FSM or duplicate gate enum.
- Direct worktree-board, CAID history, trajectory file, budget, decision, security, or approval store writes.
- Dependency installation, package/version selection, network calls, shell execution, provider-specific control flow, timers, polling loops, or autonomous retries.
- Fleet fan-out, nested delegation, multi-role spawn, adversarial-pair recipes, overnight queue running, PR creation, push, merge, deploy, release, or destructive cleanup.
- APR-01 implementation, denial storage, cryptographic identity, universal sandboxing, or organization approval policy.

## Counts

- **Rules:** 18
- **Examples:** 126 (`R1-E1` through `R18-E7`)
- **Questions resolved:** 24
- **Open questions:** 0 for ORC-01 V1

## Traceability

- **Package:** ORC-01
- **Dependencies:** CMP-02, CON-01, HDR-01, ISO-01, ROLE-01 (merged)
- **Primary acceptance:** `docs/plans/work-packages/ORC-01.feature`
- **Focused command:** `cd agents-shared/.agents/adapters/pi/personal && bun test lib/orchestrator extensions/assurance-orchestrator`
- **Mutation targets:** BDD authority bypass, timeout-to-success, second writer
- **Human authority:** no push/PR/merge; final merge remains human-only

# CMP-02 Example Map — `fleet_dispatch` WorkflowScript Compatibility

## Observed contract lock

- pi-subagents package: `0.45.2`
- RPC protocol: `subagents:rpc:v1`, spawn is async-only
- Public execution cutover: top-level `tasks`, `chain`, `parallel`, `concurrency`, direct `agent/task`, and execution `action` are rejected
- Required execution shape: non-empty `workflowScript`, no action, outer `async: true`
- Current defect: `buildFleetPlan()` emits `subagentParams.tasks` + top-level `concurrency`, reproducing `Legacy top-level chain and parallel inputs were removed; use workflowScript.`
- Live fleet dispatch remains disabled until SEC-00; CMP-02 validation is mocked/contract-only

## Rules

### R1 — Public spawn uses WorkflowScript only

Every fleet RPC spawn payload has a non-empty `workflowScript`, omits `action`, and contains none of the removed orchestration or direct-execution fields.

### R2 — Child identity is stable and valid

Every `runs.all` child has a deterministic unique key matching pi-subagents’ `[A-Za-z0-9][A-Za-z0-9._-]{0,127}` contract. Agent, task, model, and output values remain attached to the same persona.

### R3 — Serialization cannot inject JavaScript

Task text, scope, labels, paths, model ids, quotes, backticks, `${...}`, Unicode, and newlines are serialized as JSON data. They cannot escape into executable WorkflowScript syntax.

### R4 — Requested concurrency is enforced without removed fields

The generated script partitions children into sequential batches of at most the resolved concurrency and calls `runs.all` once per batch. It never emits a forbidden top-level or child `concurrency` field.

### R5 — Context and async policy stay explicit

The RPC payload preserves `context: fresh|fork`, forces `async: true`, and warns when the caller requested unsupported `async:false`.

### R6 — Results remain useful to the parent

The script returns all child results in persona order. A child failure remains represented in the result; it is not dropped or converted into a false dispatch success.

### R7 — RPC failure is deterministic and honest

Removed-payload, timeout, malformed reply, or execution errors produce a typed failed result and a copyable current WorkflowScript payload. They never claim a run id or successful dispatch.

### R8 — Successful identity remains ledger-bound

A mocked successful spawn response with `runId`/`asyncDir` continues through existing run-identity extraction and ledger behavior without coupling the transport builder to session persistence.

### R9 — Containment precedes dogfood

CMP-02 does not use a live research/review fleet. The first real Grok smoke is advisory G2-D and requires SEC-00 containment to be green.

## Examples

| ID | Given | When | Then |
|---|---|---|---|
| E1 | current fleet plan | public spawn normalization is applied | old top-level `tasks`/`concurrency` is rejected with the exact cutover message |
| E2 | five research personas | new plan is built | payload has WorkflowScript only and five stable-key children |
| E3 | concurrency 2 with five personas | mock script executes | `runs.all` receives batches 2, 2, 1 sequentially |
| E4 | models rotate Grok A/B | script is inspected/executed | each child retains the selected model |
| E5 | task contains backticks, `${process.exit()}`, quotes, and newlines | script is compiled | it remains inert task data and script parses |
| E6 | duplicate/custom persona ids | keys/outputs are built | keys remain unique; output paths remain unique by index |
| E7 | caller requests `async:false` | plan is built | outer async is true and warning is present |
| E8 | context is `fork` | payload is built | outer context remains fork |
| E9 | mocked RPC reply succeeds | call completes | request envelope is v1/spawn/current payload and reply data is returned |
| E10 | mocked RPC times out or rejects | call completes | typed failure is returned and listener/timer are cleaned up |
| E11 | current run identity appears in successful data | existing extractor runs | runId/asyncDir remain available for ledger binding |
| E12 | SEC-00 is not green | operator requests live smoke | no live fleet is launched; only fixture validation runs |

## Questions and disposition

1. **Can `runs.all` take concurrency?** No. Child params reject orchestration fields. Use deterministic script batches.
2. **Should batch execution stop after one child failure?** `runs.all` collects child failures; preserve all results and continue later batches so the parent receives the whole bounded panel.
3. **Should WorkflowScript be a template literal?** No. Build the script from JSON-serialized data to prevent code injection.
4. **Should `tasks` remain on the domain plan?** Yes, as an internal display/persona model. Only public `subagentParams` must switch to WorkflowScript.
5. **Should CMP-02 launch a real five-person fleet?** No. SEC-00 must land first; mocked execution is the required deterministic gate.
6. **Where is requested concurrency represented?** In script batch boundaries and the human plan summary, never in public RPC params.

## ValidationContractV1

- **Focused red/green command:** `cd /Users/leonardoribeiro/worktrees/dotfiles-pi-herdr-high-assurance/agents-shared/.agents/adapters/pi/personal && bun test lib/fleet/plan.test.ts lib/fleet/rpc.test.ts`
- **Expected red test id:** `buildFleetPlan current RPC payload > emits WorkflowScript-only public spawn params`
- **Expected red signature:** `legacy top-level tasks payload is still emitted`
- **Forbidden production paths before red SHA:** `lib/fleet/plan.ts`, `lib/fleet/rpc.ts`, `extensions/agentic-fleet.ts`
- **Covering green:** exact command passes; broader fleet/run-ledger tests pass
- **Sensitivity:** replace the generated payload with legacy `tasks`/`concurrency`; current-schema validator must reject it, then restored WorkflowScript payload passes

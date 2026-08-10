# High-Assurance Multi-Agent Workflow Implementation Plan

**Stack:** WezTerm → Herdr → Pi  
**Repository:** `~/dotfiles`  
**Plan status:** implementation-ready after the human decisions at the end of this document  
**Acceptance:** `docs/plans/pi-herdr-wezterm-high-assurance-plan.feature`  
**Example Map:** `docs/plans/pi-herdr-wezterm-high-assurance-example-map.md`

## Executive decision

Build this as an **incremental composition of the controls already present**, not as a new monolithic agent framework.

1. **WezTerm remains host chrome.** It launches or attaches Herdr, supplies readable fonts/colors/keybindings, and may show coarse runtime health. It does not own agent workspaces or lifecycle state.
2. **Herdr remains the durable execution runtime.** It owns real PTYs, persistent sessions, workspaces/tabs/panes, worktrees, agent state, waits, and notifications.
3. **Pi remains the policy and coding layer.** Its existing `bdd-mode`, `agentic-fleet`, `worktree-board`, `herd`, role agents, CAID, trajectory, decisions, and cost-budget modules remain the foundation.
4. **Use two delegation paths:**
   - Pi fleet/pi-subagents for read-only research, code review, and UX perspective fan-out.
   - Herdr + CAID worktrees + fresh Pi processes for writers and strongly isolated roles.
5. **Do not merge BDD and fleet into a mega-extension.** A later `assurance-orchestrator` is a thin façade over deterministic libraries and existing tools; `bdd-mode` remains the phase authority.
6. **Repair the base before adding autonomy.** Current discovery found a broken `fleet_dispatch` compatibility path and a missing Herdr Pi lifecycle integration. Those are P0.
7. **Promote scaffolding in stages:** observable → advisory → required. CAID, trajectory, decision-store, and cost helpers already exist, but must not be described as universal hard gates until wired and tested.
8. **Human authority is invariant.** No automatic merge, deployment, protected-branch mutation, approval simulation, or autonomous budget increase.

### Recommended first releasable slice

The minimum valuable release is:

- canonical Rulesync rule source plus a root BDD/test contract;
- repaired fleet dispatch with Grok 4.5;
- reproducible Herdr install/config plus `herdr integration install pi`;
- Herdr 0.8 contract rebaseline;
- versioned handoff schemas;
- one command path for CAID plan → worktree → Herdr Pi spawn → bounded wait/read;
- redacted trajectory capture and advisory evaluation;
- a strict but opt-in security profile;
- a local golden workflow proving discovery → formulation → red → green → verify.

Everything else can follow without blocking that slice.

## Current-state baseline

### Verified runtime facts

| Item | Current evidence | Classification | Consequence |
|---|---|---|---|
| Pi | `0.84.1` in tracked settings/runtime | present | Use current ExtensionAPI and `session_shutdown`; do not depend on older lifecycle behavior. |
| Herdr | `0.8.0`, protocol `19`, client/server compatible | present | Rebaseline 0.7.5 docs and fixtures before adding client code. |
| Herdr environment | `HERDR_ENV=1` in this session | present | Live Herdr smoke tests are possible after implementation. |
| Herdr Pi integration | `herdr integration status` reports **not installed** | missing/P0 | Native lifecycle state cannot be assumed until bootstrap installs and verifies it. |
| Herdr config | `~/.config/herdr/config.toml` contains only `onboarding = false` | machine-local/minimal | Add a tracked stow package with safe cross-platform defaults. |
| WezTerm | charcoal theme, 20k scrollback, `CTRL+SPACE` host leader, GPU rendering | present | Preserve visual system; add attach ergonomics without dual-mux behavior. |
| Rulesync | no `rulesync.jsonc` or `.rulesync/**` in this checkout | missing/P0 governance | Establish canonical rule source before changing generated rules. |
| Root BDD config | no root `.pi/bdd.json`; inference finds no unit command | missing/P0 | Add a root adapter that invokes existing package tests and resource validation. |
| Fleet config | default Grok 4.5, concurrency 8, caps 48/16/48 | present | Keep read-only fan-out; hard-budget writer concurrency remains 1. |
| Fleet dispatch | `fleet_dispatch` failed with legacy top-level chain/parallel RPC error; workflowScript fallback worked | broken/P0 | Repair transport/payload compatibility before relying on fleet automation. |
| Working tree | pre-existing edits in `codex/.codex/config.toml`, `pi/.pi/agent/settings.json`, `zsh/.zshrc`, plus unrelated untracked skills | user-owned dirty state | Implementation must start in a human-approved clean branch/worktree and preserve these changes. |

### Existing Pi controls to retain

| Capability | Primary paths | Actual status |
|---|---|---|
| BDD phase FSM, path/bash/fleet gates, red/green evidence, handoff | `agents-shared/.agents/adapters/pi/personal/extensions/bdd-mode.ts`, `lib/bdd/**` | enforced now |
| Deterministic stack profile and quality-gate plan | `lib/bdd/project-profile.ts`, `lib/bdd/quality-gates.ts` | enforced when invoked/configured |
| Role contracts and bounded single-role delegation | `lib/bdd/assurance-cycle.ts`, `agents/bdd-*.md` | enforced policy plus fresh subagent context; not OS isolation |
| Fleet persona planning, native-model resolution, run ledger | `extensions/agentic-fleet.ts`, `lib/fleet/**` | present; dispatch compatibility currently broken |
| Worktree board and cooperative writer cap | `extensions/worktree-board.ts`, `lib/worktree/**` | enforced only for participants using the board |
| Herdr sibling widget and `/herd-task` | `extensions/herd/**`, `pi/tests/herd-*.test.ts` | present; docs/fixtures partly pinned to Herdr 0.7.5 |
| CAID planning, handoff, collision detection | `lib/worktree/caid.ts`, `skills/caid/SKILL.md` | tested scaffold; not auto-wired |
| Trajectory evaluation and anti-patterns | `lib/trajectory/**`, `skills/trajectory/SKILL.md` | tested scaffold; no default recorder/handoff gate |
| Requirements-as-Code decision store | `lib/decisions/**` | tested scaffold; not a universal pre-action gate |
| Cost budgets | `lib/bdd/cost-budget.ts` | tested scaffold; not a spawn circuit breaker |
| High-assurance playbook and overnight runbook | `docs/high-assurance-*.md`, `docs/overnight-rhythm.md` | normative documentation |
| Anti-hang controls | `extensions/anti-hang.ts`, `lib/anti-hang/**` | enforced for covered tools |

### Mapping from the proposed system to this repository

| Proposed capability | Implementation decision |
|---|---|
| High-assurance/FSM orchestrator | Add only a thin `assurance-orchestrator` façade after contracts, Herdr client, and CAID lifecycle are stable. Keep `bdd-mode` as phase authority. |
| Fitness guardian | Extend existing quality-gate libraries and the `bdd-fitness-guardian` role. Add a separate UI/tool façade only if needed; do not duplicate gate execution. |
| Schema/constrained handoffs | Add `lib/contracts/**` with TypeBox schemas and pure validators; enforce at every spawn, handoff, approval, and result boundary. Provider grammar/seed control remains roadmap where unsupported. |
| Trajectory logger | Add a redacting, append-only recorder and wire it to Pi/Herdr events; evaluate advisory first, then required. |
| Worktree isolation helpers | Compose existing CAID, worktree board, `herdr worktree`, and `herdr agent start`; fail on collisions. |
| Approval seams | Add TUI-backed, SHA-scoped approval records; block without UI in strict/headless mode. Cryptographic signatures remain a later hardening option. |
| Security/supply chain | Add trust tiers, secret redaction, sandbox evaluation, package pins, and configurable deterministic gates. |
| Role skills | Reconcile and strengthen existing `bdd-*` agents/skills before creating new duplicates. Add only missing domain skills. |

## Target architecture

```text
WezTerm (host process; stowed config)
  ├─ launch/attach Herdr default or named session
  ├─ host keybindings, font, color, coarse status
  └─ no agent/worktree state authority

Herdr 0.8+ server (durable runtime; tracked config + generated Pi hook)
  ├─ session → workspace → tab → pane topology
  ├─ agent lifecycle: idle | working | blocked | done | unknown
  ├─ worktree create/open/remove
  ├─ wait/read/prompt/notification APIs
  └─ native Pi integration installed and checked

Pi personal package (policy/control plane)
  ├─ bdd-mode: authoritative phase/evidence FSM
  ├─ agentic-fleet: read-only persona fan-out
  ├─ worktree-board: writer lease authority; CAID: assignment/isolation history
  ├─ assurance-orchestrator: thin composition façade
  ├─ contracts: versioned request/result/approval schemas
  ├─ trajectory/decisions/budget: process gates
  ├─ security policy: trust tier + redaction + sandbox routing
  └─ role agents/skills: bounded creative workers

Project artifacts
  ├─ .pi/bdd.json                    deterministic project commands/policy
  ├─ .pi/caid-board.json             assignment history and handoff metadata (not a writer lock)
  ├─ .pi/worktree-board.json         primary cooperative writer lease authority
  ├─ .pi/handoffs/*.json|md          schema-valid path-based handoffs
  ├─ .pi/trajectories/**             redacted append-only process events
  ├─ .pi/fleet-runs/<runId>/**       fleet plan/member/synthesis evidence
  └─ docs/decisions/decisions.json   accepted constraints and risks
```

### State authority

| State | Single authority | Mirrors/read models |
|---|---|---|
| BDD phase and evidence | `bdd-mode` session entries | orchestrator, skills, fleet gates |
| Runtime pane/agent state | Herdr server | Pi herd widget, orchestrator status, notifications |
| Git worktree truth | `git worktree list --porcelain` | Herdr worktree view and Pi board registry |
| Writer ownership | `.pi/worktree-board.json`, written only by the parent orchestrator | CAID assignment history and Herdr labels/tokens are read-only mirrors |
| Fleet run state | pi-subagents async/run ledger | `.pi/fleet-runs` collected evidence |
| Process trajectory | append-only trajectory ledger | session custom entries and verify evaluator |
| Accepted decisions | project decision store | pre-action gate and role handoffs |
| Human approval | TUI approval event scoped to plan/SHA/paths | trajectory and handoff evidence |

**Primary writer lease store: `.pi/worktree-board.json`.** `.pi/caid-board.json` records role assignments and handoff history but never grants write authority. Only the parent orchestrator mutates leases, using a cross-process lock plus atomic replace; workers report heartbeats through typed events. A conflicting CAID assignment, Herdr identity, git realpath, or board lease blocks instead of auto-reconciling. No component should infer or overwrite another component’s authority.

### Versioned inter-role contracts

Create TypeBox schemas and derived TypeScript types for:

- `RoleRequestV1`: task id, role, goal, BDD phase, worktree, owned/forbidden paths, artifact refs, model/thinking, tools, budgets, approval requirements.
- `RoleResultV1`: status, changed paths, commands/evidence, SHA/dirty state, handoff artifacts, blockers, residual risks, usage.
- `ValidationContractV1`: behavior assertions, exact test commands, expected assertion/test identifier and failure signature for causal red, green coverage relation, required sensitivity/mutation evidence, quality gates, thresholds.
- `ApprovalRequestV1` / `ApprovalDecisionV1`: risk kind, exact action, paths, plan fingerprint, candidate SHA, expiry, human decision.
- `ResourceLeaseV1`: canonical worktree realpath, pane id, Pi session id, branch/PR/port ownership, parent-issued capability token, heartbeat sequence/time, stale state, and release evidence.
- `TrajectoryEventV1`: sequence, time, actor, phase, event kind, redacted preview, artifact/hash references.

Validation occurs before spawn, before accepting a result, before phase transitions that depend on a handoff, and before destructive cleanup. Free-text Markdown remains a human-readable rendering of the validated data, not the source of truth.

### Pi extension boundaries

Use small adapters over pure libraries:

- `extensions/assurance-orchestrator/index.ts`: registers high-level tools/commands only.
- `lib/contracts/**`: schemas and validation.
- `lib/herdr/**`: argv builders, JSON envelope parsing, compatibility checks, bounded waits.
- `lib/orchestrator/**`: pure plan/state/reconciliation functions; no LLM control flow.
- `extensions/trajectory-logger.ts` + `lib/trajectory/record.ts`: event capture and redaction.
- `extensions/approval-seams.ts` + `lib/approvals/**`: human UI and scoped records.
- `extensions/security-policy.ts` + `lib/security/**`: trust tier and tool policy.

Use `pi.events` for namespaced inter-extension notifications such as `assurance:bdd-state`, `assurance:trajectory`, and `assurance:budget`. Persist important state through `pi.appendEntry`; use project files only for cross-session/CI artifacts. Every long-lived resource starts after `session_start` and closes idempotently on `session_shutdown`.

### High-level tool surface

The first orchestrator version should expose only:

- `assurance_status` — reconcile BDD, Herdr, worktree, fleet, trajectory, and budget state.
- `assurance_plan_role` — return a schema-valid role assignment and CAID plan; no mutation.
- `assurance_spawn_role` — after human/workspace checks, create/open the worktree, start one Pi role, register lease, and return IDs.
- `assurance_wait_role` — bounded wait → get → read result; timeout remains `unknown`.
- `assurance_record_handoff` — validate and persist a role result.
- `assurance_request_approval` — show a human TUI seam and persist a scoped decision.

Convenience commands such as `adversarial_pair` or full-cycle recipes should compose these primitives only after the primitives have golden tests. They must never introduce a second hidden FSM.

## Work package catalog

Estimates are engineering ranges for one focused writer plus an independent Test Designer/reviewer. They are not calendar promises. Every package follows the BDD/TDD protocol later in this document.

### GOV-01 — Canonical rules and root assurance contract

- **Objective:** establish Rulesync as the authoring source for always-on rules and add a root BDD/test adapter.
- **Owned paths:** `rulesync.jsonc`, `.rulesync/**`, generated root `AGENTS.md`, root `.pi/bdd.json`, root `package.json`/`bun.lock`, `scripts/{generate-rules,check-rulesync-drift,test-root}.sh`, `tests/test_rules_contract.py`, `README.md`.
- **Dependencies:** accepted GOV-01 decision: project-scope `agentsmd` rules only, with exact local Rulesync 16.9.1; vendor stow targets remain deferred until compatibility-tested.
- **Deliverables:** concise high-assurance rule source; generation/drift check; root commands aggregating current Pi package tests and AI-resource validation; explicit statement that `agents-shared` owns resources while Rulesync owns generated rules.
- **Acceptance:** generation is deterministic; generated files are unchanged after a second run; direct edits to generated outputs fail validation; root BDD profile detects a real unit command.
- **Existing commands to compose:** `bun test lib` in the personal package, `bun test` in `pi/`, and `python3 agents-shared/.agents/scripts/verify-ai-resources.py`.
- **Risks:** dual source of truth, generator churn, accidental overwrite of adapter-specific content.
- **Rollback:** remove Rulesync outputs/config together and restore previous documented governance; never leave partially generated files.
- **Estimate:** M, 1–2 days.

### BASE-01 — Canonical playbook and bounded Test Designer baseline

- **Objective:** restore a truthful green package baseline without downgrading the canonical v1.2 playbook to stale v1.0 assertions.
- **Owned paths:** `agents-shared/.agents/adapters/pi/personal/lib/bdd/{playbook,playbook.test,assurance-agents.test}.ts`, `agents/bdd-test-designer.md`; `docs/high-assurance-playbook.md` is the read-only normative v1.2 source for this repair unless a new acceptance rule proves a genuine document defect.
- **Dependencies:** GOV-01 root aggregation and explicit human approval to move this minimal baseline repair into Wave 0 ahead of ROLE-01.
- **Deliverables:** v1.2/August 2026 runtime metadata; tests aligned with the canonical 20-section living document and changelog; explicit Test Designer writable-path and no-delegation rules; contracts/invariants, fuzz, differential, and golden-master oracle responsibilities.
- **Acceptance:** focused baseline tests pass after a causal red against stale runtime metadata and missing role requirements; the canonical document remains v1.2; full `bun test lib` and the root aggregate have no baseline role/playbook failures.
- **Risks:** weakening tests to prose equivalence, brittle exact-string checks, or rewriting the normative document backward merely to satisfy stale assertions.
- **Rollback:** revert runtime metadata and role wording together while retaining the v1.2 canonical document; never relabel stale v1.0 metadata as current.
- **Estimate:** S, 0.5–1 day.

### CMP-01 — Version policy and Herdr 0.8 contract rebaseline

- **Objective:** pin or constrain tested versions and update stale 0.7.5 assumptions.
- **Owned paths:** `pi/docs/pi-herdr-*`, `pi/tests/herd-*.test.ts`, `pi/tests/fixtures/herdr/**`, `pi/.pi/agent/personal/extensions/herd/{herd-compat,herd-task}.ts`, personal `skills/herdr/SKILL.md`; package pins only after reconciling the user’s current `pi/.pi/agent/settings.json` edits.
- **Dependencies:** none; must precede new Herdr client work.
- **Deliverables:** supported Pi/Herdr/pi-subagents/context-mode matrix; live Herdr 0.8 JSON fixtures; updated `--no-focus`, command, and lifecycle expectations; pinned package policy.
- **Acceptance:** old and current compatible fixtures parse; incompatible protocol fails with an actionable message; `session_shutdown` remains the cleanup event; no dependency is silently upgraded.
- **Risks:** overfitting to transient envelope fields; pinning stale security releases.
- **Rollback:** support dual fixtures and revert pins while retaining the compatibility doctor.
- **Estimate:** M, 1–2 days.

### CMP-02 — Repair `fleet_dispatch` workflow compatibility

- **Objective:** eliminate the observed legacy chain/parallel payload failure.
- **Owned paths:** `agents-shared/.agents/adapters/pi/personal/lib/fleet/plan.ts`, `lib/fleet/rpc.ts`, their focused tests, and the narrow dispatch call sites in `extensions/agentic-fleet.ts`.
- **Dependencies:** current pi-subagents RPC schema captured as a fixture.
- **Deliverables:** a current dispatch adapter; structured run identity; deterministic error/fallback result; regression fixture for the exact discovery failure.
- **Acceptance:** red proves the current plan emits a removed top-level `tasks`/`chain` payload; green produces the current pi-subagents execution shape with five distinct personas, preserves `xai/grok-4.5`, and captures runId/asyncDir. `workflowScript` is the expected current solution, not the red assertion itself.
- **Risks:** coupling to private pi-subagents details; duplicated fallback logic.
- **Rollback:** retain an explicit plan-only output and manual `subagent` workflowScript payload without claiming dispatch success.
- **Estimate:** M, 1–2 days.

### BDD-01 — Machine-checkable red cause and gate-command trust

- **Objective:** prevent unrelated failures and untrusted project commands from becoming assurance evidence.
- **Owned paths:** `agents-shared/.agents/adapters/pi/personal/lib/bdd/{run-command,config,types,quality-gates}*` and focused tests; one integrator owns any later `extensions/bdd-mode.ts` wiring.
- **Dependencies:** GOV-01 and CON-01 schema shape; pure red-cause tests may start after GOV-01.
- **Deliverables:** expected assertion/test-id/failure-signature matching; invalid-red reasons; assertion-level green sensitivity requirement; canonical gate result model supporting `command` and `internal` deterministic executors; strict gate config integrity and trust policy.
- **Gate-command trust:** strict/overnight modes reject mutable untrusted `.pi/bdd.json` shell strings, use validated argv or a sandboxed approved command, sanitize inherited environment, and invalidate approval/evidence when gate config changes.
- **Acceptance:** unrelated assertion, import/setup, timeout, 126/127, or wrong test id cannot unlock green; deleting/skipping the focused assertion fails sensitivity; a malicious project gate cannot run unrestricted shell with inherited secrets.
- **Risks:** migration of existing string commands; cross-platform argv behavior.
- **Rollback:** keep legacy strings only in explicitly trusted interactive mode and label their evidence non-assurance.
- **Estimate:** L, 3–4 days.

### SEC-00 — Minimum fleet containment before live Grok dispatch

- **Objective:** make read-only fleet claims enforceable before G2 dogfood.
- **Owned paths:** `agents-shared/.agents/adapters/pi/personal/lib/fleet/child-policy*`, `agents/fleet-*.md` tool declarations, and sanitized child-process environment tests. SEC-00 retains ownership until SEC-01 explicitly receives it; ROLE-01 never owns fleet containment.
- **Dependencies:** CMP-02 and CMP-01 version policy.
- **Deliverables:** no write/edit tools; no unrestricted bash/env/printenv/curl for review/research children; deny-read for auth/secret paths; sanitized environment; explicit network capability only for the web researcher tool.
- **Acceptance:** a child cannot read `~/.pi/agent/auth.json`, dump inherited secrets, mutate the checkout, or invoke arbitrary egress; attempted violations are recorded as blocked.
- **Risks:** reduced researcher flexibility and third-party tool escape paths.
- **Rollback:** disable live fleets and use plan-only fixtures; never fall back to unrestricted children.
- **Estimate:** M, 1–2 days.

### HOST-01 — Reproducible Herdr package and Pi integration

- **Objective:** make Herdr a first-class dotfiles dependency on macOS and Ubuntu.
- **Owned paths:** new `herdr/.config/herdr/config.toml`, `Brewfile`, `install.sh`, installation docs.
- **Dependencies:** CMP-01 version policy.
- **Deliverables:** stow package; idempotent binary check/install path; `herdr config check`; `herdr integration install pi`; post-install status diagnostics; safe sidebar/toast/sound/session defaults; no secrets.
- **Acceptance:** install is idempotent; absent binary produces an exact supported action instead of false success; config validates; Pi integration status is current; repeated integration install is safe; rollback/uninstall is documented.
- **Risks:** Linux distribution support, machine-local generated hook drift, notification spam.
- **Rollback:** remove `herdr` from stow packages, restore minimal config, and run official integration uninstall only with human confirmation.
- **Estimate:** M, 1–2 days.

### HOST-02 — WezTerm attach and host ergonomics

- **Objective:** make the intended outer-shell flow obvious without creating a second mux.
- **Owned paths:** `wezterm/.config/wezterm/wezterm.lua`, `tabbar.lua`, operator docs.
- **Dependencies:** HOST-01.
- **Deliverables:** a non-conflicting action to open/attach Herdr; `herdr` process icon; documented prefix split; optional coarse status that is cached and never shells on every render; remote flow uses `herdr --remote`, not duplicate WezTerm domains in v1.
- **Acceptance:** config loads on supported WezTerm; existing keys retain behavior; action does not steal focus unexpectedly; no per-frame Herdr process spawn; visual state is icon+text.
- **Risks:** key collision, platform-specific process launch behavior, status-loop latency.
- **Rollback:** remove only the new key/action/status code; base visual config remains untouched.
- **Estimate:** S, 0.5–1 day.

### CON-01 — Versioned contracts and schema enforcement

- **Objective:** make every role, result, approval, and validation handoff machine-checkable.
- **Owned paths:** new `agents-shared/.agents/adapters/pi/personal/lib/contracts/**` and tests.
- **Dependencies:** architecture decisions in this plan.
- **Deliverables:** V1 schemas/types/validators/renderers; compatibility/version rejection; path and output bounds; explicit red-cause and sensitivity fields. Redaction is delegated to RED-01 rather than duplicated here.
- **Acceptance:** valid fixtures round-trip; missing/unknown required fields fail; wrong version fails; path traversal/absolute-secret references fail policy; Markdown render is derived from valid data.
- **Risks:** schema rigidity and premature over-modeling.
- **Rollback:** keep V1 parsers additive and allow the existing Markdown handoff as an explicitly labeled legacy adapter during migration.
- **Estimate:** L, 2–3 days.

### RED-01 — Single pre-persistence redaction authority

- **Objective:** provide one mandatory redaction library before any trajectory or handoff file sink is enabled.
- **Owned paths:** new `agents-shared/.agents/adapters/pi/personal/lib/security/redact.ts` and focused fixtures/tests.
- **Dependencies:** CON-01 field model.
- **Deliverables:** recursive structured redaction, high-entropy/token/path patterns, safe hash/path references, binary/oversize refusal, and a no-raw-secret invariant.
- **Acceptance:** synthetic API keys, auth headers, env values, private keys, credential paths, nested arrays/objects, and encoded previews are removed before persistence; the raw fixture never appears in output bytes.
- **Risks:** false negatives and destructive over-redaction.
- **Rollback:** disable persistence entirely; never bypass RED-01 to keep logging.
- **Estimate:** M, 1–2 days.

### HDR-01 — Typed Herdr 0.8 client and compatibility doctor

- **Objective:** replace ad hoc shell strings with bounded argv-based Herdr operations.
- **Owned paths:** new `personal/lib/herdr/**`, focused changes under `extensions/herd/**`, Herdr fixtures/tests under `pi/tests/**`.
- **Dependencies:** CMP-01, CON-01.
- **Deliverables:** environment guard; version/protocol check; JSON envelope parser; argv builders for list/get/read/wait/worktree/start/prompt/notification; abort/timeout behavior; explicit IDs; no focus by default.
- **Acceptance:** malformed JSON, missing pane id, incompatible protocol, absent `HERDR_ENV`, timeout, blocked, and unknown states have distinct typed outcomes; timeout is never success/failure; argv never invokes an interpolated shell.
- **Risks:** CLI drift and stale cached state.
- **Rollback:** preserve existing `/herd-task` behavior behind a legacy adapter and disable new client feature flag.
- **Estimate:** L, 2–4 days.

### ISO-01 — CAID lifecycle, writer leases, and collision hard-fail

- **Objective:** turn existing CAID planning into a safe operational lifecycle with one durable writer authority.
- **Owned paths:** `agents-shared/.agents/adapters/pi/personal/lib/worktree/{caid,registry,io,caid-lifecycle}*`, `extensions/worktree-board.ts`, tests.
- **Dependencies:** CON-01, HDR-01.
- **Deliverables:** plan → create/open → register → acquire → handoff → release flow; canonical realpath/symlink checks; parent-only lease mutation in `.pi/worktree-board.json`; cross-process lock + atomic replace; CAID assignment-history mirror; stale detection; collision refusal; conservative cleanup preconditions.
- **Heartbeat policy:** the parent orchestrator writes monotonic heartbeats derived from a matching parent-issued token, Pi session id, Herdr pane id, and worktree realpath. TTL is configured relative to the Herdr poll interval. Stale, blocked, working, or unknown never auto-releases ownership.
- **Acceptance:** Test Designer and Implementer cannot share, nest, or alias a writable path; board/CAID disagreement blocks; the writer cap is honored atomically across processes; dirty/working/blocked/unknown/mismatched-SHA resources cannot be cleaned.
- **Risks:** worktree proliferation, cooperative lock bypass, false stale detection.
- **Rollback:** disable automated apply/release and retain plan/status/collision-only commands.
- **Estimate:** L, 3–4 days.

### ROLE-01 — Role contract and skill reconciliation

- **Objective:** strengthen existing roles rather than add duplicate `specifier`, `test-designer`, and `implementer` skills.
- **Owned paths:** `personal/agents/bdd-*.md`, `personal/skills/{bdd-tdd,caid,trajectory,ship,herdr-delivery-supervisor}/**`, new missing supporting skills only.
- **Dependencies:** CON-01, ISO-01, SEC-00.
- **Deliverables:** V1 handoff requirements in each BDD role; explicit owned/forbidden paths; model/thinking/tool/budget contract; add only missing skills such as `validation-contract-first`, `security-supply-chain`, and selective `formal-first`. Fleet-agent containment remains owned by SEC-00/SEC-01.
- **Acceptance:** role prompts express the separation contract, while SEC-00/SEC-01 tool policy plus BDD path gates enforce it: Test Designer production writes and Implementer test writes are blocked; reviewer/guardian/QA have no mutation path; every role result validates; high-risk ambiguity blocks.
- **Risks:** prompt-only controls mistaken for sandboxing; skill bloat.
- **Rollback:** preserve existing role files and make schema additions additive until all callers migrate.
- **Estimate:** M, 1–2 days.

### ORC-01 — Thin assurance orchestrator façade

- **Objective:** provide a coherent operator/model surface without creating a second FSM.
- **Owned paths:** new `extensions/assurance-orchestrator/**`, new `lib/orchestrator/**`, tests.
- **Dependencies:** CMP-02, CON-01, HDR-01, ISO-01, ROLE-01.
- **Deliverables:** the six high-level tools listed above; pure reconciliation; event-bus contracts; BDD phase queries; bounded waits; one-role spawn; no autonomous merge.
- **Acceptance:** all state transitions are rejected unless `bdd-mode` permits them; two writers cannot be spawned into one path; invalid handoff/approval blocks; reload cleans resources; disabling the extension leaves existing BDD/fleet/herd commands functional.
- **Risks:** hidden duplicate state, shared-entrypoint conflicts, model overuse of orchestration tools.
- **Rollback:** remove the façade package and continue with existing manual skills/commands.
- **Estimate:** L, 3–5 days.

### OBS-01 — Redacted trajectory recorder and replay fixtures

- **Objective:** record process evidence safely and evaluate the existing anti-pattern library automatically.
- **Owned paths:** `agents-shared/.agents/adapters/pi/personal/lib/trajectory/**`, new `extensions/trajectory-logger.ts`, unit golden fixtures under `lib/trajectory/fixtures/**`.
- **Dependencies:** CON-01 and RED-01; file persistence is blocked until RED-01 is green.
- **Deliverables:** append-only sequencing; buffered file writes; session custom entries; phase/tool/gate/handoff/approval/budget/Herdr-state events; hashes/path refs instead of raw content; retention policy; explicit good/bad fixtures replacing the weak stub.
- **Acceptance:** RED-01 runs before every sink; sequence is monotonic; reload does not duplicate timers/writers; fixtures for `MISSING_RED_BEFORE_GREEN`, `FALSE_COMPLETION`, `TEST_AND_IMPL_SAME_AGENT`, `SUCCESS_AFTER_FAILED_GATE`, and `SECRET_IN_PREVIEW` fail evaluation.
- **Risks:** sensitive logs, disk growth, hook overhead.
- **Rollback:** disable file persistence and keep session-only minimal events; purge only through explicit operator command.
- **Estimate:** L, 2–4 days.

### DEC-01 — Decision-store pre-action and handoff gate

- **Objective:** give Requirements-as-Code an explicit implementation owner and deterministic evidence.
- **Owned paths:** `agents-shared/.agents/adapters/pi/personal/lib/decisions/**`, decision gate adapters/tests, templates only after GOV-01 releases them.
- **Dependencies:** CON-01 and BDD-01 canonical gate-result model.
- **Deliverables:** trusted store loading; accepted/rejected/superseded semantics; path-scoped pre-action result; current fingerprint; handoff evidence.
- **Acceptance:** a contradictory accepted constraint blocks the action; rejected/superseded records behave deterministically; agent-writable store mutation invalidates approval and requires human review.
- **Risks:** heuristic false positives and stale governance.
- **Rollback:** advisory warnings only; never fabricate a passing decision result.
- **Estimate:** M, 1–2 days.

### FIT-01 — Fitness-gate integration and guardian status

- **Objective:** compose current quality-gate planning with trajectory, decision, security, and budget results without a second gate enum.
- **Owned paths:** the canonical `agents-shared/.agents/adapters/pi/personal/lib/bdd/{types,quality-gates,assurance-handoff}*`, `bdd-fitness-guardian` contract, and one designated integrator for `extensions/bdd-mode.ts`.
- **Dependencies:** BDD-01, OBS-01, DEC-01, BUD-01, SEC-01. **FIT-01 starts only after SEC-01** is green and integrated.
- **Deliverables:** one canonical gate-result model with `command` and `internal` deterministic executors; trajectory/decision/budget/security adapters; current-evidence checks; concise guardian report; no metric parsing from prose.
- **Acceptance:** required unavailable/timeout/non-zero/stale/internal-fail blocks; advisory failure is visible and continues; command thresholds come from exit status while internal checks return typed evidence; final handoff includes current plan fingerprint and every result.
- **Risks:** brittle gates driving bypass behavior; slow verify loops.
- **Rollback:** demote new gates to advisory through configuration, never by rewriting evidence.
- **Estimate:** L, 2–3 days.

### APR-01 — Human approval seams

- **Objective:** create explicit plan/findings/risky-action/diff approvals.
- **Owned paths:** new `lib/approvals/**`, `extensions/approval-seams.ts`, tests.
- **Dependencies:** CON-01, ORC-01.
- **Deliverables:** TUI confirm/select flow; SHA/path/plan-fingerprint-scoped decisions; expiry; `blocked` payload; fail-closed headless behavior; trajectory record. The authoritative approval entry is created only by the approval extension in session/machine-local state with mode `0600`; project handoff files are mirrors, not approval authority.
- **Acceptance:** model-supplied booleans or project-file edits do not satisfy approval; changed SHA/paths/risk invalidates approval; no UI blocks strict actions; denial is durable for that request; no extension merges.
- **Risks:** approval fatigue and single-local-operator identity limits.
- **Rollback:** keep existing manual approval seams and disable strict approval tool until UX is acceptable.
- **Estimate:** M, 1–2 days.

### SEC-01 — Trust tiers, sandboxing, secret hygiene, and supply-chain gates

- **Objective:** reduce Pi’s full-host-permission blast radius before overnight autonomy.
- **Owned paths:** new `agents-shared/.agents/adapters/pi/personal/lib/security/**` except RED-01’s stable module, `extensions/security-policy.ts`, sandbox templates, security docs/config. CMP-01 remains the sole pin writer; SEC-01 consumes its inventory read-only.
- **Dependencies:** CON-01, RED-01, SEC-00, and BDD-01; a time-boxed evaluation of Pi’s official sandbox and Gondolin examples.
- **Deliverables:** `interactive`, `strict`, and `overnight` trust profiles; deny-read secret paths; allow-write canonical worktree/tmp paths; per-runtime egress/env matrix for fleet children, Herdr Pi workers, gate commands, and web tools; tool-result redaction through RED-01; secret/SAST/SCA/license gate slots.
- **Acceptance:** synthetic env dump, auth-file read, `.env` write, `curl|sh`, interpreter-based hidden write, out-of-worktree/symlink mutation, malicious project gate command, and unauthorized egress are blocked in strict fixtures; unsupported sandbox initialization fails closed for overnight.
- **Risks:** breaking legitimate development, incomplete coverage of third-party tools, platform differences.
- **Rollback:** strict profile can be disabled for interactive use, but overnight remains unavailable until required controls pass.
- **Estimate:** XL, 4–6 days.

### BUD-01 — Usage accounting and spawn circuit breakers

- **Objective:** turn the existing cost-budget helper into an actual fleet/orchestrator control.
- **Owned paths:** `agents-shared/.agents/adapters/pi/personal/lib/bdd/cost-budget.ts`, fleet usage/ledger helpers, narrow serialized changes in `extensions/agentic-fleet.ts` after CMP-02.
- **Dependencies:** CMP-02, CON-01, OBS-01.
- **Deliverables:** task/agent usage attribution; preflight count confirmation; hard post-usage circuit break; warning thresholds; no automatic budget increase; footer/status summary.
- **Acceptance:** count above policy requires human confirmation; exceeded tokens/cost/time/iterations prevents new spawn; the current `used == null → ok` behavior is replaced so missing usage is typed `unknown`, not zero/pass; `unknown` fails closed for new spawns in strict/overnight hard-budget profiles and requires human resolution interactively; budget event appears in trajectory.
- **Risks:** provider usage gaps and false estimates.
- **Rollback:** retain count/concurrency limits and advisory accounting while disabling dollar estimates that lack provenance.
- **Estimate:** M, 1–2 days.

### OPS-01 — Notifications, bounded recovery, and conservative cleanup

- **Objective:** make blocked agents and resource lifecycle manageable day to day.
- **Owned paths:** Herdr config, `extensions/herd/**`, supervisor skill, new cleanup/recovery pure helpers.
- **Dependencies:** HOST-01, HDR-01, ISO-01, APR-01.
- **Deliverables:** blocked/done background toast policy; stale-age display; prompt → wait → get → read automation; at most two focused resumes; cleanup readiness validation; morning triage report.
- **Acceptance:** blocked emits one icon+text request signal; focused/seen idle does not spam; timeout remains unknown; dirty or active pane blocks cleanup; user-owned panes are never closed/re-homed without approval.
- **Risks:** alert fatigue and destructive cleanup bugs.
- **Rollback:** notifications and cleanup apply are independently disabled; status/read-only triage remains.
- **Estimate:** L, 2–4 days.

### PKG-01 — Packaging, migration, and operator documentation

- **Objective:** make the system reproducible without prematurely publishing machine-specific code.
- **Owned paths:** personal `package.json`, manifests, templates, README/operator docs, installation checks.
- **Dependencies:** all v1 core packages.
- **Deliverables:** versioned private `leo-pi-personal` release first; migration flags; upgrade/rollback guide; generated resource validation; later extraction criteria for a shareable `pi-high-assurance` package.
- **Acceptance:** `/reload` has no extension issues; `pi list` shows expected packages; install is idempotent on macOS/Ubuntu; no auth/session/runtime state is committed; old commands remain documented during migration.
- **Risks:** path assumptions and package dependency drift.
- **Rollback:** return to the prior personal package tag and restow; machine-local state remains untouched.
- **Estimate:** M, 1–2 days.

### E2E-01 — Golden high-assurance workflow

- **Objective:** prove the complete process on a harmless fixture project before wider adoption.
- **Owned paths:** fixture project/tests, golden trajectories, operator acceptance docs.
- **Dependencies:** ORC-01, OBS-01, FIT-01, SEC-01, OPS-01.
- **Deliverables:** one deterministic story with locked acceptance/unit tests; isolated designer/implementer; blocker simulation; budget event; review fleet; cleanup refusal and success cases.
- **Acceptance:** complete discovery → formulation → causal red → covering green → verify; separate worktrees/contexts; no error trajectory hits; required gates current; review synthesis dispositioned; human diff approval; no auto-merge.
- **Risks:** fixture coverage can drift toward happy paths; G9 requires blocker, secret, budget, stale-state, collision, and cleanup-refusal negative cases as first-class fixtures.
- **Rollback:** fixture remains a regression suite even if new orchestration is disabled.
- **Estimate:** L, 2–3 days.

## Parallel execution DAG

### Wave 0 — Human, compatibility, and safety lock (serial where paths overlap)

1. Decide workspace/branch and preserve current dirty user changes.
2. Approve architecture and the decisions at the end of this plan.
3. Complete GOV-01 and CMP-01.
4. Complete BASE-01 so the canonical v1.2 playbook/role contract and full root baseline are green.
5. Complete CMP-02 with mocked transport fixtures; do not run a live fleet yet.
6. Complete the pure/security portions of BDD-01 that protect red evidence and gate commands.
7. Complete SEC-00 before any live Grok fleet smoke.
8. Gate: root BDD/test command and full baseline are green; compatibility matrix accepted; mocked fleet dispatch green; contained child policy green.

### Wave 1a — Independent foundations (parallel one-writer lanes)

| Lane | Grok 4.5 role pairing | Work package | Exclusive paths |
|---|---|---|---|
| A — host bootstrap | Test Designer → Implementer | HOST-01 | `herdr/**`, `install.sh`, `Brewfile` |
| B — contracts | Test Designer → Implementer | CON-01 | `agents-shared/.agents/adapters/pi/personal/lib/contracts/**` |
| C — security architecture | contained research fleet → Test Designer | SEC-01 discovery/formulation only | `docs/security/**`; no runtime implementation yet |

**Start-gated Wave 1b:** HOST-02 starts after HOST-01; RED-01 and DEC-01 start after CON-01; no lane starts merely because its wave label matches.

**Integration Gate W1:** hermetic bootstrap tests, base package tests, schema tests, redaction tests, decision tests, and WezTerm contract tests pass. Live Herdr install/integration is a separate operator acceptance, not a hermetic unit gate.

### Wave 2a — Runtime foundations (parallel after declared dependencies)

| Lane | Work package | Path ownership |
|---|---|---|
| D — Herdr client | HDR-01 | `personal/lib/herdr/**`; CMP-01 first releases compatibility fixtures |
| E — trajectory | OBS-01 | `personal/lib/trajectory/**`; starts only after RED-01 |
| F — strict security | SEC-01 implementation | `personal/lib/security/**`, security extension; starts after RED-01/SEC-00/BDD-01 |

### Wave 2b — Isolation chain (start-gated, not parallel with prerequisites)

1. ISO-01 starts only after HDR-01 and CON-01 are green and integrated.
2. ROLE-01 starts only after ISO-01 and SEC-00 are green and integrated.
3. BUD-01 may run parallel with ISO-01 only after OBS-01 and CMP-02 are green.
4. Gate: collision/lease hard-fail, enforced role tool/path policy, trajectory redaction, and budget unknown/circuit-break fixtures pass.

### Wave 3 — Shared control-plane integration (serialized)

Shared entrypoints are intentionally not edited in parallel.

1. ORC-01 pure library and tests, then its extension adapter.
2. APR-01.
3. BUD-01’s serialized `agentic-fleet.ts` integration if not already applied.
4. DEC-01 and OBS-01 adapters publish typed internal results.
5. FIT-01 starts only after SEC-01, BDD-01, OBS-01, DEC-01, and BUD-01 are green; FIT-01 is the sole owner of the canonical gate-model and `bdd-mode.ts` integration in this wave.
6. Gate after every merge/cherry-pick; never batch shared-entrypoint changes before testing.

### Wave 4 — Operations and packaging

- OPS-01 starts after APR-01, HDR-01, ISO-01, and HOST-01; it receives explicit ownership of released Herdr paths.
- PKG-01 starts after the v1 API is frozen. It applies the already approved CMP-01 pin set but does not choose versions.
- E2E fixture design may proceed read-only, but implementation waits for FIT-01 and SEC-01.

### Wave 5 — Independent verify and dogfood

1. E2E-01 full positive and negative golden story.
2. After SEC-00 and SEC-01, call `fleet_dispatch(kind="review", count=3, model="xai/grok-4.5")`; persona expansion supplies distinct architecture, security, and operator lenses.
3. The mocked CMP-02 transport test is the deterministic required gate; a real five-person model smoke is costly advisory dogfood with recorded usage, never a deterministic gate.
4. Collect and synthesize agreements, disagreements, blockers, actions, and residual risks.
5. Fix accepted P0–P2 findings through new red/green slices, then obtain human exploratory/diff approval.

### Dependency summary

```text
GOV-01 ─► BASE-01 ─► BDD-01 ──────────────────────────────────┐
CMP-01 ─► HOST-01 ─► HOST-02                                  │
   └────► CMP-02 ─► SEC-00 ───────────────────────────────┐    │
CON-01 ─► RED-01 ─► OBS-01 ─► BUD-01 ────────────────────┼─► FIT-01
   ├────► DEC-01 ─────────────────────────────────────────┤    │
   └────► HDR-01 ─► ISO-01 ─► ROLE-01 ─► ORC-01 ─► APR-01│    │
RED-01 + SEC-00 + BDD-01 ─► SEC-01 ──────────────────────┘    │
HOST-01 + HDR-01 + ISO-01 + APR-01 ─► OPS-01                  │
all v1 core ─► PKG-01 ─► E2E-01 ─► review fleet ──────────────┘
```

### One-writer and integration ownership

Use `P = agents-shared/.agents/adapters/pi/personal` as the canonical prefix; plans and handoffs must not mix `personal/`, package-relative, and repo-relative aliases.

- Every work package gets an isolated branch/worktree.
- A CAID Test Designer creates and commits tests first; the parent transfers that locked test commit to a separate Implementer worktree.
- The integration parent is the only writer to the integration branch and the only writer lease-store process.
- Review/research fleets use `xai/grok-4.5` and are mutation-disabled by SEC-00; never invent near-duplicate tasks where `fleet_dispatch` can expand personas.

**Ownership transfer table:**

| Shared path | First owner | Later owner | Transfer rule |
|---|---|---|---|
| `P/lib/fleet/plan.ts`, `P/extensions/agentic-fleet.ts` | CMP-02 | BUD-01 | CMP-02 merged and green; BUD changes only usage/circuit-break seams |
| `P/agents/bdd-test-designer.md` | BASE-01 | ROLE-01 | BASE v1.2/no-delegation/path/oracle contract is green; ROLE may strengthen schema/tool enforcement but cannot weaken it |
| `pi/tests/herd-compat*.test.ts` | CMP-01 | none | HDR-01 adds `herd-client*.test.ts`; it does not rewrite compatibility corpus |
| `P/extensions/herd/**` | HDR-01 | OPS-01 | HDR public API frozen; OPS owns only notification/recovery adapters |
| `herdr/.config/herdr/config.toml` | HOST-01 | OPS-01 | HOST baseline tagged; OPS changes notification keys only |
| `P/skills/herdr-delivery-supervisor/**` | ROLE-01 | OPS-01 | role schema merged; OPS changes recovery procedure only |
| `README.md` and operator docs | GOV-01 | PKG-01 | governance section frozen; later WPs contribute dedicated docs, PKG integrates links |
| `P/package.json`, `pi/.pi/agent/settings.json` | CMP-01 | PKG-01 | CMP chooses/reviews pins; PKG applies frozen set after user dirty-state reconciliation |
| `P/lib/trajectory/fixtures/**` | OBS-01 | none | E2E uses `pi/tests/fixtures/e2e/**`, never rewrites unit golden fixtures |
| `P/lib/bdd/{types,quality-gates}*`, `P/extensions/bdd-mode.ts` | BDD-01 | FIT-01 | BDD red/trust and canonical executor model merge first; FIT is the sole later integrator |
| `P/agents/fleet-*.md`, `P/lib/fleet/child-policy*` | SEC-00 | SEC-01 | SEC-00 containment is green before live fleets; SEC-01 may only tighten policy |

## BDD/TDD delivery protocol

### Program-level precondition

Implementation must not begin in the current dirty checkout. Present the human with:

- **A:** new branch in this checkout after resolving dirty state;
- **B:** new integration worktree and branch (recommended);
- **C:** stay only if the human confirms the current branch/worktree is intentional.

Record the chosen cwd, branch, worktree, dirty-state handling, and integration owner. The recommended branch is `feat/pi-herdr-high-assurance`; the path is a proposal only and must not be created without approval.

### Per-work-package cycle

1. **Discovery**
   - Read this plan, current implementation profile, decision store, and package-specific code.
   - Record Rules/Examples/Questions under `docs/plans/work-packages/<ID>-example-map.md` or the tracking issue.
   - Resolve environment/setup questions before tests.
2. **Formulation**
   - CAID Test Designer in a fresh Pi/Herdr worktree.
   - Write acceptance scenarios and focused unit/contract tests only.
   - Lock `ValidationContractV1` with expected red cause and exact command.
3. **Red**
   - Enter red.
   - Run `bdd_assert_red` using the focused command and the ValidationContract’s expected assertion/test id/failure signature.
   - BDD-01 must reject a different assertion, import/setup error, timeout, 126/127, spawn error, or unrelated failure; operator attestation alone is not enough once BDD-01 ships.
   - Commit the test-only result and handoff path/SHA.
4. **Green**
   - Parent creates a separate Implementer worktree from the integration branch plus the locked test commit.
   - Enter green only after recorded causal red.
   - Implement minimum production behavior; tests are read-only.
   - Run `bdd_assert_green` with the same or demonstrably broader command, then prove the focused assertion still executes through command-backed mutation/sensitivity for acceptance-changing packages.
5. **Refactor**
   - Optional serial refactorer; no concurrent implementer.
   - Re-run the covering green command after structural changes.
6. **Verify**
   - Run the root/local deterministic gate plan.
   - Use read-only breaker, fitness guardian, QA, and a default three-person Grok 4.5 review fleet where warranted.
   - Run mutation/sensitivity with command-backed evidence when acceptance changed.
   - Record dispositions and current clean-SHA evidence.
7. **Handoff**
   - Schema-valid RoleResult and BDD handoff.
   - Human reviews plan/findings/diff and decides whether to integrate.

### Test command matrix

These commands exist today and should be composed rather than replaced:

| Scope | Command |
|---|---|
| Pi personal pure libraries | `cd agents-shared/.agents/adapters/pi/personal && bun test lib` |
| Focused CAID | `cd agents-shared/.agents/adapters/pi/personal && bun test lib/worktree/caid.test.ts` |
| Focused trajectory | `cd agents-shared/.agents/adapters/pi/personal && bun test lib/trajectory` |
| Focused decisions | `cd agents-shared/.agents/adapters/pi/personal && bun test lib/decisions` |
| Pi/Herdr extension core | `cd pi && bun test` |
| Canonical AI resources | `python3 agents-shared/.agents/scripts/verify-ai-resources.py` (with its documented repo/home arguments when required) |
| Herdr config | `herdr config check` |
| Herdr runtime smoke | `herdr --version`, `herdr status`, `herdr integration status` |

GOV-01 should wrap these in a root deterministic command. Do not add a second JS test framework. Additional tools become gates only after a pinned local command exists.

### Agent model and context policy

- Requested/default fleet model: `xai/grok-4.5`.
- Use fresh context for Test Designer, Implementer, Breaker, Guardian, and QA.
- Use explicit model/thinking in every Herdr worker contract.
- Verification prompts are versioned; provider temperature/seed is recorded only when supported, never claimed universally.
- Context checkpoint at ~60%; compact/stop before ~80%; at most two focused follow-ups.
- Every worker reports changed paths, commands, evidence, SHA/dirty state, blockers, residual risks, and usage.

## Per-package validation contracts

`P` means `agents-shared/.agents/adapters/pi/personal`. The Test Designer creates the listed test file during formulation and must make it reach the existing public behavior; a missing import/module or setup failure is not accepted as red. Commands below are the focused commands to lock before implementation.

| WP | Role owner | Focused command after formulation | Expected causal red |
|---|---|---|---|
| GOV-01 | governance Test Designer | `python3 -m unittest tests.test_rules_contract` | profile/generation assertion says root canonical source or test command is absent/drifting |
| BASE-01 | baseline Test Designer | `cd P && bun test lib/bdd/playbook.test.ts lib/bdd/assurance-agents.test.ts` | tests lock canonical v1.2/August 2026, but runtime metadata still reports v1.0/July and the Test Designer role lacks an explicit required oracle/path/delegation contract |
| CMP-01 | compatibility Test Designer | `cd pi && bun test tests/herd-compat.test.ts` | current 0.7.5-only fixture/expectation rejects observed Herdr 0.8 behavior |
| CMP-02 | fleet transport Test Designer | `cd P && bun test lib/fleet/plan.test.ts lib/fleet/rpc.test.ts` | current plan sends removed top-level parallel payload |
| BDD-01 | BDD oracle Test Designer | `cd P && bun test lib/bdd/run-command.test.ts lib/bdd/quality-gates.test.ts` | unrelated assertion or untrusted shell command is incorrectly accepted |
| SEC-00 | fleet security Test Designer | `cd P && bun test lib/fleet/child-policy.test.ts` | child policy permits secret env/read, arbitrary bash/egress, or mutation |
| HOST-01 | host bootstrap Test Designer | `cd pi && bun test tests/herdr-bootstrap.test.ts` | injected absent/current/install-status fixture yields false success or non-idempotent plan |
| HOST-02 | WezTerm contract Test Designer | `cd pi && bun test tests/wezterm-herdr-contract.test.ts` | attach action/icon is absent or architecture fixture detects agent-state/mux duplication |
| CON-01 | schema Test Designer | `cd P && bun test lib/contracts` | invalid version/path/red-cause fixture validates or valid V1 fixture fails |
| RED-01 | security Test Designer | `cd P && bun test lib/security/redact.test.ts` | raw synthetic secret remains in serialized output bytes |
| HDR-01 | Herdr client Test Designer | `cd pi && bun test tests/herd-client.test.ts` | typed parser/wait/argv fixture misclassifies protocol, timeout, blocked, or unknown |
| ISO-01 | isolation Test Designer | `cd P && bun test lib/worktree/caid-lifecycle.test.ts lib/worktree/registry.test.ts` | aliased/nested path, split board, or concurrent lease is granted |
| ROLE-01 | role-contract Test Designer | `cd P && bun test lib/bdd/assurance-agents.test.ts` | a role receives forbidden tools/paths or emits an invalid result |
| ORC-01 | orchestrator Test Designer | `cd P && bun test lib/orchestrator` | façade advances outside BDD phase authority or duplicates state |
| OBS-01 | trajectory Test Designer | `cd P && bun test lib/trajectory` | seeded anti-pattern/secret/reload fixture evaluates clean or duplicates events |
| DEC-01 | decision Test Designer | `cd P && bun test lib/decisions` | contradictory accepted decision does not block or stale store passes |
| APR-01 | approval Test Designer | `cd P && bun test lib/approvals` | model/project-file approval or changed SHA is accepted |
| SEC-01 | security Test Designer | `cd P && bun test lib/security` | strict runtime allows fixture exfiltration, hidden mutation, unsafe gate, or unsupported overnight sandbox |
| BUD-01 | budget Test Designer | `cd P && bun test lib/bdd/cost-budget.test.ts lib/fleet/budget.test.ts` | missing usage reports `ok` or exceeded budget permits spawn |
| FIT-01 | fitness Test Designer | `cd P && bun test lib/bdd/quality-gates.test.ts lib/bdd/assurance-handoff.test.ts` | required internal/command failure, staleness, or missing result allows handoff |
| OPS-01 | operations Test Designer | `cd pi && bun test tests/herd-notification.test.ts tests/herd-cleanup.test.ts` | notification spam/timeout-success/unsafe cleanup fixture passes |
| PKG-01 | packaging Test Designer | `python3 agents-shared/.agents/scripts/verify-ai-resources.py --repo . --home "$HOME"` | staged manifest/package fixture is inconsistent; use a temporary HOME in automated tests |
| E2E-01 | QA Test Designer | `cd pi && bun test tests/high-assurance-e2e.test.ts` | seeded positive or negative golden workflow violates an invariant |

Each package’s `ValidationContractV1` stores its exact command, expected test id/signature, forbidden production paths before red SHA, covering green relation, and required sensitivity command. If the listed test path does not exist yet, formulation creates it and verifies the harness independently before red; setup/import failure remains neither color.

## Integration gates

| Gate | Required evidence | Blocks |
|---|---|---|
| **G0 — Governance** | Rulesync source/outputs deterministic; root BDD profile detects commands; generated files untouched manually | all rule and package work |
| **G1 — Compatibility** | accepted version matrix; Herdr 0.8 fixtures; Pi 0.84 lifecycle tests; package pins reviewed | new Herdr/orchestrator code |
| **G2 — Fleet transport and containment** | exact removed-payload regression green; SEC-00 child policy blocks mutation/secret/env/arbitrary egress | any live fleet dispatch |
| **G2-D — Fleet dogfood (advisory)** | real contained five-person Grok smoke yields runId/asyncDir and usage | operator confidence only; never substitutes for G2 |
| **G3 — Host bootstrap** | hermetic install-plan tests; operator smoke: stow idempotent, `herdr config check`, protocol compatible, Pi integration current | CAID Herdr spawn |
| **G4 — Contracts and red cause** | V1 valid/invalid/path fixtures plus BDD-01 expected-test-id and gate-command-trust fixtures green | any structured spawn/handoff or assurance green |
| **G5 — Isolation** | separate designer/implementer worktrees; collision hard-fail; writer lease/reconciliation current | writer delegation |
| **G6 — Orchestrator** | BDD remains phase authority; reload cleanup; no duplicate state; disable-path fallback works | dogfood |
| **G7 — Security** | strict profile blocks synthetic secret/exfil/write/gate-config bypasses across fleet, Herdr workers, gates, and web tools; required security gates available; overnight fails closed | FIT security integration and unattended/overnight mode |
| **G8 — Process evidence** | redacted trajectory; error anti-pattern suite clean; budget current; decision conflicts resolved | final handoff |
| **G9 — End-to-end** | golden story completes red/green/verify, review synthesis dispositioned, human exploratory review | broader rollout/publish |

### Gate truth rules

- A timeout is not red, green, pass, or completion.
- Missing usage is unknown, not zero; strict/overnight hard-budget policy blocks new spawns on unknown.
- Stale Herdr data is marked with age and cannot authorize cleanup.
- Dirty SHA evidence is diagnostic only.
- Required unavailable gate blocks; advisory unavailable gate is visible.
- A human approval is valid only for its exact plan fingerprint, paths, risk, and SHA.
- A roadmap recommendation is never reported as enforced evidence.

## Rollout and rollback

### Milestone 0 — Truthful and contained base (GOV-01, BASE-01, CMP-01, CMP-02, BDD-01, SEC-00)

- **Rollout:** local only; no live fleet until SEC-00.
- **Exit:** root tests and the canonical v1.2 playbook/role baseline, compatibility matrix, causal-red/gate-trust fixtures, contained child policy, and mocked fleet dispatch are green. Any Milestone 0 live Grok smoke is limited to a non-secret fixture with SEC-00 restrictions; product-code review fleets wait for SEC-01/G7.
- **Rollback:** revert governance/transport changes together; disable live fleets and use plan-only/manual workflowScript fallback.

### Milestone 1 — Reproducible host (HOST-01, HOST-02)

- **Rollout:** one MacBook first, then second MacBook, then Ubuntu.
- **Exit:** install/restow/attach/integration/config checks pass on each OS.
- **Rollback:** previous stow commit; disable attach key; uninstall generated Pi integration only after confirmation.

### Milestone 2 — Structured isolated roles (CON-01, RED-01, HDR-01, ISO-01, ROLE-01, DEC-01)

- **Rollout:** one low-risk fixture story; manual approval for every spawn.
- **Exit:** separate red/green worktrees and collision/cleanup refusal tests pass.
- **Rollback:** use manual CAID/Herdr skill path; keep schema parsing advisory.

### Milestone 3 — Observed orchestration (ORC-01, OBS-01, BUD-01)

- **Rollout:** orchestrator and trajectory enabled for dotfiles only; trajectory advisory. RED-01 is already mandatory for every sink.
- **Exit:** no duplicate FSM state, no raw secret events, budget attribution/unknown semantics work.
- **Rollback:** disable façade/logger; existing `/bdd`, `/fleet`, `/wt`, `/herd-task` remain operational.

### Milestone 4 — Required assurance (SEC-01, APR-01, FIT-01, OPS-01)

- **Rollout:** strict profile opt-in for interactive; required for overnight.
- **Exit:** security/recovery/approval tests and human dogfood pass.
- **Rollback:** demote newly flaky gates to advisory with recorded reason; overnight stays disabled rather than bypassing security.

### Milestone 5 — Package and expand (PKG-01, E2E-01)

- **Rollout:** version private personal package; adopt in selected product repo; publish a generic package only after machine paths and personal assumptions are removed.
- **Exit:** cross-machine install, golden workflow, review fleet, and human approval.
- **Rollback:** return to previous package tag and restow; project artifacts are additive and can be ignored by old versions.

### Global rollback constraints

- Never auto-delete a dirty worktree.
- Never transfer writer ownership on timeout/unknown state.
- Never auto-increase cost limits after a circuit break.
- Never remove a user-owned pane/workspace.
- Preserve old artifact paths until migration tests prove all consumers moved.
- Keep current user modifications to `pi/.pi/agent/settings.json`, `zsh/.zshrc`, and `codex/.codex/config.toml` out of implementation commits unless explicitly reconciled.

## Success metrics

### Reliability and process integrity

- After BDD-01, 100% of behavior-changing packages have machine-matched causal red before implementation; before BDD-01, causality is reported as operator-attested rather than machine-enforced.
- 100% of green runs cover their red command and acceptance-changing packages prove focused assertion sensitivity.
- 0 Test Designer/Implementer same-writable-tree collisions.
- 0 success handoffs after unresolved required gate failure.
- 0 auto-merges or unattended deploys.
- 100% of final evidence bound to a clean candidate SHA or explicitly reported non-passing dirty state.

### Operations

- Herdr Pi integration current on every managed machine.
- ≥99% of background agent state polls succeed or show explicit stale age.
- Blocked-agent notification latency within one configured poll interval plus toast delay.
- Timeout recovery uses at most two focused resumes.
- 0 worktrees deleted while dirty or while writer state is working/blocked/unknown.

### Quality

- No regression in existing `bun test lib`, `cd pi && bun test`, or AI-resource verification.
- Required project gates pass at current plan fingerprint.
- Mutation/coverage/doctor/security thresholds are enforced only by configured commands and tracked per adopted project.
- Golden trajectory suite catches all seeded error-level anti-pattern fixtures.

### Cost and performance

- 100% of fleet/role runs have usage attribution or explicit `unknown`.
- 0 spawns after hard budget circuit break.
- Fleet count > configured threshold requires human confirmation.
- Pi UI/Herdr polling adds no unbounded process loop; render/poll work is cached and serialized.

### Adoption and ergonomics

- New machine reaches WezTerm → Herdr → Pi with one documented install/restow flow plus provider login.
- Operators can identify role, worktree, phase, blocked state, gate state, and budget without opening raw logs.
- Existing `/bdd`, `/fleet`, `/wt`, `/herd-task`, and `/reload` workflows remain available.
- Human exploratory review rates the workflow understandable before strict mode becomes default.

## Implementation start checklist

The start gate is split so the controls needed to unlock later work can themselves be implemented without a circular prerequisite.

### Gate A — Wave 0 bootstrap

Only GOV-01, BASE-01, CMP-01, CMP-02, BDD-01, and SEC-00 may start when every item below is true:

- [ ] Human selected workspace A/B/C and approved the exact branch/worktree; pre-existing dirty changes are committed, stashed, or explicitly excluded.
- [ ] One parent integration owner and one writer per worktree are recorded.
- [ ] The active Wave 0 package’s ValidationContractV1 locks its focused command, expected assertion/test id, forbidden production paths before red SHA, covering green relation, and sensitivity command.
- [ ] Decisions needed by that package are accepted; later decisions are explicitly deferred to their owning package and cannot be consumed early.
- [ ] CMP-02 live dogfood remains disabled until SEC-00 is green; mocked transport fixtures are allowed.

An unchecked Gate A item permits read-only discovery/formulation only.

### Gate B — Runtime expansion

HOST-01 and every later runtime package remain blocked until every item below is true:

- [ ] Rulesync output map and tested version policy are approved.
- [ ] GOV-01 root BDD command, BASE-01 canonical v1.2 package baseline, CMP-01 matrix, CMP-02 mocked transport, BDD-01 causal-red/gate trust, and SEC-00 containment are green.
- [ ] No live fleet or Herdr writer was launched before its required containment/integration gate.
- [ ] The next package’s ValidationContractV1 satisfies the same Gate A contract.
- [ ] Decisions required by the next package are accepted or explicitly deferred with a blocking reason that prevents dependent work.

An unchecked Gate B item blocks runtime expansion, not the Wave 0 packages that establish the gate.

## Human decisions required

Implementation must pause for these decisions:

**Accepted Wave 0 ownership adjustment:** BASE-01 owns the minimal canonical v1.2 playbook metadata and bounded Test Designer baseline repair before BDD-01. ROLE-01 remains the later owner for broader role-schema/tool-policy evolution; tests may not be weakened or the canonical document downgraded.

1. **Workspace:** choose A/B/C and resolve the current dirty checkout. Recommended: a new integration worktree from a clean base.
2. **Rulesync target map:** confirm which generated tools belong in this dotfiles repo and how the inherited `/Users/leonardoribeiro/AGENTS.md` relates to repo-local generated output. The authoring source must be `rulesync.jsonc` + `.rulesync/**`.
3. **Version policy:** exact tested pins or supported ranges for Pi, Herdr, pi-subagents, context-mode, pi-markdown-preview, pi-web-access, and Rulesync.
4. **Herdr install policy on Ubuntu:** approved official channel and whether missing Herdr is fatal or an explicit degraded mode.
5. **WezTerm launch UX:** keybinding/launcher item (recommended) versus auto-start Herdr on every terminal launch.
6. **Security backend:** official sandbox runtime, Gondolin microVM, or a staged combination; confirm acceptable dependencies and performance.
7. **Trust defaults:** whether strict mode is opt-in interactively (recommended) and mandatory overnight (recommended).
8. **Approval persistence:** extension-only session plus mode-0600 machine-local authority (recommended v1) versus a separately signed approval store; project files are never authoritative.
9. **Budget thresholds:** approve or change the current playbook defaults before they become hard.
10. **Automatic CAID apply:** keep plan/apply human-confirmed in v1 (recommended) or auto-create worktrees on phase transitions after dogfood.
11. **Packaging:** keep `leo-pi-personal` private for v1 (recommended) or immediately extract a publishable package.
12. **Rollout repo:** choose the first low-risk product repository for Milestone 5 after dotfiles dogfood.
13. **Remote scope:** keep `herdr --remote` out of v1 (recommended) or fund a separate SSH host-key/authz/secret-boundary threat model.
14. **Identity scope:** confirm v1 assumes one trusted local console operator; multi-user authorization is out of scope.

## Source anchors

Repository evidence used for this plan:

- `README.md`, `install.sh`, `Brewfile`
- `wezterm/.config/wezterm/{wezterm.lua,tabbar.lua}`
- `pi/DESIGN.md`, `pi/docs/pi-herdr-{example-map,acceptance}.md`, `pi/tests/**`
- `pi/.pi/agent/{settings,fleet}.json`, `pi/.pi/bdd.json`
- `agents-shared/.agents/adapters/pi/personal/extensions/**`
- `agents-shared/.agents/adapters/pi/personal/lib/{bdd,fleet,worktree,trajectory,decisions}/**`
- `agents-shared/.agents/adapters/pi/personal/skills/{bdd-tdd,caid,trajectory,ship,herdr,herdr-delivery-supervisor,agentic-fleet}/**`
- `agents-shared/.agents/adapters/pi/personal/docs/high-assurance-{playbook,pi-implementation}.md`

Official API references:

- Pi extensions/packages/skills/TUI: installed `@earendil-works/pi-coding-agent/docs/*.md`
- Herdr: `https://herdr.dev/docs/`, especially agents, socket API, configuration, keyboard, and agent automation
- WezTerm config/launch: `https://wezterm.org/config/files.html`, `https://wezterm.org/config/launch.html`
- Rulesync: `https://github.com/dyoshikawa/rulesync`

## Fleet synthesis used in planning

A five-person Grok 4.5 research fleet examined primary sources, recent compatibility, practitioner operations, architecture alternatives, and risks. Strong agreement:

- compose rather than rebuild;
- repair the missing Pi integration and fleet dispatch first;
- keep WezTerm thin and Herdr authoritative;
- distinguish enforced controls from scaffolding;
- wire CAID/trajectory/budgets incrementally;
- treat security and supply-chain boundaries as prerequisites for overnight autonomy;
- serialize shared entrypoints and all writers.

Main disagreement was sequencing: operations favored writer leases/cleanup early, security favored sandboxing early, and architecture favored contracts/trajectory wiring first. This plan resolves it with start-gated foundation lanes, one primary writer lease store, mandatory pre-persistence redaction, and strict unattended mode waiting for all controls.

## Independent review synthesis

A three-person Grok 4.5 verify panel reviewed correctness, tests, and security. `fleet_dispatch` was attempted first as required but reproduced the known transport failure; the generated persona plan was executed through pi-subagents `workflowScript`. Because that fallback did not produce a fleet runId/ledger directory, these findings are independent review evidence but are not misreported as a BDD fleet-ledger pass.

### Agreements

- Layer ownership and rejection of a mega-extension are sound.
- Existing enforced/scaffold/missing labels are honest.
- The BDD protocol, human authority, conservative cleanup, and staged rollout are directionally strong.
- Shared entrypoints must be serialized and all production work must start after causal red.

### Accepted blockers and actions

- **Fleet payload ownership:** CMP-02 now owns `lib/fleet/plan.ts`, where the removed payload is built.
- **Split writer authority:** `.pi/worktree-board.json` is now the single lease authority; CAID board is assignment history only.
- **Causal red:** BDD-01 adds expected test-id/signature matching and sensitivity evidence.
- **Fleet containment:** SEC-00 blocks live fleets until tool/env/secret/egress policy is enforceable.
- **Untrusted gate RCE:** BDD-01/SEC-01 add gate-command trust, sanitized execution, and strict config integrity.
- **Redaction ordering:** RED-01 is the sole pre-persistence redactor and precedes OBS-01.
- **Missing decision owner:** DEC-01 now owns decision pre-action/handoff gates.
- **Broken DAG edges:** Wave 2 is split into start-gated 2a/2b; FIT-01 follows SEC-01.
- **Path overlap:** the Ownership transfer table assigns each shared path serially.
- **Weak package contracts:** the Per-package validation contracts table supplies owner, focused command, and causal red for every package.
- **Gate model:** FIT-01 extends one canonical command/internal result model instead of creating a second enum.
- **Budget unknown:** BUD-01 explicitly changes missing usage from `ok` to `unknown` and fails closed for strict/overnight spawns.
- **BDD/FIT shared files:** the ownership table now transfers canonical gate types, quality gates, and `bdd-mode.ts` from BDD-01 to FIT-01.
- **Fleet-agent containment:** ROLE-01 now depends on SEC-00 but never owns `fleet-*.md`; ownership transfers only from SEC-00 to the stricter SEC-01.

### Remaining disagreements and conservative resolutions

- A real Grok fleet smoke is useful operational evidence but not deterministic; it remains advisory while mocked transport fixtures are required.
- Prompt role contracts are useful but not security boundaries; SEC-00/SEC-01 and BDD path gates must enforce them.
- Live Herdr integration tests mutate operator state; hermetic bootstrap tests are required, while the live install remains explicit operator acceptance.

### Residual risks

- OS sandbox choice and cross-platform performance remain human decisions.
- Regex/heuristic redaction cannot prove absence of every secret class.
- Local-console approval is not multi-user authentication.
- Herdr, Pi, and pi-subagents APIs can drift after the tested version matrix.
- Cooperative worktree isolation cannot prevent all same-user cross-tree reads without an OS boundary.

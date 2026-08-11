# ROLE-01 Example Map — Role Contract and Skill Reconciliation

## Story and approved personas

**As Leo (A), Maya (B), Nikhil (C), Sofia (D), and André (E) from `docs/bdd/TARGET_PUBLIC.md`,**
**we need each ROLE-01-owned BDD agent and its orchestration skills to use one bounded V1 request/result contract,**
**so role separation is portable, ambiguity fails closed, and prompt guidance is never mistaken for runtime authority.**

| Persona | ROLE-01 need |
|---|---|
| **Leo (A)** | Exact role focus, path ownership, launch profile, evidence, and stop conditions without hidden delegation. |
| **Maya (B)** | A concise result whose status, commands, findings, risks, and authority limits can be reviewed quickly. |
| **Nikhil (C)** | No ambient authority, no mutation path for ROLE-owned reviewers, and no prompt-only security claim. |
| **Sofia (D)** | Stable blocked behavior and a clear recovery question when a high-risk input is absent or ambiguous. |
| **André (E)** | Additive compatibility with CON-01 `RoleRequestV1` / `RoleResultV1`, existing role names, and existing skills. |

## Scope and authority lock

- **Owned role prompts:** `bdd-specifier.md`, `bdd-test-designer.md`, `bdd-implementer.md`, `bdd-breaker.md`, `bdd-refactorer.md`, and `bdd-qa.md`.
- **Owned skills:** `bdd-tdd`, `caid`, `trajectory`, `ship`, and `herdr-delivery-supervisor` only.
- **Optional support:** no new skill unless these five skills cannot express the validated contract. Discovery found no such gap, so V1 adds no skill.
- **Tests:** `lib/bdd/assurance-agents.test.ts` only.
- **Forbidden:** `agents/bdd-fitness-guardian.md`; `lib/bdd/{types,quality-gates,assurance-handoff}*`; `extensions/bdd-mode.ts`; fleet child/security policy; worktree lifecycle production; budget, trajectory, and agentic-fleet production.
- **Merged dependencies:** CON-01 supplies closed V1 validation; ISO-01 supplies lease/worktree authority; SEC-00 supplies fleet containment. ROLE-01 composes them and grants none of their authority.
- **V1 request:** a validated CON-01 `RoleRequestV1` supplies `schemaVersion: 1`, task/focus (`taskId` + `goal`), phase, write scope, locked artifact refs, `ownedPaths`, `forbiddenPaths`, tools, model, thinking, and budget.
- **V1 result:** a validated CON-01 `RoleResultV1` supplies role/schema version, task/role, status, SHA/dirty state, changed files, commands/evidence, finding artifact refs, blockers, residual risks/questions, and usage.
- **Authority notice:** request and result fields are bounded evidence, not approval, writer lease, phase-transition, assurance, cleanup, PR, merge, or release authority.

## Rules and examples

### R1 — Every owned prompt is concise, named, and versioned

Each owned prompt declares **Role contract v1**, keeps its existing canonical `bdd-*` name, and consumes only exact CON-01 V1 envelopes.

- **R1-E1 (André):** `bdd-specifier` remains the runtime name after adding Role contract v1.
- **R1-E2 (André):** `bdd-test-designer` remains one agent definition; no duplicate Test Designer skill is created.
- **R1-E3 (André):** `bdd-implementer` remains one agent definition; no duplicate Implementer skill is created.
- **R1-E4 (Maya):** a handoff stating schema version 2 is blocked instead of silently downgraded.
- **R1-E5 (Sofia):** a missing role contract version produces `blocked`, not an improvised legacy completion.
- **R1-E6 (Leo):** incidental prose can evolve while the literal V1 envelope and role boundaries stay stable.

### R2 — RoleRequestV1 locks task, focus, and inputs before action

A role starts only from a validated request containing task/focus and path-based locked inputs; chat lore and unbounded pasted transcripts are not substitutes.

- **R2-E1 (Leo):** `taskId` identifies the package while `goal` states the role-specific focus.
- **R2-E2 (Maya):** artifact references name the approved Example Map, feature, test, or diff rather than pasting a transcript.
- **R2-E3 (Nikhil):** an unknown request field is refused by CON-01 before spawn.
- **R2-E4 (Sofia):** an absent locked specification blocks Test Designer work with one explicit question.
- **R2-E5 (André):** legacy Markdown may be read only through the explicit assurance-ineligible adapter; it cannot become V1 by appearance.
- **R2-E6 (Leo):** a role does not broaden its goal because another interesting repository problem is visible.

### R3 — Owned and forbidden paths are explicit and non-overlapping

Every role request lists repository-relative `ownedPaths` and `forbiddenPaths`; the prompt narrows behavior further but never grants a lease.

- **R3-E1 (Leo):** Test Designer receives test/spec owned paths and production forbidden paths.
- **R3-E2 (Leo):** Implementer receives production owned paths and test/spec forbidden paths.
- **R3-E3 (Nikhil):** overlapping owned and forbidden paths fail validation before work.
- **R3-E4 (Sofia):** an unlisted path needed for completion causes `blocked` plus a scope question.
- **R3-E5 (André):** repository-relative paths preserve CON-01 compatibility; absolute worktree paths stay runtime facts outside artifact refs.
- **R3-E6 (Maya):** changed paths outside `ownedPaths` prevent a completed result from being accepted.

### R4 — Test Designer cannot write production

The Test Designer may write only specification and test paths and may not change production implementation, dependencies, gates, thresholds, or deploy configuration.

- **R4-E1 (Leo):** adding a failing unit test under a locked test path is allowed.
- **R4-E2 (Leo):** adding persona-driven Gherkin under a locked specification path is allowed.
- **R4-E3 (Nikhil):** editing a production module to manufacture red is forbidden.
- **R4-E4 (Maya):** weakening a quality threshold to make a test pass is forbidden.
- **R4-E5 (Sofia):** a required production seam missing from the public contract becomes a blocker for the parent, not a Test Designer edit.
- **R4-E6 (André):** the existing contracts/invariants, fuzz, differential, and golden-master responsibilities remain intact.

### R5 — Implementer cannot write tests or acceptance artifacts

The Implementer changes only production paths needed for the locked red and treats tests, specifications, acceptance artifacts, thresholds, and reviewer evidence as immutable.

- **R5-E1 (Leo):** a minimum production prompt change that satisfies the named red is allowed.
- **R5-E2 (Nikhil):** deleting or skipping the named test is forbidden.
- **R5-E3 (Maya):** changing the feature file after red invalidates the handoff rather than becoming green.
- **R5-E4 (Sofia):** contradictory locked tests cause `blocked` with a question instead of guessed test edits.
- **R5-E5 (André):** gate config remains owned by its existing package, not by the Implementer.
- **R5-E6 (Leo):** broader refactoring waits for the Refactorer phase even when it looks beneficial.

### R6 — Specifier and ROLE-owned verification roles have no mutation path

Specifier, Breaker, and QA are read-only and receive no `edit`, `write`, or unrestricted `bash` tool. The forbidden Fitness Guardian remains FIT-owned and unchanged.

- **R6-E1 (Nikhil):** Specifier tools are exactly read/search/list capabilities.
- **R6-E2 (Nikhil):** Breaker cannot mutate fixtures through shell because no shell tool is present.
- **R6-E3 (Nikhil):** QA cannot alter a cache, server, or repository through shell because no shell tool is present.
- **R6-E4 (Maya):** a reviewer reports a reproduction command as proposed/not-run when no safe executor is available.
- **R6-E5 (Leo):** read-only findings reference files and evidence; `changedPaths` is empty.
- **R6-E6 (André):** ROLE-01 does not edit `bdd-fitness-guardian.md` to force cross-package uniformity.

### R7 — Refactorer is a serial production-only writer after green

Refactorer may change only owned production paths in refactor phase, must preserve behavior, and may not change tests, acceptance, gates, or thresholds.

- **R7-E1 (Leo):** a small duplication reduction under a locked green command is allowed.
- **R7-E2 (Maya):** a public behavior change is blocked even if the refactor looks cleaner.
- **R7-E3 (Nikhil):** mutation of tests to accommodate the refactor is forbidden.
- **R7-E4 (Sofia):** absent current green evidence blocks the role with a recovery question.
- **R7-E5 (André):** the Refactorer remains a serial writer and never overlaps the Implementer lease.
- **R7-E6 (Leo):** a complexity improvement outside owned paths is reported as residual risk, not edited.

### R8 — Model, thinking, tools, and budgets are explicit and bounded

Each role has a bounded default launch profile. A validated request may lower it or select a permitted model, but cannot exceed the role ceiling or ambient runtime policy.

- **R8-E1 (Leo):** every owned prompt declares an explicit default model and thinking level.
- **R8-E2 (Maya):** every owned prompt declares exact tools rather than inheriting ambient tools.
- **R8-E3 (Nikhil):** a request for an undeclared tool blocks before role action.
- **R8-E4 (Sofia):** missing model, thinking, or budget data blocks with a specific request correction.
- **R8-E5 (André):** budget uses CON-01 `maxTokens`, `maxCostUsd`, and `maxDurationMs` and stays below published role ceilings.
- **R8-E6 (Leo):** exhaustion produces `blocked` or `unknown` with usage evidence; the role never raises its own limit.

### R9 — Delegation defaults to none

All owned roles plainly prohibit running, launching, or delegating to subagents or fleets. Only a future separately validated orchestrator contract plus an actual tool capability may create an exception; ROLE-01 V1 grants none.

- **R9-E1 (Nikhil):** no owned role includes `subagent` in tools.
- **R9-E2 (Leo):** Test Designer cannot ask a fleet to write additional tests.
- **R9-E3 (Leo):** Implementer cannot launch a helper to edit production.
- **R9-E4 (Maya):** Breaker cannot turn its finding into a fixer delegation.
- **R9-E5 (Sofia):** a role that needs specialist input returns a blocker/question to the parent.
- **R9-E6 (André):** duplicated no-delegation wording remains machine-checkable in plain text, not markdown emphasis alone.

### R10 — High-risk ambiguity blocks

Ambiguity involving security, data, architecture, public API, destructive operations, authority, path scope, locked evidence, or contradictory requirements must return `blocked` rather than guess.

- **R10-E1 (Nikhil):** uncertainty about secret-bearing artifacts blocks without reading them.
- **R10-E2 (Maya):** uncertainty about human approval never becomes model-emitted approval.
- **R10-E3 (Leo):** contradictory owned/forbidden scope is rejected before any edit.
- **R10-E4 (Sofia):** a blocked result names the exact unresolved question and safe parent action.
- **R10-E5 (André):** unsupported schema version blocks rather than invoking a compatibility heuristic.
- **R10-E6 (Nikhil):** missing lease or worktree facts do not become an inferred writer grant.

### R11 — RoleResultV1 is the only completion handoff shape

Every owned role returns a schema-ready V1 result with task/role/status, SHA/dirty state, changed files or finding refs, command claims/evidence, blockers, residual risks/questions, and usage.

- **R11-E1 (Maya):** writer results list exact changed files and command exit codes.
- **R11-E2 (Maya):** read-only results use `changedPaths: []` and put findings in bounded artifact/evidence refs.
- **R11-E3 (Sofia):** unresolved questions are represented in `blockers` or `residualRisks`, not an unknown `questions` field.
- **R11-E4 (Nikhil):** missing usage is `unknown`, never fabricated as zero.
- **R11-E5 (Leo):** a dirty result says dirty and cannot be presented as clean SHA evidence.
- **R11-E6 (André):** completed-with-blockers remains invalid under CON-01.

### R12 — Results never claim authority

A role result is evidence only. It cannot approve a plan/diff, grant a lease, advance BDD phase, certify assurance, authorize cleanup, or merge/release.

- **R12-E1 (Maya):** Test Designer reports causal red but does not claim green or ship readiness.
- **R12-E2 (Leo):** Implementer reports local green but does not claim final handoff authority.
- **R12-E3 (Nikhil):** a reviewer finding of “no blockers” does not become merge approval.
- **R12-E4 (Sofia):** a QA pass does not hide required human exploratory testing.
- **R12-E5 (André):** Markdown render remains derived and non-authoritative.
- **R12-E6 (Nikhil):** model-emitted approval, lease, or capability fields remain invalid unknown fields.

### R13 — Prompt policy and runtime enforcement stay distinct

Role text is defense-in-depth guidance. CON-01 validation, ISO-01 leases/realpaths, SEC-00/SEC-01 capability policy, and BDD path/gate controls provide their respective enforcement; ROLE-01 does not claim otherwise.

- **R13-E1 (Nikhil):** “must not write” in a prompt is not described as an OS sandbox.
- **R13-E2 (Leo):** owned paths in a request do not grant a writer lease.
- **R13-E3 (Maya):** a valid result does not prove commands ran unless trusted execution evidence exists.
- **R13-E4 (Sofia):** prompt refusal and runtime denial use separate, understandable explanations.
- **R13-E5 (André):** skills direct callers to validate before spawn and before accepting results.
- **R13-E6 (Nikhil):** ROLE-01 never modifies fleet containment or BDD enforcement production to make prompt claims appear enforced.

### R14 — Existing skills reconcile around one contract without bloat

`bdd-tdd`, `caid`, `trajectory`, `ship`, and `herdr-delivery-supervisor` reference the same V1 boundary and preserve existing orchestration compatibility.

- **R14-E1 (André):** `bdd-tdd` requires validated requests/results while retaining red-before-green semantics.
- **R14-E2 (Leo):** `caid` identifies assignment history as non-authoritative and lease authority as ISO-owned.
- **R14-E3 (Nikhil):** `trajectory` records only validated/redacted role-result references and does not grant authority.
- **R14-E4 (Sofia):** `ship` stops when a request/result is invalid or high-risk ambiguity remains.
- **R14-E5 (Maya):** `herdr-delivery-supervisor` validates before spawn/accept and keeps timeout as unknown.
- **R14-E6 (André):** no duplicate role skill or new support skill is created because the existing surfaces are sufficient.

## Resolved questions

| ID | Question | Resolution |
|---|---|---|
| Q1 | Is a new specifier/designer/implementer skill needed? | **No.** Strengthen existing agents and five orchestration skills. |
| Q2 | What is the machine contract? | CON-01 `RoleRequestV1` and `RoleResultV1`, exact `schemaVersion: 1`. |
| Q3 | How are focus and locked inputs represented? | `taskId` + `goal`, with locked path-based inputs in `artifacts`. |
| Q4 | How are questions represented without changing CON-01? | Blocking questions go in `blockers`; non-blocking questions/uncertainty go in `residualRisks` or a bounded artifact ref. |
| Q5 | Does a prompt grant write access? | **No.** Tools, BDD gates, SEC policy, and ISO lease authority remain external enforcement. |
| Q6 | May roles delegate? | **No in V1.** A future exception requires a new validated orchestrator contract and actual capability; prompt text alone is insufficient. |
| Q7 | Do read-only ROLE-owned reviewers retain bash? | **No.** Unrestricted shell is a mutation path; they return proposed/not-run commands when no safe executor is supplied. |
| Q8 | What about Fitness Guardian bash? | `bdd-fitness-guardian.md` is explicitly forbidden/FIT-owned and remains untouched; ROLE-01 tests preserve but do not rewrite that boundary. |
| Q9 | May a request override model/thinking? | Only within runtime policy and at or below the role ceiling; invalid/missing launch data blocks. |
| Q10 | May a role increase budget? | **No.** Exhaustion blocks; only the parent/human may issue a new validated request. |
| Q11 | What statuses are legal? | CON-01 `completed`, `blocked`, `failed`, or `unknown`; uncertainty is never upgraded. |
| Q12 | Does local green authorize merge/handoff? | **No.** It is command evidence only. Parent gates and human authority remain final. |
| Q13 | Are role prompt tests enforcement tests? | **No.** They are prompt/schema regression tests; enforcement remains in merged or future owner packages. |
| Q14 | Are production contract schemas changed? | **No.** ROLE-01 consumes CON-01 and changes prompts/skills/tests/docs only. |
| Q15 | Is a support skill demonstrably missing? | **No.** Contract-first validation, security boundaries, and selective formal guidance already fit the existing skills/roles. |
| Q16 | How is compatibility preserved? | Existing role names, phase mapping, BASE-01 Test Designer rules, CAID workflow, and skill entry points remain additive and green. |

## Counts

- **Rules:** 14
- **Concrete examples:** 84
- **Resolved questions:** 16
- **Open questions:** 0

## ValidationContractV1

- **Package:** `ROLE-01`
- **Focused command:** `cd agents-shared/.agents/adapters/pi/personal && bun test lib/bdd/assurance-agents.test.ts`
- **Expected test id:** `ROLE01_ROLE_CONTRACT_MISSING: owned roles require bounded V1 request and result contracts`
- **Expected failure signature:** `ROLE01_ROLE_CONTRACT_MISSING`
- **Causal red:** the test reaches existing role/skill Markdown and fails because V1 launch/handoff/boundary clauses are absent; timeout, import/setup failure, 126, or 127 is not red.
- **Locked test paths:** `lib/bdd/assurance-agents.test.ts` and these two ROLE-01 formulation documents.
- **Forbidden before red proof:** all six owned role prompts and all five owned skills.
- **Covering green:** exact focused command, then complete `bun test` in the personal package.
- **Mutation:** temporarily remove the Test Designer production-write prohibition **or** the Implementer test-write prohibition; the named separation test must fail with `ROLE01_ROLE_CONTRACT_MISSING`; restore and pass.

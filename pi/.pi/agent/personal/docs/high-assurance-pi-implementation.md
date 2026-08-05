# Pi Implementation Profile for the High-Assurance Playbook

**Companion to:** [`high-assurance-playbook.md`](./high-assurance-playbook.md) **v1.2** — August 2026  
**Repo:** [VerstandTech/dotfiles](https://github.com/VerstandTech/dotfiles) · package `pi/.pi/agent/personal`

The canonical playbook is the normative target. This profile states honestly what the current personal Pi package enforces, what projects can opt into through deterministic commands, what **scaffolding** v1.2 adds, and what remains roadmap work. It never installs tools, calls the network for stack discovery, or turns a named 2026 product into an unpinned automatic command.

## Enforced now (runtime gates)

1. **Deterministic phase ownership** — `bdd-mode.ts` owns discovery → formulation → red → green → refactor → verify transitions and path/tool gates.
2. **Red before implementation** — `bdd_assert_red` must record a real failing test before production paths and green are allowed.
3. **Offline project profiling** — `project-profile.ts` derives stable stack, package-manager, framework, command, signal, and SHA-256 fingerprint data from repository artifacts.
4. **Ordered fail-closed gates** — `quality-gates.ts` compiles and runs format → static → types → unit → acceptance → property → coverage → mutation → architecture → doctor → security → performance. Missing, timed-out, spawn-failed, or non-zero required gates block.
5. **Fresh evidence** — assurance evidence must postdate green and match the current deterministic plan fingerprint.
6. **Separation of powers (policy)** — seven fresh-context role contracts divide specification, test design, implementation, refactoring, adversarial review, fitness review, and QA.
7. **One writer** — writer roles are serial in one confirmed branch/worktree; verification roles are read-only by contract.
8. **Bounded delegation** — `bdd_delegate_role` validates phase, role, workspace confirmation, and a narrow task before launching one pi-subagent.
9. **Auditable handoff** — red/green, acceptance, mutation, CRAP, assurance results, exact fleet synthesis, and finding dispositions are persisted and checked.
10. **Human authority** — the extension never autonomously merges or ships.
11. **Worktree board writer caps** — `worktree-board` enforces `maxBusyWriters` and focus metadata.

Use:

```text
/bdd playbook
/bdd profile
/bdd gates
bdd_assurance_plan
/wt list
```

## Scaffolding added in v1.2 (library + docs; wire into extensions incrementally)

These modules are **tested pure libraries** and operator docs. They are ready for skills and future extension commands; they are **not** yet universal hard gates inside `bdd-mode.ts` unless a project wires them.

| Capability | Path | Status |
|------------|------|--------|
| **CAID** plan/handoff/collision | `lib/worktree/caid.ts`, skill `skills/caid` | Scaffold + unit tests — use from orchestrator / human-driven spawn |
| **Trajectory** evaluate + anti-patterns + golden stub | `lib/trajectory/*`, skill `skills/trajectory` | Scaffold + unit tests — invoke in verify/CI |
| **Decision store** (Requirements-as-Code) | `lib/decisions/*`, `templates/decisions.store.json` | Scaffold + unit tests — project JSON under `docs/decisions/` |
| **Cost budgets** | `lib/bdd/cost-budget.ts` | Scaffold + unit tests — Orchestrator should evaluate before/after runs |
| **Overnight rhythm** | `docs/overnight-rhythm.md` | Operational runbook |
| **AGENTS.md template** | `templates/AGENTS.md` | Copy into product repos |
| **Stricter Test Designer contract** | `agents/bdd-test-designer.md` | Prompt-level CAID isolation strengthened |

## Configurable through deterministic project commands

The following playbook controls can become hard gates when a repository supplies commands in `.pi/bdd.json` or matching local scripts/tools:

- formatting, static analysis, type checks
- unit, acceptance/Gherkin, property, and scripted QA tests
- coverage thresholds and mutation score
- architecture, dependency direction, complexity/CRAP, and duplication checks
- doctor/health scanners
- security, SAST, dependency/SCA, license, secret, and supply-chain checks
- performance, latency, resource, concurrency, jitter, race, and bounded chaos checks
- trajectory/action assertions, runtime contracts, differential/golden-master checks, fuzzing, and semantic-stability checks
- formal verification/model checking
- replay/cassette and prompt/skill/schema regression suites
- cost/token/iteration budgets when the configured command or surrounding Pi/subagent policy returns a failing status
- decision-store validation scripts when provided by the project

The extension records threshold numbers as policy metadata, but the configured command must enforce each threshold with its exit status. It does not parse ambiguous prose output and claim a metric passed.

### Command precedence

1. `assurance.commands.<gate>` exact override
2. `.pi/bdd.json` `commands.*`
3. existing project/package scripts
4. conservative local ecosystem defaults
5. unavailable

There are no implicit installs, remote tool probes, or automatic `@latest` commands.

## Role mapping

| Playbook role | Pi role/surface | Enforcement |
|---|---|---|
| Orchestrator / Blueprint Engine | deterministic `bdd-mode.ts` + pure `lib/bdd/*` + CAID planner helpers | Phase/action/gate policy is code, not an LLM decision |
| Specifier | `bdd-specifier` | Read-only specs, examples, contracts, risks, unresolved approvals |
| Test Designer / Property Agent | `bdd-test-designer` (+ CAID skill) | Test-only writer; CAID worktree+fresh-pi recommended |
| Implementer | `bdd-implementer` | Production-only minimum change; locked tests |
| Critic / Breaker | `bdd-breaker` | Read-only adversarial verifier |
| Architect / Fitness Guardian | `bdd-fitness-guardian` | Read-only deterministic gate and structural evidence; trajectory eval recommended |
| Refactorer | `bdd-refactorer` | Serial production writer under green behavior |
| QA / Performance | `bdd-qa` | Read-only scripted, budget, concurrency, recovery, and chaos evidence |
| Human Operator | parent/human | Workspace, plan/findings/diff approvals and final merge authority |

Tool allowlists and fresh contexts reduce correlated failures. They are policy controls, not an OS sandbox; high-risk deployments should add read-only containers, microVMs, or isolated worktrees with default-deny egress.

## Roadmap / not yet enforced

These canonical-playbook capabilities are not universal built-in guarantees yet:

- automatic CAID worktree creation from `/bdd` phase transitions (helpers exist; extension wiring pending)
- provider-level temperature, seed, grammar-decoding, model-version, and prompt-schema pinning across every provider
- cryptographic approval payloads and a general risk-policy engine
- private-test isolation that is technically inaccessible to the Implementer rather than context-minimized by orchestration
- semantic-stability dashboards across repeated model runs
- full trajectory scoring + golden-task regression **in CI by default** (libraries ready; project must adopt)
- event-sourced project memory beyond the JSON decision store
- gateway-level spend/latency enforcement across every model provider (local budget helpers ready)
- mandatory SAST/SBOM/license/secret scanners in repositories that have not configured them
- formal methods for projects without explicit local verifier commands
- OS-enforced read-only child sandboxes and default-deny network policy
- automated overnight queue runner (runbook only)
- enforcement of multi-agent launches that bypass registered model tools through unrelated slash-command surfaces

Projects should adopt these controls incrementally according to risk. A roadmap item must never be reported as passed evidence merely because the canonical playbook recommends it.

## Operator workflow (v1.2)

1. Confirm branch/worktree, dirty-tree handling, one writer, and risk level.
2. Read the canonical playbook v1.2 and this profile.
3. Ensure project `AGENTS.md` + decision store exist (copy templates if needed).
4. Run `/bdd profile` and `/bdd gates`; configure missing required commands explicitly.
5. For multi-role work: **plan CAID** assignments; spawn Test Designer first; prove red.
6. Spawn Implementer on a separate CAID worktree; green minimum.
7. Evaluate trajectory + cost budget; run deterministic gates + breaker/guardian/QA.
8. Require findings approval, then inspect the final diff.
9. Record mutation, acceptance, assurance, dispositions, trajectory artifact.
10. Run `bdd_handoff`; human retains final merge authority.
11. Optional: queue remaining locked tasks for overnight (see `overnight-rhythm.md`).

## Tests for new scaffolding

```bash
cd ~/dotfiles/pi/.pi/agent/personal
bun test lib/worktree/caid.test.ts
bun test lib/trajectory
bun test lib/decisions
bun test lib/bdd/cost-budget.test.ts
bun test lib/bdd
bun test lib/worktree
```

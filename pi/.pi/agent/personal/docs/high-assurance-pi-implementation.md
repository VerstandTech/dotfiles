# Pi Implementation Profile for the High-Assurance Playbook

**Companion to:** [`high-assurance-playbook.md`](./high-assurance-playbook.md) v1.0 — July 2026

The canonical playbook is the normative target. This profile states honestly what the current personal Pi package enforces, what projects can opt into through deterministic commands, and what remains roadmap work. It never installs tools, calls the network for stack discovery, or turns a named 2026 product into an unpinned automatic command.

## Enforced now

1. **Deterministic phase ownership** — `bdd-mode.ts` owns discovery → formulation → red → green → refactor → verify transitions and path/tool gates.
2. **Red before implementation** — `bdd_assert_red` must record a real failing test before production paths and green are allowed.
3. **Offline project profiling** — `project-profile.ts` derives stable stack, package-manager, framework, command, signal, and SHA-256 fingerprint data from repository artifacts.
4. **Ordered fail-closed gates** — `quality-gates.ts` compiles and runs format → static → types → unit → acceptance → property → coverage → mutation → architecture → doctor → security → performance. Missing, timed-out, spawn-failed, or non-zero required gates block.
5. **Fresh evidence** — assurance evidence must postdate green and match the current deterministic plan fingerprint.
6. **Separation of powers** — seven fresh-context role contracts divide specification, test design, implementation, refactoring, adversarial review, fitness review, and QA.
7. **One writer** — writer roles are serial in one confirmed branch/worktree; verification roles are read-only by contract.
8. **Bounded delegation** — `bdd_delegate_role` validates phase, role, workspace confirmation, and a narrow task before launching one pi-subagent.
9. **Auditable handoff** — red/green, acceptance, mutation, CRAP, assurance results, exact fleet synthesis, and finding dispositions are persisted and checked.
10. **Human authority** — the extension never autonomously merges or ships.

Use:

```text
/bdd playbook
/bdd profile
/bdd gates
bdd_assurance_plan
```

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
| Orchestrator / Blueprint Engine | deterministic `bdd-mode.ts` + pure `lib/bdd/*` modules | Phase/action/gate policy is code, not an LLM decision |
| Specifier | `bdd-specifier` | Read-only specs, examples, contracts, risks, unresolved approvals |
| Test Designer / Property Agent | `bdd-test-designer` | Test-only writer; isolated from implementation internals when possible |
| Implementer | `bdd-implementer` | Production-only minimum change; locked tests |
| Critic / Breaker | `bdd-breaker` | Read-only adversarial verifier |
| Architect / Fitness Guardian | `bdd-fitness-guardian` | Read-only deterministic gate and structural evidence |
| Refactorer | `bdd-refactorer` | Serial production writer under green behavior |
| QA / Performance | `bdd-qa` | Read-only scripted, budget, concurrency, recovery, and chaos evidence |
| Human Operator | parent/human | Workspace, plan/findings/diff approvals and final merge authority |

Tool allowlists and fresh contexts reduce correlated failures. They are policy controls, not an OS sandbox; high-risk deployments should add read-only containers, microVMs, or isolated worktrees with default-deny egress.

## Roadmap / not yet enforced

These canonical-playbook capabilities are not universal built-in guarantees yet:

- provider-level temperature, seed, grammar-decoding, model-version, and prompt-schema pinning across every provider
- cryptographic approval payloads and a general risk-policy engine
- private-test isolation that is technically inaccessible to the Implementer rather than context-minimized by orchestration
- semantic-stability dashboards across repeated model runs
- full trajectory scoring, golden-task regression, and deterministic cassette replay in CI
- event-sourced project memory with governance projections
- gateway-level spend/latency enforcement across every model provider
- mandatory SAST/SBOM/license/secret scanners in repositories that have not configured them
- formal methods for projects without explicit local verifier commands
- OS-enforced read-only child sandboxes and default-deny network policy
- automated ADR generation, prompt registry, and chaos infrastructure
- enforcement of multi-agent launches that bypass registered model tools through unrelated slash-command surfaces

Projects should adopt these controls incrementally according to risk. A roadmap item must never be reported as passed evidence merely because the canonical playbook recommends it.

## Operator workflow

1. Confirm branch/worktree, dirty-tree handling, one writer, and risk level.
2. Read the canonical playbook and this profile.
3. Run `/bdd profile` and `/bdd gates`; configure missing required commands explicitly.
4. Require human plan approval for high-risk work.
5. Complete Example Mapping, isolated test design, red, minimum green, and optional refactor.
6. Run deterministic gates plus independent breaker/guardian/QA review.
7. Require findings approval, then inspect the final diff.
8. Record mutation, acceptance, assurance, and dispositions.
9. Run `bdd_handoff`; human retains final merge authority.

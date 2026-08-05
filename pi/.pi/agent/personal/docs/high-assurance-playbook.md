# High-Assurance Multi-Agent Software Development Playbook

**Achieving Process Determinism with AI Coding Agents**  
*(Optimized for Pi + Herdr + Uncle Bob–style testing · VerstandTech)*

*Version 1.2 — August 2026*  
*Canonical location: `pi/.pi/agent/personal/docs/high-assurance-playbook.md` in [VerstandTech/dotfiles](https://github.com/VerstandTech/dotfiles).*

*Synthesized from Uncle Bob Martin’s practices, constrained generation research, multi-agent patterns (CAID, trajectory supervision, Requirements-as-Code), formal methods, and high-assurance engineering. Tuned for the Pi coding agent harness and Herdr agent-aware terminal multiplexer.*

---

## Changelog (1.0 → 1.2)

| Version | Highlights |
|---------|------------|
| **1.0** | Core roles, gates, Uncle Bob stack, production hardening (§13) |
| **1.1** | Pi + Herdr runtime, spawned vs sub-agent isolation |
| **1.2** | **CAID** worktree isolation, **trajectory** golden suite, **Requirements-as-Code** decision store, **cost budgets** as gates, **overnight rhythm**, **AGENTS.md** contract, package scaffolding under `lib/{worktree/caid,trajectory,decisions,bdd/cost-budget}` |

Companion (honest enforcement map): [`high-assurance-pi-implementation.md`](./high-assurance-pi-implementation.md).

---

## 1. Purpose & Goals

This playbook defines a practical, production-oriented workflow for teams (or individuals) running **multiple specialized agents** to produce software with significantly higher reliability and lower variance than unconstrained LLM coding.

**Primary goal**: *Process determinism* — given the same requirements and constraints, the system consistently produces high-quality, thoroughly verified code that meets functional and non-functional requirements. Bit-identical source outputs are not required; verified equivalence of behavior and quality is the target.

**Recommended concrete stack (2026)**:
- **Pi (pi.dev)** — primary coding agent harness. Minimal core (read / write / edit / bash), highly extensible via skills and TypeScript extensions.
- **Herdr** — agent-aware terminal multiplexer. Named panes/tabs with real-time state (working / blocked / idle).
- **Uncle Bob–style testing** — multi-layer verification (unit + Gherkin/acceptance + property + mutation + QA + jitter + exploratory) as the primary interface agents optimize against.
- **CAID worktrees** — physical isolation of roles via git worktrees + fresh Pi instances.
- **Trajectory + decision store** — process oracles and institutional memory, not only final diffs.

**Core philosophy**:
- LLMs are powerful but stochastic. Treat them as focused but unreliable “idiot savants.”
- Determinism comes primarily from **scaffolding, constraints, independent oracles, and architectural separation**, not from better prompting alone.
- Tests, metrics, and formal checks are the primary interface the agents optimize against.
- Control flow is owned by **deterministic code** (the Orchestrator), not by an LLM.
- Prefer **true process isolation** (separate Herdr panes + fresh Pi + CAID worktrees) over shared-context sub-agents when roles must not collude.

---

## 2. Guiding Principles

1. **Surround agents with deterministic tools and oracles**
2. **Separation of powers** (and *physical* isolation via CAID when stakes are high)
3. **Independent test generation**
4. **Over-constrain with oracles**
5. **Small, decoupled units** (cyclomatic complexity ≤ 6–8)
6. **Blueprint / executable specification first**
7. **Hard gates before hand-off** (including cost/latency budgets)
8. **Human as final judge** (merge authority never delegated overnight)
9. **Agents maintain their own checkers**
10. **Score the path, not only the outcome** (trajectory supervision)
11. **Memory-as-governance** (decisions are queryable constraints, not chat lore)
12. **Minimal AGENTS.md** — human-curated, strict, short; deep policy lives in this playbook + skills

---

## 3. Multi-Agent Architecture & Roles

### Recommended Runtime

- **Pi** instances run inside **Herdr** panes.
- Each major role preferably runs as an independent Pi process in its own named Herdr pane (true isolation).
- **CAID** assigns each sensitive role a dedicated git worktree under `.worktrees/caid/<task>/<role>/`.
- The deterministic **Orchestrator** decides when to spawn a new Herdr pane + Pi agent with a clean handoff document versus using a lighter sub-agent pattern.

### Specialized Roles

| Role | Primary Responsibilities | Key Constraints / Isolation |
|------|---------------------------|-----------------------------|
| **Orchestrator / Blueprint Engine** | Owns control flow, state, sequencing, gate + budget enforcement, CAID planning | **Pure deterministic code**. Never an LLM for control flow. |
| **Specifier / Requirements Agent** | Structured tasks, Gherkin, properties, contracts; may draft decision records | Specs only; no production code. CAID worktree preferred. |
| **Test Designer / Property Agent** | Unit, property, trajectory, acceptance tests from locked specs | **Strict CAID**: `worktree+fresh-pi`. Different model preferred. |
| **Implementer / Coder Agent** | Production code for locked tests | Does not modify tests. Own CAID worktree. |
| **Critic / Breaker / Adversarial Agent** | Bugs, mutants, weak assertions | Adversarial; separate Herdr pane + worktree. |
| **Architect / Fitness Guardian** | Architecture, complexity, coverage, doctor, **cost budgets**, trajectory anti-patterns | Can reject work. Read-only tree preferred. |
| **Refactorer** | Structure under green gates | Serial writer; not concurrent with Implementer on same tree. |
| **QA / Performance Agent** | Scripted QA, jitter, budgets | Complements human exploratory testing. |
| **Human Operator** | Approvals, exploratory testing, thresholds, merge | Ultimate authority. |

### Sub-agents vs Spawned Agents vs CAID

| Type | Implementation | Isolation | When to use |
|------|----------------|-----------|-------------|
| **Sub-agent** | Same Pi process / shared context | Low–Medium | Short helpers |
| **Spawned agent** | New Herdr pane + fresh Pi + handoff | High | Role separation |
| **CAID assignment** | Spawned agent **+ dedicated worktree** + board registry | Highest | Test Designer ↔ Implementer, overnight writers, parallel features |

**Rule of thumb**: When the playbook says “strongly isolated,” use **CAID** (`lib/worktree/caid.ts`, skill `caid`).

### Isolation & communication rules

- Test Designer must not see production implementation while designing tests (and vice versa).
- Prefer intermediate representations (Gherkin → IR → executable tests).
- Inter-agent messages use schemas or clean **handoff documents** (paths/refs, not content dumps).
- Flush or heavily summarize context between major stages when drift is detected.
- Tool allowlists per role.
- Use Herdr state (working / blocked / idle) to know who needs attention.
- Decision store + AGENTS.md are read before repeating past approaches.

---

## 4. Concrete Runtime: Pi + Herdr

### Why this stack

- **Pi** does not impose a heavy multi-agent runtime — we own process via skills, extensions, AGENTS.md, and the Orchestrator.
- **Herdr** provides process isolation and visibility.
- Combined with Uncle Bob–style testing + CAID, we get isolation **and** extreme verification pressure.

### Recommended practices with Pi

- Project contract in **`AGENTS.md`** (template: `templates/AGENTS.md`).
- Skills: `bdd-tdd`, `caid`, `trajectory`, `ship`, `agentic-fleet`, `herdr`.
- Prefer **CAID spawned agents** for strongly isolated roles.
- Route cheaper models to Test Designer / simple implementer steps; stronger models to Architect / Critic.

### Handoff / Spawn standard

1. Create a short handoff (temp or `.pi/handoffs/`).
2. Include: goal, **artifact refs by path**, suggested skills, constraints/red lines.
3. Redact secrets.
4. Launch fresh Pi in a named Herdr pane.
5. Register CAID + worktree-board cards; acquire writer caps.

---

## 5. Generation Constraints Layer

- Temperature ≤ 0.2 (ideally 0) + fixed seeds for implementation/verification.
- Structured outputs / JSON Schema / tool-calling schemas.
- Grammar-constrained decoding where available.
- Small, well-scoped units; multi-stage generation (plan → IR → code).
- Pin model version, system prompt, tool schemas; tag every generation.
- Optional self-consistency for high-stakes decisions.

---

## 6. Layered Verification & Testing Stack

### Tier 1 – Core (Always-on)

- Unit tests (mid-to-high 90s coverage on critical/changed code)
- Acceptance / Gherkin
- Property-based tests
- Scripted QA
- Mutation testing (high kill rate)
- Jitter / concurrency where relevant
- Manual exploratory testing

### Tier 2 – Process & Behavioral Determinism

| Technique | Purpose |
|-----------|---------|
| **Trajectory / Action assertions** | Tool-call sequences, phase order; prevent path cheating (`lib/trajectory`) |
| **Anti-pattern detectors** | False completion, same-agent test+impl, missing red-before-green |
| **Golden trajectory suite** | Regression of process quality on prompt/skill changes |
| **Differential / golden-master** | Behavioral equivalence |
| **Semantic stability** | Variance across repeated runs |
| **Design-by-Contract** | Pre/post/invariants |
| **Fuzzing** | Specs and generated code |

### Tier 3 – High-Assurance / Formal (Selective)

- TLA+ / Alloy / Quint / Dafny / Lean on critical components
- Model checker as independent oracle
- Iterative proof-repair loops

**Key practice**: Test Designer isolated from Implementer. Prefer private tests until verification when operationally feasible.

---

## 7. Deterministic Gates & Fitness Functions

Hard gates enforced by the Orchestrator — work does not advance until green:

- Unit + acceptance + property tests pass
- Mutation score ≥ threshold (e.g. 80–95% on changed/critical code)
- Complexity / CRAP ≤ 6–8 per function
- Duplication + architecture fitness
- Coverage thresholds (c8/nyc/Vitest; cargo-llvm-cov)
- Doctor / health-score (react-doctor ≥ 90 or no high-severity on diff)
- **Trajectory assertions clean + no error-level anti-patterns**
- Contracts hold
- Performance budgets
- Static analysis clean
- **Cost / token / iteration / wall-clock budgets** (`lib/bdd/cost-budget.ts`)
- Security / secret scan / SCA when configured
- **Decision-store pre-action gate** for accepted constraints (advisory → hard when project enables)

Agents write and run checkers; Orchestrator refuses state transitions on red.

---

## 8. Orchestration: Blueprint-First / Compiled AI

1. Deterministic orchestrator owns control flow (LangGraph, Pi extension state machine, or pure `lib/bdd/*` + CAID planner).
2. LLM agents are tools for bounded creative subtasks.
3. Multi-stage validation: syntax → types → tests → fitness → security → trajectory → budget.
4. “Compile” stable features: remove further LLM calls from runtime paths once validated.

---

## 9. End-to-End Feature Workflow

1. Human goal + non-negotiable constraints + budgets.
2. Read **AGENTS.md** + query **decision store**.
3. Specifier → specs/contracts; human plan review when high-risk.
4. **CAID**: plan Test Designer worktree; spawn isolated designer; red proof.
5. **CAID**: plan Implementer worktree; green minimum; no test edits.
6. Breaker + Fitness Guardian (trajectory + gates + doctor + cost).
7. QA + human exploratory; findings approval.
8. Merge only if hard gates green; archive trajectory + decisions + evidence.
9. Optional overnight queue for remaining green-bound tasks (`docs/overnight-rhythm.md`).

---

## 10. Observability, Replay & Versioning

- Append-only trajectories (`.pi/trajectories/`) — no secrets in previews.
- Record/replay cassettes where available.
- Version models, prompts, roles, schemas, fitness defs, orchestrator.
- Golden trajectory suite on every skill/prompt change.
- Semantic stability dashboards over time.
- Tag successful runs as golden candidates.

---

## 11. Recommended Tooling Stack (2026)

**Runtime**: Pi + Herdr + this personal package (`leo-pi-personal` / VerstandTech dotfiles).

**Package scaffolding (v1.2)**:

| Area | Path |
|------|------|
| CAID | `lib/worktree/caid.ts`, skill `caid` |
| Trajectory | `lib/trajectory/*`, skill `trajectory` |
| Decisions | `lib/decisions/*`, template `templates/decisions.store.json` |
| Cost budgets | `lib/bdd/cost-budget.ts` |
| Overnight | `docs/overnight-rhythm.md` |
| AGENTS template | `templates/AGENTS.md` |
| BDD / fleet / worktree board | existing `extensions/*`, `lib/bdd/*`, `lib/fleet/*` |

**Constrained generation**: XGrammar, Outlines, provider structured outputs.

**Testing**: Hypothesis / fast-check; mutation tools; agentverify-style trajectory tests; Promptfoo.

**Coverage / doctors**: c8/nyc/Vitest; cargo-llvm-cov; react-doctor; Clippy/audit stack; Biome + dependency-cruiser.

**Orchestration**: Deterministic Pi extensions + optional LangGraph for product systems.

---

## 12. Incremental Adoption Roadmap

**Phase 0 – Hygiene**: temperature, structured outputs, core suite + mutation, basic coverage, trajectory logging.

**Phase 1 – Multi-agent separation**: Test Designer + Implementer + Orchestrator; wire doctor + coverage gates.

**Phase 2 – CAID + hard gates**: worktree isolation, architecture fitness, decision store, cost budgets.

**Phase 3 – Trajectory golden suite + overnight rhythm**: process regression CI, batch queues with circuit breakers.

**Phase 4 – Blueprint-first / formal**: full deterministic control flow; selective formal methods; compile stable paths.

---

## 13. Limitations, Anti-Patterns & Human Oversight

### Limitations

- Perfect bit-level determinism across model updates is unrealistic.
- Formal methods have cost; apply selectively.
- Soft isolation (prompt-only) is weaker than CAID worktrees.
- Novel domains still need strong human judgment.

### Anti-Patterns

- Same agent/context writes production code **and** the tests that verify it
- Free-text LLM-as-judge instead of deterministic oracles
- Schema-free handoffs
- Unrestricted tools / unbounded loops without circuit breakers
- Skipping mutation, fitness, or trajectory checks “for speed”
- Unbounded context without flush
- Bit-identical output as the goal
- Happy-path-only promotion
- Overnight merge / unsupervised production deploys
- Raising cost budgets automatically after circuit break
- Treating playbook recommendations as “enforced” without commands/config

### Human Role

- Requirements and quality bars
- Spot-check Gherkin, design, contracts
- Exploratory / UX / business-value testing
- Flush/reset agents
- Evolve fitness functions from observed failures
- **Final merge / ship authority**

---

## 14. CAID — Centralized Asynchronous Isolated Delegation

### Problem

Shared worktrees and shared contexts cause collusion: tests and code co-adapt, trajectory evidence becomes fiction, and parallel agents thrash the same files.

### Pattern

1. **Centralized** planning in the Orchestrator / parent Pi (deterministic helpers).
2. **Asynchronous** role execution in separate Herdr panes.
3. **Isolated** git worktrees per role (`planCaidAssignment`).
4. **Delegation** via handoff documents + board registry — not pasted megaprompts.

### Defaults

| Role | Isolation |
|------|-----------|
| test-designer, breaker, fitness-guardian, qa | `worktree+fresh-pi` |
| implementer, refactorer, specifier | `worktree` |
| orchestrator | `shared` |

### Collision policy

- Active Test Designer + Implementer on the **same path** is a hard process error (`detectCaidCollisions`).
- Multiple writer roles on one path is a hard process error.
- Worktree board `maxBusyWriters` still applies.

### Operator commands (conceptual)

```text
plan CAID → add worktree → write handoff → spawn Herdr pane →
acquire writer → work → release → evaluate trajectory → merge (human)
```

Implementation: `lib/worktree/caid.ts`, skill `skills/caid`, pairs with `extensions/worktree-board.ts`.

---

## 15. Trajectory Supervision & Golden Suite

### Why

Agents can reach green tests via unsafe, non-reproducible, or policy-violating paths. Outcome-only CI is insufficient.

### Minimum metrics

- Tool-call correctness / required tool order
- Phase order (red before green)
- False-completion rate
- Gate failures vs claimed success
- Efficiency (steps/tokens to success)
- Anti-pattern hits (error vs warning)

### Package API

- `evaluateTrajectory(run, assertions)`
- `detectTrajectoryAntiPatterns(run)`
- `evaluateGoldenSuite(suite, runsByEntryId)`
- Stub suite: `lib/trajectory/golden-suite.stub.json`

### Error-level anti-patterns

`SUCCESS_AFTER_FAILED_GATE`, `FALSE_COMPLETION`, `TEST_AND_IMPL_SAME_AGENT`, `MISSING_RED_BEFORE_GREEN`, `SECRET_IN_PREVIEW`.

Fitness Guardian (or CI) fails verify when error-level hits remain.

---

## 16. Requirements-as-Code (Decision Store)

### Why

Chat memory is not institutional memory. Agents re-derive or contradict past decisions without a durable store.

### Model

- Append-friendly records: id, kind, status, context, decision, consequences, scopePaths, tags, humanReview.
- Kinds: requirement, constraint, architecture, policy, gate-threshold, adr, risk, non-goal.
- Statuses: proposed → accepted | rejected | deprecated | superseded.

### Governance

- `checkDecisionGate({ store, action, paths })` before high-impact edits (heuristic keyword gate; projects may add stricter oracles).
- Accepted constraints can block; rejected approaches warn when echoed.
- Template: `templates/decisions.store.json` → project `docs/decisions/decisions.json`.
- Library: `lib/decisions/*`.

### MCP / future

Expose query/upsert via MCP when ready; until then, agents read/write the JSON store under docs path gates.

---

## 17. Cost, Latency & Resource Budgets as Gates

Treat spend and time as fitness functions (`lib/bdd/cost-budget.ts`):

| Profile | maxCostUsd | maxTokens | maxDuration | maxIterations |
|---------|------------|-----------|-------------|---------------|
| Interactive | 5 | 500k | 30 min | 80 |
| Overnight | 25 | 2M | 8 h | 400 |

- Warn at 80–85% of limit; **circuit break** over hard max.
- Orchestrator stops spawns on `circuitBroken`.
- Never auto-raise overnight limits.
- Log attribution per task/agent in trajectory `budget` events.

Projects may also wire a shell command into assurance gates that exits non-zero on budget breach.

---

## 18. Overnight Agent Rhythm

See full runbook: [`overnight-rhythm.md`](./overnight-rhythm.md).

Summary:

- Day: high-judgment planning, isolated test design, human approvals.
- Night: only **locked-test** implementer/repair tasks under overnight budget.
- Morning: triage board, re-gates, human diff, merge.
- Never overnight-merge; never unsupervised production deploy.

---

## 19. AGENTS.md Contract

Every serious repo should carry a **short** human-curated `AGENTS.md`:

- Authority (human merge)
- Red-before-green / one writer / CAID
- Project commands table
- Decision store path
- Budget posture
- Out-of-scope actions

Template: `templates/AGENTS.md`.  
Deep policy stays in this playbook + skills — do not paste the entire playbook into AGENTS.md.

---

## 20. Production Hardening & Continuous Improvement

(Retained and extended from v1.0 §13.)

1. Trajectory evaluation + golden task suite  
2. Cost/latency budgets + circuit breakers  
3. Security & supply-chain hard gates + sandboxing  
4. Shared decision store / project memory  
5. Explicit human approval seams (plan / findings / diff)  
6. ADR / documentation as pipeline outputs  
7. Chaos experiments (agents + system under test)  
8. Prompt/skill/schema regression CI  
9. **CAID** for all strongly isolated roles  
10. Overnight queue with non-merge policy  

---

## Closing

By combining Uncle Bob’s aggressive testing philosophy with constrained generation, multi-agent separation of powers, **CAID isolation**, hard fitness gates (including **cost**), **trajectory** verification, a **decision store**, and a deterministic orchestrator, teams turn agent speed into a reliability advantage.

The agents are extremely fast juniors forced to work inside a high-assurance process. **The process itself is the primary source of determinism.**

Living document — update thresholds, roles, tooling, and gates as the ecosystem evolves. Keep it in the repository so humans and agents share one policy.

---

*VerstandTech · Document refined collaboratively · August 2026 · v1.2*

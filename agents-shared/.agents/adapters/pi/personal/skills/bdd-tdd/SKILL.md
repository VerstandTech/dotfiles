---
name: bdd-tdd
description: >-
  Cross-project BDD → TDD workflow for Pi: Example Mapping, Gherkin/acceptance
  scenarios, red-green-refactor, mutation checks, and handoff evidence. Use when
  the user wants behavior-driven or test-driven development, Example Maps,
  Gherkin, failing tests first, or /skill:bdd-tdd. Pairs with the bdd-mode
  extension (/bdd, bdd_* tools).
---

# BDD → TDD (cross-project)

This skill is **project-agnostic**. It uses the **bdd-mode** Pi extension for hard
gates and discovers each repo’s runners via `.pi/bdd.json` or `package.json` scripts.

**Operator cheatsheet (read anytime):**
`docs/bdd-fleet-cheatsheet.md` (next to this package) — phases, why green/verify need red, fleet gates, troubleshooting.

Roadmap / design locks: `docs/agentic-bdd-roadmap.md`.

## Canonical high-assurance policy

For high-assurance, multi-agent, or production-critical work, read both package documents before planning:

- `docs/high-assurance-playbook.md` — canonical **August 2026 v1.2** normative playbook (CAID, trajectory, decisions, budgets, overnight rhythm)
- `docs/high-assurance-pi-implementation.md` — honest enforced / scaffolding / roadmap mapping for this Pi package
- `docs/overnight-rhythm.md` — day/night cadence when batching agent work

Operationalize the playbook through deterministic phase control, **CAID isolation** (skill `caid`), independent test design, one writer, fresh role contexts, least-privilege tools, schema-constrained handoffs, trajectory evaluation (skill `trajectory`), cost budgets (`lib/bdd/cost-budget.ts`), current hard-gate evidence, and explicit human approvals. **Human merge authority** is final. Do not claim a roadmap control is enforced, and do not auto-install or synthesize an unpinned command for a named tool.

## When to load

- User asks for BDD, TDD, Example Map, Gherkin, red-green-refactor, or acceptance tests
- Implementing a behavior-changing story/bugfix
- `/example-map`, `/formulate`, `/tdd`, `/green`, `/handoff` prompts

## Non-negotiables

1. **Discovery before formulation** — Example Map (Rules / Examples / Questions) before scenarios or production code when the change is behavior-shaped.
2. **Formulation before implementation** — acceptance scenarios and/or unit tests exist first.
3. **Causal red before green** — prove the focused test fails because the intended behavior is absent, not merely because some command is non-zero. Use `bdd_assert_red` before `/bdd green` or implementation. The extension records/nonzero-gates red, but causality remains an operator verification requirement; do not claim it is machine-inferred.
4. **Timeout/setup is neither color** — timeout, cancellation, missing dependency, compile/import/harness failure, unavailable service, or unrelated pre-existing failure is neither valid red nor valid green. Repair the harness or report blocked.
5. **Green minimum** — smallest change that passes; `bdd_assert_green` must **cover** the red command (`strictGreenCoversRed` default on).
6. **Evidence labels stay honest** — a local command pass is local green. CI may be documented as same-SHA replacement evidence when local execution is genuinely unavailable, but it is never renamed a local pass and does not bypass an extension gate that requires `bdd_assert_green`.
7. **Clean SHA evidence** — SHA-bound red/green/final evidence requires empty `git status --porcelain`. Otherwise record `dirty@SHA` plus exact paths; it is non-passing for final handoff.
8. **Handoff evidence** — red command/reason/SHA, green command/result/SHA, acceptance path or N/A + reason, mutation note when acceptance changed, CRAP notes for new branches.
9. **CAID for multi-role work** — Test Designer and Implementer use separate worktrees (`lib/worktree/caid.ts`); never collude in one writable tree.
10. **Trajectory + budgets on verify** — evaluate process anti-patterns and cost circuit breakers before claiming done.

## Extension API (use these tools)

| Tool / command | Purpose |
|---|---|
| `/bdd status` / `bdd_status` | Phase, config, evidence |
| `/bdd playbook` / `bdd_playbook` | Canonical playbook version/path plus honest Pi implementation profile |
| `/bdd profile` / `bdd_project_profile` | Deterministically detect local stacks, frameworks, package managers, and commands |
| `/bdd gates` / `bdd_assurance_plan` | Compile the ordered hard/advisory gate plan and bounded role blueprint |
| `bdd_run_quality_gates` | Execute the local gate plan sequentially in verify; required gates fail closed |
| `bdd_delegate_role` | Launch exactly one phase-appropriate isolated role through pi-subagents RPC |
| `/bdd init` | Write `.pi/bdd.json` template for this repo |
| `/bdd discovery\|formulation\|red\|green\|refactor\|verify` | Set phase |
| `/bdd bypass <reason>` | Emergency path-gate skip (logged) |
| `bdd_set_phase` | Same as phase commands from the model |
| `bdd_assert_red` | Run tests; **must fail**; store evidence |
| `bdd_assert_green` | Run tests; **must pass**; store evidence |
| `bdd_assert_mutation` | Optional failCmd→passCmd mutation (parent edits) |
| `bdd_record_evidence` | Example Map, acceptance, mutation, CRAP, fleet synthesis |
| `bdd_handoff` | Completeness checklist; `asPr` / `/bdd handoff pr` for PR body |
| `agentic_doctor` | `/agentic doctor` — config/auth/RPC diagnostics |
| skill `ship` | Full discovery→verify fleet→handoff recipe |
| skill `caid` | Plan isolated worktrees + handoffs |
| skill `trajectory` | Score agent paths / golden suite |

Path gates block `edit`/`write` by phase (e.g. no `src/**` in red).

## Phase playbook

### 0. Project bootstrap (once per repo)

```text
/bdd playbook      # canonical policy + honest implementation status
/bdd profile       # inspect deterministic local stack/command detection
/bdd gates         # inspect required/advisory gate plan; no execution
/bdd init          # creates .pi/bdd.json from detected local stacks/scripts
# copy templates/AGENTS.md and templates/decisions.store.json when high-assurance
# edit patterns, commands, assurance.requiredGateKinds, and thresholds if needed
/bdd on            # or /bdd discovery
```

Detection is offline and read-only. It never installs packages or uses unpinned `@latest` tools. Explicit `.pi/bdd.json` commands win; project scripts are next; conservative local ecosystem defaults are last.

Config search order: `.pi/bdd.json` → `bdd.json` → `.bdd-tdd.json` → infer from `package.json`.

### 1. Discovery

- Identify actor + goal + behavior change.
- Write **Rules (R#)**, **Examples (R#-E#)**, **Questions (Q#)**.
- Prefer the tracking issue body; else `docs/bdd/` or a short markdown note.
- Query decision store for prior constraints.
- `bdd_record_evidence` with `exampleMapRef`, rule/example counts.
- `/bdd formulation` when examples are concrete.

Skip a formal map only for tiny pure-tech fixes; still record acceptance N/A reason later.

### 2. Formulation

- Turn examples into acceptance scenarios (Gherkin `.feature` if the project uses it).
- Follow **project-local** conventions when present (`docs/bdd/gherkin-conventions.md`, `tests/features/**`, etc.).
- If no Gherkin harness: write clear acceptance tests in the project’s E2E/unit style and tag them to the example ids in comments.
- Add unit/integration tests that will fail for the right reason.
- Do **not** implement production behavior yet.
- `/bdd red`

### 3. Red (prefer CAID Test Designer)

- Finish failing tests in an isolated designer worktree when multi-agent.
- `bdd_assert_red` with focused command (use `append` for a file path).
- Confirm causality: the new/changed assertion reaches the behavior under test and fails for the expected missing outcome. A passing baseline plus a focused sensitivity/mutation check is stronger evidence than exit code alone.
- Timeout, cancellation, dependency/setup/import/compile failure, unavailable infrastructure, and unrelated existing failures are **not red**. Fix or isolate them before recording evidence.
- Record the exact command, exit code, causal assertion/failure, and current commit SHA.
- `/bdd green` only after causal red evidence is stored.

### 4. Green (prefer CAID Implementer)

- Implement **minimum** production code on a **separate** worktree from Test Designer.
- `bdd_assert_green` on the same focus (then broader suite if needed).
- A timeout, setup/import failure, interrupted run, or unavailable dependency is **not green**, even if no assertion failed.
- Run acceptance command from config when user-visible (`acceptanceTest` in bdd.json).
- If local execution is impossible for an environment-specific reason, do not fake `bdd_assert_green`. Record the blocker. A successful required CI check may be cited separately as **replacement CI evidence** only when it tests the same command/behavior on the exact candidate SHA; include workflow/check URL and conclusion. It remains distinct from local green and cannot override a hard local extension gate.

### 5. Refactor (optional)

- `/bdd refactor` — structure only; re-assert green if risky.

### 6. Verify + handoff

- `/bdd verify`
- Run `bdd_run_quality_gates` with `workspaceConfirmed=true`; required unavailable/failing gates block handoff when assurance is enabled.
- Evaluate trajectory + cost budget for the session when artifacts exist.
- Use isolated read-only `bdd-breaker`, `bdd-fitness-guardian`, and `bdd-qa` roles when independent verification is warranted. The parent remains the orchestrator and sole decision-maker.
- Mutation/sensitivity: deliberately break the behavior, run the fail command, restore, then use `bdd_assert_mutation` so proven mutation evidence is command-backed.
- Review fleet synthesis must live under `.pi/fleet-runs/<runId>/` and record `fleetNoBlockers=true` or accepted/deferred blocker dispositions.
- Before `bdd_handoff`, require clean git status for every SHA-bound local result. Dirty evidence remains diagnostic only and blocks a passing final handoff.
- `bdd_handoff` — fix any missing fields before claiming done.

## Handoff template (must fill)

```markdown
## BDD/TDD Handoff Evidence
- Focus: …
- Example Map: … (R#/E#/Q#)
- Red: `command` @ `<sha>` → exit N — causal assertion/failure (not timeout/setup)
- Local green: `command` @ `<sha>` → exit 0 — result | not-run — blocker
- Replacement CI: `<workflow/check URL>` @ `<same sha>` → conclusion — why local evidence was unavailable | none
- Acceptance: path | N/A — reason
- Mutation: proven | n/a — note
- CRAP: branches/errors/permissions covered or simplified
- Assurance: profile fingerprint + gate-plan fingerprint + required gate results
- CAID: designer/implementer paths (if multi-agent)
- Trajectory: run id + anti-pattern summary (if recorded)
- Budget: cost/tokens/iterations vs policy (if recorded)
```

## Project adapters (learn once per repo)

At session start, quickly detect:

| Signal | Adapter |
|---|---|
| `gherkin:test` / `tests/features/**/*.feature` | Gherkin acceptance; run generate/check if scripts exist |
| `playwright` / `e2e/` | Map scenarios to e2e specs; name specs after examples |
| `bun:test` / `vitest` / `jest` | Unit runner from package.json |
| `Cargo.toml` | Cargo test/check/fmt/Clippy; configured cargo-llvm-cov/audit gates when present |
| `go.mod` | `go test ./...`, vet, formatting, optional race gate |
| `pyproject.toml` / `pytest.ini` | pytest via uv/Poetry/Python; Ruff/mypy/coverage only when locally declared |
| `Package.swift` / `.xcodeproj` | SwiftPM test detection; Xcode commands require explicit project config |
| `docs/bdd/example-mapping.md` | Prefer that Example Map format |
| Issue tracker + “Example Map” section | Keep map on the issue |

Never invent a second test stack. **Wrap what the repo already runs.**

## Anti-patterns

- Implementing first, then adding tests (“tests after”)
- Treating any non-zero exit, timeout, setup/import error, or unrelated failure as red
- Treating timeout/interruption or "no assertion failure seen" as green
- Green assert without a prior causal failing red assert
- Calling replacement CI evidence a local pass or using it to silently bypass a local hard gate
- Broadening scope mid-green
- Acceptance N/A without reason
- Using `/bdd bypass` to avoid writing tests
- Ignoring project Gherkin tag/layout rules when they exist
- Test Designer and Implementer sharing one writable worktree
- Claiming ship-ready without human merge authority

## Related prompts

- `/example-map` — start discovery
- `/formulate` — scenarios from the map
- `/tdd` — enter red with focus
- `/green` — minimum implementation
- `/handoff` — evidence block

## Optional reading in-repo

Load only if present:

- `docs/bdd/example-mapping.md`
- `docs/bdd/gherkin-conventions.md`
- `AGENTS.md` testing section
- `docs/decisions/decisions.json`
- `.pi/bdd.json`

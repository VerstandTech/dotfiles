---
name: caid
description: >-
  Centralized Asynchronous Isolated Delegation (CAID): assign high-assurance
  roles to dedicated git worktrees, produce handoff docs, and detect
  collusion. Use when spawning Test Designer / Implementer / Critic in
  isolation, planning multi-agent worktrees, or /skill:caid.
---

# CAID — Centralized Asynchronous Isolated Delegation

CAID keeps **separation of powers** physical: each sensitive role gets its own
git worktree (and preferably a fresh Pi in a Herdr pane), coordinated by a
deterministic plan rather than a shared chat context.

## Role contract boundary (V1)

A CAID assignment starts from a validated CON-01 `RoleRequestV1` with `schemaVersion: 1`, locked artifact refs, explicit `ownedPaths`/`forbiddenPaths`, exact tools/model/thinking, and a bounded budget. High-risk ambiguity or a request that conflicts with the role, phase, path, or isolation plan blocks before worktree action. Role delegation defaults to none.

Accept a worker handoff only after validating `RoleResultV1`, including exact status, SHA/dirty state, changed files or finding refs, command/evidence claims, blockers, residual risks/questions, and usage. Store path refs rather than transcripts. These contracts and `.pi/caid-board.json` are assignment evidence. This evidence does not grant approval, writer lease, BDD phase, cleanup, merge, or release authority. ISO-01's parent-owned worktree board remains writer authority; prompts are not containment.

## Library

Pure helpers live in `lib/worktree/caid.ts`:

| Export | Purpose |
|--------|---------|
| `planCaidAssignment` | Branch, path, card id, handoff markdown |
| `defaultIsolationForRole` | `worktree+fresh-pi` for designer/breaker/guardian/qa |
| `detectCaidCollisions` | Flag designer+implementer on same path |
| `recommendCaidTarget` | Reuse vs create against worktree board |
| `upsertCaidAssignment` | Persist CAID board entries |
| `formatCaidBoard` | Operator-readable board |

Registry file (project-local): `<repo>/.pi/caid-board.json`.

## Isolation defaults

| Role | Isolation |
|------|-----------|
| test-designer, breaker, fitness-guardian, qa | `worktree+fresh-pi` |
| implementer, refactorer, specifier | `worktree` |
| orchestrator | `shared` (main tree) |

## Workflow

1. Confirm repo root + worktree board (`/wt list`).
2. Plan assignments for the task:

```ts
planCaidAssignment(repoRoot, {
  taskId: "billing-round",
  role: "test-designer",
  goal: "Write failing tests for invoice rounding from locked specs",
  artifactRefs: ["docs/specs/billing.md", "docs/decisions/decisions.json"],
  constraints: ["No production code", "Prove red with bdd_assert_red"],
});
```

3. Create worktree (`lib/worktree/new-worktree.ts` → `addWorktree`) when isolation ≠ `shared`.
4. Write handoff markdown **outside** the repo or under `.pi/handoffs/` (gitignored).
5. Spawn fresh Pi in a named Herdr pane; seed with handoff path only.
6. Register card on worktree board + CAID board; acquire writer for implementer trees.
7. Before verify/handoff: `detectCaidCollisions` must be empty for active writers.

## Collusion rules

- Test Designer and Implementer **must not** share a writable worktree.
- At most one writer role per path (designer **or** implementer **or** refactorer).
- Read-only roles (breaker, guardian, qa) may share a tree **only** if they never write; prefer separate trees anyway.

## Handoff contents

`formatCaidHandoff` is a bounded human-readable assignment view, not the V1 source of truth. The caller retains the validated `RoleRequestV1` and later validates `RoleResultV1`.

- Task/focus, isolation mode, branch, path
- Locked artifact **refs** (paths, not pasted secrets/content dumps)
- Owned/forbidden paths, exact launch profile, budget, and constraints
- Role contract, red lines, and default no-delegation
- Result status, commands/evidence, changed files or finding refs, blockers, and residual risks/questions

## Pair with

- `worktree-board` extension (`/wt`)
- `bdd-tdd` skill + role agents (`bdd-test-designer`, …)
- `trajectory` skill (log CAID handoffs as trajectory events)
- `docs/overnight-rhythm.md` for batch queues

## Tests

```bash
cd ~/dotfiles/agents-shared/.agents/adapters/pi/personal && bun test lib/worktree/caid.test.ts
```

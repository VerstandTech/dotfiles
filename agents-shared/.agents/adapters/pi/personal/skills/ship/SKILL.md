---
name: ship
description: >
  End-to-end BDD→TDD→verify fleet recipe for Pi. Use when the user says /ship,
  ship this story, or wants discovery through handoff in one orchestration.
  Skill-only — does not replace bdd-mode or agentic-fleet tools.
  Always confirm branch vs worktree before coding.
---

# /ship — parent orchestration recipe

**Not a second phase engine.** Call existing tools; stop on failed asserts.

## Preconditions

1. `/reload` if package just updated  
2. For high-assurance work, read `docs/high-assurance-playbook.md` and `docs/high-assurance-pi-implementation.md`; use `/bdd playbook` to locate/version them
3. Run `/bdd profile` and `/bdd gates`; correct ambiguous detection before coding
4. Optional: `agentic_doctor` or `/bdd doctor` — fix fails first
5. Focus: issue number or short title

## Risk-based human approval seams

Classify the change before modifying files. Authentication, payments, public APIs, migrations/data models, security boundaries, destructive operations, and large architectural changes are high-risk and must stop at each seam:

1. **Plan approval** — human approves the structured plan, exact workspace, constraints, quality bars, and configured hard gates before production edits.
2. **Findings approval** — after discovery/exploration, human disposition is required for unexpected complexity, migrations, security implications, and unresolved questions before implementation.
3. **Diff approval** — human reviews the final diff, independent findings, assurance evidence, and residual risks before commit, merge, or ship.

Low-risk work may use an explicitly approved abbreviated path, but the parent must record that decision. Approval arguments should be structured and specific; agents escalate rather than guess. Human merge authority remains final.

## 0. Workspace confirmation — **STOP and wait**

**Before discovery, formulation, or any git branch/worktree mutation**, present options and **wait for an explicit user choice**. Do not assume. Do not start red/green until confirmed.

Show current context first (run read-only):

```bash
git rev-parse --show-toplevel
git branch --show-current
git status -sb
# optional: git worktree list
```

Then ask the user to pick **exactly one**:

| Choice | Meaning | Typical action (only after they confirm) |
|--------|---------|------------------------------------------|
| **A. New branch here** | Stay in this checkout; create/switch a feature branch | `git checkout -b <type>/<id>-short-slug` (or project naming) |
| **B. New git worktree** | Isolated directory + branch; ship continues **in that cwd** | Prefer `/wt new <branch>` from root Pi (registers board card), or `git worktree add .worktrees/<slug> -b <branch>` then `/wt focus` |
| **C. Stay put** | Already on the correct branch and/or worktree | Confirm name; no create |

Also confirm:

- Proposed **branch name** (suggest from focus/issue; user may edit)
- If **B**: proposed **worktree path**
- Dirty tree: if `git status` is dirty, warn and ask whether to stash, commit, or abort — do not force

### Rules

- **One writer only** in the chosen tree. Fleet children stay read-only.  
- **B (worktree)** does **not** mean multi-writer fleets — still one parent writer in that worktree.  
- If the user has not answered A/B/C, **stop**. Do not invent a branch.  
- After they choose, apply the git action, re-check `git status -sb`, record the workspace in the handoff notes (`cwd`, branch, worktree path if any), then continue the pipeline.

Suggested prompt to the user:

```text
Ship workspace — pick one:
  A) Create/switch branch in this checkout: <suggested-branch>
  B) Add a git worktree + branch at: <suggested-path> (branch <suggested-branch>)
  C) Stay on current branch/worktree: <current-branch> @ <cwd>
Reply A, B, or C (and edit names if you want).
```

## Pipeline

### 1. Discovery
```text
/bdd discovery
bdd_assurance_plan                    # compiled local gate + role blueprint
# Optional isolated specifier (one bounded role):
bdd_delegate_role role=specifier workspaceConfirmed=true task="..."
# Parent/human writes and approves Example Map (Rules / Examples / Questions)
bdd_record_evidence exampleMapRef=... exampleMapRules=N exampleMapExamples=N
```
Optional: `/fleet research 3 <open questions>` if unknowns remain.

### 2. Formulation
```text
/bdd formulation
# Optional isolated test designer; never show it implementation internals unnecessarily:
bdd_delegate_role role=test-designer workspaceConfirmed=true task="locked specs + expected red"
# Gherkin and/or unit test skeletons only — no production impl
```

### 3. Red
```text
/bdd red
bdd_assert_red   # must FAIL (not timeout/127)
```

### 4. Green
```text
/bdd green
# Parent or one isolated implementer; tests remain locked:
bdd_delegate_role role=implementer workspaceConfirmed=true task="locked red command + contracts"
# minimum implementation
bdd_assert_green   # must PASS and cover red; invalidates prior assurance evidence
```

### 5. Verify + deterministic gates + independent review
```text
/bdd verify
bdd_run_quality_gates workspaceConfirmed=true       # required gates fail closed
# Optional bounded read-only roles: breaker, fitness-guardian, qa
fleet_dispatch kind=review topic="<focus / diff>"   # default count=3
# wait for fleet
fleet_collect runId=...
# write .pi/fleet-runs/<runId>/synthesis.md
bdd_record_evidence fleetRunId=... fleetSynthesisPath=... fleetNoBlockers=true
# OR record fleetBlockersAccepted / fleetDeferred with reasons
```

### 6. Optional mutation
```text
# Parent breaks an assertion, then:
bdd_assert_mutation failCommand="bun test ..." passCommand="bun test ..."
# Parent restores between fail and pass runs
```

### 7. Handoff
```text
bdd_handoff asPr=true title="<PR title>"
# or /bdd handoff pr
# Include workspace: branch + cwd (+ worktree path if B)
```

## Stop rules

- No A/B/C workspace answer → **do not proceed**  
- Red assert fails validation → fix tests, do not green  
- Green fails cover check → same command as red  
- Fleet blocked in green → you skipped verify  
- Required gate failed/unavailable → configure/fix it; never soften the threshold in green
- Gate evidence predates green or plan fingerprint changed → rerun gates
- Handoff missing synthesis/disposition → finish collect + synthesis.md and record no-blocker/accepted/deferred disposition

## Defaults

- Review fleet **N=3** unless user asks larger  
- One writer only (branch **or** single worktree — not both as dual writers)  
- See `docs/bdd-fleet-cheatsheet.md`

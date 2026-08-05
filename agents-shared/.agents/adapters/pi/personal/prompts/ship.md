---
description: Run full BDD→TDD→verify fleet ship recipe
argument-hint: "[issue-or-focus]"
---

Run the **/ship** orchestration for: ${1:-the current task}

1. Load skill `ship` (and `bdd-tdd` / `agentic-fleet` as needed).
2. **First:** workspace confirmation (skill §0). Show current branch/cwd/status. Ask the user to pick:
   - **A** new branch in this checkout,
   - **B** new git worktree + branch (then continue in that cwd),
   - **C** stay put.
   **Stop and wait** for an explicit A/B/C (and name edits). Do not create a branch/worktree or start discovery until they answer.
3. After confirmation, follow the skill pipeline: discovery → formulation → red → green → verify → fleet review (default 3) → collect → synthesis → handoff.
4. Stop on any failed bdd_assert_*; do not skip red evidence.
5. End with `bdd_handoff` (asPr=true when opening a PR). Note branch + cwd (+ worktree path) in the handoff.

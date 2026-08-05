---
name: demand-review-to-issues
description: >-
  Turn a batch of client/stakeholder demands (feature requests, change requests, bug
  reports, "the client wants X, Y, Z") into well-scoped GitHub issues by running TWO
  complementary code-reviewing agents — an implementation/feasibility lens and a
  product/UX/safety lens — that investigate the actual codebase, exchange questions with
  each other, converge on a plan per demand, then file one issue each. Use whenever the
  user hands over a list of demands/requests to scope, asks to "brainstorm with agents and
  open issues", "review these requests and file issues", "scope these feature requests", or
  wants two agents to debate the code before writing tickets.
---

# Demand Review → GitHub Issues

Convert a list of demands into scoped, code-grounded GitHub issues via two complementary
review agents that converge before any issue is written. The biggest value this delivers:
**catching that a "new" feature already exists, is feature-gated, is broken, or is riskier
than it looks — before filing it as build work.** In a real run, 2 of 4 "new" demands
already existed in the code; the review reframed them from "build" to "expose / re-enable /
fix scope".

## When this applies

A list of 2+ user-facing demands phrased as outcomes ("remove the X button", "add a delete
button", "reactivate the popup"). Each becomes one GitHub issue after review. A single
well-understood demand does not need this — just scope it directly.

## Workflow

Create one todo per step.

### 1. Clarify the two decisions that change every issue

Ask the user (a single batched question set):
- **Issue language** — match the repo's existing issue convention unless told otherwise.
- **Create directly vs. draft-then-confirm** — create issues immediately after convergence,
  or show drafts first.

Do NOT ask the user to pre-resolve the demands' ambiguity — that is what the agents surface,
and genuine forks become "decision needed" blocks inside the issue.

### 2. Recon the repo (you, before spawning agents)

- `git remote -v` → confirm `owner/repo`.
- `gh issue list --limit 8 --json number,title,labels` and `gh label list` → learn the
  title style and the **exact label names** (issue creation fails on unknown labels).

### 3. Spawn two named, persistent agents in parallel

Use the harness's available parallel subagent mechanism and keep the parent as orchestrator.
In Pi, inspect executable agents first, then use `pi-subagents` to dispatch both read-only
reviews in one parallel call. In Claude Code, use the Agent tool with
`subagent_type: general-purpose`. Name the roles `Alex` and `Blair`. The two lenses are
**fixed**:
- **Alex** = implementation/feasibility (where the code is, how to change it, what already
  exists, what's risky to touch).
- **Blair** = product/UX + safety (real user intent, UX flow, edge cases, destructive/
  irreversible actions, regulatory exposure).

Read `references/agent-prompts.md` and fill in the demand list. Both prompts MUST require:
investigate the ACTUAL code (no guessing), use repo-relative paths only (never local
absolute paths like `/Users/...`), and produce per-demand findings + 1–3 sharp open
questions for the other agent.

### 4. Facilitate convergence

Wait for both reports, then relay each agent's open questions to the other with the harness's
follow-up or inter-agent messaging mechanism. Require every report and converged plan to be
returned to the parent orchestrator. Continue until they converge per demand. Distinct lenses
make these cross-questions genuinely useful — that's the point.

### 5. Resolve what you can verify yourself

Some "open questions" are verifiable without the client (env/config values, whether a flag
is set, whether a file still exists). Check them directly rather than punting to the user.
In the real run, the "reactivate support popup" demand reduced to verifying one build-time
env var.

### 6. Write and create the issues

Per demand, write a body using `references/issue-template.md`: the client request, the
two-reviewer findings (with exact `path:line` references), the converged recommendation,
risks/edge cases, an explicit **❓ Decision needed** block for any genuine scope fork, and
acceptance criteria. Then create each issue with `gh issue create --body-file` and labels
chosen from the repo's existing label set (category + type). Report the issue URLs.

### 7. Stand the agents down

Close or stop persistent child sessions when the harness requires it. Ignore further idle
notifications after the final reports are collected.

## Hard-won rules

- **Verify current code state — assume nothing is greenfield.** "Add a feedback button" may
  already have a backend; "add delete" may already ship a partial, non-cascading version.
- **Capture forks, don't block on them.** When a demand has a real scope ambiguity (which
  exact button? account vs. profile?), write the recommended interpretation plus a
  "decision needed" block. Don't stall all issues waiting on the user.
- **Repo-relative paths only**, everywhere — agent reports, issue bodies, commit messages.
- **Match labels to the repo**, don't invent them.

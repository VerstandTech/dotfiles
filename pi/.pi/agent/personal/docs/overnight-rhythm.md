# 24h Overnight Agent Rhythm

**Companion to:** [high-assurance-playbook.md](./high-assurance-playbook.md) v1.2  
**Package:** `pi/.pi/agent/personal` (VerstandTech/dotfiles)

This document defines a practical **day / night** cadence for high-assurance multi-agent work with Pi + Herdr + CAID worktrees. It is operational guidance; hard enforcement still belongs to budgets, gates, and human merge authority.

---

## Goals

1. Keep interactive daytime sessions focused on **high-judgment** work (plans, approvals, novel design).
2. Push **batchable, gate-bound** work into overnight windows with hard cost/latency budgets.
3. Wake to a **triage board**, not a pile of unsupervised merges.

---

## Daily cadence (local time)

| Window | Mode | Typical work | Budget profile |
|--------|------|--------------|----------------|
| Morning (30–60 min) | Human + Orchestrator | Review overnight report, approve/reject plans, merge ready PRs | Interactive |
| Mid-day | Interactive multi-agent | Specifier + Test Designer isolation, hard problems, plan reviews | Interactive (`DEFAULT_INTERACTIVE_BUDGET`) |
| Late afternoon | Queue prep | Freeze task queue JSON, assign CAID roles, set budgets | — |
| Overnight | Unattended batch | Implementers on locked tests, mutation survivors, golden trajectory re-runs, dep/doctor sweeps | Overnight (`DEFAULT_OVERNIGHT_BUDGET`) |
| Next morning | Triage | Read ledger, re-run failed gates, human diff review | Interactive |

Adjust for your timezone; keep the **structure**, not the clock hours.

---

## Overnight queue format

Store at `<repo>/.pi/overnight-queue.json` (project-local; may be gitignored):

```json
{
  "version": 1,
  "createdAt": "2026-08-05T18:00:00-03:00",
  "budget": {
    "maxCostUsd": 25,
    "maxTokens": 2000000,
    "maxDurationMs": 28800000,
    "maxIterations": 400
  },
  "tasks": [
    {
      "id": "billing-round",
      "priority": 1,
      "goal": "Green implementer for locked invoice rounding tests",
      "role": "implementer",
      "caidTaskId": "billing-round",
      "artifactRefs": [
        "docs/decisions/decisions.json",
        ".pi/handoffs/billing-round-test-designer.md"
      ],
      "constraints": [
        "Do not modify tests",
        "Stop on first required gate failure after 3 repair loops"
      ],
      "maxRepairLoops": 3
    }
  ]
}
```

Rules:

- Only tasks with **locked tests / accepted decisions** go overnight.
- No overnight task may **merge** or **push to protected branches**.
- Each task maps to a **CAID assignment** (see `lib/worktree/caid.ts`).
- Circuit breakers: cost budget, iteration cap, consecutive gate failures.

---

## What is safe overnight

| Safe | Unsafe without human |
|------|----------------------|
| Implementer green loops on locked red tests | New product requirements / ambiguous specs |
| Mutation kill attempts with auto-restore | Auth, payments, public API contract changes |
| Doctor / coverage / architecture gate repairs | Dependency major upgrades |
| Golden trajectory suite re-runs | Production deploys |
| ADR draft generation for human review | Force-push / history rewrite |

---

## Morning triage checklist

1. Open Herdr / worktree board — which CAID cards are `busy` vs `done`?
2. Read `.pi/fleet-runs/*` and overnight ledger (cost, iterations, gate results).
3. For each green task: run `bdd_run_quality_gates` + human diff review.
4. For failures: promote to interactive (Specifier/Test Designer), do not re-queue blindly.
5. Update decision store if overnight work revealed a new constraint.
6. Merge only with human authority.

---

## Cost & circuit breakers

Use `lib/bdd/cost-budget.ts`:

- Interactive default: ~$5 / 500k tokens / 30 min / 80 iterations.
- Overnight default: ~$25 / 2M tokens / 8 h / 400 iterations.

When `circuitBroken`:

1. Stop spawning new agents for that task.
2. Persist trajectory + budget snapshot.
3. Mark queue task `failed` with reason `budget_exceeded`.
4. Never “retry with higher budget” automatically overnight.

---

## Trajectory capture

Every overnight task should append a trajectory run under:

```text
.pi/trajectories/<date>/<taskId>-<runId>.json
```

Morning job (human or CI):

```text
evaluate golden suite + anti-patterns on last night’s runs
```

See `lib/trajectory/*` and `skills/trajectory`.

---

## Herdr layout suggestion

```text
pane: orchestrator-main     (human sits here)
pane: caid-billing-designer (done before night)
pane: caid-billing-impl     (overnight)
pane: caid-billing-breaker  (overnight after impl green)
pane: fleet-review          (optional parallel)
```

Name panes after CAID card ids for muscle memory.

---

## Anti-patterns

- Leaving merge credentials available to overnight agents.
- Overnight Test Designer + Implementer sharing one worktree.
- Unbounded “keep fixing until green” without iteration caps.
- Treating overnight green as ship-ready without human diff review.
- Re-running the same failed task every night without changing specs/gates.

---

## Adoption

1. Week 1: manual queue markdown + morning review only.
2. Week 2: CAID worktrees per overnight implementer + cost budget logging.
3. Week 3: trajectory dump + golden suite smoke.
4. Week 4: optional cron/launchd that only **starts** queued Pi sessions (never merges).

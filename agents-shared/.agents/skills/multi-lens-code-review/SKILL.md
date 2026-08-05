---
name: multi-lens-code-review
description: >
  Parallel multi-agent code review with P0–P2 triage and fix-all remediation.
  Spawns specialized read-only review lenses (performance, simplicity, design
  patterns, QA, code quality, security, CRAP, data integrity, UX/API contract),
  merges findings with cross-check, then implements fixes TDD-first (or defers
  with reason). Use when the user says "multi-lens review", "8-lens review",
  "parallel code review agents", "fix all review findings", "review with
  sub-agents", or after a feature ships green and needs adversarial review
  before PR. Complements intensive-engineering (full delivery loop) when only
  review+remediation is needed.
---

# Multi-lens code review

Orchestrator owns the loop. Sub-agents review in **one parallel wave**. Then you merge, fix, re-verify.

## Non-negotiables

1. **Review agents are read-only** — no edits until the backlog is merged.
2. **Every P0–P2 is fixed or deferred with reason** — no silent drops.
3. **Behavior change ⇒ failing test first** when implementing fixes.
4. **Never `git add -A`** — stage named files only.
5. Prefer **one message, many agents** for the review wave.

## When to use vs intensive-engineering

| Need | Skill |
|------|--------|
| Full BDD→TDD→review→UX delivery | `intensive-engineering` |
| Green feature needs adversarial review + remediations | **this skill** |
| Single PR review as comments | project `code-review` / `bmad-code-review` |

## Phase map

| Phase | Goal |
|-------|------|
| 0 | Scope: branch, diff inventory, which surfaces changed |
| 1 | Spawn review lenses in parallel (pick set below) |
| 2 | Merge + cross-check → single P0→P1→P2 backlog |
| 3 | Implement fixes (TDD for behavior); re-run suites |
| 4 | Re-check open items; document deferrals |
| 5 | Handoff summary |

## Lens set (default 8)

Spawn **in one message**. Capability: **read-only**. Give absolute paths, issue/PR context, and required output shape.

| Id | Lens | Focus |
|----|------|--------|
| `rev-perf` | Performance | Hot paths, N+1, extra RTT, unbounded memory, index fit |
| `rev-simple` | Simplicity | YAGNI, dead code, double work, over-tested pure policy |
| `rev-patterns` | Design patterns | Layering, ownership, DTO bleed, dual-writer contracts |
| `rev-qa` | QA | False confidence, missing seams, mutation sensitivity |
| `rev-quality` | Code quality | Naming, types, magic, comments that lie, casts |
| `rev-security` | Security | Injection, authz, tenancy, DoS/bloat, untrusted input |
| `rev-crap` | CRAP | Branchy untested paths, simplify vs add tests |
| `rev-data` | Data integrity | Metrics meaning, dual pipelines, reconciliation, TZ |

**Optional:** `rev-ux` when API/UI-facing (false zeros, empty states, contract flip-flops).

Lens prompt bodies: [references/lens-prompts.md](references/lens-prompts.md).

### Required output shape (every lens)

```markdown
### P0
- **Title** — path:line — impact — concrete fix

### P1
...

### P2
...

### Strengths
...

### Cross-check defenses
- Anticipated pushback from two other named lenses and your rebuttal
```

Use **"None"** for empty severities.

## Merge rules (orchestrator)

1. Deduplicate by root cause (same fix closes multiple findings).
2. **Code facts > measured numbers > a11y/product vetoes > majority.**
3. Contested items: short cross-check pass (each agent attacks ≥1 peer claim or concedes) **or** resolve yourself with repo evidence.
4. Emit one backlog table:

| ID | Severity | Finding | Lenses | Action |
|----|----------|---------|--------|--------|
| P0-A | P0 | … | data, perf | implement |

## Fix-all discipline

1. **P0 first**, then P1, then P2.
2. For each behavior change: red test → green → stay green.
3. Prefer **shared pure helpers** over dual implementations.
4. If a finding needs UI OOS or infra (rate limits, warehouses): **defer with reason** in handoff.
5. Watch for **test mock pollution** (partial `mock.module` of shared helpers breaks suite mates). Prefer real helpers + container fakes.

## Handoff

Report:

- Review lens set used
- P0/P1/P2 counts fixed vs deferred (with reasons)
- Commands proving green
- Remaining risks
- Git branch / PR if created

## Related

- `intensive-engineering` — full delivery loop including this review as Phase 5–6
- `ux-panel` — adversarial UX on screenshots
- Project code-review skills for PR comment workflows

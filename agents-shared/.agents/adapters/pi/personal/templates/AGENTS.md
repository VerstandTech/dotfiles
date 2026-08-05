# AGENTS.md

Human-curated operating contract for coding agents in this repository.
Keep this file **short, strict, and honest**. Agents must read it at session start.

## Authority

- Humans own product intent, risk thresholds, and **final merge/ship**.
- Deterministic tools (tests, gates, budgets, CAID) outrank free-text rationalizations.
- Do not claim a control is enforced unless this repo’s config and commands actually enforce it.

## High-assurance defaults

1. Prefer **BDD → TDD**: Example Map → formulation → red → green → refactor → verify.
2. **Red before green** with command-backed evidence (`bdd_assert_red` / project equivalent).
3. **One writer** per worktree; use CAID isolation for Test Designer vs Implementer.
4. Do not modify tests when implementing; do not modify production code when designing tests.
5. Run project quality gates before handoff; fail closed on required gates.
6. No secrets in transcripts, trajectories, handoffs, or commits.
7. Escalate ambiguity — do not guess on auth, payments, data loss, or public API breaks.

## Commands (fill per project)

| Intent | Command |
|--------|---------|
| Unit tests | `<!-- e.g. bun test -->` |
| Typecheck | |
| Lint / static | |
| Coverage | |
| Acceptance | |
| Full gate suite | |

## Paths

| Kind | Patterns |
|------|----------|
| Production | `src/**`, `app/**` |
| Tests | `**/*.{test,spec}.*`, `tests/**` |
| Docs / decisions | `docs/**`, `AGENTS.md`, `docs/decisions/**` |

## Decisions

- Durable decisions live in `docs/decisions/decisions.json` (Requirements-as-Code).
- Before repeating a rejected approach, query the decision store.
- Material architecture choices need an ADR / decision record, not only chat.

## Budgets

Respect interactive vs overnight budgets. Stop and report when circuit-broken.
Never raise overnight spend limits autonomously.

## Multi-agent

- Orchestrator is deterministic control flow, not an unbounded coding agent.
- Spawn isolated agents with **handoff documents** (paths/refs, not content dumps).
- Log trajectories under `.pi/trajectories/` for process review.

## Out of scope for agents

- Production deploys, production secret access, force-push to protected branches.
- Expanding scope mid-green without human plan approval.

## References

- High-assurance playbook (package): `~/.pi/agent/personal/docs/high-assurance-playbook.md`
- Pi implementation profile: `~/.pi/agent/personal/docs/high-assurance-pi-implementation.md`
- Overnight rhythm: `~/.pi/agent/personal/docs/overnight-rhythm.md`

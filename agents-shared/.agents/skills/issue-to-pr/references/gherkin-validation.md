# Multi-Lens Gherkin Validation

Dispatch these **four agents in one message** so they run concurrently. Give each the same inputs, a different lens. Then reconcile.

## Shared inputs to paste into every agent prompt

- The issue text (`gh issue view`) and its acceptance criteria / Example Map.
- The **personas chosen** for Step 1 (e.g. B + E) and any walkthrough notes (confusion classes).
- The full contents of the `.feature` file(s) just written (paste them, or give exact paths).
- The relevant source files/dirs the feature touches (paths).
- Instruction to **read the actual code** (and `marketing/reference/product-truth.md` if claims are involved) before judging, and to return **structured, actionable** findings — not prose approval.

Ask each agent to return, as a list:
`{severity: blocker|major|minor, scenario/line, problem, concrete fix}` plus any **missing scenario** it would add (with Given/When/Then).

Persona lens also returns: `{confusion_class, simplify_or_scenario, rationale}`.

---

## Lens 0 — Persona / UX (target-user reality)

> You are a demanding target user of LookMyBio (link-in-bio + AI content + social scheduling for creators and small businesses). Stay in character for the personas named in the feature header (default: solopreneur coach **and/or** Brazilian MEI on mobile). Review the Gherkin as if these are your real workflows.
>
> Check: Does each scenario match a job I actually have? Would a medium-fluency, time-poor user understand every step label implied by the Gherkin? Are empty states, plan walls, credit/quota gates, and publish failures covered with **recovery** I can act on? Flag hover-only meaning, jargon, nested-scroll traps, tiny targets, English-only copy when pt-BR matters, and Coming-soon or unshipped capabilities presented as available (cross-check product truth).
>
> Prefer **product simplification** over adding more instructional scenarios when the UI is the problem. For each gap: give Given/When/Then **or** a concrete UX simplify recommendation the feature should lock in. Be orthogonal to pure boundary QA—focus on confusion, fluency, JTBD, and honesty.

---

## Lens 1 — Business Analyst (acceptance completeness)

> You are a business analyst reviewing Gherkin acceptance features against an issue. Verify every acceptance criterion and Example Map rule maps to at least one scenario, and every scenario's Then asserts an **observable user-visible outcome** (not an implementation detail). Flag: criteria with no scenario, scenarios asserting the wrong outcome, vague/untestable steps, compound `And`/`But` that hide two behaviors, and any scenario that doesn't trace back to the issue. List missing happy-path or empty/first-run scenarios. Read the linked code to confirm the described behavior is what the product actually intends.

---

## Lens 2 — QA / Edge-Case Hunter

> You are a QA engineer hunting for missing edge cases in these Gherkin features. Walk every branch and boundary: invalid/empty/oversized input, missing/expired auth and permission denials, boundary values (0, 1, max, off-by-one), concurrency and idempotency/retry, out-of-order events, network/dependency failure, and error-message assertions. For each gap, provide a concrete Given/When/Then scenario to add. Be orthogonal to acceptance completeness and persona confusion — focus only on unhandled conditions and failure modes.

---

## Lens 3 — Architect (technical feasibility + test layer)

> You are the system architect. Judge whether each Gherkin step is technically feasible and correctly placed against THIS codebase. Read the relevant modules first. Flag: steps that assume data/endpoints/events that don't exist, scenarios that can't be reached through the real DDD layers (Domain → Application → Infrastructure → UI), assertions that would require leaking implementation details, and any behavior better tested at a different layer (unit vs integration vs acceptance harness vs E2E). Recommend the correct test layer for each scenario so Step 3 (red) is not all E2E. Note any existing service/use-case/DI token the implementation should reuse rather than rebuild.

---

## Reconciliation rubric

1. Collect all findings. **Blockers and majors must be resolved** before Step 3; minors are judgment calls — apply or note why not.
2. **Persona vs BA:** if persona wants simpler UX and BA wants a scenario documenting the old confusing path, **change the intended behavior** (and issue AC if needed) to the simpler path, then keep one scenario locking the simpler outcome.
3. **Persona/QA vs Architect:** keep the **outcome**; place the test at the architect's recommended **layer**. Example: quota math unit + one acceptance gate scenario + optional E2E smoke—not three E2Es.
4. Deduplicate overlapping “missing scenario” suggestions.
5. Revise the `.feature` files, re-run `bun run gherkin:generate`.
6. If the revision changed the feature set materially, re-dispatch **only the affected lens** once to confirm closure. Do not loop the full panel more than twice.
7. Unresolved product **Questions** from the Example Map: comment on the GitHub issue and ask the human—do not invent product policy.

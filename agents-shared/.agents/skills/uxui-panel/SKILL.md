---
name: uxui-panel
description: >
  Adversarial 10-agent UX/UI panel review of a UI surface (menu, dialog, page, flow, or component).
  Five UX lenses (information architecture, interaction, visual craft, accessibility, product
  minimalism/JTBD) plus five UI design experts (density/scan, craft polish, design systems,
  content/microcopy, motion/microinteraction) independently critique the surface grounded in
  real code, then cross-examine until they converge; the orchestrator adjudicates and synthesizes
  a ranked verdict. Use when the user runs /uxui-panel or /ux-panel, asks to "analyze this UI
  with multiple agents", "run a UX panel/debate", "UX/UI panel", "have design agents discuss
  each other", "make this screen awesome/simpler", or wants a deep multi-perspective design
  critique of an existing surface (screenshot and/or code). Not for building new UI from
  scratch or single-lens quick reviews.
---

# UX/UI Panel (`/uxui-panel`)

Run a **10-agent** adversarial design review: independent critique → cross-examination → converged verdict.

| Cohort | Agents (always all 10) |
|--------|------------------------|
| **UX lenses (5)** | `ux-ia`, `ux-interaction`, `ux-visual`, `ux-a11y`, `ux-minimal` |
| **UI design experts (5)** | `ui-density`, `ui-craft-polish`, `ui-systems`, `ui-content`, `ui-motion-micro` |

Value comes from grounding (agents read real code, compute real numbers) and forced disagreement (each agent must attack peers before converging). Expect **~20 sub-agent turns** (10× round 1 + 10× round 2, or at minimum 5 UX lenses in round 2 if experts only vote in R1). Tell the user it takes several minutes.

**Alias:** `/ux-panel` is the legacy name — same skill. Prefer `/uxui-panel`.

## Phase 0 — Ground the panel (orchestrator, before spawning)

Collect and verify. Ungrounded panels produce plausible-sounding fiction; the best findings come from agents reading code, not only the screenshot.

1. **The surface**: precise top-to-bottom UI description (screenshot and/or live snapshot). Dimensions, states, copy.
2. **Real code paths**: component file(s), primitives (e.g. Radix wrappers), siblings for pattern comparison, container wiring handlers, design tokens/theme CSS. List exact paths in every brief.
3. **Product context**: domain vocabulary (e.g. "profile ≠ user account"), duplication candidates, recent product decisions (issue/PR), implementation facts (latency, persistence, keyboard).
4. **Constraints**: fixed vs open decisions the panel must not reopen without catastrophe.

## Phase 1 — Independent positions (10 agents in parallel)

Use the harness's available parallel subagent mechanism and keep the parent as the only
orchestrator. In Pi, inspect executable agents first, then use `pi-subagents` to dispatch ten
independent read-only reviews in one parallel call. In Claude Code, use the Agent tool with
`subagent_type: "general-purpose"`. Assign distinct descriptions/ids to **all ten** roles:

**UX:** `ux-ia`, `ux-interaction`, `ux-visual`, `ux-a11y`, `ux-minimal`  
**UI experts:** `ui-density`, `ui-craft-polish`, `ui-systems`, `ui-content`, `ui-motion-micro`

Build each brief from [references/lens-briefs.md](references/lens-briefs.md) (shared skeleton + per-lens focus + peer list of **the other nine**).

Non-negotiables in every brief:

- Name peers (other 9) and warn the position will be debated — committed calls, not hedges.
- Read listed code before judging; cite file/line or computed numbers (contrast, targets, timing).
- Fixed output shape: (a) top-3 problems + severity, (b) concrete redesign prescription, (c) pre-emptive defenses against **two** named peers' likely objections.
- Require each full position to be returned to the parent orchestrator.

**Choreography:** wait until **all 10** round-1 positions are in before round 2. Nudge or
resume idle agents once using the harness's follow-up mechanism.

## Phase 2 — Cross-examination (round 2)

1. Read all **10** positions. Extract **contested points** (disagreements + code contradictions). Number them (typically 5–10).
2. **Round 2 is mandatory for all 10 agents** (not UX-only). Resume each persistent child
   when supported; otherwise launch a fresh child with its round-1 position included. Send the
   round-2 brief from `lens-briefs.md`: conflict digest, who-said-what, tailored so each agent
   sees attacks on *their* claims; require attack ≥2 peers, concessions, FINAL vote on every
   numbered point (≤400 words).
3. Route checkable claims to the right specialist (e.g. a11y re-runs contrast math; systems verifies component API; content rewrites contested copy).

Optional efficiency: if a UI expert fully aligns with a UX peer and has no unique contested claim, still collect a short FINAL vote on all points so tallies stay complete.

## Phase 3 — Adjudicate and synthesize (orchestrator)

Tally final votes from **all 10** panelists per contested point. Decide in order:

1. **Code facts beat opinions** (even majority).
2. **Measured numbers beat vibes** (contrast, px, timing).
3. **Hard a11y constraints are vetoes** (WCAG floors, focus, accessible names).
4. **Reconcile before picking** (compatible prescriptions merge).
5. Remaining taste: majority of the full 10; record minority.

Deliver to the user, in this order:

- **Reframing discovery** first (fact that changed the debate).
- **Converged blueprint** (ASCII sketch of redesigned surface).
- **Ranked change list** (impact + standard/number justifying each).
- **What the panel refused to change** and why.
- **Minority holdouts** and follow-ups (telemetry, product gaps).
- Offer implementation.

When summarizing, tag findings with cohort when useful (`UX:` / `UI craft:`) so product vs systems/copy/motion ownership is clear.

## Quality bar

- A panel where all agents agree in round 1 is a failed panel — re-brief with sharper biases.
- At least one round-2 concession/reversal should trace to a code or number check.
- Never synthesize until **all 10** round-1 positions are in and **all 10** round-2 finals (or explicit short votes) are collected.
- Do **not** drop the five UI experts to save turns unless the user explicitly requests a “lite” 5-lens-only run.

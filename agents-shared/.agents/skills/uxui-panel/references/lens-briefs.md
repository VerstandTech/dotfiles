# Lens briefs — UX/UI Panel (10 agents)

Prompt templates for all panelists and round-2 cross-examination. Fill every `{…}` slot from Phase 0 grounding. Spawn with `subagent_type: "general-purpose"` and a distinct agent description/id set to the lens id.

## Roster (always all 10)

### UX lenses (5)

| Id | Title |
|----|--------|
| `ux-ia` | Information architecture |
| `ux-interaction` | Interaction design |
| `ux-visual` | Visual craft |
| `ux-a11y` | Accessibility (WCAG + ARIA) |
| `ux-minimal` | Product minimalism / JTBD |

### UI design experts (5)

| Id | Title |
|----|--------|
| `ui-density` | Information density & scan patterns |
| `ui-craft-polish` | Craft polish (spacing, type, borders, state honesty) |
| `ui-systems` | Design systems & component APIs |
| `ui-content` | Content design / microcopy (incl. locale) |
| `ui-motion-micro` | Motion & microinteraction feedback |

**Peer list for every brief:** the other nine ids by name.

---

## Shared brief skeleton (prepend to every lens prompt)

```
You are {LENS TITLE} (`{LENS_ID}`) on a 10-person UX/UI panel critiquing {SURFACE NAME}.
Your position will be debated by 9 peers:
  UX: {OTHER UX LENSES}
  UI experts: {OTHER UI EXPERTS}
Commit to defensible calls with reasoning, not hedges.

## The surface under review ({THEME/SIZE/CONTEXT ONE-LINER})
{TOP-TO-BOTTOM TEXT DESCRIPTION OF THE UI — every row/element, states, copy}

## Ground truth (read the code before judging)
{EXACT FILE PATHS: component, primitives, container, siblings for pattern
comparison, tokens/theme CSS}
Implementation facts: {latency, persistence, keyboard semantics, framework
behaviors already verified}
Product context: {domain vocabulary, duplication candidates elsewhere,
recent decisions that constrain the redesign, fixed vs open constraints}

## Deliver
(a) your top 3 problems ranked with severity (blocker/major/minor),
(b) your concrete redesign prescription (exact, not directional),
(c) one position you'd defend against {PEER A} ("{their likely objection}")
    and {PEER B} ("{their likely objection}").
Ground every claim in the actual code/tokens, not assumptions.
Return your full position as your final message (structured markdown).
If SendMessage to "main" is available, also send it there.
```

The pre-emptive defenses in (c) are load-bearing: naming the likely objection primes real disagreement instead of ten overlapping reviews.

**Peer defense pairing suggestions (vary by lens):**

| Lens | Typical PEER A | Typical PEER B |
|------|----------------|----------------|
| ux-ia | ux-minimal | ux-interaction |
| ux-interaction | ux-visual | ux-ia |
| ux-visual | ux-a11y | ux-minimal |
| ux-a11y | ux-visual | ux-interaction |
| ux-minimal | ux-ia | ux-a11y |
| ui-density | ux-ia | ui-content |
| ui-craft-polish | ux-visual | ux-interaction |
| ui-systems | ui-craft-polish | ux-interaction |
| ui-content | ux-ia | ui-density |
| ui-motion-micro | ux-minimal | ux-interaction |

---

## UX Lens 1 — `ux-ia` (information architecture)

Focus areas:

- Grouping logic and order: action clusters / preferences / navigation / destructive exits (serial-position, Gestalt proximity/common-region).
- Label clarity and term collisions: words bound to two referents; labels that over/under-promise destination (verify against what the route/page ACTUALLY does — read it).
- Redundancy vs disambiguation: repeated strings — noise, or load-bearing distinction between different objects that share a name?
- Scent of navigation: in-place vs navigate away vs open externally.
- Whether each element belongs on THIS surface vs settings/detail.
- Typical defenses: vs minimalist ("cut it entirely"), vs interaction ("control is fine where it is").

## UX Lens 2 — `ux-interaction` (motor efficiency, feedback, input ergonomics)

Focus areas:

- Target sizes and spacing vs platform floors (WCAG 2.5.8 24px, 44pt/48dp coarse-pointer); inter-target gaps (Fitts).
- System-status feedback: every async action changes something within ~100ms (Doherty, Nielsen H1). Dead-click windows.
- Affordances: cursor semantics, hover/press, "click = act + close" vs stateful persistence.
- Idiom collisions: stateful widgets inside menus/dialogs.
- Optimistic vs pessimistic updates for reversible low-risk toggles; rollback story.
- Typical defenses: vs visual ("don't add chrome/spinners"), vs IA ("move it to settings").

## UX Lens 3 — `ux-visual` (typography, rhythm, visual system)

Focus areas:

- Density and vertical rhythm; mixed row heights; separator count; radius/spacing token conflicts.
- Visual mass vs importance.
- State contrast as SURFACE distinction (WCAG 1.4.11 territory — flag for a11y to compute).
- Separators: rule vs whitespace.
- Emphasis honesty: destructive tint only for irreversible actions.
- Prescriptions grounded in existing token vocabulary with exact class/spacing values.
- Typical defenses: vs interaction ("add spinners"), vs minimalist ("collapse the control").

## UX Lens 4 — `ux-a11y` (WCAG + ARIA)

Focus areas — **REQUIRE computation, not eyeballing**:

- Contrast ratios from real theme tokens for text (1.4.3) AND non-text state (1.4.11), both themes. Report numbers; clear PASSes.
- Accessible-name computation: name bloat, aria-labelledby/describedby.
- Target sizes vs 2.5.8 with measured px.
- Focus integrity across async updates; live regions (4.1.3); never pointer-events-none mid-focus.
- Role masking; keyboard model of composed widgets; typeahead in every supported locale.
- Typical defenses: vs visual ("small text looks right"), vs interaction (often an ally on widget choice).

## UX Lens 5 — `ux-minimal` (product minimalism / JTBD)

Bias (verbatim): "every element must earn its place; the best {surface} is the one users never think about."

Focus areas:

- Right to exist HERE: job frequency vs permanence of real estate.
- Duplication: canonical home elsewhere (READ nav/editor code — cite line). Consolidation vs accretion.
- Context match: where intent forms.
- THE one job this surface must do instantly — does height/scan tax it?
- REMOVE vs DEMOTE; demote-with-telemetry when product freezes cuts.
- Typical defenses: vs IA ("consolidation was the point"), vs a11y ("in-place is more discoverable").

---

## UI Expert 1 — `ui-density` (information density & scan patterns)

Industry lens: dense product UIs (Later, Buffer, Meta Business Suite, Pinterest grids).

Focus areas:

- What earns a permanent row vs progressive disclosure?
- Scan path: primary action → secondary → metadata; where does the eye stutter?
- Uneven row heights / mixed second lines (meta that only some items have).
- Full-quota / healthy status as wallpaper (habituation that kills near-cap signals).
- Compact numeric forms (`12/100`) vs long prose for non-blocked states.
- Typical defenses: vs IA ("always show remaining"), vs content ("full sentence is clearer").

## UI Expert 2 — `ui-craft-polish` (craft quality)

Industry lens: Stripe / Linear-level polish.

Focus areas:

- Spacing rhythm, type hierarchy, border honesty, empty/full/near/blocked state dialects.
- Semantic collision: same paint for different meanings (e.g. opacity-50 for coming-soon AND quota-blocked).
- Progressive urgency must change **weight/color of the signal**, not only ambient chrome.
- Dark/light theme: fixed vs semantic tokens.
- Typical defenses: vs interaction ("disabled is enough"), vs visual ("muted xs is fine for blocked").

## UI Expert 3 — `ui-systems` (design systems & component APIs)

Focus areas:

- Duplicated component APIs / prop names for the same molecule.
- Escape-hatch sprawl (`meta?: ReactNode` without semantics).
- Status as first-class prop vs CSS-only private maps.
- Composable Root/Item patterns vs monolithic list organisms.
- Domain DTO vs UI presentation mapping — single helper, not per-dialog forks.
- Typical defenses: vs craft ("just hardcode classes"), vs interaction ("string meta is fine").

## UI Expert 4 — `ui-content` (content design / microcopy)

Focus areas:

- Unit + window + frame (scarcity vs available) per state and locale.
- Jargon (pending slots, in-flight, capacity) vs creator language.
- Ontology collisions (Facebook vs Facebook Reels; posts vs concurrent uploads).
- Name vs description split for a11y (short ACCNAME, long reason in description).
- Exact rewrite tables (en + product locales when present).
- Typical defenses: vs density ("shorter is always better"), vs IA ("users know what 100 means").

## UI Expert 5 — `ui-motion-micro` (motion & microinteraction)

Focus areas:

- Feedback requires a **delta** users can perceive; static muted text is data, not feedback.
- Duration tokens only: `duration-150|300|500`; no `transition-all`; no scale-on-hover if project forbids it.
- Load settle, post-action tick, band cross, hard-zero hit, reduced-motion fallbacks.
- Opacity-only disable is a weak primitive for quota blocks.
- Invalidate/refetch alone is not felt decrement — optimistic or digit flash.
- Typical defenses: vs minimal ("static text is enough"), vs visual ("don't animate").

---

## Round-2 template (send to **each of the 10** panelists)

```
ROUND 2 — cross-examination. The panel's positions conflict on {N} points.
Attack at least 2 peer claims with reasoning, concede where genuinely
convinced, then give your FINAL vote on each point (≤400 words total).

THE {N} CONTESTED POINTS + who said what:
1. {point} — YOU: {their claim}; {PEER}: {conflicting claim}; {PEER}: {…}
   {If their premise is checkable: "Your premise may be factually wrong — verify against {file} and respond."}
2. …

{Targeted verification asks, e.g.:
- "A11Y: VISUAL's concern is about SURFACE contrast (1.4.11, 3:1), not text —
  run that check against the real tokens."
- "UI-SYSTEMS: confirm whether {prop} is duplicated across {files}."
- "UI-CONTENT: propose exact en + pt-BR strings if copy is contested."
- "UI-MOTION: check allowed duration tokens in architectural guards."}

Also react to: {cross-cutting proposals not yet voted on}.
Return your final round-2 position as your final message (and SendMessage to main if available).
```

Tailor per recipient: lead each agent's digest with the points where **they** are under attack. Same numbered points for everyone so votes tally cleanly across all 10.

---

## Lite mode (only if user explicitly asks)

If the user says "lite", "UX only", or "5 lenses only":

- Phase 1–2 use only the five UX lenses.
- Still mention the five UI experts were skipped by request.
- Default remains **full 10**.

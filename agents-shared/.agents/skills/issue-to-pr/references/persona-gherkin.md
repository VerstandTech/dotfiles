# Persona-driven Gherkin (LookMyBio / olhaminha.bio)

Use this **before** writing `.feature` files. The point is not marketing fluff—it is to force scenarios that predict **simplify, clarify, fix, or recover** work beyond engineer happy paths.

Canonical audience research (when in this monorepo): `marketing/reference/audiences.md`.  
Capability truth (do not invent product promises): `marketing/reference/product-truth.md`.

---

## Default persona set

Pick **1–2 primaries** per issue. Name them in the feature header comment.

| ID | Segment | Digital fluency | Default JTBD lens |
|----|---------|-----------------|-------------------|
| **B** ⭐ | Solopreneur / coach / course creator | Medium–high; time-poor; hates agency complexity | Look pro, book/sell, schedule without a team |
| **E** ⭐ | Brazilian creator / MEI (pt-BR) | Medium; mobile-first; price-sensitive | Sell via IG/TikTok; everything must work in Portuguese |
| **A** | Nano/micro creator (1K–50K) | Medium; app-juggler; low WTP | Free-tier walls, first brand-deal polish, multi-app fatigue |
| **C** | Local SMB (salon, gym, restaurant) | **Lower** tech IQ; owner = marketer | Promo posts, “does this work?” anxiety, infrequent use |
| **D** | E-com / digital product seller | Higher; conversion-obsessed | Volume creative, multi-link hub, analytics honesty |

**Defaults:** B and/or E unless the issue is clearly freemium onboarding (A) or local-business chrome (C).

### Fluency model (use when writing copy/empty/error scenarios)

| Level | Typical | UI must |
|-------|---------|---------|
| Lower (often C, some E mobile) | Skims; taps first obvious button; ignores dense chrome | One primary action, plain language, big targets, no jargon (“oRPC”, “DTO”, “webhook”) |
| Medium (A, many B) | Can learn one new pattern per session | Progressive disclosure; hover-only = fail; explain gates *before* dead-end |
| Higher (D, power B) | Wants density and shortcuts | Keyboard paths, filters, batching—without breaking lower-fluency defaults |

**IQ is not intelligence—it is product literacy + patience budget.** Design for the lower of your two chosen personas when they conflict.

---

## Role-play script (act as the user)

Stay in first person for the walkthrough. Example: *“I'm Camila, MEI, phone on Instagram, need to post this week's promo without looking amateur.”*

For the issue's main job and each side path:

1. **Arrive** — Where do I land? Is the job obvious in <3 seconds?
2. **Orient** — What do I think these chips/tabs/cards mean? What would I confuse with what?
3. **Act** — What is the single next action? What do I fear will happen if I tap it?
4. **Wait** — Loading / credits / publish queue—do I understand time and cost?
5. **Outcome** — Success: can I verify it (posted, scheduled, saved)? Failure: do I know *why* and *what next*?
6. **Wrong turn** — If I open Calendar vs Posts, Create vs Providers, Free vs paid—am I safe?
7. **Leave and return** — Preferences, drafts, scroll position, sticky chrome—still make sense?

Write down every “I would get stuck / ask WhatsApp support / churn” moment as a **scenario candidate**.

---

## Confusion → scenario catalog

Map each confusion to a Gherkin shape. Prefer **preventing** the confusion (simpler UX) and still keep a scenario that locks the simpler behavior.

| Confusion class | Scenario intent | Example `Then` (outcome-level) |
|-----------------|-----------------|--------------------------------|
| **Empty / first run** | Zero posts, zero connections, new account | Sees clear empty CTA, not a blank grid or clipped pager |
| **Plan / tier wall** | Free: 0 connections, no scheduling | Action disabled or upgrade path with honest reason (product-truth accurate) |
| **Quota / credits** | 0 credits, IG remaining 0, TikTok pending cap | Create blocked with **text** remaining/reason, not color-only |
| **Wrong mental model** | Thinks bio storefront is checkout; thinks Coming soon is available | Coming-soon not in primary strip; no fake checkout claims |
| **Jargon / density** | Too many controls compete with Create | Sticky chrome ≤ budget; density controls don't bury primary job |
| **Hover-only meaning** | Meta only on hover | Same meta on focus-within and touch (a11y dual-path) |
| **Language** | en-only error in pt-BR product | User-visible string uses i18n; pt-BR path covered when issue touches copy |
| **Mobile thumb** | Tiny targets, nested scroll trap | Can scroll full list; primary targets usable |
| **Partial failure** | One platform failed, others ok | Failed urgency visible at rest; Retry without hover |
| **Idempotent re-entry** | Double submit, back button, refresh mid-load | No duplicate posts / clear in-progress state |
| **Permission** | Shared editor vs owner | Forbidden with clear ownership outcome |
| **Recovery** | OAuth expired, media missing | Actionable next step, not raw exception |
| **Adjacent regression** | Calendar / Create / Providers must still work | Smoke scenario or explicit regression suite note |

Not every row needs a scenario every time—only those **reachable** for this issue. Silence on a reachable confusion class is a gap.

---

## From walkthrough → Example Map → Gherkin

1. Promote walkthrough notes into **Rules** (`R#`) and **Examples** (`R#-E#`) on the issue if missing.
2. Collapse equivalent examples into Scenario Outlines (≤ ~8 rows).
3. One scenario title = one user-observable outcome.
4. Tag with closed vocabulary (`@use-case`, `@domain`, `@orpc`, …) per `docs/bdd/gherkin-conventions.md`.
5. Feature header comment: personas used + “confusion classes covered.”

```gherkin
# Personas: B (solopreneur, desktop), E (MEI, mobile pt-BR)
# Confusion covered: empty library, publish cap, hover-only meta, nested scroll
Feature: Socials posts library browse
  …
```

---

## Product-truth guardrails (persona honesty)

When role-playing, **do not** invent capabilities the code does not have. Common traps (from product-truth):

- Free tier: **0** social connections, **no** scheduling (Creator+)
- Bio page routes out—it is **not** an in-app storefront/checkout
- AI labeling claims only where implemented (e.g. don't over-claim beyond TikTok if that's the truth)
- Coming-soon platforms must not look available on primary Socials chrome

If a persona *wants* something we don't ship, scenarios should assert **honest gating / absence**, not a fake success path.

---

## Simplify vs scenario

When the walkthrough finds confusion:

| Prefer | When |
|--------|------|
| **Simplify the product** (remove chrome, better default, earlier gate, clearer label) | Confusion is structural; many personas hit it |
| **Scenario that locks guidance/recovery** | Edge is real (quota, authz) and must stay explicit |
| **Both** | Happy path simplified **and** hard gate still tested |

Gherkin that only documents a confusing UI is a smell—revise the intended UX in the issue, then encode the **improved** behavior.

---

## Checklist before leaving Step 1

- [ ] Primary persona(s) named
- [ ] Happy-path job completable in scenarios
- [ ] At least one empty/first-run or zero-data path if the surface can be empty
- [ ] At least one failure/recovery or gate path if the issue touches publish/credits/plan/auth
- [ ] No hover-only-only meaning for interactive meta (if UI)
- [ ] Product-truth: no scenarios that assert unshipped capabilities
- [ ] Example Map traceability (`R#` / comments)
- [ ] `bun run gherkin:generate` succeeds

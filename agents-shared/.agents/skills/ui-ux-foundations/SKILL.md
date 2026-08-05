---
name: ui-ux-foundations
description: Citation-anchored reference on the foundations of UI and UX design — visual aesthetics, the math of design (type scales, grids, color spaces, motion), the canonical HCI laws (Nielsen, Fitts, Hick, Norman, Gestalt), and what creates real user delight vs. surface decoration. Use when designing, reviewing, critiquing, or implementing any user interface; when a product needs to feel polished rather than templated; when writing or reviewing a design system; when answering "is this UI good?" or "why does this feel off?"; when scoping accessibility, micro-interactions, error states, or onboarding; or whenever the user references hierarchy, contrast, spacing, typography, color systems, motion, micro-interactions, delight, friction, dark patterns, usability heuristics, cognitive load, or HCI principles.
---

# UI/UX Foundations

A four-part reference grounded in the canonical sources: Rams, Norman, Nielsen, Bringhurst, Wathan & Schoger (Refactoring UI), Tim Brown, Material 3, Apple HIG, Yablonski's *Laws of UX*, Walter's *Designing for Emotion*, and Brignull on dark patterns.

## When to load which reference

The four references map to the four foundational questions. Load only the one you need.

| If the work is about… | Load |
|---|---|
| Aesthetic critique, why a UI looks templated, hierarchy, contrast, alignment, white space, what makes a UI feel "expensive" or "innovative" | [`references/visual-ui-principles.md`](references/visual-ui-principles.md) |
| Design tokens, type scales, 8pt grid, color systems (HSL/OKLCH), motion tokens, radius nesting, baseline grids, consistency types | [`references/design-math-and-consistency.md`](references/design-math-and-consistency.md) |
| User delight, friction reduction, anticipating intent, perceived performance, onboarding, microcopy, magic moments, dark patterns to avoid | [`references/ux-delight.md`](references/ux-delight.md) |
| Nielsen's 10 heuristics, Fitts/Hick/Miller/Tesler/Jakob's Laws, Gestalt, Norman's gulfs, mental models, affordances, accessibility (POUR), error-state policy | [`references/hci-laws.md`](references/hci-laws.md) |

If multiple apply (most non-trivial UI work), load several — the four are independent and small. A full audit usually needs all four.

## Core stance

These are guardrails for an agent that defaults to "looks fine." Three rules survive every situation:

1. **Functional → Reliable → Usable → Pleasurable** (Walter). Skip a tier and the next one cannot rescue you. Don't paint delight on top of a broken core.
2. **Less, but better** (Rams #10). Every element must justify its presence. Default-everything (centered hero, `border-radius: 8px`, generic shadow, blue-500 button) is the AI/template aesthetic — it's recognizable in under two seconds.
3. **Use the math, don't fight it.** Type scales, 8pt spacing, OKLCH color steps, radius families, motion durations — pick a system, derive everything from it. Magic numbers are the visible signature of an undisciplined UI.

## Related skills

This skill is the *theoretical foundation*. For applied workflows, chain with:

- `web-design-guidelines` — checklist-based UI review against established patterns
- `ux-audit` — full SaaS UX audit with reports
- `frontend-design:frontend-design` — building polished, distinctive frontend code
- `figma:figma-implement-design` — Figma → code translation
- `vercel:shadcn` — composing shadcn/ui with consistent tokens

This skill answers *why*; those skills answer *how*.

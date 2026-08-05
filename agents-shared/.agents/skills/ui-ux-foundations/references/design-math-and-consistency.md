# Design Math & Consistency — Tokens, Grids, Type Scales, Color, Motion

Sources: Refactoring UI, Bringhurst, Tim Brown's *Modular Scale*, Material 3, Apple HIG, Bryn Jackson ("The 8-Point Grid"), Björn Ottosson (OKLCH), Radix Colors, Salesforce/Material design tokens, Penner's easing equations.

## Table of contents

1. Design tokens (the atomic system)
2. Consistency types (visual, functional, internal, external)
3. Grid systems (8pt, 4pt for icons, baseline)
4. Type scale mathematics
5. Color systems (HSL, OKLCH, palette construction, contrast)
6. Spacing scales
7. Radius scales (and the nested-radius rule)
8. Motion tokens (durations, easings)

---

## 1. Design tokens — the atomic system

(Salesforce Lightning popularized "design tokens"; Material, Spectrum, Polaris all standardize the practice.)

**Three token tiers** (Brad Frost, refined by Material 3):

- **Reference tokens** — raw values: `color-blue-500: #3b82f6`
- **System tokens** — semantic mappings: `color-action-primary: {color-blue-500}`
- **Component tokens** — scoped overrides: `button-primary-bg: {color-action-primary}`

A brand refresh changes reference tokens; a UX refactor changes component tokens; **system tokens are the stable contract** between them.

---

## 2. Consistency types (NN/g)

| Type | Definition | Example |
|---|---|---|
| **Visual** | Same things look the same | All primary buttons share radius, shadow, padding |
| **Functional** | Same controls behave the same | Every "Cancel" closes without saving, everywhere |
| **Internal** | Within your product | Color tokens and spacing scale match across pages |
| **External** | With platform / web conventions | macOS uses ⌘+W; the web uses underlined links |

External consistency is the most often violated by "innovative" AI-generated UIs — reinventing dropdowns or date pickers loses years of user muscle memory. Conform unless you have measured benefit not to (see Jakob's Law in `hci-laws.md`).

---

## 3. Grid systems

### 8-point grid (Bryn Jackson; Material; Apple's 8pt minor / 4pt micro)
- Layout spacing: multiples of 8 → `8, 16, 24, 32, 48, 64, 96`
- Component padding: multiples of 4 within (12px button padding inside an 8px grid)
- **Why 8**: divisible by 2 four times; scales cleanly to 1.5×, 2×, 3× displays without subpixel rounding

### 4-point grid for icons (Material)
- 24×24dp container, 20×20dp live area, 2dp keyline padding
- Optical alignment: a circle should be ~2dp larger than a square to look the same size
- Stroke widths quantized to 1.5/2/2.5dp — never arbitrary

### Baseline grid (Bringhurst, *Elements*)
- All text sits on a regular vertical rhythm — typically 4 or 8px
- `line-height` = baseline multiple (`line-height: 24px` for `font-size: 16px` on an 8px baseline)
- When columns of text align baselines across gutters, the page feels *composed*; when they don't, it feels accidental

---

## 4. Type scale mathematics

### Bringhurst's traditional scale
`6, 7, 8, 9, 10, 11, 12, 14, 16, 18, 21, 24, 36, 48, 60, 72`. Note the irregular jumps — non-uniform on purpose because perception of size is non-linear.

### Modular scale ratios (Tim Brown, *Modular Scale*; musical intervals)

| Ratio | Name | Personality | Sample (16px base) |
|---|---|---|---|
| **1.067** | minor 2nd | very tight | 16 → 17 → 18.2 |
| **1.125** | major 2nd | calm, editorial | 16 → 18 → 20.25 → 22.78 |
| **1.2** | minor 3rd | gentle, default-safe | 16 → 19.2 → 23.04 → 27.65 |
| **1.25** | major 3rd | Tailwind-ish | 16 → 20 → 25 → 31.25 → 39 |
| **1.333** | perfect 4th | punchy, marketing | 16 → 21.3 → 28.4 → 37.9 |
| **1.414** | aug 4th (√2) | A-paper ratio | 16 → 22.6 → 32 |
| **1.5** | perfect 5th | strong | 16 → 24 → 36 → 54 |
| **1.618** | golden | dramatic display only | 16 → 26 → 42 |

**Practical**: use **two scales** — a tighter ratio (1.125/1.2) for body and small UI, a wider ratio (1.333/1.5) for display headlines. The ratio sets the personality; a single value across the whole product is the strongest unifier you have.

### Golden ratio (φ ≈ 1.618)
Useful for **layout proportions** (sidebar : content = 1 : 1.618) and crop ratios. Too aggressive for granular type sizing.

---

## 5. Color systems

### HSL (CSS3)
Hue 0–360, saturation 0–100%, lightness 0–100%. Easy to reason about, but **not perceptually uniform** — equal L steps don't look equal (yellow at L=50% looks brighter than blue at L=50%).

### OKLCH (Björn Ottosson, 2020; CSS Color 4)
Perceptual lightness, chroma, hue. `oklch(60% 0.15 250)` — a blue at perceptual L=60%. L=60% in OKLCH always looks the same brightness regardless of hue. **Recommended for new design systems** (Tailwind v4 ships OKLCH; Radix Colors uses a derived perceptual system).

### Palette construction (Refactoring UI; Radix Colors)
- **9–12 steps per color** (50, 100, 200…900, 950)
- Steps mapped to roles (Radix's 12-step semantic scale):
  - 1–2: app backgrounds
  - 3: subtle bg
  - 4–5: hover/active bg
  - 6–8: borders
  - 9: solid fills
  - 10: hover
  - 11: secondary text
  - 12: primary text
- **Pair colors of the same step number** for consistent contrast (gray-9 on white ≈ blue-9 on white in contrast feel)
- **Don't just darken with L**: as L decreases, also rotate H toward blue/purple (cooler shadows feel real); as L increases, rotate toward yellow (warmer highlights). Pure-L gradients look muddy.

### Contrast ratios
- **WCAG AA**: 4.5:1 body, 3:1 large (≥18pt or 14pt bold), 3:1 non-text UI
- **WCAG AAA**: 7:1 body, 4.5:1 large
- **APCA** (proposed WCAG 3): more perceptually accurate, ~Lc 75 ≈ AA body, Lc 90 ≈ AAA

### 60-30-10 rule
60% dominant neutral, 30% secondary, 10% accent. Most "AI-generated" designs invert this and drown in accent color.

---

## 6. Spacing scales

| Strategy | Sequence | Use case |
|---|---|---|
| Linear (4) | 4, 8, 12, 16, 20, 24, 28… | Fine control, gets unwieldy past ~32 |
| Linear (8) | 8, 16, 24, 32, 40, 48… | Coarse but predictable |
| Exponential | 4, 8, 16, 32, 64, 128 | Too jumpy in mid-range |
| **Hybrid (Tailwind)** | **0, 1(4), 2(8), 3(12), 4(16), 6(24), 8(32), 12(48), 16(64), 24(96), 32(128)** | **Empirical winner** — fine where 1px matters, coarse where 16px doesn't |

---

## 7. Radius scales

### Family principle (Spectrum; Material 3 Shape)
Radii must feel related. Card at 12px + inner button at 4px = 3:1 jump (jarring). Card at 12px + button at 8px = 1.5:1 (harmonious).

Common scale: `0, 2, 4, 6, 8, 12, 16, 24, 9999 (full/pill)`.

### Nested radius rule (Apple HIG, "concentric rounded rectangles")
`inner_radius = outer_radius − padding`

A card with 16px radius and 8px padding contains an inner element with 8px radius. Otherwise the curves visibly mismatch and the whole layout looks amateur.

---

## 8. Motion tokens

### Duration scale (Material 3 Motion; Apple HIG)
- **50–100ms** — instant feedback (hover, button press)
- **100–200ms** — small transitions (tooltip, dropdown)
- **200–300ms** — medium (modal, page transition)
- **300–500ms** — large (full-screen sheet)
- **>500ms** — feels slow on the web; reserve for showcase animations only

### Easing curves (Material 3; Penner)
- **Linear** — only for continuous progress (loading bars)
- **Ease-out** `cubic-bezier(0.0, 0.0, 0.2, 1)` — elements *entering* (fast in, settles)
- **Ease-in** `cubic-bezier(0.4, 0.0, 1, 1)` — elements *exiting* (gentle out, fast end)
- **Ease-in-out** `cubic-bezier(0.4, 0.0, 0.2, 1)` — movement that starts and ends on screen
- **Spring** (Apple, Framer Motion) — physically based via stiffness/damping/mass; replaces cubic-bezier for most modern interactions because it feels alive

### Reduced motion
Respect `prefers-reduced-motion: reduce`. Replace transforms with cross-fades, kill spring physics, shorten or skip transitions.

---

## Sources

- Wathan & Schoger, *Refactoring UI*
- Bringhurst, *The Elements of Typographic Style*
- Tim Brown, *Modular Scale* (modularscale.com); *Flexible Typesetting*
- Bryn Jackson, "The 8-Point Grid"
- Björn Ottosson, "A perceptual color space for image processing" (OKLab/OKLCH)
- Radix Colors documentation (radix-ui.com/colors)
- Material Design 3 Motion + Shape guidelines
- Apple HIG (concentric rounded rectangles, motion)
- WCAG 2.2 (w3.org/WAI/WCAG22); APCA (git.apcacontrast.com)
- Brad Frost, *Atomic Design* (atomicdesign.bradfrost.com)
- Salesforce *Lightning Design System* (design tokens origin)
- Penner's easing equations

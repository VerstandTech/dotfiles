# HCI Laws & Principles — The Canonical Set

Sources: Jakob Nielsen / NN/g (10 Heuristics), Don Norman (*The Design of Everyday Things*), Jon Yablonski (*Laws of UX*), Paul Fitts (1954), Hick & Hyman (1952), George Miller (1956) and Cowan (2001), Larry Tesler (~1984), Ebbinghaus, Daniel Kahneman (Peak-End), Wertheimer/Köhler/Koffka (Gestalt), James Gibson / Norman (affordances), W3C WAI (WCAG 2.2 / POUR).

## Table of contents

1. Nielsen's 10 Usability Heuristics
2. Fitts's Law (target size + distance)
3. Hick's Law (decision time)
4. Miller's Law (and the modern critique)
5. Tesler's Law (conservation of complexity)
6. Jakob's Law (users spend most time elsewhere)
7. Goal-Gradient, Zeigarnik, Peak-End, Serial Position
8. Gestalt principles
9. Mental models vs. system models (Norman)
10. Affordances and signifiers (Gibson / Norman)
11. Feedback loops
12. The Gulfs of Execution and Evaluation (Norman)
13. Recognition over recall
14. Principle of Least Astonishment
15. Accessibility as UX (WCAG / POUR)
16. Error state hierarchy: Prevent → Forgive → Recover → Educate

---

## 1. Nielsen's 10 Usability Heuristics (Nielsen, NN/g, 1994)

1. **Visibility of System Status** — keep users informed via timely feedback.
   - *Apply*: progress bar shows 3 of 5 steps; toast confirms saved.
   - *Violate*: user clicks "Send," nothing visible for 4s.

2. **Match Between System and the Real World** — speak users' language; follow real-world conventions.
   - *Apply*: shopping cart icon, trash icon for delete.
   - *Violate*: "Commit transaction to persistence layer" instead of "Save."

3. **User Control and Freedom** — clearly marked exits, undo, redo.
   - *Apply*: Gmail Undo Send; modal closes on Esc.
   - *Violate*: multi-step wizard with no Back; destructive actions with no undo.

4. **Consistency and Standards** — same words, icons, patterns within and across products.
   - *Apply*: primary action is always the right-most filled button.
   - *Violate*: "Save" / "Submit" / "Apply" all meaning the same thing on different screens.

5. **Error Prevention** — design out the conditions that cause errors.
   - *Apply*: date picker; disabled submit until valid; type-to-confirm for irreversible delete.
   - *Violate*: free-text date that accepts "2026-13-45."

6. **Recognition Rather Than Recall** — make options visible.
   - *Apply*: autocomplete; recently-used; visible menu.
   - *Violate*: "enter the code we showed on the previous screen."

7. **Flexibility and Efficiency of Use** — accelerators for experts, hidden from novices.
   - *Apply*: Cmd-K command palette; type-ahead; saved filters.
   - *Violate*: every user must walk the same menu chain.

8. **Aesthetic and Minimalist Design** — every extra element competes for attention.
   - *Apply*: focused dashboard with the 3 metrics that matter.
   - *Violate*: dashboard with 47 widgets and 6 nav menus.

9. **Help Users Recognize, Diagnose, and Recover from Errors** — plain language; pinpoint problem; suggest fix.
   - *Apply*: "Email already in use. [Sign in instead] or [Reset password]."
   - *Violate*: "Error 500. Contact support."

10. **Help and Documentation** — easy to search, focused on the user's task, listing concrete steps.
    - *Apply*: contextual `?` linking to the relevant doc; in-product search.
    - *Violate*: 200-page PDF manual; broken docs link.

---

## 2. Fitts's Law (Paul Fitts, 1954)

`T = a + b · log₂(D/W + 1)`

Time to acquire a target = function of distance D and target width W. Bigger and closer = faster.

- **Apply**: 44×44px minimum tap targets (Apple HIG); primary action button is large and high-contrast; right-click menus appear *at the cursor*; **screen edges and corners are infinitely tall/wide** along one axis (the cursor stops there) — that's why macOS puts the menu bar at screen top and Windows puts Start in a corner.
- **Violate**: a 12px close button in a small window's top-right, far from where the user just clicked.

---

## 3. Hick's Law (Hick & Hyman, 1952)

`RT = a + b · log₂(n+1)` — decision time scales with log of options.

- **Apply**: chunk a 30-item nav into 5 categories of 6; default sort/filter to a useful preset; show 3 pricing tiers, not 9.
- **Violate**: dropdown with 200 unsorted countries; settings page with 80 toggles.

---

## 4. Miller's Law (George Miller, 1956) — and the modern critique

Often cited as **7 ± 2 chunks** in working memory. The most-misapplied number in UX.

**Modern critique** (Cowan, 2001): working memory limit is **~4 chunks** for novel information. Miller's 7±2 was about *immediate* memory span (with rehearsal), not working memory. Yablonski (*Laws of UX*) notes that the "magic 7" is widely misapplied as a hard UI limit; the practical advice (**chunk**, group related items, limit list lengths) is correct; the specific number is folklore.

- **Apply**: phone numbers chunked `415-555-1234`; navigation grouped into 4–6 sections; credit card field auto-spaces every 4 digits.
- **Violate**: a single 16-digit unbroken card-number field with no spacing.

---

## 5. Tesler's Law — Conservation of Complexity (Larry Tesler, ~1984)

Every system has irreducible complexity. The only question is **who absorbs it** — the user or the designer/engineer.

- **Apply**: email clients hide MIME, IMAP, threading rules — engineers eat the complexity. Stripe Checkout absorbs PCI compliance, 3DS2, SCA, currency conversion.
- **Violate**: surfacing every config knob to the user because it's easier than picking a default.

---

## 6. Jakob's Law (Jakob Nielsen)

Users spend most of their time on *other* sites. Their expectations are formed elsewhere. **Conform to convention** unless you have a *very* good reason and *measured* benefit not to.

- **Apply**: cart icon top-right; logo top-left links to home; primary action is a filled button; Cmd-S saves.
- **Violate**: inventing a novel scroll behavior; reversing OK/Cancel order; hiding navigation behind a non-standard gesture.

---

## 7. Goal-Gradient, Zeigarnik, Peak-End, Serial Position

### Goal-Gradient Effect (Hull, 1932; Kivetz et al., 2006 in UX)
Motivation increases as people approach a goal. Showing progress accelerates completion.
- *Apply*: progress bar on multi-step forms; LinkedIn profile-completeness meter; pre-filled checklist starting at 30% not 0%.

### Zeigarnik Effect (Bluma Zeigarnik, 1927)
Open loops are remembered better than closed ones. People feel tension toward incomplete tasks.
- *Apply*: "1 of 4 onboarding steps complete" persistent banner; auto-saved draft with "Continue your post" prompt.
- *Caution*: artificial incompleteness manufactured to nag (engagement-bait notifications) crosses into dark-pattern territory. Use ethically.

### Peak-End Rule (Kahneman, 1993)
People judge an experience by its **peak** moment and its **end**, not its average. Middle is largely forgotten.
- *Apply*: invest in the celebratory success state and the offboarding/checkout end; the "thanks for subscribing" page is more memorable than the form before it.
- *Violate*: smooth flow ending with a bare "Done." or generic 200 OK redirect.

### Serial Position Effect (Ebbinghaus)
Items at start (primacy) and end (recency) of a list are remembered best.
- *Apply*: most important nav items at far left and far right (Home, Account); Save/Cancel at form ends.
- *Violate*: bury the primary action mid-row of a 7-item button group.

---

## 8. Gestalt Principles (Wertheimer, Köhler, Koffka — 1920s)

How the visual system groups perception. NN/g and Yablonski both treat them as foundational.

- **Proximity** — items close together are perceived as related. *Apply*: form labels close to inputs. *Violate*: equal spacing between label/input and input/next-label, so it's ambiguous which label belongs to which field.
- **Similarity** — shared visual properties imply shared function. *Apply*: all destructive buttons red, all primary buttons brand color. *Violate*: random color assignment; two identically styled buttons doing different things.
- **Closure** — the brain completes incomplete shapes. *Apply*: a card with rounded corners and partial border still reads as a card; loading skeletons rely on this.
- **Continuity** — the eye follows smooth lines. *Apply*: aligned columns, baseline grids. *Violate*: jagged left edges in a column of text.
- **Common Region** — items inside a shared boundary (card, panel) are grouped. *Apply*: card-based dashboards; settings sections in bordered groups.
- **Figure / Ground** — distinguishing object from background. *Apply*: high-contrast modal with dimmed backdrop. *Violate*: light-grey text on white; modal that doesn't separate from the page.

---

## 9. Mental models vs. system models (Norman)

- **User's mental model** — how the user *thinks* the system works
- **System's conceptual model** — how it actually works
- **Designer's model** — how the designer intends it to be understood

The interface is the only way the user encounters the system, so **the interface must teach the right mental model**. When the three diverge, errors and frustration follow.

- *Apply*: file/folder metaphor; trash that "still has the file" until emptied (mirrors physical trash).
- *Violate*: "Sign out" that doesn't actually sign you out on other devices.

---

## 10. Affordances and signifiers (Gibson 1979 / Norman 1988, refined 2013)

- **Affordance** (Gibson) — what an object *allows* an actor to do. A chair affords sitting.
- **Perceived affordance / Signifier** (Norman) — the cues that communicate the affordance. A "Push" sign on a door is a signifier.

In digital UI, affordances are abstract — everything is pixels. So **signifiers do all the work**: button shadow, underlined link, cursor change on hover, "Click to expand" text.

- *Apply*: buttons that look pressable (slight elevation, contrast); inputs with visible borders and placeholder; icons paired with labels until the convention is universal.
- *Violate*: ghost buttons indistinguishable from labels; clickable areas with no hover state. Norman explicitly criticized the iOS/Material flat-design era in the 2013 revision for regressing on this.

---

## 11. Feedback loops

- **Immediate** (<100ms) — direct manipulation: hover, button press, drag
- **Short-delay** (100–400ms) — within Doherty: optimistic UI, loading state appearance
- **Long-delay** (>1s) — must show progress, allow cancellation, notify on completion (toast, badge, email)
- **Contextual** — appears at the action location, not in a global banner. Inline validation under the field beats a top-of-page error summary.

**Every action requires feedback. Silence is the worst response a system can give.**

---

## 12. The Gulfs of Execution and Evaluation (Norman, 1986; *DOET*)

- **Gulf of Execution** — gap between what the user wants to do and the actions the system requires. Bridged by **signifiers, constraints, mappings, and a clear conceptual model**.
- **Gulf of Evaluation** — gap between the system's state and the user's understanding of it. Bridged by **feedback and a clear conceptual model**.

Every usability problem reduces to one of these gulfs being too wide.

- *Execution example*: user wants to share a doc; share button is buried in `…` menu (gulf wide). Fix: surface the share affordance.
- *Evaluation example*: user clicks "Publish" and nothing visible happens; was it published? (gulf wide). Fix: immediate optimistic state + confirmation.

---

## 13. Recognition over recall

(Nielsen Heuristic #6, repeated because fundamental.) Working memory is expensive; long-term recognition is cheap. **Show, don't make them remember.**

- *Apply*: visible navigation, breadcrumbs, autocomplete, recently-used items, command palettes that show possibilities as you type.
- *Violate*: command-line incantations; "enter the code we showed on the previous screen"; modal that closes the data the user needs to fill it in.

---

## 14. Principle of Least Astonishment (POLA)

A system should behave the way a reasonable user expects. Surprise is a usability failure.

- *Apply*: Cmd-Z undoes; Esc closes the modal; clicking the logo goes home; Back returns to the previous state.
- *Violate*: Esc submits the form; Back skips three steps; clicking a list item expands inline on one row but opens a new page on another.

---

## 15. Accessibility as UX (WCAG 2.2 / POUR)

Accessibility is not a separate concern bolted on at the end — it is core UX. WCAG's **POUR** principles (W3C/WAI):

- **Perceivable** — text alternatives for images; captions for video; sufficient color contrast (AA: 4.5:1 normal, 3:1 large and UI components).
- **Operable** — full keyboard navigation; visible focus indicators; no keyboard traps; respect `prefers-reduced-motion`; target size ≥ 24×24 CSS px (2.2 AA, with exceptions); avoid drag-only interactions.
- **Understandable** — predictable navigation; consistent labels; clear error identification with suggestions; correct `lang` attribute.
- **Robust** — valid semantic HTML; correct ARIA roles only when semantic HTML is insufficient; tested with screen readers (VoiceOver, NVDA, JAWS).

Designs that work for users with disabilities tend to work better for all users (curb-cut effect).

---

## 16. Error state hierarchy: Prevent → Forgive → Recover → Educate

A practical four-stage policy for every error scenario:

1. **Prevent** — disable invalid actions, constrain inputs, validate before submission, default to safe choices
2. **Forgive** — accept messy input (Postel); auto-correct obvious typos; preserve user input across errors; provide undo for destructive actions
3. **Recover** — when an error occurs, the message must say *what happened, why, and what the user can do next* (Nielsen #9). One-click recovery wherever possible.
4. **Educate** — surface the underlying constraint so the user doesn't repeat the error. ("Passwords must be 12+ characters" *before* they type, not after they submit.)

---

## Sources

- Jakob Nielsen, *10 Usability Heuristics for User Interface Design* (NN/g, 1994; refined 2024)
- Don Norman, *The Design of Everyday Things* (revised 2013)
- Jon Yablonski, *Laws of UX* (lawsofux.com / O'Reilly)
- Paul Fitts, "The information capacity of the human motor system" (1954)
- Hick & Hyman, *Quarterly Journal of Experimental Psychology* (1952)
- George Miller, "The Magical Number Seven, Plus or Minus Two" (1956)
- Nelson Cowan, "The magical number 4 in short-term memory" (2001)
- Larry Tesler, *Communications of the ACM* on conservation of complexity
- Daniel Kahneman, "Evaluations of moments and episodes" (Peak-End, 1993)
- Hermann Ebbinghaus, *Über das Gedächtnis* (Serial Position)
- Wertheimer, Köhler, Koffka — Gestalt school (1920s)
- James J. Gibson, *The Ecological Approach to Visual Perception* (1979)
- W3C WAI, *WCAG 2.2* (w3.org/WAI/WCAG22)
- Bluma Zeigarnik, "Über das Behalten von erledigten und unerledigten Handlungen" (1927)
- Doherty & Thadani, IBM Systems Journal (1982)

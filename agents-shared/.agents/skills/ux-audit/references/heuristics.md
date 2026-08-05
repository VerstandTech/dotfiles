# UX Heuristics Reference

## Table of Contents
1. [Nielsen's 10 Usability Heuristics](#nielsens-10)
2. [SaaS-Specific Patterns](#saas-patterns)
3. [Jobs-to-Be-Done Framework](#jtbd)
4. [Cognitive Load Checklist](#cognitive-load)
5. [Accessibility Quick Checks](#accessibility)

---

## Nielsen's 10 Usability Heuristics {#nielsens-10}

For each page, evaluate against these heuristics. Score 0-4 (0=no issue, 4=catastrophic).

| # | Heuristic | What to look for |
|---|-----------|-----------------|
| 1 | **Visibility of system status** | Loading indicators, progress bars, success/error feedback, active states, breadcrumbs |
| 2 | **Match between system and real world** | Familiar language (not dev jargon), logical ordering, metaphors users understand |
| 3 | **User control and freedom** | Undo/redo, cancel buttons, back navigation, clear exit points, non-destructive defaults |
| 4 | **Consistency and standards** | Same action = same result everywhere, platform conventions followed, consistent terminology |
| 5 | **Error prevention** | Confirmation dialogs for destructive actions, inline validation, disabled states for invalid actions, smart defaults |
| 6 | **Recognition rather than recall** | Visible options, contextual help, recently used items, auto-complete, labels on icons |
| 7 | **Flexibility and efficiency** | Keyboard shortcuts, bulk actions, customizable views, power-user paths alongside beginner paths |
| 8 | **Aesthetic and minimalist design** | No irrelevant information, clear visual hierarchy, whitespace usage, progressive disclosure |
| 9 | **Help users recognize, diagnose, recover from errors** | Plain language errors, specific problem description, constructive suggestion, no error codes shown raw |
| 10 | **Help and documentation** | Contextual tooltips, onboarding tours, searchable docs, FAQ links at friction points |

---

## SaaS-Specific Patterns {#saas-patterns}

### Onboarding & Activation
- **Time to value**: How many steps/clicks from signup to first meaningful action?
- **Empty states**: Do empty pages guide users to take action, or show blank space?
- **Progress indicators**: Is there a setup checklist or progress bar?
- **Sample data**: Are there examples/templates to reduce cold-start friction?
- **Activation metric**: What's the "aha moment"? Is the UI guiding toward it?

### Navigation & Information Architecture
- **Primary nav**: Is the most important action 1 click away?
- **Secondary nav**: Are settings/account/billing easy to find but not in the way?
- **Breadcrumbs**: Can users always tell where they are?
- **Search**: Is there global search? Does it work across entities?
- **Mobile nav**: Does the nav collapse appropriately? Is the hamburger discoverable?

### Pricing & Upgrade Friction
- **Plan comparison**: Are plan differences immediately clear?
- **Upgrade prompts**: Are they contextual (at the point of need) vs. intrusive (random popups)?
- **Feature gating**: Is it clear what's locked vs. available?
- **Trial experience**: Can users try before buying? Is the trial length visible?

### Dashboard & Data Display
- **Key metrics first**: Are the most important numbers prominent?
- **Actionable data**: Can users act on what they see, or is it just informational?
- **Filters & sorting**: Can users slice data the way they need?
- **Empty/zero states**: What happens when there's no data yet?
- **Loading states**: Skeletons vs. spinners vs. nothing?

### Forms & Input
- **Field count**: Minimum viable fields? Every extra field = drop-off
- **Inline validation**: Real-time feedback vs. submit-then-error?
- **Smart defaults**: Are sensible defaults pre-filled?
- **Autosave**: For long forms, is progress saved?
- **Mobile input**: Correct keyboard types? Touch targets 44px+?

### Feedback & Communication
- **Success states**: Clear confirmation after actions?
- **Error states**: Actionable error messages?
- **Loading states**: Perceived performance OK? Skeleton screens?
- **Notifications**: In-app vs. email vs. push? User can control preferences?
- **Changelogs/updates**: How are new features communicated?

---

## Jobs-to-Be-Done Framework {#jtbd}

For each page, identify:

1. **What job is the user hiring this page to do?**
   - Functional: "I need to [specific task]"
   - Emotional: "I want to feel [confident/in control/creative]"
   - Social: "I want to [look professional/impress clients]"

2. **What's the user's context when they arrive?**
   - Where did they come from? (Navigation path)
   - What do they already know?
   - What's their emotional state? (Frustrated? Excited? Confused?)

3. **What would make them switch away?**
   - Too many steps?
   - Confusing terminology?
   - Missing feature?
   - Slow performance?

4. **What's the desired outcome?**
   - What does "done" look like for this job?
   - How quickly should they get there?

---

## Cognitive Load Checklist {#cognitive-load}

### Intrinsic Load (complexity of the task itself)
- [ ] Is the task broken into manageable steps?
- [ ] Are complex decisions deferred until necessary?
- [ ] Are defaults provided for non-critical choices?

### Extraneous Load (unnecessary complexity from bad design)
- [ ] Is irrelevant information hidden or removed?
- [ ] Is visual noise minimized?
- [ ] Are related items grouped together?
- [ ] Is the visual hierarchy clear (what to read/do first)?

### Germane Load (effort that helps learning)
- [ ] Are patterns consistent so users learn once and apply everywhere?
- [ ] Are affordances clear (buttons look clickable, links look like links)?
- [ ] Does progressive disclosure reveal complexity only when needed?

---

## Accessibility Quick Checks {#accessibility}

| Check | How to verify |
|-------|--------------|
| Color contrast | Text readable against background? (WCAG AA: 4.5:1 normal, 3:1 large) |
| Keyboard navigation | Can all interactive elements be reached with Tab? |
| Focus indicators | Visible focus ring on focused elements? |
| Alt text | Images have meaningful alt text? |
| Touch targets | Buttons/links at least 44x44px on mobile? |
| Motion | Animations respect prefers-reduced-motion? |
| Screen reader | Semantic HTML used? ARIA labels where needed? |
| Zoom | Page usable at 200% zoom? |
| Form labels | Every input has an associated label? |
| Error identification | Errors identified by more than just color? |

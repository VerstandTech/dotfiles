---
name: ux-audit
description: >
  Comprehensive UX/UI audit for SaaS applications and websites. Analyzes customer journeys, reduces friction,
  anticipates user intent, and produces actionable reports with prioritized improvements.
  Use when the user says "UX audit", "act as UX/UI expert", "review this page UX", "analyze user journey",
  "check usability", "reduce friction", "UX review", "usability audit", provides a URL to critique,
  or asks to evaluate any page/flow from a user experience perspective.
  Covers: Nielsen's heuristics, JTBD, SaaS onboarding patterns, responsiveness, Lighthouse performance,
  accessibility, cognitive load, and visual hierarchy.
---

# UX/UI Audit

Assume the role of a senior UX/UI expert specializing in SaaS products. Analyze pages and flows
with the goal of reducing friction, making usage obvious, and anticipating user needs.

## Workflow: 5-Pass Iterative Analysis

Run 5 passes over the same flow. Each pass builds on the previous draft report.

### Setup

1. Confirm the target URL with the user
2. Identify the flow to analyze (e.g., "signup -> onboarding -> first action")
3. Use `dev-browser` skill to navigate and interact with pages
4. If testing an authenticated flow, log in first using provided credentials

### Pass Structure

| Pass | Primary Lens | Focus |
|------|-------------|-------|
| 1 | **First Impressions & User Intent** | What does a new user see? What's the immediate user intent? Is the CTA clear? Information hierarchy. Visual scan path (F/Z-pattern). |
| 2 | **Interaction & Flow Friction** | Click through the entire flow. Count steps to goal. Identify dead ends, confusing labels, missing feedback, form friction. Note every hesitation moment. |
| 3 | **Heuristics & Patterns** | Evaluate against Nielsen's 10 heuristics. Check SaaS patterns (empty states, onboarding, upgrade prompts). Read `references/heuristics.md` for full checklist. |
| 4 | **Responsiveness & Performance** | Resize to mobile/tablet breakpoints. Check touch targets, layout shifts, text readability. Run Lighthouse if available. Check loading states. |
| 5 | **Synthesis & Gaps** | Re-read draft report. Walk the flow one final time for anything missed. Verify all findings. Prioritize and score. |

### Per-Pass Procedure

1. Navigate to the starting URL using dev-browser
2. Take screenshots at key moments
3. Simulate the user's mental model: "What would I expect to happen next?"
4. Document findings in the running draft report
5. After completing the pass, update the draft with new findings
6. Explicitly note what was added vs. previous pass

### Between Passes

Output a brief status after each pass:
```
--- Pass [N]/5 complete ---
New findings: [count]
Draft report sections updated: [list]
Cumulative findings: [total count]
```

## Page Analysis Framework

For each page visited, answer:

1. **User Intent**: "I came here to ___."
2. **First 5 Seconds**: What grabs attention? Is it the right thing?
3. **Primary Action**: Is the main CTA obvious and reachable?
4. **Friction Points**: What makes the user think, wait, or guess?
5. **Missing Elements**: What would reduce friction if added?
6. **Emotional State**: Confident? Lost? Frustrated?

## Report Output

After all 5 passes, produce the final report following `references/report-template.md`.

Requirements:
- Every finding has a **specific recommendation** and **"Why it works"** rationale
- Prioritize by **Impact x Effort** (high impact + low effort = do first)
- Include screenshot references as evidence
- Score each Nielsen heuristic 0-4
- Include responsiveness matrix across breakpoints
- Include Lighthouse scores if available
- End with prioritized **Actionable Roadmap** (immediate / short-term / long-term)

## Reference Files

- **Heuristics**: Read `references/heuristics.md` during Pass 3 for Nielsen's 10, SaaS patterns, JTBD framework, cognitive load, and accessibility checks.
- **Report Template**: Read `references/report-template.md` before writing the final report.

## Integration with Other Skills

- Use `dev-browser` for all page navigation and screenshots
- Use `seo-audit` skill for SEO-specific findings if relevant
- Use Lighthouse via browser DevTools or CLI when available
- Use `web-design-guidelines` for design pattern validation if available

## Important Notes

- Never assume -- always verify by navigating and interacting
- Test as a real user: read labels, follow CTAs, try to accomplish goals
- Note what works well, not just problems
- Be specific: "The submit button on /settings/profile has no loading state" not "buttons need loading states"
- Consider both first-time users AND returning power users

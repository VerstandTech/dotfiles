# Triage: severity + reviewer dialects

How to read a review comment and decide what to do about it.

## Severity ladder

Use the same ladder regardless of reviewer. Map their dialect onto it.

| Severity | Action | Examples |
|----------|--------|----------|
| **Blocker** | Must fix before merge. | broken auth, security hole, build error, regression |
| **Suggestion** | Fix unless there's a strong reason not to. | better pattern, missed edge case, cleaner API |
| **Nit** | Fix if it's cheap. Defer with a follow-up issue if not. | naming, formatting, minor style |
| **Question** | Answer in a reply. Edit code only if the answer requires it. | "why this approach?", "is X considered?" |

When you defer a nit, say so explicitly: `Deferring to follow-up <issue-link>; the touch is large for a nit and we're under a release window.`

## Human dialects

Reviewers in this org commonly tag comments inline:

- `[issue]` — blocker
- `[suggestion]` — suggestion
- `[nit]` — nit
- `[question]` — question
- `[praise]` — informational, no action

Untagged plain prose is most often a suggestion. Read the verb: "must", "needs to", "blocks", "broken" → blocker; "consider", "could", "might" → suggestion; "minor", "small thing" → nit.

## Bot dialects

### Codex (chatgpt-codex-connector)
- Posts a P0 / P1 / P2 / P3 badge image at the top of each comment.
- P0/P1 → treat as blocker / suggestion respectively.
- P2/P3 → nit / informational.
- Codex sometimes flags real bugs but also produces confident false positives. Always read the cited code before accepting.

### Copilot
- Often prefixes with `Suggestion:` / `Improvement:` / `Possible bug:`. The prefix maps directly to severity.
- Frequently rewrites code style; weight more heavily toward "nit" unless it identifies a concrete bug.

### Coderabbit / Sweep / Diamond
- Categorize via emoji + heading (🐛 bug → blocker, ⚠️ warning → suggestion, 💡 tip → nit).
- Their suggested patches are often syntactically correct but semantically wrong. Verify before applying.

### Vercel Agent / similar AI reviewers
- Confidence varies wildly. Read the linked detector / rule before fixing.

### verstand-agent-reviewer (github-actions panel)
- Posts an issue comment summarizing findings **and** one inline thread per finding.
- Tags: `quality` / `simplicity` (+ voice counts like `3/3 models`).
- Often **duplicates** the same consolidation ask on two lines of one file. Dedupe by intent before fixing.
- Default severity: quality with multi-voice agreement → suggestion; single-voice simplicity → nit (fix if cheap).

## Dedupe

The same line can attract multiple reviewers. Before fixing, group by `path` + `line` **or** by semantic request (“consolidate switches”, “inline helper”). One fix → multiple replies, all citing the same commit.

## When the reviewer is wrong

You're allowed to push back. The reply should:
1. Acknowledge what they noticed.
2. Explain why the current code is correct or why you chose it.
3. Link to the rule, incident, or constraint that drove the decision.
4. Resolve the thread (your reply is the resolution; if they disagree, they'll unresolve).

Don't blindly implement a suggestion you disagree with. Verify the claim against the code, tests, and repository rules before changing behavior.

## When to ask the user

Pause and ask before:
- Touching auth, billing, or migrations
- Changing a public API surface (breaking change risk)
- Implementing 4+ unrelated fixes in one cycle (suggest splitting the PR)
- Disagreeing with a maintainer on a blocker

For trivial fixes (≤2 nits + suggestions, all in one file), just go.

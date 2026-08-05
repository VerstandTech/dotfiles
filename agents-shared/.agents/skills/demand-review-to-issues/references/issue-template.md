# Issue body template

One issue per demand. Write the body to a file and create with
`gh issue create --title "..." --body-file <file> --label "<type>" --label "<category>"`.
Use labels that already exist in the repo (from `gh label list`) — typically one **type**
(enhancement / bug / feature) plus one **category** label. Title: concise, action-first, and
flag the open decision when there is one (e.g. "… (scope: which button?)").

## Body skeleton

```markdown
## Client request

> "<original demand, verbatim>" (<gloss/translation if not in issue language>)

## Context (two-reviewer code review)

<What the two agents found in the ACTUAL code. Lead with the reframe if the feature already
exists / is gated / is broken. Use exact `path/to/file.tsx:line` references. A small table
works well when a demand spans multiple surfaces.>

## Recommendation

<The converged plan. If/else by interpretation when scope is ambiguous. Name what to touch
and what to leave alone, and why.>

## Risks / edge cases

<Especially for destructive/irreversible actions: data loss, billing, orphaned tokens,
regulatory exposure, public-page teardown. Omit the section if genuinely none.>

## ❓ Decision needed from client (before build)

<ONLY when a genuine scope fork exists. State the question crisply and what each answer
implies. Skip this section entirely when the path is unambiguous.>

## Acceptance criteria

- [ ] <verifiable outcome>
- [ ] <tests cover new branches/permission checks, per project quality gates>

<sub>Scoped via a two-agent code review (implementation + product/safety lenses).</sub>
```

## Notes

- The **❓ Decision needed** block is how forks get captured without blocking issue creation.
- Keep every path repo-relative.
- If the project enforces test/quality gates (e.g. TDD, acceptance coverage), reflect that in
  the acceptance criteria so the issue carries the bar forward.

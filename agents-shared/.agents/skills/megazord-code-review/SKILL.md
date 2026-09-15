---
name: megazord-code-review
description: Use when asked to review a branch, pull request, commit, patch, diff, or implementation; when another expert or multi-agent review is requested; or when prior reviews may have missed correctness, performance, security, complexity, test-realism, maintainability, or AI-generated-code risks. When the target is a GitHub pull request, post a single review with concise human inline comments after findings are verified.
---

# Megazord Code Review

Run a read-only, evidence-first review. Preserve the requested scope and do not implement fixes unless the user explicitly asks for them.

## Workflow

1. Establish the review target.
   - Read the repository instructions before inspecting the change.
   - Use the user-specified pull request, branch, commit, range, or files. Otherwise resolve the base from pull-request metadata or the repository's configured merge target. Ask when multiple bases are plausible; never silently assume a default branch.
   - Record the exact reviewed range or file set. For a branch review, compute the merge base with the resolved target and include relevant tracked and untracked worktree changes.
   - For a live pull request, record the current head SHA and distinguish current code and checks from outdated comments, superseded diffs, and earlier CI failures.
   - Inspect changed files, callers, tests, data models, and runtime or configuration paths needed to understand behavior. Do not judge the diff in isolation.
   - Record unrelated pre-existing worktree changes and leave them untouched.

2. Prepare a neutral evidence packet.
   - Include the user intent, review range or baseline, raw diff or changed paths, applicable repository instructions, and relevant validation commands.
   - Give every reviewer the same scope and enough repository access to trace behavior.
   - Do not include suspected defects, expected answers, or conclusions from another reviewer.

3. Dispatch the specialist panel.
   - Read [references/reviewers.md](references/reviewers.md) before delegating.
   - Start one fresh subagent for each of the eight lenses: performance, simplicity, design patterns, QA, code quality, security, CRAP analysis, and anti-AI slop.
   - Use clean, non-inherited contexts such as `fork_turns=none`, passing only the neutral evidence packet and one lens. Do not combine lenses in one reviewer.
   - Use parallel waves when concurrency is limited. Collect all eight responses before synthesizing.
   - Ask reviewers to inspect and report only; do not let them edit files.
   - Require each reviewer to return findings or explicitly say `No findings` or `Not applicable`.
   - If subagents are unavailable, disclose that limitation and apply the same eight lenses sequentially.

4. Verify every candidate finding.
   - Reproduce the relevant code path and independently confirm the claim against the actual change and baseline. Never decide by reviewer vote.
   - Run focused, non-mutating tests or diagnostics when they materially strengthen or disprove a claim.
   - For every newly introduced raw query, unsafe API, manual parser, broad type assertion, or custom framework workaround, require a concrete reason a typed repository primitive cannot preserve the needed semantics or measured performance. If a typed query can fetch an already-bounded candidate set and an existing helper can apply the unsupported predicate, report the low-level implementation as maintainability risk. Parameterization can prevent injection without making database-specific SQL the best design.
   - Before calling an input or value unused, trace framework-visible uses such as cache identity, routing, serialization, invalidation, and type-level contracts.
   - Verify that tests exercise production behavior. A mocked-child adapter test is useful only when it proves a deliberate parent contract that types and existing tests do not cover. Treat a large mock that recreates child controls and interactions as redundant when real child tests plus integration or E2E coverage already prove the flow; identify the regression it cannot catch and the maintenance burden it adds.
   - Reject speculative concerns, pure style preferences, duplicate findings, stale evidence, and recommendations without a concrete failure mode or maintainability cost.

5. Report the review.
   - Put findings first, ordered by severity and then confidence.
   - For each finding, include severity (`P0` through `P3`), the narrowest useful file and line reference, triggering conditions, impact, verifying evidence or reproducible counterexample, and a concise correction direction.
   - Keep one root cause per finding. Merge duplicates across reviewers and credit the strongest evidence, not the number of reviewers.
   - Separate confirmed findings from outdated or already-addressed observations, non-actionable questions, and unrelated CI noise.
   - State the exact reviewed range or file set and which tests or diagnostics ran. If no findings remain, say so explicitly and identify any validation gap.

6. Post GitHub comments when the target is a live pull request.
   - After the chat report, post one review on the current head SHA unless the user said not to comment.
   - Follow [references/pr-comments.md](references/pr-comments.md). Write as a teammate: what is wrong, what it causes, what to change. Keep comments short and human. Do not paste P0–P3 labels, lens names, or the chat report.
   - One inline comment per confirmed root cause, on a line that is in the current head diff. Prefer P0–P2. Skip already-open threads that cover the same claim.
   - Use `event: COMMENT`. Do not approve or request changes unless the user asked.
   - If nothing confirmed survives, do not open an empty review.

## Common Review Traps

| Initial signal | Required verification |
|---|---|
| Parameterized raw SQL | Injection may be mitigated; require evidence that a typed query over bounded candidates cannot preserve semantics or measured performance. |
| Handler does not read an input | Trace cache keys, routing, serialization, invalidation, and type contracts before calling it dead. |
| Mock-heavy test is green | Identify which production behavior ran, whether the adapter contract is unique, and whether real child plus E2E tests make the scaffold redundant. |
| PR comment or CI failure exists | Match it to the current head SHA, current line, and latest check run before treating it as active. |

## Review Standard

- Prioritize correctness, regressions, security, data loss, broken contracts, user-visible behavior, and concrete maintainability risk.
- Use `P0` for release-blocking catastrophic impact, `P1` for high-impact defects, `P2` for ordinary actionable defects, and `P3` for concrete low-impact or maintainability problems.
- Treat missing tests as a finding only when the patch creates a specific unprotected behavior or regression risk.
- Treat unusual implementation choices as questions until repository evidence proves a safer or simpler equivalent.
- Keep summaries short. A review is useful because its findings are precise, not because it is long.

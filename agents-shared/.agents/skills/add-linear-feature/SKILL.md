---
name: add-linear-feature
description: >-
  Use when a Linear issue or URL must be represented in the Gheeggle Harbor
  support contract at dataset/FEATURES.md, including additions, reconciliations,
  deduplication, tier classification, or summary-count updates.
---
# Add Linear Feature

## Overview

Turn one Linear issue into an evidence-backed `dataset/FEATURES.md` contract
entry. Treat “include” as idempotent: add, reconcile, or leave unchanged when
the behavior is already covered.

## Input

Accept exactly one Linear identifier or URL, for example:

```text
$add-linear-feature LIM-3585
$add-linear-feature https://linear.app/<workspace>/issue/LIM-3585/...
```

If the argument is missing or identifies multiple issues, stop and request one
issue. Do not select from the backlog.

## Workflow

1. Fetch the full Linear issue. Read comments, relations, and embedded images
   only when they contain acceptance details missing from the description.
2. Read `dataset/FEATURES.md`, then search the issue key, task metadata,
   `COVERAGE.md`, and semantic behavior terms across the repo. Inspect the
   nearest rows for the same app and interface.
3. Decide whether the behavior is already covered:
   - Exact contract exists: make no change.
   - Existing row is incomplete or stale: reconcile that row; do not add a
     duplicate.
   - No matching contract exists: continue to support verification.
4. Verify the ticket against implementation and observable state. A Linear
   ticket alone is not proof of support. Trace the relevant MCP tool/router or
   visible UI plus its durable read-back, State API representation, task
   verifier, or focused test. Stop and report an unsupported or ambiguous
   requirement rather than advertising it as supported.
5. Classify the verified behavior:
   - Tier 1: mutates durable state and has a reliable read-back/reload check.
   - Tier 2: read-only or seeded/computed behavior with no mutation.
   - Stub/absent/undocumented: do not create a positive Tier 1 or Tier 2 row.
6. Add or update exactly one row, keeping it beside the closest rows for the
   same app/interface. Update only the affected Tier 1 or Tier 2 summary count.
   Do not edit seeds, task packages, application code, or coverage files.
7. Validate and inspect the diff:

   ```bash
   python3 '.rulesync/skills/add-linear-feature/scripts/validate_features.py' \
     'dataset/FEATURES.md'
   git diff --check -- 'dataset/FEATURES.md'
   git diff -- 'dataset/FEATURES.md'
   ```

8. Report the issue key, result (`added`, `reconciled`, or `already covered`),
   feature ID, tier, support evidence, and validation output. Do not commit.

## Row Contract

| Field | Required shape |
| --- | --- |
| ID | Reuse the nearest app/interface naming pattern; never use the Linear key as the feature ID. |
| Feature | Short, user-visible behavior phrase. |
| Area | Existing `ghee-<app>` slug. |
| Notes And Boundaries | Interface/tools, actor or seed target, exact operation, preserved controls, durable/read-only outcome, verification path, and app port when neighboring rows include it. |

For MCP rows, begin with `MCP: <tools>.` and end with an exact read-back or
State API outcome. For UI rows, begin with `Visible UI.` and name the actor,
journey, unchanged controls, and reload-visible result. Preserve a known product
limitation instead of copying an unsupported ticket expectation into the
contract.

## Common Mistakes

- Blindly translating the ticket title without checking implementation.
- Adding a duplicate row when an existing contract already covers the behavior.
- Inventing a universal ID format instead of following the closest rows.
- Incrementing both summary totals or forgetting the affected total.
- Treating a task prompt as proof that the environment supports the behavior.
- Expanding scope beyond `dataset/FEATURES.md`.

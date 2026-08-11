---
name: qc-user-story-to-linear-issue
description: Draft and create Linear QC User Story issues from product-feature inventories and UI or MCP capability catalogs. Use when auditing UI or MCP QC coverage, maintaining feature-first UI or tool-and-capability-first MCP coverage trackers, finding uncovered behavior, designing realistic agent scenarios, or turning an approved Seed, Prompt, Features Covered, and Verifiers draft into a Linear child issue. Always require explicit user approval of the current full draft before creating or updating anything in Linear.
---

# QC User Story to Linear Issue

Turn verified product features into realistic, deterministic QC User Stories and,
after approval, direct child issues of the correct Linear QC epic.

Read [issue-template.md](references/issue-template.md) before drafting.

## Inputs

Resolve these from the request or current context:

- Surface: exactly `UI` or `MCP`.
- Supported-feature inventory, such as `features.md`.
- For MCP work, the complete MCP catalog, such as `mcps.md`, and its live
  discovery endpoint.
- Target Linear QC epic URL or identifier.
- Target product/app and any requested persona or coverage goal.
- Running local app URL, when available.
- Coverage tracker path, when UI feature or MCP capability reporting is
  requested.

Ask one concise question only when a required input cannot be discovered safely.

## Workflow

1. Read the complete supported-feature inventory. For MCP work, also read the
   complete MCP catalog. Treat the feature inventory as the product-behavior
   boundary and the MCP catalog as the tool-and-contract boundary; do not invent
   behavior that either source does not support.
2. Fetch the target epic and list all direct child issues live, including
   completed and archived children. Inherit the epic's team, project, milestone,
   and parent placement.
3. Build the applicable coverage maps from feature IDs, MCP capability IDs, and
   observable behavior:
   - Inspect child descriptions, not only titles.
   - Prefer an existing `Features Covered` section when present.
   - For MCP stories, prefer an exact `MCP capabilities exercised:` verifier.
   - Infer legacy coverage conservatively from populated prompts and verifiers;
     never infer coverage from a title alone.
   - Distinguish covered, partially covered, uncovered, canceled, and archived
     stories.
   - Report a likely duplicate instead of drafting or creating it silently.
4. Select one coherent workflow using 1–3 related, uncovered product features
   and, for MCP, one or more related uncovered catalog capabilities. Confirm
   each selected feature and capability from its ticket, catalog, live schema,
   or current repository. Exclude internal-only behavior that cannot be
   exercised or verified through the requested surface.
5. Run the runtime realism gate before drafting:
   - Check a supplied or known localhost URL with `curl` before trying to start
     the app.
   - Exercise the relevant controls in the live UI when browser access is
     available, then verify persisted state through reload or durable read-back.
   - For MCP, inspect live server metadata, complete `tools/list`, and the input
     schema for every selected tool. Reconcile catalog drift before drafting.
     Exercise the tools end to end when mutation and cleanup are safe.
   - When the story will become an Arena mission or Voyager task, inspect the
     currently pinned agent action vocabulary. Confirm that every essential
     gesture and assertion is expressible, especially modifier-assisted range
     selection, drag/drop, canvas interaction, and multi-stage keyboard state.
     Preserve a valid product contract and disclose a runtime gap rather than
     replacing an unsupported interaction with an easier workflow.
   - Never run a development command that resets or reseeds local data without
     explicit user approval. When safe live mutation is unavailable, use an
     isolated test database or focused automated tests and disclose the gap.
   - Run focused automated tests or inspect current implementation only as
     supporting evidence. Never describe source or test inspection as visual
     validation.
   - Label the evidence as live UI, live MCP discovery, live MCP execution,
     live HTTP, automated test, or source inspection and disclose any gap. Do
     not proceed to creation when a key behavior remains unrealistic or
     unsupported.
6. Design a realistic user context. Use exact entity names, values, actions,
   and end state. Keep seed data minimal and name an unchanged control when a
   seed is required.
   - Seed the active identity by durable ID and include required bootstrap or
     system entities. Treat route account slots as navigation aliases unless
     route behavior is itself under test.
   - Require normal app bootstrap to be state-neutral for the story. If startup
     would create or rewrite graded records, fix the seed contract or disclose
     the gap before approval.
   - Count a feature as covered only when the prompt requires an observable
     action or the seed starts in the opposite state. A requested result that
     merely matches the default does not exercise the feature.
   - Identify automatic dependencies and side effects. Include them in the
     prompt and verifiers when they affect the visible or persisted result.
   - Match cleanup assertions to verified product semantics. If an operation
     intentionally leaves a narrowly defined unreferenced relation row, specify
     that exact allowance and require proof that no live entity references it;
     never weaken collateral-change checks broadly.
   - Specify exact cardinality and cleanup when editors begin with starter,
     placeholder, or blank content.
7. Draft the exact title and body from
   [issue-template.md](references/issue-template.md). Ensure every listed
   feature is exercised by the prompt and asserted by the verifiers. For MCP,
   add stable capability identifiers and the exact confirmed tool names to the
   verifiers.
8. Apply inherited metadata, with these defaults when the parent does not
   provide an override:
   - State: `Todo`
   - Priority: `Medium` (`3`)
   - Labels: `User Story` and `qc-ui` or `qc-mcp`
   - Assignee: none
9. Run the quality gate, then show the complete title, Markdown body, intended
   Linear metadata, and runtime validation evidence.

## UI Coverage Tracking

When the user requests UI coverage against a supported-feature inventory:

1. Keep every inventory feature visible. Mark archived and genuinely
   internal-only features `Not UI-testable`, give the reason, and exclude them
   from the UI denominator.
2. Use exactly these definition states:
   - `Covered`: a populated UI story exercises and verifies the feature.
   - `Proposed`: an exact draft assigns the feature, but the approved Linear
     update has not been applied.
   - `Uncovered`: no populated UI story exercises the feature.
   - `Not UI-testable`: the feature is excluded under rule 1.
3. Track the Linear workflow state separately. `Todo`, `In Progress`, and
   `Done` describe delivery progress; they do not change definition coverage.
4. Do not count MCP stories toward UI coverage. Do not count canceled stories
   or placeholder-only bodies as `Covered`.
5. Calculate:
   - UI denominator = total inventory minus `Not UI-testable`.
   - Current coverage = `Covered` divided by the UI denominator.
   - Planned coverage = (`Covered` + `Proposed`) divided by the UI denominator.
6. Create or update `COVERAGE.md` beside the feature inventory unless the user
   specifies another path. Include the rules, summary counts and percentages,
   proposed issue-to-feature assignments, the complete feature matrix, and
   validation evidence or gaps.
7. Before Linear approval, keep draft assignments `Proposed`. After approved
   updates succeed, refresh them to `Covered` and preserve their Linear states.

## MCP Coverage Tracking

When the user requests MCP coverage against a catalog:

1. Read the entire catalog and discover the live MCP surface. The catalog and
   live `tools/list` must agree before calculating current coverage. Record
   drift explicitly and use the live input schema to reject unsupported tasks.
2. Track both:
   - Tool coverage: every live, cataloged MCP tool.
   - Capability coverage: each documented observable operation branch,
     constraint, or supported alternative that changes state or output.
3. Use stable capability IDs:
   - Whole operation: `<tool>`, such as `forms_get`.
   - Operation branch: `<tool>.<request-or-behavior-path>`, such as
     `forms_batchUpdate.updateSettings.emailCollectionType` or
     `responses_list.filter`.
   - Create one row per meaningful documented behavior, not per output-only
     field or mechanically optional scalar.
4. Use exactly these definition states:
   - `Covered`: a populated MCP story actively exercises the tool or capability
     and verifies its meaningful output or durable state.
   - `Proposed`: an exact MCP story draft assigns the tool or capability, but
     its approved Linear creation or update has not been applied.
   - `Uncovered`: no populated MCP story currently exercises and verifies it.
   - `Not MCP-testable`: the cataloged behavior cannot be exercised through the
     public MCP surface; keep it visible, explain why, and exclude it from the
     denominator.
5. Track Linear workflow state separately. Do not count UI stories, canceled
   stories, placeholder-only bodies, titles, tool mentions without invocation,
   or interaction logs without result verification as `Covered`.
6. Calculate and report separately:
   - Tool denominator = cataloged live tools minus `Not MCP-testable` tools.
   - Current tool coverage = covered tools divided by the tool denominator.
   - Planned tool coverage = covered plus proposed tools divided by the tool
     denominator.
   - Capability denominator = documented capability rows minus `Not
     MCP-testable` rows.
   - Current and planned capability coverage using the same formulas.
7. Create or update `MCP_COVERAGE.md` beside the MCP catalog unless the user
   specifies another path. Follow
   [mcp-coverage-template.md](references/mcp-coverage-template.md) and keep it
   separate from UI `COVERAGE.md`.
8. Before Linear approval, keep draft assignments `Proposed`. After approved
   writes succeed, re-fetch the issues and refresh the assignments to
   `Covered`, preserving their Linear states.

## Mandatory Approval Gate

Never create or update a Linear issue in the same turn that first presents or
revises its draft.

After showing the full current draft:

1. Ask the user for explicit approval.
2. Stop without calling any Linear write tool.
3. Treat only an unambiguous later message such as `approved`, `looks good,
   create it`, or equivalent as approval of that exact draft.

An initial request to "create an issue" is not approval of an unseen draft. Any
content or metadata revision invalidates prior approval: show the full revised
draft and request approval again.

For multiple issues, number every full draft. Approval must explicitly cover
each issue; otherwise create only the individually approved drafts.

## Create After Approval

After approval of the current draft:

1. Re-fetch the parent and re-run the duplicate check.
2. Stop and report any new duplicate or placement conflict.
3. Create exactly one direct child issue per approved draft, preserving the
   approved title, body, and metadata.
4. Prefer Linear MCP. Leave the issue unassigned unless explicitly overridden.
5. Wait for the create result, then report the issue key and URL.

Do not create comments, additional issues, or unrelated Linear changes.

## Update After Approval

After approval of a revision to an existing issue:

1. Re-fetch the issue, its parent, and current metadata.
2. Re-run the duplicate, placement, and runtime realism checks.
3. Preserve every field not shown in the approved revision.
4. Update only the approved title, body, or metadata fields.
5. Wait for the update result, then report the issue key and URL.

Do not reuse approval granted to an earlier revision.

## Quality Gate

- The title starts with exactly `[UI]` or `[MCP]`.
- The body contains exactly `Seed`, `Prompt`, `Features Covered`, and
  `Verifiers`, in that order.
- Every feature is supported, linked or stably identified, exercised in the
  prompt, and checked by a verifier.
- Every feature requires an observable non-default action or an explicit
  opposite-state seed.
- The story represents one realistic workflow, not a feature checklist.
- UI stories require UI-only interaction. MCP stories name only live,
  catalog-confirmed tools and include stable capability identifiers.
- Automatic dependencies and side effects are represented in both the requested
  end state and the verifiers.
- Seed identity uses durable records, required system/bootstrap entities are
  present, and route aliases are not mistaken for user identity.
- Every essential interaction is supported by the pinned task runtime, or the
  exact action-surface limitation is disclosed without weakening the story.
- Exact counts are asserted, including the absence of leftover starter, blank,
  or placeholder content.
- Cleanup and residual-row expectations match verified product semantics and
  retain strict unrelated-state protection.
- Verifiers prove durable state through reload, API/State API, or MCP read-back.
  Interaction logs may prove the surface used but not the final state alone.
- Runtime evidence is accurately labeled, and any gap is disclosed before
  approval. Source inspection alone is not live UI validation.
- UI coverage tracker counts reconcile exactly to the complete feature
  inventory, use only populated UI stories for `Covered`, and keep proposed
  drafts separate until their approved Linear updates succeed.
- MCP coverage tracker tool and capability counts reconcile to the complete
  catalog and live discovery, count only populated MCP stories with result
  verification, and keep proposed drafts separate until approved writes
  succeed.
- The story is deterministic and does not duplicate an existing active or
  completed child issue.
- The ticket contains no implementation plan, code paths, branch instructions,
  or Harbor packaging details.

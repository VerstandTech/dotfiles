---
name: voyager-qc-task-implementation
description: Implement, migrate, validate, and prove Gheeggle Voyager QC tasks, including paired Arena missions, deterministic seeds, RewardKit criteria, provenance, catalog reconciliation, focused Harbor runs, and final-head CI evidence. Use after a QC User Story is approved or whenever work touches qc/voyager/tasks, app Arena missions, RewardKit grading, tasks-provenance.json, or Voyager task-gate failures.
---

# Voyager QC Task Implementation

Turn an approved QC behavior contract into an executable task whose seed,
interface, grader, catalogs, and final evidence agree.

Use `qc-user-story-to-linear-issue` for coverage analysis and Linear story
design. Use this skill for repository implementation and validation.

Always read:

- [authoring.md](references/authoring.md) before creating or changing task files.
- [validation-and-ci.md](references/validation-and-ci.md) before running a task,
  updating generated metadata, or reporting completion.

## Establish the Local Contract

1. Read the repository instructions, QC contract, feature inventory, package
   scripts, current task schema, and the closest passing sibling tasks.
2. Read the approved user story or source ticket. Write a compact trace from
   every requested behavior to its seed precondition, agent action, durable
   state assertion, trajectory assertion, and unchanged control.
3. Inspect the real product model, routes, bootstrap behavior, public MCP
   schema, and Arena action vocabulary involved. Do not infer them from a task
   title or an older example.
4. Identify ownership boundaries before editing. Never modify VendorKit-managed
   or materialized runtime files in the consumer repository; route a runtime
   fix upstream and re-vendor it.
5. Check the working tree and preserve unrelated changes. Use one branch and PR
   when the user requests a batch, but keep each mission/task pair reviewable.

## Choose the Source and Execution Path

- When the behavior belongs in Arena and the checked-in runtime can express it,
  author the Arena mission and seed first, then create or export the matching
  Voyager task. Preserve one behavior contract and semantic seed parity across
  both representations.
- When the task is intentionally manual, author it from current Voyager
  siblings and record honest manual provenance.
- If Arena cannot express an essential gesture or assertion, keep the product
  contract intact, document the exact action gap, and separate source coverage
  from current runtime executability. Do not replace the gesture with an easier
  workflow merely to make the mission pass.
- An authored-but-non-executable mission is a documented partial state, not a
  completed pair. If only Arena or Voyager can execute the behavior, continue
  with the independent artifact only when the approved scope or user explicitly
  permits partial delivery; otherwise stop at the ownership/go-no-go decision.

## Author as a Coupled Unit

Implement the instruction, seed, task metadata, environment, RewardKit
criteria, judge prompt, and provenance as one contract:

- Make the instruction realistic, surface-specific, deterministic, and free of
  implementation hints or grading details.
- Seed the smallest complete world, including the active durable user,
  mandatory system records, opposite-state targets, and at least one meaningful
  unchanged control.
- Treat bootstrap as state-neutral. Compare snapshots before and after normal
  app bootstrap so startup mutations cannot masquerade as agent work.
- Grade exact intended deltas, target cardinality, cleanup, automatic side
  effects, unchanged controls, and unrelated-domain safety.
- Use durable IDs for identity. A route account slot such as `/u/0` may
  canonicalize and is not identity evidence unless route behavior is itself the
  feature under test.
- Grade real product semantics. If a legitimate operation leaves a narrowly
  defined unreferenced row, allow only that exact residue and prove that no live
  relationship references it; do not weaken the whole collateral-change rule.
- Use initial/final durable snapshots for state and the trajectory only for
  interface use, sequencing, and required intermediate actions.

## Validate in Layers

1. Run repository-native structural and quality checks through declared package
   scripts. Inspect `package.json` first and use the script's supported argument
   form; never assume a path passed to a generic test script narrows execution.
2. Validate seeds against the real adapter/bootstrap path and inspect the
   initial snapshot, not only JSON syntax.
3. For MCP tasks, run both static catalog checks and live `tools/list` plus
   schema checks. A static pass does not prove the deployed surface agrees.
4. Run focused task checks and a fresh task-specific Harbor trial. Inspect the
   actual result artifacts.
5. Regenerate provenance and derived catalog counts only after task content is
   final. Re-run them after any base-branch merge that changes the catalog.
6. When requested or required by the repository, run the full selected gate and
   distinguish task evidence, aggregate gate evidence, and required CI status.

## Completion Gate

Do not call the work complete until all of these are true:

- The implemented files trace back to every approved behavior and feature ID.
- Arena and Voyager representations agree, or the precise runtime limitation is
  disclosed without weakening the contract and the work is reported as partial.
- The final task-specific run belongs to the current head SHA and has reward
  `1.000`, every criterion passed, and no verifier exception.
- Durable state read-back proves the requested result and collateral safety.
- Provenance digests, task membership, feature/catalog totals, and documentation
  reconcile with the final tree.
- Generated validation side effects were reviewed; unrelated rewrites were not
  silently committed.
- Any external failure is classified with evidence as infrastructure, runtime,
  agent behavior, product behavior, or task-contract failure.

Never persist API keys in files, commands captured by the repository, logs, or
commits. Use ephemeral environment injection and recommend rotation when a key
has been pasted into chat.

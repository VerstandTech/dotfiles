# Voyager QC Validation and CI Reference

## Use the Repository's Entry Points

Read `package.json`, task documentation, and CI workflows before choosing a
command. Use declared `pnpm` scripts for project checks. Quote every path.

Confirm that a focused command is truly focused. Some root test scripts ignore
or consume extra arguments and run the whole workspace. Prefer a documented
file-specific script when one exists, and inspect the emitted test selection.

Check an existing service with `curl` before starting another instance. Never
run a reset or reseed command against user data without explicit approval.

## Validation Ladder

Run the narrowest useful layer first, then broaden:

1. Parse and schema checks for task metadata, criteria, mission, and seed.
2. Repository QC quality review and dataset validation.
3. Seed adapter/bootstrap test with inspection of the collected initial state.
4. Arena mission validation or audit, when an Arena source exists.
5. Focused verifier and application tests.
6. One fresh task-specific Harbor run using the actual pinned runtime.
7. The requested aggregate gate and required CI checks.

Structural checks are necessary but do not replace a live reward run.

## MCP Schema Is Static and Live

For MCP tasks, validate both views:

- Static: catalog, generated contract, schemas, and focused parity tests.
- Live: the running service's complete `tools/list` and each selected tool's
  input schema.

Treat disagreement as contract drift. If an intentional schema expansion raises
a category-wide warning count, measure the current exact count and ratchet that
specific category with a ticket-scoped rationale. Do not use a broad ignore or
silence unrelated warnings.

## Provenance and Catalogs Come Last

Current Voyager provenance binds task membership and task-tree SHA-256 digests,
plus source, generator, and trust metadata. Use the repository generator; do
not hand-edit hashes.

Regenerate after every change to task content, including instruction, seed,
metadata, criteria, and judge prompt. Regenerate again after merging the base
branch because another task can change membership, digests, and catalog totals.

Recompute application/interface counts and feature documentation from task
metadata instead of adjusting numbers mentally. Review `git status` after every
generator or validator: some tools rewrite additional catalogs. Keep intended
updates and restore only side effects you have positively identified as
unrelated.

## Fresh-Head Evidence

Bind every reported run to:

- repository and PR;
- exact head SHA;
- workflow/run ID and attempt;
- task name;
- shard/job identity from that run's manifest;
- model/runtime configuration when relevant.

Shard indices can move between runs. Resolve the task from the manifest attached
to the same run; do not reuse a shard number from an older attempt.

Any push, amend, rebase, merge from the base branch, task rewrite, provenance
rewrite, or catalog change makes earlier final-head evidence stale. Cancel or
supersede obsolete runs and produce fresh evidence from the new SHA.

## Read the Reward, Not Only the Job Status

A green workflow or job only proves process completion. Inspect the task result
artifacts, especially `reward-details.json`, and require:

- total reward exactly `1.000`;
- every criterion passed;
- verifier/judge exception is null;
- initial/final durable state supports the result;
- trajectory evidence supports required interface and intermediate steps.

Report task-specific results separately from the full aggregate gate and from
required PR checks. `MERGEABLE` with a blocked state can mean review or policy is
still required; it is not a merge conflict.

A reward of `0` without an exception is a product, agent, or task-contract
failure, not infrastructure. Diagnose the failed criterion and evidence.
Checkout timeouts, registry outages, and missing runners are infrastructure only
when logs support that classification; rerun unchanged before altering the task.

## Secret Handling

Pass credentials through an ephemeral environment only. Never place a key in a
seed, task file, shell history-oriented helper, captured command, artifact,
commit, or PR text. Avoid printing environment variables. If a credential was
pasted into chat or logs, advise rotating it after the run.

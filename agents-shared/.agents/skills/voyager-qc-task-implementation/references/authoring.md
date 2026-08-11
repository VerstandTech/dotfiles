# Voyager QC Authoring Reference

## Start From Evidence

Before editing, locate and read:

- repository and path-scoped instructions;
- the feature inventory and approved QC story;
- the current Voyager dataset contract and closest task siblings for the same
  application and interface;
- the app's Arena mission conventions, if Arena is in scope;
- seed adapters, snapshot collection, app bootstrap, routing, database schema,
  public MCP tools, and the implementation of the behavior being graded;
- provenance ownership and any vendored-runtime lock or generated-file marker.

Prefer an already passing sibling over remembered filenames or schema versions.
Copy structure, not behavior-specific assumptions.

## Build a Trace Matrix

For each approved behavior, record:

| Contract item | Seed precondition | Required action | Durable assertion | Trajectory assertion | Control |
| --- | --- | --- | --- | --- | --- |
| Observable result | Explicit opposite state | Exact UI or MCP operation | Stable-ID final state | Intended interface and sequence | Unchanged related entity |

Every row must be exercised and graded. Remove unsupported rows rather than
listing features that the prompt never requires.

## Pair Arena and Voyager Deliberately

When both representations are required:

1. Keep one stable slug or an obvious one-to-one mapping.
2. Keep user intent and exact target values equivalent.
3. Preserve semantic seed parity: the same active user, target entities,
   relationships, controls, and initial opposite state. File schemas may differ.
4. Make Arena deterministic checks prove what its runtime can observe.
5. Make RewardKit criteria prove full durable state and collateral safety.
6. Record feature IDs or journey IDs consistently.

Before authoring a UI mission, inspect the installed action vocabulary and
input driver. Complex gestures such as modifier-assisted range selection,
pointer drag/drop, canvas interactions, and multi-stage keyboard state require
an exact expressibility check. A product behavior can be valid while the
vendored Arena runtime cannot yet execute it.

When blocked by the action surface:

- preserve the original mission contract;
- identify the missing primitive and its upstream owner;
- do not edit vendored runtime code locally;
- do not substitute clicks, API calls, or direct state mutation for the required
  gesture;
- label the mission as authored but not executable with the current pin until
  the upstream change is released and re-vendored.

This is a partial result, not passing coverage. If the paired Voyager task uses
a different runtime and could proceed independently, do so only when the
approved scope or user explicitly permits splitting delivery. Otherwise pause
for the upstream ownership or go/no-go decision.

## Seed a Complete, Neutral World

- Restrict the active-user set when the adapter supports it. More seeded users
  can change account slots, navigation, ownership, permissions, and defaults.
- Seed the active user by durable ID and provide all application configuration
  needed to resolve that identity.
- Include mandatory system entities the product normally bootstraps, such as
  default collections, groups, settings, or ownership rows.
- Prefer stable explicit IDs for all graded entities and relationships.
- Start every mutation target in an explicit opposite state.
- Include one nearby control that catches over-broad changes.
- Avoid extra data that increases ambiguity or incidental grader work.

Launch the app through its real task environment and compare state immediately
before and after bootstrap. If normal startup creates, renames, or reassigns
rows, fix the seed or adapter contract. The initial grading snapshot should
represent the state the agent actually receives.

Routes such as `/u/0` are navigation aliases in some applications and may
canonicalize to another slot. Verify identity using the durable user/config
record, ownership, and resulting state. Assert the route only when routing is
the behavior under test.

## Write RewardKit Criteria

Use separate binary criteria for independently important facts. A strong task
usually covers:

- every target's exact final values and cardinality;
- removal of superseded or placeholder values;
- required intermediate actions that final state alone cannot prove;
- intended-interface use and forbidden shortcuts;
- automatic side effects and dependent relationships;
- preservation of target fields not meant to change;
- unchanged controls and unrelated-domain state.

The initial and final snapshots are authoritative for durable state. The
trajectory is authoritative for tool/interface use and intermediate lifecycle
steps. The agent's final prose is not evidence.

Compare stable rows by durable ID and relationships by their foreign keys.
Avoid naive whole-database equality when timestamps or known derived data are
nondeterministic; enumerate intentional differences and reject everything else.

Product deletion semantics can legitimately leave an unreferenced helper row.
When verified in the implementation and runtime, narrowly permit the exact row
only if no live membership or domain entity references it. Continue rejecting
all other residue and collateral changes.

## Keep the Judge Prompt Operational

Tell the judge:

- which attached artifacts are authoritative;
- the stable IDs and relevant tables/collections;
- how to compare initial and final state;
- when trajectory evidence is required;
- which residue is intentionally allowed, if any;
- that seed files and application APIs are not grading evidence;
- to evaluate every criterion independently and return the required structured
  RewardKit result.

Do not duplicate every criterion in free-form prose. Add only the domain context
needed to interpret the artifacts correctly.

# QC User Story Issue Template

Use the selected surface consistently. Replace every placeholder and remove
instructions before presenting the draft.

## Title

```text
[UI|MCP] <concise user-visible workflow>
```

## Body

```markdown
## Seed

- <Required seeded entity and why it is needed, including the active durable
  identity and required bootstrap/system records when the environment does not
  provide them, or “No seed required — the workflow starts from scratch.”>

  >>> <Entity> Info

  Name: <exact name>

  <Relevant starting fields, items, and unchanged control>

  >>>

## Prompt

> <First-person request from a realistic user. Require only the selected
> product surface and specify exact targets, observable non-default actions,
> values, exact counts, cleanup, automatic side effects, and end state.>

## Features Covered

- [<FEATURE-ID> — <Feature name>](<feature URL>)
- [<FEATURE-ID> — <Feature name>](<feature URL>)

## Verifiers

- The agent used only the <UI|MCP>.
- <Each requested entity, field, relationship, or setting has its own
  deterministic assertion.>
- <Each covered feature was actively exercised or began in an explicit
  opposite state; matching an untouched default is insufficient.>
- <Exact counts hold and no starter, blank, or placeholder content remains.>
- <Expected automatic dependencies or side effects are present, when
  applicable.>
- <Expected cleanup holds; any intentionally retained unreferenced row is
  identified exactly and has no live references.>
- <Durable reload, API/State API, or MCP read-back proves the persisted result.>
- <The graded owner/account is proven by durable identity rather than a route
  slot, unless route behavior is under test.>
- <A seeded source or control remains unchanged, when applicable.>
- <For MCP only: MCP capabilities exercised: `<tool>.<capability>`, ...>
- <For MCP only: The agent used only these confirmed MCP tools: `<tool>`, ...>
```

Omit the seed info block and unchanged-control verifier when no seed is needed.
Omit side-effect or cleanup verifiers only when they genuinely do not apply.
For MCP stories, add both final MCP verifiers. Use stable capability IDs from
the MCP catalog and list only tools confirmed by live discovery. Do not count a
capability unless the prompt actively exercises it and another verifier asserts
its meaningful output or durable state.
For UI stories, visible reload may prove user-visible state, but use durable
read-back when the state is not fully observable.

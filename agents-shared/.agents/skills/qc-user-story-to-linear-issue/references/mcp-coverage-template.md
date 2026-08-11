# MCP QC Coverage Tracker Template

Use this structure for `MCP_COVERAGE.md`. Replace every placeholder and keep the
tool and capability calculations separate.

```markdown
# <Product> MCP QC Coverage

Last reviewed: <YYYY-MM-DD>

This tracker maps populated MCP QC User Stories in <epic link> to the supported
MCP catalog in `<catalog filename>`.

## Coverage rules

- <Definition states and evidence rules from the skill.>
- <Catalog-versus-live discovery precedence and any current drift.>
- <Linear workflow state is tracked separately from definition coverage.>

## Runtime snapshot

| Evidence | Result |
| --- | --- |
| Catalog last verified | <date> |
| MCP endpoint | `<URL>` |
| Live tools/list | <count and validation date> |
| Catalog drift | <none or exact differences> |

## Summary

### Tool coverage

| Metric | Tools | Percent of MCP-testable tools |
| --- | ---: | ---: |
| Total cataloged live tools | <count> | — |
| Not MCP-testable | <count> | — |
| Tool denominator | <count> | 100% |
| Covered | <count> | <percent> |
| Proposed | <count> | <percent> |
| Uncovered | <count> | <percent> |

### Capability coverage

| Metric | Capabilities | Percent of MCP-testable capabilities |
| --- | ---: | ---: |
| Total documented capabilities | <count> | — |
| Not MCP-testable | <count> | — |
| Capability denominator | <count> | 100% |
| Covered | <count> | <percent> |
| Proposed | <count> | <percent> |
| Uncovered | <count> | <percent> |

## Proposed story assignments

| Draft | Scenario focus | Product features | MCP capabilities |
| --- | --- | --- | --- |
| <draft> | <workflow> | <feature IDs> | <stable capability IDs> |

## Tool matrix

| MCP tool | Coverage | MCP stories | Story state | Covered capabilities |
| --- | --- | --- | --- | --- |
| `<tool>` | <state> | <issue links> | <Linear state> | <count or IDs> |

## Capability matrix

| Capability ID | Catalog behavior | Coverage | MCP story | Story state | Verification |
| --- | --- | --- | --- | --- | --- |
| `<tool>.<path>` | <observable behavior> | <state> | <issue link> | <Linear state> | <result or durable read-back> |

## Exclusions

| Catalog behavior | Reason |
| --- | --- |
| <behavior> | <why it is not MCP-testable> |

## Validation evidence

- <Linear audit scope and date.>
- <Live MCP discovery and schema evidence.>
- <Live MCP execution, automated test, source inspection, and disclosed gaps.>
```

Every tool and capability row must appear exactly once. Counts must reconcile
with the matrices, and `Proposed` rows become `Covered` only after the approved
Linear write is re-fetched successfully.

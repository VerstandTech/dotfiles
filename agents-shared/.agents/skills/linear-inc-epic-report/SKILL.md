---
name: linear-inc-epic-report
description: Use when reporting recent INC team epics, open incident-response work, or pending P0/P1 child tickets in Linear.
---

# Linear INC Epic Report

Generate a read-only Linear report anchored to one timestamp/window boundary. Never write to Linear or print authentication tokens.

## Workflow

1. Record one timestamp and the user's timezone. Default cutoff: exactly 14 days earlier in that timezone. Reuse this boundary throughout.
2. Resolve team `INC`. Discover non-archived issue labels containing `Epic`. Query each separately, always including exact labels `Client Request Epic` and `Type: Epic`. Set `includeArchived: false` on epic issue queries so archived parent epics, including Canceled or Duplicate epics, never enter the table. Paginate and deduplicate by Linear issue ID.
3. Keep epics created at or after the cutoff whose current status name is neither exactly `Done` nor `Ready for Delivery`. Sort by `(createdAt ASC, id ASC)`.
4. For every retained epic, paginate all direct children (`parent.id == epic.id`), including archived issues when the source supports it. Do not include deeper descendants.
5. From each epic's direct-child set, calculate:
   - **Issues created:** total direct children.
   - **Canceled:** current status name `Canceled` or `Cancelled`.
   - **Duplicate:** current status name `Duplicate`.
   - **Pending P0/P1:** when priority is an object, compare `priority.value == 1` for P0 and `priority.value == 2` for P1. Accept an equivalent scalar only if used by the source schema. Require `statusType` in `backlog`, `unstarted`, or `started`.
6. List all pending P0 and P1 children by epic, with identifier, title, status, and link. Never infer priority from titles, labels, or prose.
7. Reconcile: totals equal row sums, and each epic/overall P0/P1 count equals its listed items.

Calls are live, not atomic or historical. If material changes appear during the run, re-read affected epic and child pages. Disclose that no historical freeze was available.

## Output contract

Start with timestamp, timezone, window, and a one-sentence summary. Then use:

```markdown
| # | Epic | Project | Created | Status | Issues created | Canceled | Duplicate | Pending P0 | Pending P1 |
|---:|---|---|---|---|---:|---:|---:|---:|---:|
| … oldest to newest … |
| | **Total** | | | | **…** | **…** | **…** | **…** | **…** |

## Pending P0
### [EPIC-ID — title]
- [CHILD-ID — title](url) — Status

## Pending P1
…
```

State these definitions briefly: the window uses epic creation time; counts cover direct children and current statuses; pending means the three active status types above. Write `None` for an empty pending section.

Disclose unavailable data sources, inaccessible pages, or unsupported archived-child visibility. If archived children cannot be included, say counts may be understated; do not imply completeness.

## Common mistakes

- Querying only `Client Request Epic` and missing `Type: Epic` or newly active epic labels.
- Counting only the first page, double-counting issues returned by multiple labels, or counting nested descendants.
- Moving the window boundary between queries or claiming the live calls form an atomic snapshot.
- Treating title prefixes as priority or treating all nonterminal custom statuses as pending.
- Omitting archived-visibility limitations or publishing totals that do not match the detail sections.

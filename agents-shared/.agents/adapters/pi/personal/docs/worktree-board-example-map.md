# Example Map — Worktree Board

**Focus:** Root Pi mission-control for git worktrees (`/wt`, board overlay)  
**Date:** 2026-07-24  
**Branch:** `feat/pi-worktree-board`

## Locked decisions (strawman accepted)

| # | Decision |
|---|----------|
| D1 | Dashboard + optional tmux open later (P4); v1 no tmux required |
| D2 | `maxBusyWriters` default **2** |
| D3 | Current repo only (filter by common git dir / root) |
| D4 | Toggle overlay Ctrl+Alt+W; P1 commands first |
| D5 | Pure extension in `./personal` |
| D6 | Prefer `.worktrees/<slug>`; still list all worktrees of repo |
| D7 | Root is orchestrator; no silent chdir of root session |

## Rules

- **R1:** Discover cards only from worktrees that share the repo’s common git directory (current repo).
- **R2:** At most `maxBusyWriters` cards may be marked `busy` with a writer; further acquire attempts fail with a clear reason.
- **R3:** Acquiring a writer slot requires an explicit card `id`; never implicit “use root”.
- **R4:** `prune` removes registry entries whose paths are no longer in discovery.
- **R5:** `registerCard` / new worktree metadata merges onto discovery by absolute path.
- **R6:** `focus` selects a card by id, branch, or path substring; does not change process cwd.
- **R7:** Porcelain parser accepts standard `git worktree list --porcelain` records (worktree/HEAD/branch/detached/bare/locked/prunable).

## Examples

| ID | Given | When | Then |
|----|-------|------|------|
| R1-E1 | Porcelain lists main + two linked trees under same repo | discover | 3 entries (or 2 if bare skipped policy) with paths/branches |
| R1-E2 | Foreign path not under common dir | filter | excluded from board for this root |
| R2-E1 | maxBusy=2, two cards busy | try acquire third | `{ ok:false, reason }` |
| R2-E2 | one busy, release it | acquire another | ok |
| R3-E1 | acquire without id | call | rejected |
| R4-E1 | registry has stale path | prune(discovery) | stale removed |
| R5-E1 | register path with label | merge | card has label + discovery branch |
| R6-E1 | focus by branch name | resolveFocus | returns that card id |
| R7-E1 | sample porcelain fixture | parse | structured rows |

## Questions (resolved)

- Q1 multi-repo → D3 no  
- Q2 always-visible rail → D4 toggle first  

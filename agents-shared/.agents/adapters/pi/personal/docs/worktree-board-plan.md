# Worktree Board — implementation plan & progress

**Status:** P0–P2 shipped (v1); P3 partial; P4 best-effort tmux  
**Created:** 2026-07-24  
**Owner:** Leo + Pi personal package  
**Canonical copy:** `~/dotfiles/agents-shared/.agents/adapters/pi/personal/docs/worktree-board-plan.md`
**Scratch copy:** `/tmp/pi-worktree-board-plan.md` (refresh from canonical if lost)

**Related:** ship skill §0 (branch vs worktree), ops-hud, agentic-fleet, bdd-mode, pi-subagents  

---

## Vision

One **root Pi** terminal acts as mission control:

- **Left rail (or toggle overlay):** active git worktrees + status  
- **Main pane:** plan / ship / triage / synthesis  
- **Orchestration:** spawn at most one writer per worktree; jump focus; optional full Pi via tmux  

**Non-goals (v1):** multi-writer in one tree; silently `cd` mid-session; full IDE split-pane in core pi-tui (upstream).

---

## Locked decisions (fill as we decide)

| # | Question | Decision | Date |
|---|----------|----------|------|
| D1 | Deep work: dashboard-only vs tmux full Pi? | _TBD — strawman: dashboard + optional tmux `o`_ | |
| D2 | Max concurrent writing trees? | _TBD — strawman: 2_ | |
| D3 | Scope: current repo only vs multi-repo? | _TBD — strawman: current repo_ | |
| D4 | Rail always visible vs toggle? | _TBD — strawman: Ctrl+Alt+W toggle overlay for P0_ | |
| D5 | Pure extension vs adapt pi-sidebar-tui? | _TBD — strawman: pure extension in `./personal` (like ops-hud)_ | |
| D6 | Worktree path convention? | _TBD — strawman: prefer `.worktrees/<slug>` + still list all `git worktree`_ | |
| D7 | Root may edit code? | _TBD — strawman: root = orchestrator by default; explicit bypass_ | |

---

## Progress legend

- `[ ]` not started  
- `[~]` in progress  
- `[x]` done  
- `[-]` cancelled / deferred  

Update the **Progress log** at the bottom on every meaningful step.

---

## Phase 0 — Discovery & contracts

**Goal:** pure libs + types; no TUI yet. Test-first.

| ID | Task | Status | Notes |
|----|------|--------|-------|
| P0.1 | Example Map (rules/examples/questions) for board | [x] | Issue or section below |
| P0.2 | `lib/worktree/types.ts` — `WorktreeCard`, board state | [x] | |
| P0.3 | `lib/worktree/discover.ts` — parse `git worktree list --porcelain` | [x] | |
| P0.4 | `lib/worktree/registry.ts` — merge discovery + optional `.pi/worktree-board.json` | [x] | |
| P0.5 | `lib/worktree/status.ts` — dirty, branch, optional BDD phase file peek | [x] | |
| P0.6 | Caps: `maxBusyWriters`, cost/warn helpers | [x] | Align with fleet N>5 spirit |
| P0.7 | Unit tests for discover/registry/status | [x] | bun test |

**Exit:** `bun test lib/worktree` green; no extension wiring required.

### Example Map (draft)

**Rules**

- R1: Board lists only worktrees belonging to current repo root (unless D3 changes).  
- R2: At most `maxBusyWriters` cards may be `busy` with a writer agent.  
- R3: Spawning a writer requires an explicit card id + cwd; never implicit root.  
- R4: Removing a git worktree drops or prunes the card on next refresh.  
- R5: Ship choice B registers a card after successful `git worktree add`.  

**Examples**

- R1-E1: `git worktree list` shows 3 paths under repo → 3 cards.  
- R2-E1: 2 busy, third spawn → rejected with message.  
- R5-E1: ship B creates `.worktrees/foo` → card appears with branch name.  

**Questions** → promote to Locked decisions.

---

## Phase 1 — CLI / commands (thin UX)

**Goal:** usable without fancy chrome.

| ID | Task | Status | Notes |
|----|------|--------|-------|
| P1.1 | Extension stub `extensions/worktree-board.ts` | [x] | |
| P1.2 | `/wt` · `/wt list` · `/wt status` | [x] | |
| P1.3 | `/wt new <branch> [path]` — wrap `git worktree add` + registry | [x] | Reuse ship naming |
| P1.4 | `/wt focus <id\|path\|branch>` — set focused card; footer chip | [x] | No silent chdir |
| P1.5 | `/wt prune` — drop stale registry entries | [x] | |
| P1.6 | Footer `setStatus('wt', …)` via ops-hud-like pattern | [x] | |
| P1.7 | Wire package.json / settings if needed | [x] | personal package already globs extensions |
| P1.8 | Docs blurb in cheatsheet | [x] | |

**Exit:** From root repo, operator can list/new/focus/prune worktrees in Pi.

---

## Phase 2 — Overlay rail (left-panel *feel*)

**Goal:** toggleable board UI (overlay), not upstream layout fork.

| ID | Task | Status | Notes |
|----|------|--------|-------|
| P2.1 | `WorktreeBoardView` component (SelectList / custom) | [x] | TUI docs Pattern 1 |
| P2.2 | `ui.custom(..., { overlay: true, overlayOptions })` dock left if API allows | [x] | Fall back to centered overlay |
| P2.3 | Keybinding `Ctrl+Alt+W` toggle | [x] | keybindings.md style |
| P2.4 | j/k navigate, Enter detail, `n` new, `x` clear focus | [~] | |
| P2.5 | Detail strip: path, branch, dirty, last agent, BDD phase | [~] | |
| P2.6 | Live refresh on timer / git hooks optional | [x] | Keep simple: refresh on open + command |

**Exit:** Keyboard-driven board feels like a left rail; works in Ghostty/iTerm.

**Research spike:** skim [pi-sidebar-tui](https://pi.dev/packages/pi-sidebar-tui) for overlay positioning patterns — do not depend on it unless D5 changes.

---

## Phase 3 — Orchestration

**Goal:** root spawns work bound to a card’s cwd.

| ID | Task | Status | Notes |
|----|------|--------|-------|
| P3.1 | `/wt run ship <id>` — confirm → subagent/ship in card cwd | [x] | Skill ship + workspace already confirmed |
| P3.2 | `/wt run review <id>` — fleet_dispatch review on that tree’s diff | [x] | Record runId on card |
| P3.3 | Busy/idle from pi-subagents async / ledger | [~] | Reuse run-ledger patterns |
| P3.4 | Steer/stop hooks (minimal) | [-] | |
| P3.5 | Enforce maxBusyWriters at spawn | [x] | |
| P3.6 | Card links: `synthesisPath`, session id | [~] | |

**Exit:** Can run review or ship against a non-focused tree without manually cd’ing.

---

## Phase 4 — Deep attach (optional)

| ID | Task | Status | Notes |
|----|------|--------|-------|
| P4.1 | `/wt open <id>` — tmux new-window `pi` in cwd | [x] | Only if D1 allows |
| P4.2 | Detect existing tmux session / reuse | [-] | |
| P4.3 | Document keybinding coexistence | [ ] | |

**Exit:** One key from board → full Pi in that worktree.

---

## Phase 5 — Integrations & polish

| ID | Task | Status | Notes |
|----|------|--------|-------|
| P5.1 | Ship skill §0: on B, call registry register | [ ] | |
| P5.2 | BDD: read phase from card cwd `.pi` state if present | [ ] | |
| P5.3 | ops-hud: `trees×N` chip | [ ] | |
| P5.4 | `/agentic doctor` check: git worktree available | [ ] | |
| P5.5 | Cheatsheet + roadmap link | [x] | |
| P5.6 | Hardening: path allowlist, no escape outside repo | [ ] | |

---

## Out of scope / deferred

| Item | Why |
|------|-----|
| Core pi-tui permanent left split | Upstream; track as future P3+ |
| Multi-repo monorepo-of-monorepos board | Until D3 says yes |
| Auto multi-writer fleets per tree | Safety |
| Windows worktree UX | Later |

---

## File map (target)

```text
~/dotfiles/agents-shared/.agents/adapters/pi/personal/
  extensions/worktree-board.ts
  lib/worktree/
    types.ts
    discover.ts
    discover.test.ts
    registry.ts
    registry.test.ts
    status.ts
    status.test.ts
    caps.ts
    format.ts
  docs/worktree-board-plan.md    ← this plan (canonical)
  docs/bdd-fleet-cheatsheet.md   ← link section
```

Project optional:

```text
<repo>/.pi/worktree-board.json   ← registry overlay (not secrets)
```

---

## Commands (target UX)

```text
/wt                 # toggle board overlay
/wt list            # text list
/wt status          # focused card + caps
/wt new <branch> [path]
/wt focus <id|branch|path>
/wt prune
/wt run ship <id>
/wt run review <id>
/wt open <id>       # optional tmux
```

**Hotkeys (target)**

| Key | Action |
|-----|--------|
| Ctrl+Alt+W | Toggle board |
| j/k | Move (when board focused) |
| Enter | Focus / detail |
| n | New worktree flow |
| s | Ship on selection (confirm) |
| r | Review fleet on selection |
| o | Open full Pi (if enabled) |
| x | Stop / clear busy (if safe) |
| Esc | Close overlay |

---

## Risks

| Risk | Mitigation |
|------|------------|
| Silent cwd switch corrupts session tools | Never chdir root session; always spawn with cwd |
| Overlay can’t dock left on all terminals | Graceful center modal; still ship P1 commands |
| Too many writers | maxBusyWriters + confirm |
| Stale registry | prune + discover is source of truth |
| Keybinding clashes (fleet Ctrl+Alt+F) | Document; make configurable |

---

## Success metrics

- [ ] From monorepo root, create 2 feature worktrees without leaving Pi  
- [ ] See both on board with dirty/branch  
- [ ] Run review on tree A while chatting in root  
- [ ] Never double-write the same tree  
- [ ] Ship B auto-registers a card  

---

## Progress log

| Date | What | Result |
|------|------|--------|
| 2026-07-24 | Brainstorm in chat; plan file created | Plan v0 |
| 2026-07-24 | BDD red→green; lib/worktree + /wt extension | tests green; overlay Ctrl+Alt+W |


---

## Next action

1. Lock D1–D7 (even as strawman → accepted).  
2. Start **P0.1–P0.3** (Example Map + discover lib + tests).  
3. Do not build overlay until P0 tests green.

---

## Open for Leo

Reply with decisions D1–D7 (or “accept strawman”) to move P0 to in progress.

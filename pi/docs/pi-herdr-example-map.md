# Example Map — pi × herdr Orchestration TUI

**Focus:** `pi-herdr-orchestration-tui`
**Phase:** discovery (bdd-mode)
**Date:** 2026-07-28
**Actor:** developer-orchestrator running multiple pi (and other) agents via herdr; secondarily, pi agents driving herdr themselves from inside a pane.

**Story:** Transform pi into a beautiful, worktree-first, BDD+TDD-first TUI for agent orchestration and management, using herdr (agent multiplexer) as the session/process layer.

---

## Rules

- **R1 — Authoritative agent state.** When herdr's pi lifecycle hooks are installed, pi's pane state (`idle` / `working` / `blocked`) and session identity come from the hooks — never from two competing sources. Without hooks, herdr falls back to screen-manifest detection.
- **R2 — Agents can orchestrate.** Inside a herdr pane (`HERDR_ENV=1`), pi may use the `herdr` CLI: inspect workspaces/tabs/panes, split panes, `pane run`, `pane read`, `wait agent-status`, and start sibling agents — without stealing focus.
- **R3 — Worktree-first.** Every new agent task runs in its own git worktree (one writer per worktree), and each worktree maps to a herdr workspace/pane with matching labels.
- **R4 — BDD+TDD-first.** Any behavior-changing code (including the pi extensions we write in `~/dotfiles/pi`) follows discovery → formulation → red → green → verify with machine-enforced gates. Tests exist before implementation.
- **R5 — Herd state is visible in the TUI.** pi surfaces sibling-agent status (blocked first, then working/done) in a persistent widget/footer — gh-dash-style aligned rows, per DESIGN.md §7.
- **R6 — Never color-only meaning.** State is icon + text + color (`● working`, `⚠ blocked`), per DESIGN.md accessibility rules.
- **R7 — Detach-safe.** Everything survives terminal close/reattach (herdr server owns persistence); no pi UI element assumes the controlling terminal stays attached.

## Examples

- **R1-E1** — pi pane with hooks installed: sidebar shows `working` during tool execution, `idle` at prompt, `blocked` on permission gate.
- **R1-E2** — hooks not installed: herdr classifies state from the screen manifest (bottom-buffer snapshot), still correct while scrolled back.
- **R2-E1** — orchestrator pi runs `herdr pane split 1-1 --direction right`, `herdr pane run <id> "pi -p 'implement story X'"`, then `herdr wait agent-status <id> --status done` and reads output via `herdr pane read <id> --source recent-unwrapped`.
- **R2-E2** — pi outside herdr (no `HERDR_ENV`): the herdr skill stays silent; no herdr commands attempted.
- **R3-E1** — starting story #123 creates worktree `../repo-123` + herdr workspace labeled `story-123` with `cwd` = worktree path; one writer guaranteed.
- **R5-E1** — three agents active, one blocked: herd widget shows `● 2 working  ⚠ 1 blocked (api)`; blocked row lists pane label.
- **R5-E2** — no herdr session running: widget hides itself (graceful absence, not an error).
- **R4-E1** — a new pi extension in `~/dotfiles/pi` only lands after `bun test` red → green evidence is recorded via bdd-mode.

## Questions

- **Q1 — pi hook install path.** ✅ **Resolved 2026-07-28.** `herdr agent start <name> --kind pi --pane <id> [-- args...]` — pi is a native kind in herdr 0.7.5. `agent start` blocks until the agent is detected ready (30s default timeout). Lifecycle states: `idle` (seen + ready), `done` (idle after unseen background work), `blocked` (approval/question UI), `unknown`. Command surface: `herdr agent list|get|read|prompt|wait|send-keys|rename|focus|attach|start|explain`.
- **Q2 — Install approval.** ✅ **Resolved 2026-07-28.** User installed herdr manually; verified `herdr 0.7.5`.
- **Q3 — Widget data source.** Herd widget: shell out to `herdr agent list` (JSON) per render tick, or hold the socket? Polling interval + cache strategy to stay flicker-free? *Decide in formulation; CLI-per-tick with ~2s cache is the simple start.* **Amended 2026-07-28** (live flicker/perf evidence: CLI spawn 157–362ms; `setWidget` re-layout every poll; self row flapping working↔idle): TTL 2s→5s, self-filter (R5-E6), stale-while-revalidate (R5-E5), publish-on-change + serialized polls (R7-E2). Socket-direct polling (like `herdr-agent-state.ts`) is the follow-up if spawn cost still shows.
- **Q4 — Test stack for dotfiles.** ✅ **Resolved 2026-07-28.** Adopt `bun:test` + minimal `package.json` in `~/dotfiles/pi`. Red/green commands: `bun test`.
- **Q5 — Worktree-first scope.** All repos or only olhaminha.bio? Default branch to fork worktrees from (`develop`)?
- **Q6 — Mapping granularity.** One herdr workspace per repo with tabs per worktree, or one workspace per worktree? (Sidebar readability trade-off.)
- **Q7 — Skill install.** ✅ **Resolved 2026-07-28.** Vendor herdr's SKILL.md into `~/dotfiles/agents-shared/.agents/adapters/pi/personal/skills/herdr/SKILL.md` (versioned). Write blocked by discovery gate → do it first thing in formulation (config/env setup, not production code). Local adaptation: examples use `--kind pi`.

## Fact base (verified this session)

- herdr **0.7.5 installed** (`brew`); `ctrl+b q` detach, `herdr` reattach; survives over SSH.
- **pi is a native agent kind** (`herdr agent start <name> --kind pi --pane <id>`); detection verified against the installed binary (`herdr agent` help).
- State authorities: pi = **lifecycle hooks when installed**, else screen manifest (bottom-buffer, scroll-independent).
- IDs: workspace `w1`, tab `w1:t1`, pane `w1:p1` (opaque, parse from JSON; never derive from sidebar). Caller context env: `HERDR_WORKSPACE_ID`, `HERDR_TAB_ID`, `HERDR_PANE_ID`.
- Control: `herdr workspace create --cwd <dir> --label <x>` · `tab create` · `pane split --current --direction right --cwd "$PWD" --no-focus` · `pane run <id> "<cmd>"` · `pane wait-output <id> --match <text> --timeout ms` · `pane read <id> --source recent-unwrapped --lines N` · `agent prompt <name> "<text>" --wait --timeout ms` · `agent wait <name> --until blocked`.
- Agent skill: vendored into dotfiles (Q7); agents act only when `HERDR_ENV=1`; skill is explicit-invocation only (not ambient).
- Sources: herdr.dev (home, /docs/agents/, /docs/quick-start/, /docs/agent-skill/, /agent-guide.md), github.com/ogulcancelik/herdr (SKILL.md), installed binary 0.7.5.

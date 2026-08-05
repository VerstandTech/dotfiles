# DESIGN.md — pi.dev TUI Redesign + herdr Orchestration

> Living design document for customizing the pi coding-agent TUI.
> Follows the DESIGN.md convention (Goals/Non-Goals → Principles → Tokens → Components → Plan → Open Questions).
> Everything here must be implementable through pi's actual extension/theme surface — no wishful thinking.
>
> **Scope extension (2026-07-28):** pi becomes a worktree-first, BDD+TDD-first TUI for **agent orchestration**, with [herdr](https://herdr.dev) (agent multiplexer) as the session/process layer. Behavior map: `docs/pi-herdr-example-map.md` (BDD discovery artifact).

---

## 1. Overview

pi's TUI is customizable through three official surfaces:

| Surface | Mechanism | Docs |
|---|---|---|
| **Themes** | JSON theme files with 51 required color tokens, hot-reloaded on save | `docs/themes.md` |
| **Extensions** | TS files with `ctx.ui.custom()`, `setFooter`, `setHeader`, `setWidget`, `setStatus`, `setWorkingIndicator`, `setEditorComponent` | `docs/extensions.md`, `docs/tui.md` |
| **Custom components** | `Component` interface (`render(width) → string[]`, `handleInput`, `invalidate`) + overlays with anchor/margin/responsive options | `docs/tui.md` |

Plus one external surface for orchestration:

| Surface | Mechanism | Docs |
|---|---|---|
| **herdr** | Agent multiplexer (Rust binary): workspaces/tabs/panes, semantic agent state (idle/working/blocked/done), CLI + JSON socket API, pi lifecycle hooks | [herdr.dev](https://herdr.dev/docs/) |

This document captures the design decisions for how *our* TUI should look and behave, so future extension/theme work has a single source of truth.

**Theme locations:** `~/.pi/agent/themes/*.json` — file-symlinked from `~/dotfiles/pi/.pi/agent/themes/` (the themes dir is a real dir; stow folds per-file).
**Extension locations:** `~/dotfiles/agents-shared/.agents/adapters/pi/personal/extensions/herd/` (subdir + `index.ts`, discovered via the `personal` package's `"pi.extensions": ["./extensions/*.ts", "./extensions/*/index.ts"]` glob; `personal` is whole-dir stow-linked and loaded via `settings.json` packages).
**Stow policy:** only the `.pi` tree maps into `~` — enforced by `~/dotfiles/pi/.stow-local-ignore` (repo files: docs/tests/extensions-source/package.json stay out of home).

---

## 2. Goals & Non-Goals

### Goals
- A TUI that feels **calm and information-dense without noise** (gemini-cli's "one pixel at a time" philosophy).
- **Always-visible state**: model, thinking level, session, working indicator, and agent/fleet status never vanish.
- **Progressive disclosure**: tool output collapsed by default; overlays for pickers instead of inline scrolling lists.
- A **signature visual identity** built on pi's unique thinking-level color ramp (`thinkingOff` → `thinkingMax`).
- Fully **keyboard-discoverable**: every action visible in footer/autocomplete hints.
- Degrade gracefully: readable in 256-color terminals and light backgrounds.

### Orchestration Goals (herdr)
- **Worktree-first**: one git worktree per agent task, mapped 1:1 to herdr workspaces/panes (Example Map R3).
- **BDD+TDD-first**: every behavior change — including these extensions — lands red → green with bdd-mode gates (R4).
- **Herd-visible**: pi shows sibling-agent state (blocked → working → done) via herdr lifecycle hooks / CLI (R1, R2, R5).
- **Detach-safe**: all state survives close/reattach; herdr server owns persistence (R7).

### Non-Goals
- No mouse-first interactions (keyboard is primary).
- No images/Kitty-graphics in the core view (optional components only).
- No per-project theme forks — one personal design system, selected via `/settings`.
- Not re-skinning pi upstream; everything via personal themes + extensions.
- Not replacing herdr's own sidebar — pi surfaces herd *status*; herdr owns panes/sessions.

---

## 3. Inspirations (and what we take from each)

| Source | Why it's awesome | What we adopt |
|---|---|---|
| **lazygit** | Dense panels, focus always unmistakable | Obvious focused component (accent border); footer keybinding hints |
| **btop** | Proves TUIs can be gorgeous (true color, gradients) | Tasteful true-color accents; thinking-level color ramp as identity |
| **gh-dash** | One aligned line per item, dim metadata | Subagent/fleet/herd rows: status icon + name + dim metadata, aligned columns |
| **yazi** | Preview-on-navigate, instant context | Selector overlays show context preview of the highlighted item |
| **Crush** (Charm) | Most polished AI-agent CLI | Model badge styling, session chrome |
| **gemini-cli** | Flicker-free, "GUI-like" calm | No visual noise; muted borders; whitespace over ornamentation |
| **Claude Code** | Agentic TUI vocabulary | Collapsed tool output, inline diffs, clear permission dialogs |
| **OpenTUI** | Component/flexbox mental model | Compose from `Box`/`Container`/`Text`/`Spacer` built-ins |
| **herdr** | Semantic agent state in the sidebar | Blocked-first herd rows; state = icon + text + color |

Galleries for ongoing reference: [terminaltrove.com](https://terminaltrove.com/categories/tui/), [github.com/rothgar/awesome-tuis](https://github.com/rothgar/awesome-tuis).

---

## 4. Design Principles

1. **Hierarchy before color.** Spacing, weight, and grouping first; color reinforces, never carries meaning alone (WCAG: ≥4.5:1 for text, ≥3:1 for large/bold).
2. **One semantic palette.** ~5 semantic colors (success / warning / error / info / muted) + 1 accent. Everything else derives from `vars`.
3. **Quiet by default.** Muted borders, dim metadata, no decorative box-drawing on the main view. Ornamentation reserved for focused/active elements.
4. **State is persistent.** Working indicator, model, thinking level, herd status are always rendered — never transient.
5. **Overlays over inline UI.** Pickers, confirmations, and dashboards render as anchored overlays (`overlayOptions`), keeping the scrollback clean.
6. **Worst-terminal first.** Design for 256-color, no italics, narrow (≥80 col) — then enhance with true color.
7. **Blocked is the loudest signal.** In orchestration views, an agent waiting on a human outranks everything; it sorts first and uses the warning channel.

---

## 5. Design Tokens

Mapped to pi's theme schema (51 required tokens). Values below are the intended direction; concrete hex lives in the theme JSON.

### 5.1 Core UI
- `accent` — single brand accent (used sparingly: focus, links, active states)
- `text` — default terminal foreground (`""`) for maximum compatibility
- `muted` / `dim` — two-level de-emphasis ramp for metadata
- `success` / `warning` / `error` — semantic only, never decorative
- `border` / `borderAccent` / `borderMuted` — three-level border hierarchy: default structure uses `borderMuted`, focused/active elements use `borderAccent`

### 5.2 Backgrounds & Content
- `selectedBg` — subtle, low-saturation selection background (never high-chroma)
- `userMessageBg` / `customMessageBg` — barely-different-from-terminal tint; user messages visually distinct from agent output by background, not borders
- `toolPendingBg` / `toolSuccessBg` / `toolErrorBg` — state background tints for tool blocks (the lazygit "state is obvious" rule)

### 5.3 Markdown (agent output)
- `mdHeading` accent-colored; `mdCode`/`mdCodeBlock` distinct from prose; `mdQuoteBorder` + `mdHr` muted; `mdLink` accent, `mdLinkUrl` dim

### 5.4 Thinking-level ramp (pi's signature)
- `thinkingOff` → `thinkingMax`: a perceptually ordered gradient (muted → vivid), e.g. gray → blue → cyan → magenta → red. Borders of the editor/thinking blocks communicate reasoning level at a glance. This is our Crush-model-badge equivalent.

### 5.5 Syntax & diffs
- Syntax palette harmonized with accent family (avoid rainbow); diffs use classic `toolDiffAdded`/`toolDiffRemoved` but desaturated to match the quiet aesthetic

### 5.6 Bash mode
- `bashMode` — warm, high-attention color (e.g. amber): entering bash mode (`!`) must be unmissable

### 5.7 Herd states (mapped onto existing tokens)
- `working` → `accent` · `blocked` → `warning` · `idle` → `dim` · `done` → `success`. No new tokens needed; consistency with tool-state backgrounds.

---

## 6. Typography & Spacing

- Default terminal font; **never assume bold/italic support** — use color tokens as the primary emphasis channel.
- Prefer vertical whitespace (blank lines via `Spacer`) over separator lines between major sections.
- Keep content ≤ terminal width minus 2 columns margin; every `render(width)` line must respect `truncateToWidth` / `visibleWidth` (ANSI-safe).
- Alignment for tabular data (fleet/herd rows, settings lists): pad columns, dim everything after the first two.

---

## 7. Component Specs

### 7.1 Custom footer (`ctx.ui.setFooter`)
Reference: `examples/extensions/custom-footer.ts`
- Line 1: keybinding hints (dim), discoverability-first
- Line 2: model · thinking level (ramp-colored) · session name · branch
- Never more than 2 lines; truncate middle segments first

### 7.2 Header / status (`setHeader`, `setStatus`, `setWidget`)
Reference: `examples/extensions/plan-mode/index.ts`, `model-status.ts`
- Persistent status pill for plan mode / bash mode (color from token, icon + text — never color alone)
- Widget above editor for active fleet/subagent summary (gh-dash row style)

### 7.3 Working indicator (`setWorkingIndicator`)
- Calm, non-strobing animation; includes elapsed time + current tool name (dim)

### 7.4 Selector overlays
Reference: `examples/extensions/preset.ts`, overlay docs
- All pickers (models, sessions, themes) as `{ overlay: true }` with `anchor: "center"`, `width: "60%"`, `maxHeight: "70%"`
- `visible: (w) => w >= 80` — hide gracefully on narrow terminals
- Highlighted row: `selectedBg` + accent prefix `> `; yazi-style context preview when cheap

### 7.5 Custom tool rendering (`renderCall` / `renderResult`)
- Collapsed by default: one line (`toolTitle` + summary), expand on demand
- State conveyed by `toolPendingBg`/`toolSuccessBg`/`toolErrorBg` background + label text
- Markdown results via `getMarkdownTheme()` + `Markdown` component

### 7.6 Editor
- Keep default editor (CustomEditor semantics: escape-to-abort, ctrl+d, model switching must survive); restyle borders via theme tokens only (`borderAccent` focused, `borderMuted` idle, `bashMode` for `!`)

### 7.7 Herd widget (orchestration)
- **Placement**: `setWidget` above editor; hidden when no herdr session (`HERDR_ENV` unset / no socket) — graceful absence, never an error row.
- **Content**: gh-dash rows — status icon + pane label + worktree/branch (dim), sorted **blocked first**, then working, then done.
- **States**: `● working` (accent) · `⚠ blocked` (warning, needs human) · `○ idle` (dim) · `✓ done` (success). Icon + text + color — never color alone.
- **Data**: herdr CLI/JSON socket, polled with cache (flicker-free; Q3 in Example Map).
- **Identity**: pi panes use herdr lifecycle hooks for authoritative state when installed (R1).

### 7.8 Worktree-first task launcher
- Command (e.g. `/herd-task <story>`) that: creates a git worktree → creates herdr workspace/pane with matching label and `cwd` = worktree → starts a sibling pi there (R3).
- One writer per worktree, always; the orchestrator pi never edits another task's tree.

---

## 8. Accessibility

- Contrast: every foreground/background token pair ≥ 4.5:1 (test both dark and light variants).
- **Never color-only meaning**: status = icon + text + color (e.g. `● Running`, not just a green dot).
- Light theme is a first-class citizen: pi auto-detects terminal background on first run; we ship both `dark` and `light` variants of the custom theme.
- 256-color fallback values for every true-color hex (theme tokens accept palette indexes, e.g. `242`).

---

## 9. Implementation Plan

| # | Deliverable | Surface | Notes |
|---|---|---|---|
| 0 | Install herdr + pi lifecycle hooks + herdr agent skill | Environment | **Needs user approval** (brew install blocked by discovery gate); then `herdr --version` smoke check |
| 1 | `~/.pi/agent/themes/<name>.json` — dark + light variants | Theme | Iterate live via hot reload |
| 2 | Custom footer extension | `setFooter` | Model/thinking/branch line |
| 3 | Working indicator + status pills | `setWorkingIndicator`, `setStatus` | Elapsed time, plan/bash pills |
| 4 | Overlay-based model/session picker | `ctx.ui.custom` + `overlayOptions` | Replaces inline lists |
| 5 | Herd widget (sibling-agent status) | `setWidget` + herdr CLI/socket | gh-dash rows, blocked-first (R5) |
| 6 | Worktree-first task launcher | Extension + herdr CLI | worktree ↔ workspace/pane 1:1 (R3) |
| 7 | Tool render pass | `renderResult` overrides | Collapse-by-default polish |

Sequencing: 0 (environment) and 1 (pure config) first, then 2–3 (chrome), then 4–7 (components). Every behavior-changing extension (2–7) follows the BDD phase gates with `bun test` as the unit runner in `~/dotfiles/pi` (Q4).

---

## 10. Alternatives Considered

- **Fork/patch pi upstream** — rejected: maintenance burden; personal themes + extensions cover the goals.
- **Single mega-extension** — rejected: prefer small composable extensions (one per concern), matching pi's own examples layout.
- **Rich graphics (sixel/Kitty images)** — rejected for core view: terminal-compatibility risk; allowed only in opt-in components.
- **tmux/Zellij instead of herdr** — rejected: they own persistent PTYs but have no semantic agent state (idle/working/blocked) and no agent-facing socket API; herdr is purpose-built and treats pi as a first-class lifecycle-hook citizen.
- **Desktop agent-manager app** — rejected: lives on one machine, no SSH reattach, not terminal-native.

---

## 11. Open Questions

Carried from `docs/pi-herdr-example-map.md` (Q1–Q7) — highlights:
- Q1: What installs pi's herdr lifecycle hooks? (resolve post-install via `herdr agent`)
- Q2: herdr install approval (brew) — pending user.
- Q3: Herd widget polling: CLI-per-tick vs held socket + cache?
- Q4: Adopt `bun:test` + minimal `package.json` in `~/dotfiles/pi` for extension tests?
- Q6: herdr workspace per repo (tabs per worktree) vs workspace per worktree?
- Q7: Vendor herdr's SKILL.md into dotfiles vs `npx skills add -g`?

Plus the original TUI questions:
- Theme name/branding (one accent or per-mode accents)?
- Footer context-usage % (token meter) or purely navigational?
- Minimal/zen mode toggle (hide footer+widgets) — cf. `examples/extensions/minimal-mode.ts`?
- Which pickers warrant overlays vs pi's built-in autocomplete?

---

## References

**pi internals (local install):**
- `docs/tui.md` — component interface, overlays, patterns, key rules
- `docs/themes.md` — 51-token schema, color values, hot reload
- `docs/extensions.md` — `ctx.ui` surface, extension locations
- `examples/extensions/` — `custom-footer.ts`, `model-status.ts`, `preset.ts`, `plan-mode/`, `minimal-mode.ts`, `modal-editor.ts`, `overlay-qa-tests.ts`

**herdr:**
- [herdr.dev](https://herdr.dev/) · [/docs/agents/](https://herdr.dev/docs/agents/) · [/docs/quick-start/](https://herdr.dev/docs/quick-start/) · [/docs/agent-skill/](https://herdr.dev/docs/agent-skill/) · [agent-guide.md](https://herdr.dev/agent-guide.md) · [GitHub + SKILL.md](https://github.com/ogulcancelik/herdr)

**External design:**
- [Terminal Trove](https://terminaltrove.com/) — TUI gallery with screenshots
- [awesome-tuis](https://github.com/rothgar/awesome-tuis)
- [Google: Making the terminal beautiful, one pixel at a time](https://developers.googleblog.com/making-the-terminal-beautiful-one-pixel-at-a-time/)
- [OpenTUI](https://opentui.com/) · [Bubble Tea](https://github.com/charmbracelet/bubbletea) · [Crush](https://github.com/charmbracelet/crush)
- [Google DESIGN.md convention](https://github.com/google-labs-code/design.md)
- WCAG contrast: 4.5:1 text / 3:1 large text

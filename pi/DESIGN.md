# DESIGN.md — pi.dev TUI Redesign

> Living design document for customizing the pi coding-agent TUI.
> Follows the DESIGN.md convention (Goals/Non-Goals → Principles → Tokens → Components → Plan → Open Questions).
> Everything here must be implementable through pi's actual extension/theme surface — no wishful thinking.

---

## 1. Overview

pi's TUI is customizable through three official surfaces:

| Surface | Mechanism | Docs |
|---|---|---|
| **Themes** | JSON theme files with 51 required color tokens, hot-reloaded on save | `docs/themes.md` |
| **Extensions** | TS files with `ctx.ui.custom()`, `setFooter`, `setHeader`, `setWidget`, `setStatus`, `setWorkingIndicator`, `setEditorComponent` | `docs/extensions.md`, `docs/tui.md` |
| **Custom components** | `Component` interface (`render(width) → string[]`, `handleInput`, `invalidate`) + overlays with anchor/margin/responsive options | `docs/tui.md` |

This document captures the design decisions for how *our* TUI should look and behave, so future extension/theme work has a single source of truth.

**Theme locations:** `~/.pi/agent/themes/*.json` (personal) — stowed from `~/dotfiles/pi/`.
**Extension locations:** `~/.pi/agent/extensions/` (personal) — stowed from `~/dotfiles/pi/`.

---

## 2. Goals & Non-Goals

### Goals
- A TUI that feels **calm and information-dense without noise** (gemini-cli's "one pixel at a time" philosophy).
- **Always-visible state**: model, thinking level, session, working indicator, and agent/fleet status never vanish.
- **Progressive disclosure**: tool output collapsed by default; overlays for pickers instead of inline scrolling lists.
- A **signature visual identity** built on pi's unique thinking-level color ramp (`thinkingOff` → `thinkingMax`).
- Fully **keyboard-discoverable**: every action visible in footer/autocomplete hints.
- Degrade gracefully: readable in 256-color terminals and light backgrounds.

### Non-Goals
- No mouse-first interactions (keyboard is primary).
- No images/Kitty-graphics in the core view (optional components only).
- No per-project theme forks — one personal design system, selected via `/settings`.
- Not re-skinning pi upstream; everything via personal themes + extensions.

---

## 3. Inspirations (and what we take from each)

| Source | Why it's awesome | What we adopt |
|---|---|---|
| **lazygit** | Dense panels, focus always unmistakable | Obvious focused component (accent border); footer keybinding hints |
| **btop** | Proves TUIs can be gorgeous (true color, gradients) | Tasteful true-color accents; thinking-level color ramp as identity |
| **gh-dash** | One aligned line per item, dim metadata | Subagent/fleet rows: status icon + name + dim metadata, aligned columns |
| **yazi** | Preview-on-navigate, instant context | Selector overlays show context preview of the highlighted item |
| **Crush** (Charm) | Most polished AI-agent CLI | Model badge styling, session chrome |
| **gemini-cli** | Flicker-free, "GUI-like" calm | No visual noise; muted borders; whitespace over ornamentation |
| **Claude Code** | Agentic TUI vocabulary | Collapsed tool output, inline diffs, clear permission dialogs |
| **OpenTUI** | Component/flexbox mental model | Compose from `Box`/`Container`/`Text`/`Spacer` built-ins |

Galleries for ongoing reference: [terminaltrove.com](https://terminaltrove.com/categories/tui/), [github.com/rothgar/awesome-tuis](https://github.com/rothgar/awesome-tuis).

---

## 4. Design Principles

1. **Hierarchy before color.** Spacing, weight, and grouping first; color reinforces, never carries meaning alone (WCAG: ≥4.5:1 for text, ≥3:1 for large/bold).
2. **One semantic palette.** ~5 semantic colors (success / warning / error / info / muted) + 1 accent. Everything else derives from `vars`.
3. **Quiet by default.** Muted borders, dim metadata, no decorative box-drawing on the main view. Ornamentation reserved for focused/active elements.
4. **State is persistent.** Working indicator, model, thinking level, and status are always rendered — never transient.
5. **Overlays over inline UI.** Pickers, confirmations, and dashboards render as anchored overlays (`overlayOptions`), keeping the scrollback clean.
6. **Worst-terminal first.** Design for 256-color, no italics, narrow (≥80 col) — then enhance with true color.

---

## 5. Design Tokens

Mapped to pi's theme schema (51 required tokens). Concrete hex lives in `herd-dark.json` / `herd-light.json`.

### 5.0 Charcoal ops palette (screenshot-matched, 2026-08)
Neutral charcoal base — **not** blue-tinted Tokyo Night. Sampled from reference TUI:

| Role | Dark hex | Notes |
|---|---|---|
| Page bg | `#181818` | export.pageBg; terminal should match |
| Panel | `#222222` / `#1c1c1c` | user/tool surfaces |
| Ink | `#e0e0e0` | primary text |
| Fog / shadow | `#888888` / `#5a5a5a` | muted / dim |
| **Accent (sky)** | `#66a6f8` | progress bar, focus, links |
| **Teal** | `#74bcbc` | secondary brand ("swarm" labels, code) |
| **Amber** | `#dca84c` | mode labels (yolo/bash), thinkingMax |
| Success | `#60a670` | soft green progress dots |
| Error | `#d07070` | desaturated rose |

Motion (ops-hud chrome):
- Default working indicator: gold half-moon `◐◓◑◒` with amber→gold gradient (~110ms)
- Live ops indicator: braille spinner on sky→teal gradient (~80ms)
- Status chip dot: slow sky→teal pulse (~120ms) while activities run

### 5.1 Core UI
- `accent` — sky blue brand accent (used sparingly: focus, links, active states)
- `text` — soft ink (`#e0e0e0` dark / `#2a2a2a` light), not bare terminal default
- `muted` / `dim` — two-level de-emphasis ramp for metadata
- `success` / `warning` / `error` — semantic only, never decorative
- `border` / `borderAccent` / `borderMuted` — three-level border hierarchy: default structure uses `borderMuted`, focused/active elements use `borderAccent`

### 5.2 Backgrounds & Content
- `selectedBg` — subtle blue-gray selection (`#2a3038` dark), never high-chroma
- `userMessageBg` / `customMessageBg` — barely-different-from-terminal tint; user messages visually distinct from agent output by background, not borders
- `toolPendingBg` / `toolSuccessBg` / `toolErrorBg` — state background tints for tool blocks (the lazygit "state is obvious" rule)

### 5.3 Markdown (agent output)
- `mdHeading` accent-colored; `mdCode`/`mdCodeBlock` teal-tinted; `mdQuoteBorder` + `mdHr` muted; `mdLink` accent, `mdLinkUrl` dim

### 5.4 Thinking-level ramp (pi's signature)
- `thinkingOff` → `thinkingMax`: hairline → shadow → sky-deep → sky → teal → soft violet → amber. Borders of the editor/thinking blocks communicate reasoning level at a glance.

### 5.5 Syntax & diffs
- Syntax palette harmonized with sky/teal/amber family (avoid rainbow); diffs use desaturated success/error greens and roses

### 5.6 Bash mode
- `bashMode` — warm amber (`#dca84c`): entering bash mode (`!`) must be unmissable

---

## 6. Typography & Spacing

- Default terminal font; **never assume bold/italic support** — use color tokens as the primary emphasis channel.
- Prefer vertical whitespace (blank lines via `Spacer`) over separator lines between major sections.
- Keep content ≤ terminal width minus 2 columns margin; every `render(width)` line must respect `truncateToWidth` / `visibleWidth` (ANSI-safe).
- Alignment for tabular data (fleet rows, settings lists): pad columns, dim everything after the first two.

---

## 7. Component Specs

### 7.1 Mode-chip footer (`ctx.ui.setFooter`) — `tui-chrome`
Reference target: `yolo swarm K3 thinking: high .../production-`
- **One line only**, all chips **left-clustered** (no right-flush)
- Order: mode (amber) · agent (teal) · herd (sky) · model (ink) · `thinking: level` (ramp) · dim path trailing after two spaces
- Shrink order when tight: path → model → herd → agent; mode+thinking survive
- Pure renderer: `lib/tui-chrome/footer-chips.ts`

### 7.2 Task board (`setWidget` above editor) — `ops-hud`
Reference target: `001 [⣿⣿:.......] Better location? Chec…  12s`
- Numbered rows (3-digit sky index) with green dotted mini-bars, sweeping head per row
- Fed by live tool executions (web/subagent/tool), dim age suffix; `+N more` overflow
- Herd sibling widget stays gh-dash rows, but **collapses to the summary line when all idle**
- Pure renderer: `lib/tui-chrome/task-board.ts`

### 7.3 Working row (component, not just a spinner) — `tui-chrome`
Target: `◐ Working... ━━━━━━━━━━━━━━━━`
- Hide built-in loader (`setWorkingVisible(false)`) while agent runs
- Above-editor widget: gold half-moon + sky label + **solid `━` bar** with a slowly traveling sky gradient
- Elapsed seconds appear after 1s; label specializes for web/subagent tools
- Pure renderer: `lib/tui-chrome/working-row.ts`

### 7.4 Selector overlays
Reference: `examples/extensions/preset.ts`, overlay docs
- All pickers (models, sessions, themes) as `{ overlay: true }` with `anchor: "center"`, `width: "60%"`, `maxHeight: "70%"`
- `visible: (w) => w >= 80` — hide gracefully on narrow terminals
- Highlighted row: `selectedBg` + accent prefix `> `; yazi-style context preview when cheap

### 7.5 Custom tool rendering (`renderCall` / `renderResult`)
- Collapsed by default: one line (`toolTitle` + summary), expand on demand
- State conveyed by `toolPendingBg`/`toolSuccessBg`/`toolErrorBg` background + label text
- Markdown results via `getMarkdownTheme()` + `Markdown` component

### 7.6 Editor card — `tui-chrome`
Target: inset input card with `> ` prompt and breathing room
- Extend `CustomEditor` with `paddingX: 2`; inject dim `> ` on first content line
- **Card wrap**: blank line above + below, symmetric margins — 1 col left inset, 1 col right reserved for pi's scrollbar (`renderEditorCard`)
- **Full rounded box**: `boxLines` rewrites the Editor's top/bottom rules into `╭─╮`/`╰─╯` and adds `│` side borders; autocomplete dropdown lines are pulled inside the box; scroll labels (`↑ 3`) survive in the corners
- **Border policy**: quiet hairline `#383838` always; amber only while bash mode (`!`) is armed — overrides pi's thinking-level border colors in favor of calm
- App keybindings preserved (escape abort, ctrl+d, model switch)

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
| 1 | `~/.pi/agent/themes/<name>.json` — dark + light variants | Theme | Iterate live via hot reload |
| 2 | Custom footer extension | `setFooter` | Model/thinking/branch line |
| 3 | Working indicator + status pills | `setWorkingIndicator`, `setStatus` | Elapsed time, plan/bash pills |
| 4 | Overlay-based model/session picker | `ctx.ui.custom` + `overlayOptions` | Replaces inline lists |
| 5 | Fleet/subagent widget | `setWidget` | gh-dash aligned rows |
| 6 | Tool render pass | `renderResult` overrides | Collapse-by-default polish |

Sequencing: 1 first (pure config, immediate feedback), then 2–3 (chrome), then 4–6 (components).

---

## 10. Alternatives Considered

- **Fork/patch pi upstream** — rejected: maintenance burden; personal themes + extensions cover the goals.
- **Single mega-extension** — rejected: prefer small composable extensions (one per concern), matching pi's own examples layout.
- **Rich graphics (sixel/Kitty images)** — rejected for core view: terminal-compatibility risk; allowed only in opt-in components.

---

## 11. Open Questions

- Theme name/branding for the personal theme (and does it ship one accent or per-mode accents)?
- Should the footer include context-usage % (token meter) or stay purely navigational?
- Do we want a minimal/zen mode toggle (hide footer+widgets) — cf. `examples/extensions/minimal-mode.ts`?
- Which pickers actually warrant overlays vs pi's built-in autocomplete?

---

## References

**pi internals (local install):**
- `docs/tui.md` — component interface, overlays, patterns, key rules
- `docs/themes.md` — 51-token schema, color values, hot reload
- `docs/extensions.md` — `ctx.ui` surface, extension locations
- `examples/extensions/` — `custom-footer.ts`, `model-status.ts`, `preset.ts`, `plan-mode/`, `minimal-mode.ts`, `modal-editor.ts`, `overlay-qa-tests.ts`

**External:**
- [Terminal Trove](https://terminaltrove.com/) — TUI gallery with screenshots
- [awesome-tuis](https://github.com/rothgar/awesome-tuis)
- [Google: Making the terminal beautiful, one pixel at a time](https://developers.googleblog.com/making-the-terminal-beautiful-one-pixel-at-a-time/)
- [OpenTUI](https://opentui.com/) · [Bubble Tea](https://github.com/charmbracelet/bubbletea) · [Crush](https://github.com/charmbracelet/crush)
- [Google DESIGN.md convention](https://github.com/google-labs-code/design.md)
- WCAG contrast: 4.5:1 text / 3:1 large text

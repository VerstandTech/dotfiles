# HOST-02 Example Map — WezTerm attach and host ergonomics

**Work package:** HOST-02
**Dependency:** HOST-01 merged as `7a88c228d4143851bd8a6f198a5d8aa3c3636924`
**Locked test command:** `cd pi && bun test tests/wezterm-herdr-contract.test.ts`

## Story

As an operator using WezTerm as the host terminal, I want one explicit, discoverable way to attach to Herdr and a recognizable Herdr tab, so that WezTerm remains the outer shell while Herdr remains the sole durable workspace/session authority.

## In scope

- One non-conflicting WezTerm key action that launches/attaches local Herdr.
- A static Herdr foreground-process icon while retaining readable tab text.
- Operator documentation for the WezTerm-versus-Herdr prefix boundary and remote usage.
- Deterministic source contracts plus a real headless WezTerm config-load check.
- Rollback limited to HOST-02 key/icon/docs changes.

## Out of scope

- WezTerm SSH or Unix domains for Herdr sessions.
- A second durable mux/session model in WezTerm.
- Automatic Herdr launch on GUI startup, config reload, tab formatting, or status refresh.
- Per-render or timer-driven `herdr` status polling.
- Server restart, session stop, integration uninstall, agent resume, or workspace mutation.
- Changing existing split, pane, tab, copy, resize, font, or command-palette bindings.
- Redesigning the existing tab bar or optimizing its pre-existing Git branch lookup.

## Rules and examples

### R1 — Herdr attach is an explicit argv action

- `LEADER+a` is the HOST-02 local attach action because the tuple is unused in the current config.
- The action uses `SpawnCommandInNewTab` with exact argv `{ "herdr" }`; it does not invoke a shell or construct a command string.
- Omitting `cwd` intentionally lets WezTerm infer the active pane's directory according to the official `SpawnCommand` contract.
- Opening and activating the new tab is expected only after the operator presses the key; config load and render callbacks never launch Herdr.

Examples:
1. Pressing `CTRL+SPACE`, then `a`, starts `herdr` in a new tab in the current window.
2. Reloading the WezTerm config performs zero Herdr launches.
3. Formatting or refreshing the tab bar performs zero Herdr launches.
4. The attach action contains no `/bin/sh`, `sh -c`, `bash -c`, interpolation, or user-supplied argv.

### R2 — Existing WezTerm key behavior remains stable

- The existing `CTRL+SPACE` leader and its timeout remain unchanged.
- Existing leader splits, pane movement, zoom, close, resize, tab navigation, copy mode, and reload actions retain their key/action tuples.
- Existing direct macOS bindings retain their behavior.
- HOST-02 adds one tuple and does not replace a current tuple.

Examples:
5. `LEADER+|`, `LEADER+-`, and `LEADER+\\` still split in the current pane domain.
6. `LEADER+h/j/k/l`, `z`, `x`, `s`, `c`, `p`, `n`, `[`, and `r` retain their actions.
7. `CMD+d`, `CMD+SHIFT+d`, `CMD+t`, and the existing direct navigation bindings remain present.
8. A duplicate `LEADER+a` binding fails the contract test.

### R3 — Prefix ownership is documented, not hidden

- WezTerm's `CTRL+SPACE` prefix controls only outer terminal tabs and panes.
- After Herdr attaches, Herdr owns durable workspaces, tabs, panes, agent state, and recovery.
- Documentation warns operators not to model the same durable topology in both layers.

Examples:
9. The operator guide labels WezTerm as the outer shell and Herdr as the durable runtime.
10. The guide documents `CTRL+SPACE`, then `a`, without describing it as a second session layer.
11. The guide distinguishes outer WezTerm splits from Herdr-managed durable panes.

### R4 — Herdr tabs have a static icon and readable text

- `tabbar.lua` maps the foreground process basename `herdr` to a stable Nerd Font dashboard icon.
- The existing title fallback continues to render explicit tab title or foreground process text.
- Icon lookup is a static table operation; it performs no I/O or process spawn.

Examples:
12. A foreground process ending in `/herdr` selects the Herdr icon.
13. With no explicit tab title, the visible text remains `herdr` beside the icon.
14. With an explicit tab title, the icon remains Herdr-specific and the explicit text remains visible.
15. Unknown processes keep the existing terminal icon fallback.

### R5 — V1 has no Herdr status poller or duplicate mux domain

- HOST-02 deliberately omits the optional coarse Herdr status chip.
- Neither `format-tab-title` nor `update-status` calls `herdr`, `wezterm cli`, or a Herdr helper script.
- The config does not add `ssh_domains`, `unix_domains`, `default_domain`, `ConnectToUnixDomain`, or other durable WezTerm domain ownership for Herdr.
- The pre-existing Git branch lookup in `update-status` is baseline behavior and is not widened with Herdr work.

Examples:
16. Searching all WezTerm render/status callbacks finds zero Herdr process execution.
17. A mutant adding `wezterm.run_child_process({ "herdr", ... })` to a hot callback fails.
18. A mutant adding a WezTerm mux/domain for Herdr fails.
19. No timer or periodic callback writes Herdr status into the tab bar.

### R6 — Remote use delegates to Herdr

- Remote operator flow is documented as `herdr --remote <ssh-target>`.
- HOST-02 does not duplicate remote topology through WezTerm SSH domains.
- No remote target is hard-coded into tracked configuration.

Examples:
20. The guide includes `herdr --remote user@host` as a placeholder example.
21. The Lua config contains no personal hostname, username, token, or remote domain declaration.
22. Local `LEADER+a` remains local and does not guess a remote target.

### R7 — Deterministic tests and real config loading are both required

- Source contracts own key uniqueness, exact argv, callback safety, domain absence, icon+text, and docs.
- `wezterm --config-file <tracked>/wezterm.lua show-keys --lua` must exit zero on the supported installed WezTerm.
- Tests never launch the GUI, attach Herdr, change UI focus, stop the server, or mutate live sessions.

Examples:
23. Before implementation, the locked test fails because `LEADER+a`, the Herdr icon, and the operator guide are absent.
24. After implementation, source contracts pass and real WezTerm config loading succeeds.
25. A surviving mutant that disconnects main wiring, removes icon/text, adds a hot-path Herdr spawn, or duplicates mux ownership fails the focused suite.

### R8 — Visual acceptance is explicit and rollback is narrow

- Human visual acceptance reloads WezTerm, confirms existing keys, invokes the attach action once, and observes icon+text.
- Expected focus change is limited to the explicit user-triggered new tab; no background/config event changes focus.
- Rollback removes only the new key tuple, icon mapping, and operator guide section/file.

Examples:
26. Config reload alone creates no tab and changes no focus.
27. Explicit `LEADER+a` activates one Herdr tab with icon and readable text.
28. Removing HOST-02 changes restores the prior WezTerm config without touching HOST-01 installation or integration.

## Questions resolved

1. **Which key owns local attach?** `LEADER+a`; it is mnemonic and unused in the current key set.
2. **Should attach reuse the current pane?** No. A new explicit tab preserves the caller shell and makes rollback/exit obvious.
3. **Should HOST-02 add a Herdr status chip?** No. V1 avoids polling and hot-path process execution entirely.
4. **Should WezTerm own remote domains?** No. Use `herdr --remote <ssh-target>`.
5. **Is activating the new tab a focus violation?** No when caused by the explicit attach key; automatic/config/render-triggered focus changes are forbidden.
6. **Should existing Git status polling be refactored here?** No. It is pre-existing behavior outside HOST-02 scope; HOST-02 adds no Herdr poller.
7. **Which icon is used?** `wezterm.nerdfonts.md_view_dashboard`, paired with existing readable title text.

## Sources

- WezTerm `SpawnCommandInNewTab`: https://wezterm.org/config/lua/keyassignment/SpawnCommandInNewTab.html
- WezTerm `SpawnCommand`: https://wezterm.org/config/lua/SpawnCommand.html
- WezTerm `format-tab-title`: https://wezterm.org/config/lua/window-events/format-tab-title.html
- WezTerm foreground process API: https://wezterm.org/config/lua/pane/get_foreground_process_name.html

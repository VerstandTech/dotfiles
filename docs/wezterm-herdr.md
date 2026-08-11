# WezTerm and Herdr operator guide

WezTerm is the **outer shell** for the local terminal window. Herdr is the **durable runtime** that owns recoverable workspaces, tabs, panes, agent state, and session recovery.

## Local attach

Press `CTRL+SPACE`, then `a` (`LEADER+a`). WezTerm explicitly opens a new tab with the argv-only command:

```sh
herdr
```

The new tab inherits the active pane's working directory through WezTerm's `SpawnCommand` behavior. Activating that tab is expected because the operator requested it. Reloading configuration, formatting tab titles, and updating status never launch Herdr or change focus.

A Herdr foreground process is shown with a dashboard icon plus readable tab text. HOST-02 deliberately adds no Herdr status poller; tab rendering performs no Herdr command execution.

## Prefix ownership

- `CTRL+SPACE` is the outer WezTerm prefix for ephemeral host-terminal tabs and splits.
- Inside the attached application, Herdr owns durable workspaces, panes, agents, and recovery.
- Do not represent the same durable topology in both layers. Use a WezTerm split for a temporary host shell; use Herdr when the pane or agent must be tracked and recovered.

The existing WezTerm bindings remain unchanged. For example, `LEADER+|` and `LEADER+\\` split side by side, `LEADER+-` splits vertically, and `LEADER+h/j/k/l` moves between outer panes.

## Remote use

Delegate remote session transport and durable topology to Herdr rather than adding WezTerm SSH or Unix domains:

```sh
herdr --remote user@host
```

Replace `user@host` at invocation time. Do not commit personal targets, credentials, or tokens to the WezTerm configuration. The local `LEADER+a` action remains local and never guesses a remote destination.

## Validation

Load and render the tracked key configuration without launching the GUI:

```sh
wezterm --config-file ~/.config/wezterm/wezterm.lua show-keys --lua
```

Then reload WezTerm and confirm that config reload alone creates no tab. Invoke `LEADER+a` once and confirm that one Herdr tab appears with an icon and readable text.

## Rollback

Remove only the `LEADER+a` binding, the `herdr` entry in `process_icons`, and this HOST-02 guide. Do not uninstall Herdr, remove its Stow package, stop the Herdr server, delete sessions, or uninstall Pi integration as part of HOST-02 rollback.

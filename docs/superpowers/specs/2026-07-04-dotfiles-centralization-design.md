# Dotfiles Centralization — Design

> **Historical:** The resource layout here is superseded by the canonical
> `~/.agents` architecture in the repository README and
> `agents-shared/.agents/README.md`. Vendor packages now contain native config
> and thin adapters only.

**Date:** 2026-07-04
**Repo:** github.com/codingleo/dotfiles (public)
**Machines:** 2 MacBooks (macOS), 1 Ubuntu PC

## Goal

Centralize the configs for codex, claude-code, pi, opencode, neovim, wezterm, and zsh
into one public dotfiles repo, reusable across all three machines with a single
bootstrap script. Secrets and machine state never enter the repo.

## Decisions

| Decision | Choice |
|---|---|
| Manager | GNU Stow (per-tool packages) + `install.sh` |
| Visibility | Public; whitelist-only content, no secrets ever |
| nvim | Absorb working tree from `codingleo/nvim-config`; archive that repo after cutover |
| AI tools scope | Core configs + hand-written agents/rules/skills; no caches, sessions, sqlite state, auth |
| Shared skills pool | Vendor `~/.agents/skills` (+ `.skill-lock.json`) into the repo |
| Bootstrap | Installs tools (Brewfile / apt + official installers) AND links configs |
| Per-machine differences | None; single shared config, inline OS-conditionals where needed |
| Lockfiles | Track `lazy-lock.json` and `.skill-lock.json` for identical versions everywhere |

## Repo layout

Each top-level directory is a stow package mirroring its target under `$HOME`:

```
dotfiles/
├── README.md
├── install.sh                  # entry point: installs tools + stows packages
├── Brewfile                    # macOS tools
├── apt-packages.txt            # Ubuntu apt tools (rest via official installers)
│
├── zsh/
│   ├── .zshrc
│   ├── .zprofile
│   └── .config/zsh/agentic-ai.zsh
├── wezterm/
│   └── .config/wezterm/wezterm.lua
├── nvim/
│   └── .config/nvim/           # absorbed from codingleo/nvim-config
│       ├── init.lua
│       ├── lazy-lock.json
│       ├── README.md
│       └── LICENSE
│
├── claude/
│   └── .claude/
│       ├── settings.json
│       ├── CLAUDE.md
│       ├── RTK.md
│       ├── agents/             # 10 hand-written kube agents
│       └── skills/             # 11 custom skills + relative symlinks into ~/.agents/skills
├── codex/
│   └── .codex/
│       ├── config.toml         # scrubbed if it contains keys
│       ├── AGENTS.md
│       ├── RTK.md
│       └── rules/default.rules
├── opencode/
│   └── .config/opencode/
│       ├── opencode.json
│       ├── oh-my-opencode-slim.json
│       ├── tui.json
│       └── skills/             # 3 custom skills + relative symlinks into ~/.agents/skills
├── pi/
│   └── .pi/agent/
│       ├── settings.json
│       └── models.json         # auth.json excluded
│
└── agents-shared/
    └── .agents/
        ├── .skill-lock.json
        └── skills/             # shared third-party skills pool (~836K text)
```

Notes:
- The claude/opencode skill dirs contain **relative** symlinks
  (`../../.agents/skills/<name>`) into the shared pool. Both the symlinks and the
  pool are tracked, so they resolve on every machine.
- Explicitly excluded: `~/.codex` state (auth.json, *.sqlite*, sessions/, logs,
  caches), `~/.claude` state (history, projects/, plugins/ marketplace cache,
  file-history, telemetry, ...), `~/.pi/agent/auth.json`, `sessions/`, `npm/`,
  opencode `node_modules/` + lockfiles' node_modules, anything generated.

## Linking (stow)

- `stow --no-folding --restow <package>` for every package.
- `--no-folding` creates real directories and symlinks individual files. Required
  because tools write state into the same dirs (`~/.claude`, `~/.claude/skills`,
  `~/.codex`): tracked files are symlinks into the repo; untracked runtime files
  live alongside and can never leak into the repo.
- Day-to-day: edit configs in place (they are symlinks into `~/dotfiles`), commit
  and push from the repo; other machines `git pull && ./install.sh`.

## Bootstrap (`install.sh`)

Idempotent; safe to re-run. Flow:

1. Detect OS (Darwin / Linux).
2. Install tools:
   - **macOS:** install Homebrew if missing, then `brew bundle` (stow, neovim,
     wezterm, zsh, AI CLIs available via brew).
   - **Ubuntu:** `apt install` from `apt-packages.txt` (stow, zsh, build deps);
     WezTerm via its apt repo; recent Neovim via official tarball/PPA (apt's is
     too old); AI CLIs (claude-code, codex, opencode, pi) via their official
     curl/npm installers. Exact pinned commands are defined in the
     implementation plan.
3. Conflict safety: any real file that would collide with a symlink is moved to
   `~/dotfiles-backup-<timestamp>/` — never deleted.
4. Stow all packages.
5. Print a report: linked / backed up / skipped.

Error handling: `set -euo pipefail`; each tool-install section is independent (a
failing installer doesn't abort linking); nothing is ever deleted, only backed up.

## Migration (first machine = this Mac)

1. Clone repo to `~/dotfiles` (keeps existing LICENSE; no force-push).
2. **Move** each whitelisted file from its live location into its package, then
   stow it back — machine ends up on symlinks with zero behavior change.
3. Absorb nvim by copying the working tree of `~/.config/nvim` into `nvim/`;
   after cutover is verified, archive `codingleo/nvim-config` on GitHub.
4. Other machines: clone → `./install.sh`.

## Secret safety (layered, public repo)

1. Whitelist by construction — files enter the repo only by explicit move.
2. Repo `.gitignore` as second net: `auth.json`, `*.sqlite*`, `sessions/`,
   `node_modules/`, `.tmp/`, `cache/`, `logs/`.
3. Pre-first-push scan: gitleaks over the tree, plus manual review of
   `settings.json`, `config.toml`, `opencode.json` for embedded tokens (MCP
   definitions sometimes carry them). Findings are scrubbed or the file is
   dropped from scope.

## Verification

- This Mac after migration: new zsh shell loads cleanly; `nvim` boots with
  plugins; WezTerm launches; `claude` / `codex` / `opencode` / `pi` still read
  their settings (spot-check one value each).
- Ubuntu PC: fresh end-to-end `install.sh` run is the real acceptance test.

## Out of scope

- git config, zellij/skhd/yabai/alacritty/fish and other `~/.config` tools
  (can be added later as new stow packages).
- Secret syncing between machines (auth stays per-machine).
- Templating/per-machine overrides (not needed; revisit only if a real
  difference appears).

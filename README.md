# dotfiles

Configs for zsh, WezTerm, Neovim, and the AI coding CLIs (claude-code, codex,
opencode, pi), managed with [GNU Stow](https://www.gnu.org/software/stow/).
Used on 2 MacBooks (macOS) and 1 Ubuntu PC — identical config everywhere.

## New machine

```sh
git clone git@github.com:codingleo/dotfiles.git ~/dotfiles
cd ~/dotfiles && ./install.sh
```

`install.sh` installs the tools (Homebrew bundle on macOS; apt + official
installers on Ubuntu), backs up any conflicting files to
`~/dotfiles-backup-<timestamp>/`, and symlinks every package into `$HOME`.
Idempotent — re-run it anytime. Then log in per-machine: `claude`, `codex`,
`opencode`, and `pi` keep auth local (never in this repo).

## Layout

Each top-level directory is a stow package mirroring `$HOME`:

| Package | Target | Contents |
|---|---|---|
| `zsh` | `~/.zshrc`, `~/.zprofile`, `~/.p10k.zsh`, `~/.config/zsh/` | shell config + prompt theme |
| `wezterm` | `~/.config/wezterm/` | terminal config |
| `nvim` | `~/.config/nvim/` | editor config + `lazy-lock.json` |
| `claude` | `~/.claude/` | settings, CLAUDE.md, RTK.md + symlink wiring only |
| `codex` | `~/.codex/` | config.toml, AGENTS.md, RTK.md + symlink wiring only |
| `grok` | `~/.grok/` | skill symlinks only (no native config) |
| `opencode` | `~/.config/opencode/` | configs + symlink wiring only |
| `pi` | `~/.pi/agent/` | settings, models, personal extensions package (`personal/`) |
| `agents-shared` | `~/.agents/` | **canonical shared resources**: `skills/`, `agents/`, `rules/` + lock file |

**`~/.agents` is the single source of truth for shared AI resources.** All
cross-harness content lives only under `agents-shared/.agents/`:

- `skills/` — every shared skill (one copy, no duplicates)
- `agents/` — shared sub-agent definitions (e.g. Claude's ops agents)
- `rules/` — shared rule files (e.g. Codex `default.rules`)

Tool packages contain **only their own configuration** (settings files,
instruction files like `CLAUDE.md`/`AGENTS.md`, tool-specific wiring). They
never hold real skill/agent/rule content — access is wired via repo-relative
symlinks into `agents-shared` (Claude, Grok, OpenCode), while Codex and Pi
discover `~/.agents/skills` directly. Exception: Pi's `personal/` package is
Pi's own extension system (package.json, `extensions/`, `lib/`, plus
skills/agents/prompts bound to Pi-only tools) and stays in the `pi` package.

## Day to day

Configs in `$HOME` are symlinks into this repo — edit them in place, then:

```sh
cd ~/dotfiles && git add -p && git commit && git push
```

Other machines: `git pull && ./install.sh`.

### Machine-local secrets

`~/.zshrc.local` holds machine-local secret exports (API tokens, etc.). The
tracked `.zshrc` sources it when present. Create it on each machine
(`chmod 600`); it is never committed and never stowed.

## Rules

- **Never commit secrets.** Auth files, tokens, sessions, sqlite state stay
  machine-local; `.gitignore` is a second net, not the primary defense.
- New tool = new package dir + add it to `PACKAGES` in `install.sh`.

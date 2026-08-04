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
| `claude` | `~/.claude/` | settings, CLAUDE.md, agents, custom skills |
| `codex` | `~/.codex/` | config.toml, AGENTS.md, rules, custom skills |
| `grok` | `~/.grok/` | custom skills (symlinks to shared skill sources) |
| `opencode` | `~/.config/opencode/` | configs + custom skills |
| `pi` | `~/.pi/agent/` | settings, models, personal extensions package (`personal/`) |
| `agents-shared` | `~/.agents/` | canonical shared skills pool + lock file |

Shared cross-harness skills live only under `agents-shared/.agents/skills/`: Codex and Pi discover `~/.agents/skills` directly, while Claude skill entries are symlinks to that canonical tree. Keep Pi/Herdr-specific skills in Pi's personal package.

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

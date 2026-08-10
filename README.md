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
| `claude` | `~/.claude/` | native settings + symlink entrypoints into `~/.agents` |
| `codex` | `~/.codex/` | native config + symlink entrypoints into `~/.agents` |
| `grok` | `~/.grok/` | native config with `~/.agents/skills` as an extra skill path |
| `opencode` | `~/.config/opencode/` | native configuration only |
| `pi` | `~/.pi/agent/` | native settings/models + one local-package adapter |
| `agents-shared` | `~/.agents/` | **canonical AI resource hub**: portable skills, vendor adapters, manifest, validation |

**`~/.agents` is the single source of truth for AI resources.** All resource
content lives under `agents-shared/.agents/`:

- `skills/` — portable capabilities following the Agent Skills standard
- `adapters/claude/` — Claude-specific instructions and custom agents
- `adapters/codex/` — Codex-specific instructions and command rules
- `adapters/pi/personal/` — Pi's local package (extensions, skills, prompts,
  subagents, tests, and support code)
- `manifest.json`, `.skill-lock.json`, and `scripts/` — ownership, provenance,
  and deterministic validation

Tool packages contain **only native configuration and symlink wiring**. Codex,
OpenCode, and Pi discover `~/.agents/skills` directly. Grok uses its documented
`[skills].paths` setting, preserving native Grok skills. The installer generates
Claude's documented per-skill links while preserving local/native entries in
`~/.claude/skills`. Vendor-specific formats stay namespaced under `adapters/`;
they are centrally owned but are not claimed to be cross-harness standards.

## Day to day

Configs in `$HOME` are symlinks into this repo — edit them in place, then:

```sh
cd ~/dotfiles && git add -p && git commit && git push
```

Other machines: `git pull && ./install.sh`. The installer re-stows every
package and fails closed if canonical AI resources or deployed adapter links do
not validate.

### Machine-local secrets

`~/.zshrc.local` holds machine-local secret exports (API tokens, etc.). The
tracked `.zshrc` sources it when present. Create it on each machine
(`chmod 600`); it is never committed and never stowed.

## Rules

- **Never commit secrets.** Auth files, tokens, sessions, sqlite state stay
  machine-local; `.gitignore` is a second net, not the primary defense.
- New tool = new package dir + add it to `PACKAGES` in `install.sh`.

## AI rule governance (Rulesync)

Always-on AI instructions are authored only in `rulesync.jsonc` and `.rulesync/**`.
The root `AGENTS.md` is **generated** — do not edit it by hand.

- **Reusable AI resources** (skills, adapters, scripts) stay under `agents-shared/.agents/**`.
- **Generated always-on rules** are owned by Rulesync (`rulesync.jsonc` + `.rulesync/**`).

Operator commands (pinned local Rulesync `16.9.1` via `node_modules/.bin/rulesync`):

```sh
bun install --frozen-lockfile   # once, after clone / lockfile change
bun run rules:generate          # regenerate AGENTS.md
bun run rules:check             # fail on drift (also: bash scripts/check-rulesync-drift.sh)
bun run test                    # root assurance: contracts + AI resources + Pi and personal tests
```

Use `bun run test` or `bash scripts/test-root.sh` for root assurance. Bare
`bun test` is Bun's file test runner and does not execute the root script.

GOV-01 scope is project-root `agentsmd` rules only. Vendor stow-package outputs
(`.codex/**`, `.claude/**`, `.cursor/**`, etc.) are not generated here yet.


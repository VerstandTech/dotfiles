# Dotfiles sync for Pi extensions

This machine manages AI CLI config with **GNU Stow** from `~/dotfiles` (not `~/dotenv`).

## Layout that matters

| Stow package | Repo path | `$HOME` target |
|---|---|---|
| `agents-shared` | `agents-shared/.agents/skills/…` | `~/.agents/skills/…` |
| `pi` | `pi/.pi/agent/settings.json` | `~/.pi/agent/settings.json` |
| `pi` | `pi/.pi/agent/models.json` | `~/.pi/agent/models.json` |
| `agents-shared` | `agents-shared/.agents/adapters/pi/personal/…` | `~/.pi/agent/personal` adapter; loaded via relative `./personal` in settings |

`./install.sh` runs `stow --no-folding --restow` for each package in `PACKAGES`.

## Personal extensions package

Canonical path (git):

```text
~/dotfiles/agents-shared/.agents/adapters/pi/personal/
  package.json          # pi.extensions -> ./extensions/*.ts
  extensions/
    <name>.ts
  package-lock.json     # only if npm deps added
  node_modules/         # local only — gitignored
```

`settings.json` must list:

```json
"./personal"
```

inside `packages`. Pi resolves that path relative to `~/.pi/agent/settings.json` → expects `~/.pi/agent/personal`.

Because `~/.pi/agent` already exists with machine-local state, `stow --no-folding` would tree-fold `personal/` (per-file symlinks). **`install.sh` rewrites it to one directory symlink**:

```text
~/.pi/agent/personal -> ../../dotfiles/agents-shared/.agents/adapters/pi/personal
```

So new `extensions/*.ts` files are live immediately (no restow). The scaffold script also repairs this link if needed.

## Day-to-day loop

1. Edit extension under `~/dotfiles/agents-shared/.agents/adapters/pi/personal/extensions/`.
2. In Pi: `/reload` (auto-discovered / package paths support reload; prefer package path over one-off `-e` for kept work).
3. Commit:

```bash
cd ~/dotfiles
git add agents-shared/.agents/adapters/pi/personal pi/.pi/agent/settings.json
git status
git commit -m "feat(pi): <extension change>"
git push
```

4. Other machines:

```bash
cd ~/dotfiles && git pull && ./install.sh
```

## Skill updates

This skill lives at:

```text
~/dotfiles/agents-shared/.agents/skills/pi-extension-creator/
```

After pull/stow it appears under `~/.agents/skills/pi-extension-creator/` for Pi, Claude-adjacent agents, etc.

```bash
cd ~/dotfiles
git add agents-shared/.agents/skills/pi-extension-creator
git commit -m "feat(skills): improve pi-extension-creator"
```

## What never goes in git

- `~/.pi/agent/auth.json`
- `sessions/`, `state/`, `tmp/`, `npm/`, `models-store.json`, `trust.json`
- Third-party runtime state under `~/.pi/agent/extensions/<package>/`
- API keys (use `~/.zshrc.local` machine-local exports)

## New machine bootstrap

```bash
git clone git@github.com:codingleo/dotfiles.git ~/dotfiles
cd ~/dotfiles && ./install.sh
# then login: pi (auth stays local)
pi list   # should show ./personal when configured
```

## Troubleshooting

| Symptom | Fix |
|---|---|
| Extension missing after pull | `./install.sh`; confirm `settings.json` has `"./personal"`; `/reload` |
| Works with `pi -e` only | File not inside personal package or project `.pi/extensions/`, or settings package entry missing |
| Breaks on Linux | Remove absolute `/Users/…` paths; use `./personal` |
| Stow conflict on `extensions/` | Do not track `~/.pi/agent/extensions` wholesale; keep custom code in `personal/` |
| npm dep not found | `cd ~/dotfiles/agents-shared/.agents/adapters/pi/personal && npm install`; dep in `dependencies` |

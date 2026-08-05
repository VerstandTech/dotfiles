# Dotfiles Centralization Implementation Plan

> **Historical:** Resource-location steps in this plan are superseded by the
> canonical `~/.agents` architecture documented in the repository README and
> `agents-shared/.agents/README.md`. Do not recreate per-tool resource copies or
> per-skill link farms from this plan.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate codex, claude-code, pi, opencode, neovim, wezterm, and zsh configs into GNU Stow packages in `~/dotfiles` (github.com/codingleo/dotfiles), with an idempotent `install.sh` that bootstraps any of the three machines.

**Architecture:** One stow package per tool, each mirroring its target path under `$HOME`. Files are *moved* from their live locations into the repo, then immediately stowed back as symlinks — zero behavior change on this machine. A shared third-party skills pool (`~/.agents/skills`) is vendored as its own package; per-tool skill symlinks are rewritten to repo-internal relative targets so they resolve on every machine.

**Tech Stack:** GNU Stow 2.x, bash, git, Homebrew (macOS), apt + official installers (Ubuntu).

**Spec:** `docs/superpowers/specs/2026-07-04-dotfiles-centralization-design.md`

## Global Constraints

- Repo is **public**: no secrets, tokens, auth files, sqlite state, sessions, caches, or `node_modules` may ever be committed. Whitelist by explicit move only.
- All stow invocations use `--no-folding` (tools write runtime state next to tracked files).
- Never delete user files — conflicting files are moved to `~/dotfiles-backup-<timestamp>/`.
- Single shared config for all machines; portability via inline guards (`[[ -d ... ]]`, `$HOME` instead of `/Users/leonardoribeiro`), never per-machine files.
- Lockfiles ARE tracked: `nvim/lazy-lock.json`, `agents-shared/.agents/.skill-lock.json`.
- Repo root: `~/dotfiles`. Stow target: `$HOME`. Work on branch `main`, commit after every task.
- `install.sh` must be idempotent (safe to re-run) and each install section must not abort the rest (`|| warn`).
- After each package task, the live tool must still work — every task ends with a verification step that must pass before committing.

---

### Task 1: Defensive .gitignore

**Files:**
- Create: `~/dotfiles/.gitignore`

**Interfaces:**
- Produces: repo-level ignore rules that later tasks rely on as a second safety net when running `git add`.

- [ ] **Step 1: Write .gitignore**

```gitignore
# Secrets & credentials — never commit
auth.json
*.pem
*.key
.env
.env.*

# Machine state / generated
*.sqlite
*.sqlite-*
*.sqlite3
sessions/
node_modules/
.tmp/
tmp/
cache/
logs/
log/
*.log
.DS_Store
history.jsonl
```

- [ ] **Step 2: Verify the net catches a planted secret**

```bash
cd ~/dotfiles
mkdir -p codex/.codex && touch codex/.codex/auth.json
git status --porcelain | grep auth.json || echo "IGNORED-OK"
rm codex/.codex/auth.json
```

Expected output: `IGNORED-OK` (auth.json must NOT appear in git status).

- [ ] **Step 3: Commit**

```bash
cd ~/dotfiles
git add .gitignore
git commit -m "chore: add defensive gitignore for secrets and machine state"
```

---

### Task 2: zsh package

**Files:**
- Create: `~/dotfiles/zsh/.zshrc` (moved from `~/.zshrc`)
- Create: `~/dotfiles/zsh/.zprofile` (moved from `~/.zprofile`)
- Create: `~/dotfiles/zsh/.config/zsh/agentic-ai.zsh` (moved from `~/.config/zsh/agentic-ai.zsh`)

**Interfaces:**
- Produces: stowed `zsh` package; `~/.zshrc` etc. become symlinks into the repo.

- [ ] **Step 1: Move files into the package**

```bash
mkdir -p ~/dotfiles/zsh/.config/zsh
mv ~/.zshrc ~/dotfiles/zsh/.zshrc
mv ~/.zprofile ~/dotfiles/zsh/.zprofile
mv ~/.config/zsh/agentic-ai.zsh ~/dotfiles/zsh/.config/zsh/agentic-ai.zsh
```

- [ ] **Step 2: Portability edits to .zshrc**

Replace hardcoded home paths and guard Mac-only integrations. Edit `~/dotfiles/zsh/.zshrc`:

```bash
cd ~/dotfiles
# 1) Replace every literal /Users/leonardoribeiro with $HOME
sed -i '' 's|/Users/leonardoribeiro|$HOME|g' zsh/.zshrc
grep -c '/Users/leonardoribeiro' zsh/.zshrc   # expect: 0
```

Then make these manual edits in `zsh/.zshrc` (exact transformations):

Line 3 — guard the agent shell-integration (binary may be absent on Ubuntu):
```bash
# before:
eval "$(~/.local/bin/agent shell-integration zsh)"
# after:
[[ -x "$HOME/.local/bin/agent" ]] && eval "$("$HOME/.local/bin/agent" shell-integration zsh)"
```

Windsurf PATH line (~line 251) — guard directory existence:
```bash
# before:
export PATH="$HOME/.codeium/windsurf/bin:$PATH"
# after:
[[ -d "$HOME/.codeium/windsurf/bin" ]] && export PATH="$HOME/.codeium/windsurf/bin:$PATH"
```

Deno line (~line 268) — guard file existence:
```bash
# before:
. "$HOME/.deno/env"
# after:
[[ -s "$HOME/.deno/env" ]] && . "$HOME/.deno/env"
```

(The bun line already has a `[ -s ... ]` guard; `/opt/homebrew` path entries are harmless no-ops on Linux since zsh `path` handles missing dirs, and the openjdk block already checks `[[ -d ]]`.)

- [ ] **Step 3: Stow and verify**

```bash
cd ~/dotfiles
stow --no-folding -t "$HOME" zsh
readlink ~/.zshrc          # expect: dotfiles/zsh/.zshrc
zsh -ic 'echo SHELL-OK' 2>&1 | tail -1
```

Expected: `readlink` shows a path into `dotfiles/zsh/`, and the last line of the interactive shell test is `SHELL-OK` with no error spam above it.

- [ ] **Step 4: Commit**

```bash
cd ~/dotfiles
git add zsh
git commit -m "feat: add zsh package (zshrc, zprofile, agentic-ai) with portability guards"
```

---

### Task 3: wezterm package

**Files:**
- Create: `~/dotfiles/wezterm/.config/wezterm/wezterm.lua` (moved from `~/.config/wezterm/wezterm.lua`)

**Interfaces:**
- Produces: stowed `wezterm` package.

- [ ] **Step 1: Move and stow**

```bash
mkdir -p ~/dotfiles/wezterm/.config/wezterm
mv ~/.config/wezterm/wezterm.lua ~/dotfiles/wezterm/.config/wezterm/wezterm.lua
cd ~/dotfiles && stow --no-folding -t "$HOME" wezterm
```

- [ ] **Step 2: Verify config loads**

```bash
readlink ~/.config/wezterm/wezterm.lua   # expect: path into dotfiles/wezterm/
wezterm --config-file ~/.config/wezterm/wezterm.lua ls-fonts --list-system >/dev/null && echo WEZTERM-OK
```

Expected: `WEZTERM-OK` (ls-fonts forces a full config parse; a Lua error would fail here).

- [ ] **Step 3: Check for OS-conditional needs**

Open `wezterm/.config/wezterm/wezterm.lua` and check for macOS-only settings (e.g. `font` names not on Linux, `macos_window_background_blur`). If present, wrap them:

```lua
local is_mac = wezterm.target_triple:find("apple") ~= nil
if is_mac then
  -- mac-only options here
end
```

Re-run the Step 2 verification after any edit.

- [ ] **Step 4: Commit**

```bash
cd ~/dotfiles
git add wezterm
git commit -m "feat: add wezterm package"
```

---

### Task 4: nvim package (absorb codingleo/nvim-config)

**Files:**
- Create: `~/dotfiles/nvim/.config/nvim/{init.lua,lazy-lock.json,README.md,LICENSE}` (copied from `~/.config/nvim`, which is a clone of `codingleo/nvim-config`)

**Interfaces:**
- Produces: stowed `nvim` package; `~/.config/nvim` becomes a real dir of symlinks (no longer a git clone).

- [ ] **Step 1: Copy working tree into the package (excluding .git)**

```bash
mkdir -p ~/dotfiles/nvim/.config/nvim
rsync -a --exclude='.git' ~/.config/nvim/ ~/dotfiles/nvim/.config/nvim/
diff -r --exclude='.git' ~/.config/nvim ~/dotfiles/nvim/.config/nvim && echo COPY-OK
```

Expected: `COPY-OK`.

- [ ] **Step 2: Move the old clone aside (backup, not delete) and stow**

```bash
BACKUP=~/dotfiles-backup-$(date +%Y%m%d-%H%M%S)
mkdir -p "$BACKUP"
mv ~/.config/nvim "$BACKUP/nvim-config-clone"
cd ~/dotfiles && stow --no-folding -t "$HOME" nvim
readlink ~/.config/nvim/init.lua   # expect: path into dotfiles/nvim/
```

- [ ] **Step 3: Verify nvim boots with plugins**

```bash
nvim --headless "+qa" && echo NVIM-OK
```

Expected: `NVIM-OK`, exit code 0, no error output. (Plugin data in `~/.local/share/nvim` is untouched, so startup is identical.)

- [ ] **Step 4: Commit**

```bash
cd ~/dotfiles
git add nvim
git commit -m "feat: absorb nvim config from codingleo/nvim-config"
```

Note: archiving the old `nvim-config` repo happens in Task 13, only after full verification.

---

### Task 5: agents-shared package (vendored skills pool)

**Files:**
- Create: `~/dotfiles/agents-shared/.agents/skills/` (20 skill dirs moved from `~/.agents/skills`)
- Create: `~/dotfiles/agents-shared/.agents/.skill-lock.json` (moved from `~/.agents/.skill-lock.json`)

**Interfaces:**
- Produces: repo path `agents-shared/.agents/skills/<name>` — Tasks 6 and 8 create symlinks pointing at these exact paths.

- [ ] **Step 1: Move pool into the package**

```bash
mkdir -p ~/dotfiles/agents-shared/.agents
mv ~/.agents/skills ~/dotfiles/agents-shared/.agents/skills
mv ~/.agents/.skill-lock.json ~/dotfiles/agents-shared/.agents/.skill-lock.json
```

- [ ] **Step 2: Stow and verify**

```bash
cd ~/dotfiles && stow --no-folding -t "$HOME" agents-shared
ls ~/.agents/skills | wc -l          # expect: 20
readlink ~/.agents/skills/seo-audit/SKILL.md >/dev/null && echo POOL-OK
cat ~/.agents/skills/skill-creator/SKILL.md | head -3   # sanity: content readable through links
```

Expected: 20 skills listed, `POOL-OK`, and readable SKILL.md content.

- [ ] **Step 3: Commit**

```bash
cd ~/dotfiles
git add agents-shared
git commit -m "feat: vendor shared ~/.agents skills pool with lock file"
```

---

### Task 6: claude package

**Files:**
- Create: `~/dotfiles/claude/.claude/settings.json` (moved from `~/.claude/settings.json`)
- Create: `~/dotfiles/claude/.claude/CLAUDE.md`, `~/dotfiles/claude/.claude/RTK.md` (moved)
- Create: `~/dotfiles/claude/.claude/agents/` — 10 files moved: `goro-ingress.md helm-kang.md kitana-secret.md kung-hpa.md noob-rollback.md raiden-deploy.md reptile-scanner.md skorpion.md sonya-debug.md sub-kube.md`
- Create: `~/dotfiles/claude/.claude/skills/` — 11 custom skill dirs moved: `add-fal-model demand-review-to-issues infra-cost-audit issue-to-pr llm-system-hardening pr-review-loop sentry-triage test-feature ui-ux-foundations ux-audit ux-panel`, plus 20 rewritten symlinks into the shared pool

**Interfaces:**
- Consumes: `agents-shared/.agents/skills/<name>` from Task 5.
- Produces: stowed `claude` package. IMPORTANT: `~/.claude` keeps its untracked runtime content (projects/, plugins/, history.jsonl, ...) untouched alongside the symlinks.

- [ ] **Step 1: Move core files, agents, and custom skills**

```bash
mkdir -p ~/dotfiles/claude/.claude/skills
mv ~/.claude/settings.json ~/.claude/CLAUDE.md ~/.claude/RTK.md ~/dotfiles/claude/.claude/
mv ~/.claude/agents ~/dotfiles/claude/.claude/agents
for s in add-fal-model demand-review-to-issues infra-cost-audit issue-to-pr \
         llm-system-hardening pr-review-loop sentry-triage test-feature \
         ui-ux-foundations ux-audit ux-panel; do
  mv ~/.claude/skills/"$s" ~/dotfiles/claude/.claude/skills/"$s"
done
```

- [ ] **Step 2: Rewrite the shared-skill symlinks as repo-internal links**

The old links (`~/.claude/skills/x -> ../../.agents/skills/x`) would break when stowed, because a stowed symlink-to-a-symlink resolves the second link's relative target *inside the repo*. Point them at the vendored pool through the repo instead — from `claude/.claude/skills/`, the pool is 3 levels up:

```bash
cd ~/dotfiles/claude/.claude/skills
for s in agent-browser agentation building-native-ui copywriting dev-browser \
         expo-api-routes expo-cicd-workflows expo-deployment expo-dev-client \
         expo-tailwind-setup find-skills native-data-fetching react-components \
         remotion-best-practices seo-audit skill-creator upgrading-expo use-dom \
         vercel-react-best-practices web-design-guidelines; do
  rm -f ~/.claude/skills/"$s"                     # remove old broken-target link from live dir
  ln -s ../../../agents-shared/.agents/skills/"$s" "$s"
done
ls -la | grep -c '\-> \.\./\.\./\.\./agents-shared'   # expect: 20
```

- [ ] **Step 3: Stow and verify the full chain resolves**

```bash
cd ~/dotfiles && stow --no-folding -t "$HOME" claude
readlink ~/.claude/settings.json                        # expect: path into dotfiles/claude/
head -3 ~/.claude/skills/seo-audit/SKILL.md && echo CHAIN-OK   # traverses stow link + repo link + pool
ls ~/.claude/skills | wc -l                             # expect: 31 (11 custom + 20 shared)
ls ~/.claude/projects >/dev/null && echo RUNTIME-INTACT # untracked state untouched
```

Expected: `CHAIN-OK`, 31, `RUNTIME-INTACT`.

- [ ] **Step 4: Verify claude still reads its settings**

```bash
claude --version && grep -q '"theme": "light"' ~/.claude/settings.json && echo CLAUDE-OK
```

Expected: version prints, then `CLAUDE-OK`.

- [ ] **Step 5: Commit**

```bash
cd ~/dotfiles
git add claude
git commit -m "feat: add claude package (settings, CLAUDE.md, agents, custom skills, shared-skill links)"
```

---

### Task 7: codex package

**Files:**
- Create: `~/dotfiles/codex/.codex/config.toml`, `AGENTS.md`, `RTK.md` (moved from `~/.codex/`)
- Create: `~/dotfiles/codex/.codex/rules/default.rules` (moved from `~/.codex/rules/default.rules`)

**Interfaces:**
- Produces: stowed `codex` package; `~/.codex` runtime state (auth.json, sqlite, sessions/...) stays untracked alongside.

- [ ] **Step 1: Confirm config.toml is secret-free (it references paths, not keys)**

```bash
grep -inE 'key|token|secret|password|bearer|api' ~/.codex/config.toml
```

Expected: no credential values (matches on words like `api` in plugin names are fine — review each hit). If an actual secret appears, STOP and scrub it before moving.

- [ ] **Step 2: Move and stow**

```bash
mkdir -p ~/dotfiles/codex/.codex/rules
mv ~/.codex/config.toml ~/.codex/AGENTS.md ~/.codex/RTK.md ~/dotfiles/codex/.codex/
mv ~/.codex/rules/default.rules ~/dotfiles/codex/.codex/rules/default.rules
cd ~/dotfiles && stow --no-folding -t "$HOME" codex
```

- [ ] **Step 3: Verify**

```bash
readlink ~/.codex/config.toml            # expect: path into dotfiles/codex/
ls ~/.codex/auth.json >/dev/null && echo AUTH-STILL-LOCAL
codex --version && echo CODEX-OK
```

Expected: `AUTH-STILL-LOCAL`, version prints, `CODEX-OK`.

- [ ] **Step 4: Commit**

```bash
cd ~/dotfiles
git add codex
git commit -m "feat: add codex package (config.toml, AGENTS.md, RTK.md, rules)"
```

Known limitation (accepted in spec): `config.toml` contains absolute macOS paths (`notify` app, `[projects]` trust entries, pencil MCP server). These are inert on Ubuntu — codex ignores dead paths.

---

### Task 8: opencode package

**Files:**
- Create: `~/dotfiles/opencode/.config/opencode/{opencode.json,oh-my-opencode-slim.json,tui.json}` (moved)
- Create: `~/dotfiles/opencode/.config/opencode/skills/` — 3 custom dirs moved: `clonedeps codemap simplify`, plus 16 rewritten shared-pool symlinks

**Interfaces:**
- Consumes: `agents-shared/.agents/skills/<name>` from Task 5.
- Produces: stowed `opencode` package. `node_modules/`, `package.json`, `bun.lock`, `package-lock.json`, `.gitignore` stay untracked (opencode's plugin installer manages them).

- [ ] **Step 1: Move core configs and custom skills**

```bash
mkdir -p ~/dotfiles/opencode/.config/opencode/skills
mv ~/.config/opencode/opencode.json ~/.config/opencode/oh-my-opencode-slim.json \
   ~/.config/opencode/tui.json ~/dotfiles/opencode/.config/opencode/
for s in clonedeps codemap simplify; do
  mv ~/.config/opencode/skills/"$s" ~/dotfiles/opencode/.config/opencode/skills/"$s"
done
```

- [ ] **Step 2: Rewrite shared-skill symlinks (repo-internal; pool is 4 levels up from this skills dir)**

```bash
cd ~/dotfiles/opencode/.config/opencode/skills
for s in agentation building-native-ui copywriting expo-api-routes \
         expo-cicd-workflows expo-deployment expo-dev-client expo-tailwind-setup \
         native-data-fetching remotion-best-practices seo-audit skill-creator \
         upgrading-expo use-dom vercel-react-best-practices web-design-guidelines; do
  rm -f ~/.config/opencode/skills/"$s"
  ln -s ../../../../agents-shared/.agents/skills/"$s" "$s"
done
ls -la | grep -c 'agents-shared'   # expect: 16
```

- [ ] **Step 3: Stow and verify**

```bash
cd ~/dotfiles && stow --no-folding -t "$HOME" opencode
readlink ~/.config/opencode/opencode.json               # expect: path into dotfiles/opencode/
head -3 ~/.config/opencode/skills/seo-audit/SKILL.md && echo CHAIN-OK
ls ~/.config/opencode/node_modules >/dev/null && echo RUNTIME-INTACT
```

Expected: `CHAIN-OK`, `RUNTIME-INTACT`.

- [ ] **Step 4: Commit**

```bash
cd ~/dotfiles
git add opencode
git commit -m "feat: add opencode package (configs, custom skills, shared-skill links)"
```

---

### Task 9: pi package

**Files:**
- Create: `~/dotfiles/pi/.pi/agent/settings.json`, `~/dotfiles/pi/.pi/agent/models.json` (moved from `~/.pi/agent/`)

**Interfaces:**
- Produces: stowed `pi` package. `auth.json`, `sessions/`, `npm/`, `extensions/` stay untracked.

- [ ] **Step 1: Verify models.json holds no keys**

```bash
grep -inE 'key|token|secret|bearer' ~/.pi/agent/models.json ~/.pi/agent/settings.json
```

Expected: no credential values. If found, STOP — drop that file from scope instead of committing it.

- [ ] **Step 2: Move, stow, verify**

```bash
mkdir -p ~/dotfiles/pi/.pi/agent
mv ~/.pi/agent/settings.json ~/.pi/agent/models.json ~/dotfiles/pi/.pi/agent/
cd ~/dotfiles && stow --no-folding -t "$HOME" pi
readlink ~/.pi/agent/settings.json      # expect: path into dotfiles/pi/
ls ~/.pi/agent/auth.json >/dev/null && echo AUTH-STILL-LOCAL
pi --version && echo PI-OK
```

Expected: `AUTH-STILL-LOCAL`, version prints, `PI-OK`.

- [ ] **Step 3: Commit**

```bash
cd ~/dotfiles
git add pi
git commit -m "feat: add pi package (agent settings and models)"
```

---

### Task 10: Brewfile, apt-packages.txt, install.sh

**Files:**
- Create: `~/dotfiles/Brewfile`
- Create: `~/dotfiles/apt-packages.txt`
- Create: `~/dotfiles/install.sh` (mode 755)

**Interfaces:**
- Consumes: all packages from Tasks 2–9 (list must match exactly: `zsh wezterm nvim agents-shared claude codex opencode pi`).
- Produces: one-command bootstrap for any machine.

- [ ] **Step 1: Write Brewfile**

```ruby
# macOS tools — `brew bundle` reads this
brew "stow"
brew "zsh"
brew "neovim"
brew "node"        # provides npm for pi
brew "ripgrep"     # nvim telescope/grep
brew "gh"
brew "opencode"
brew "rtk"         # token-optimizing proxy used by shell + claude hooks
brew "beads"       # provides `bd`, used by claude hooks
cask "wezterm"
```

- [ ] **Step 2: Write apt-packages.txt**

```text
stow
zsh
git
curl
ca-certificates
gnupg
unzip
build-essential
ripgrep
fd-find
nodejs
npm
```

- [ ] **Step 3: Write install.sh**

```bash
#!/usr/bin/env bash
set -euo pipefail

DOTFILES_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_DIR="$HOME/dotfiles-backup-$(date +%Y%m%d-%H%M%S)"
PACKAGES=(zsh wezterm nvim agents-shared claude codex opencode pi)

log()  { printf '\033[1;34m[dotfiles]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[dotfiles] WARN:\033[0m %s\n' "$*"; }

install_macos() {
  if ! command -v brew >/dev/null 2>&1; then
    log "installing Homebrew"
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    eval "$(/opt/homebrew/bin/brew shellenv)"
  fi
  brew bundle --file="$DOTFILES_DIR/Brewfile" || warn "brew bundle had failures; continuing"
  command -v claude >/dev/null 2>&1 || curl -fsSL https://claude.ai/install.sh | bash || warn "claude install failed"
  command -v pi >/dev/null 2>&1 || npm install -g @earendil-works/pi-coding-agent || warn "pi install failed"
  command -v codex >/dev/null 2>&1 || npm install -g @openai/codex || warn "codex install failed"
}

install_ubuntu() {
  log "installing apt packages"
  sudo apt-get update
  xargs -a "$DOTFILES_DIR/apt-packages.txt" sudo apt-get install -y || warn "apt install had failures; continuing"

  if ! command -v wezterm >/dev/null 2>&1; then
    log "installing WezTerm from its apt repo"
    sudo install -d /etc/apt/keyrings
    curl -fsSL https://apt.fury.io/wez/gpg.key | sudo gpg --yes --dearmor -o /etc/apt/keyrings/wezterm-fury.gpg
    echo 'deb [signed-by=/etc/apt/keyrings/wezterm-fury.gpg] https://apt.fury.io/wez/ * *' | sudo tee /etc/apt/sources.list.d/wezterm.list >/dev/null
    sudo apt-get update && sudo apt-get install -y wezterm || warn "wezterm install failed; continuing"
  fi

  # apt's neovim is too old for this config; use the official x86_64 tarball
  if ! command -v nvim >/dev/null 2>&1; then
    log "installing Neovim from official tarball"
    curl -fsSLo /tmp/nvim-linux-x86_64.tar.gz \
      https://github.com/neovim/neovim/releases/latest/download/nvim-linux-x86_64.tar.gz
    sudo rm -rf /opt/nvim-linux-x86_64
    sudo tar -C /opt -xzf /tmp/nvim-linux-x86_64.tar.gz
    sudo ln -sf /opt/nvim-linux-x86_64/bin/nvim /usr/local/bin/nvim
  fi

  command -v claude   >/dev/null 2>&1 || curl -fsSL https://claude.ai/install.sh | bash || warn "claude install failed"
  command -v codex    >/dev/null 2>&1 || sudo npm install -g @openai/codex || warn "codex install failed"
  command -v opencode >/dev/null 2>&1 || curl -fsSL https://opencode.ai/install | bash || warn "opencode install failed"
  command -v pi       >/dev/null 2>&1 || sudo npm install -g @earendil-works/pi-coding-agent || warn "pi install failed"
  command -v rtk >/dev/null 2>&1 || warn "rtk not found — zsh/claude hooks reference it (Homebrew on Linux: brew install rtk)"
  command -v bd  >/dev/null 2>&1 || warn "bd (beads) not found — claude hooks reference it (brew install beads)"
}

# Move any real file (or foreign symlink) that a package wants to own into BACKUP_DIR.
backup_conflicts() {
  local pkg="$1"
  while IFS= read -r rel; do
    local target="$HOME/$rel"
    if [ -e "$target" ] || [ -L "$target" ]; then
      case "$(readlink "$target" 2>/dev/null || true)" in
        *"dotfiles/$pkg"*) ;;  # already our symlink
        *)
          mkdir -p "$BACKUP_DIR/$(dirname "$rel")"
          mv "$target" "$BACKUP_DIR/$rel"
          warn "backed up $target -> $BACKUP_DIR/$rel"
          ;;
      esac
    fi
  done < <(cd "$DOTFILES_DIR/$pkg" && find . \( -type f -o -type l \) | sed 's|^\./||')
}

main() {
  case "$(uname -s)" in
    Darwin) install_macos ;;
    Linux)  install_ubuntu ;;
    *) warn "unsupported OS $(uname -s); skipping tool install" ;;
  esac

  command -v stow >/dev/null 2>&1 || { echo "FATAL: stow not installed" >&2; exit 1; }

  for pkg in "${PACKAGES[@]}"; do
    backup_conflicts "$pkg"
    stow --no-folding --restow -d "$DOTFILES_DIR" -t "$HOME" "$pkg"
    log "stowed $pkg"
  done

  [ -d "$BACKUP_DIR" ] && warn "pre-existing files were backed up to $BACKUP_DIR"
  log "done — open a new shell to pick up zsh config"
}

main "$@"
```

```bash
chmod +x ~/dotfiles/install.sh
```

- [ ] **Step 4: Syntax check, then idempotency test (everything already stowed → run must be a no-op)**

```bash
bash -n ~/dotfiles/install.sh && echo SYNTAX-OK
cd ~/dotfiles && ./install.sh
```

Expected: `SYNTAX-OK`; then the script runs to `done` with **no** "backed up" warnings (all targets are already our symlinks) and no errors. `~/.zshrc`, `~/.claude/settings.json` etc. still resolve:

```bash
readlink ~/.zshrc && readlink ~/.claude/settings.json && echo IDEMPOTENT-OK
```

- [ ] **Step 5: Commit**

```bash
cd ~/dotfiles
git add Brewfile apt-packages.txt install.sh
git commit -m "feat: add install.sh bootstrap with Brewfile and apt packages"
```

---

### Task 11: README

**Files:**
- Create: `~/dotfiles/README.md`

- [ ] **Step 1: Write README.md**

```markdown
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
| `zsh` | `~/.zshrc`, `~/.zprofile`, `~/.config/zsh/` | shell config |
| `wezterm` | `~/.config/wezterm/` | terminal config |
| `nvim` | `~/.config/nvim/` | editor config + `lazy-lock.json` |
| `claude` | `~/.claude/` | settings, CLAUDE.md, agents, custom skills |
| `codex` | `~/.codex/` | config.toml, AGENTS.md, rules |
| `opencode` | `~/.config/opencode/` | configs + custom skills |
| `pi` | `~/.pi/agent/` | settings, models |
| `agents-shared` | `~/.agents/` | shared skills pool + lock file |

## Day to day

Configs in `$HOME` are symlinks into this repo — edit them in place, then:

```sh
cd ~/dotfiles && git add -p && git commit && git push
```

Other machines: `git pull && ./install.sh`.

## Rules

- **Never commit secrets.** Auth files, tokens, sessions, sqlite state stay
  machine-local; `.gitignore` is a second net, not the primary defense.
- New tool = new package dir + add it to `PACKAGES` in `install.sh`.
```

- [ ] **Step 2: Commit**

```bash
cd ~/dotfiles
git add README.md
git commit -m "docs: add README with bootstrap and daily workflow"
```

---

### Task 12: Secret scan, full verification, push

**Files:**
- No new files — gate task before anything reaches the public remote.

- [ ] **Step 1: Run gitleaks over the whole repo**

```bash
command -v gitleaks >/dev/null || brew install gitleaks
cd ~/dotfiles && gitleaks detect --source . --no-banner
```

Expected: `no leaks found`. If leaks are reported: scrub the file, `git commit --amend` / rewrite the affected commits BEFORE pushing (nothing has left the machine yet — history rewrite is safe).

- [ ] **Step 2: Manual eyeball of the risky files**

```bash
cd ~/dotfiles
grep -rinE 'sk-[a-zA-Z0-9]|ghp_|xox[bp]-|AKIA[0-9A-Z]|Bearer ' \
  claude/.claude/settings.json codex/.codex/config.toml \
  opencode/.config/opencode/*.json pi/.pi/agent/*.json || echo MANUAL-CLEAN
```

Expected: `MANUAL-CLEAN`.

- [ ] **Step 3: Full cutover verification on this Mac**

```bash
zsh -ic 'echo SHELL-OK' 2>&1 | tail -1        # SHELL-OK
nvim --headless "+qa" && echo NVIM-OK          # NVIM-OK
wezterm ls-fonts --list-system >/dev/null && echo WEZTERM-OK
claude --version && codex --version && opencode --version && pi --version
head -1 ~/.claude/skills/seo-audit/SKILL.md    # shared-skill chain resolves
git -C ~/dotfiles status --porcelain           # expect: empty (clean tree)
```

All commands must succeed. If any fails, STOP and fix before pushing.

- [ ] **Step 4: Push**

```bash
cd ~/dotfiles && git push origin main
git log --oneline origin/main | head -5
```

Expected: push succeeds; log shows the package commits on the remote.

---

### Task 13: Archive codingleo/nvim-config

**Files:**
- None (GitHub operation). Only run AFTER Task 12 passed fully.

- [ ] **Step 1: Confirm the absorbed config matches the old repo's tree, then archive**

```bash
gh repo view codingleo/nvim-config --json isArchived -q .isArchived   # expect: false
gh repo archive codingleo/nvim-config --yes
gh repo view codingleo/nvim-config --json isArchived -q .isArchived   # expect: true
```

- [ ] **Step 2: Remove the local backup pointer note and finish**

The old clone remains in `~/dotfiles-backup-*/nvim-config-clone` as a belt-and-braces copy; leave it. Done — the other MacBook and the Ubuntu PC bootstrap with:

```bash
git clone git@github.com:codingleo/dotfiles.git ~/dotfiles && cd ~/dotfiles && ./install.sh
```

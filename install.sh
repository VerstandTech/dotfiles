#!/usr/bin/env bash
set -euo pipefail

DOTFILES_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_DIR="$HOME/dotfiles-backup-$(date +%Y%m%d-%H%M%S)"
PACKAGES=(zsh wezterm herdr nvim agents-shared claude codex grok opencode pi)

log()  { printf '\033[1;34m[dotfiles]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[dotfiles] WARN:\033[0m %s\n' "$*"; }
fail() { printf '\033[1;31m[dotfiles] FATAL:\033[0m %s\n' "$*" >&2; return 1; }

ensure_herdr_available() {
  local herdr_bin="${1:-herdr}"
  local host_os="${2:-$(uname -s)}"
  local install_action version_output

  if ! command -v "$herdr_bin" >/dev/null 2>&1; then
    case "$host_os" in
      Darwin) install_action="brew install herdr" ;;
      Linux) install_action="curl -fsSL https://herdr.dev/install.sh | sh" ;;
      *) fail "Herdr is unsupported on $host_os"; return 1 ;;
    esac
    fail "herdr not found; install it with: $install_action"
    return 1
  fi

  if ! version_output="$("$herdr_bin" --version 2>&1)"; then
    fail "could not execute herdr --version"
    return 1
  fi
  if [[ ! "$version_output" =~ ^herdr[[:space:]]+0\.8\.[0-9]+([+-][A-Za-z0-9._-]+)?$ ]]; then
    fail "unsupported Herdr version '$version_output'; HOST-01 requires CMP-01-approved 0.8.x"
    return 1
  fi
}

herdr_pi_is_current() {
  grep -Eq '^pi: current([[:space:]]|$)'
}

herdr_integration_status() {
  local herdr_bin="${1:-herdr}"
  local config_path="${2:-$HOME/.config/herdr/config.toml}"
  local status
  if ! status="$(HERDR_CONFIG_PATH="$config_path" "$herdr_bin" integration status)"; then
    fail "herdr integration status failed"
    return 1
  fi
  printf '%s\n' "$status"
}

configure_herdr_pi() {
  local herdr_bin="${1:-herdr}"
  local config_path="${2:-$HOME/.config/herdr/config.toml}"
  local status

  HERDR_CONFIG_PATH="$config_path" "$herdr_bin" config check || {
    fail "herdr config check failed"
    return 1
  }

  status="$(herdr_integration_status "$herdr_bin" "$config_path")" || return 1
  printf '%s\n' "$status"
  if printf '%s\n' "$status" | herdr_pi_is_current; then
    log "Herdr Pi integration is current"
    return 0
  fi

  log "installing or refreshing Herdr Pi integration"
  HERDR_CONFIG_PATH="$config_path" "$herdr_bin" integration install pi || {
    fail "herdr integration install pi failed"
    return 1
  }

  status="$(herdr_integration_status "$herdr_bin" "$config_path")" || return 1
  printf '%s\n' "$status"
  if ! printf '%s\n' "$status" | herdr_pi_is_current; then
    fail "Herdr Pi integration is not current after install"
    return 1
  fi
  log "Herdr Pi integration is current"
}

resolved_path() {
  python3 - "$1" <<'PY'
import os
import sys
print(os.path.realpath(sys.argv[1]))
PY
}

path_is_within() {
  python3 - "$1" "$2" <<'PY'
import os
import sys
candidate = os.path.realpath(sys.argv[1])
root = os.path.realpath(sys.argv[2])
try:
    inside = os.path.commonpath([candidate, root]) == root
except ValueError:
    inside = False
raise SystemExit(0 if inside else 1)
PY
}

link_points_within() {
  [ -L "$1" ] || return 1
  python3 - "$1" "$2" <<'PY'
import os
import sys
link = os.path.abspath(sys.argv[1])
root = os.path.abspath(sys.argv[2])
target = os.path.abspath(os.path.join(os.path.dirname(link), os.readlink(link)))
try:
    inside = os.path.commonpath([target, root]) == root
except ValueError:
    inside = False
raise SystemExit(0 if inside else 1)
PY
}

ensure_git_repo() {
  local url="$1"
  local dir="$2"

  if [ -d "$dir/.git" ]; then
    git -C "$dir" pull --ff-only || warn "could not update $dir"
    return
  fi

  if [ -e "$dir" ]; then
    warn "$dir exists but is not a git checkout; leaving it untouched"
    return
  fi

  git clone --depth=1 "$url" "$dir" || warn "could not clone $url"
}

install_zsh_aesthetics() {
  if [ -d "$HOME/.oh-my-zsh/.git" ]; then
    git -C "$HOME/.oh-my-zsh" pull --ff-only || warn "could not update oh-my-zsh"
  elif [ -e "$HOME/.oh-my-zsh" ]; then
    warn "$HOME/.oh-my-zsh exists but is not a git checkout; leaving it untouched"
  else
    git clone --depth=1 https://github.com/ohmyzsh/ohmyzsh.git "$HOME/.oh-my-zsh" || warn "oh-my-zsh install failed"
  fi

  local custom="${ZSH_CUSTOM:-$HOME/.oh-my-zsh/custom}"
  mkdir -p "$custom/themes" "$custom/plugins"

  ensure_git_repo https://github.com/romkatv/powerlevel10k.git "$custom/themes/powerlevel10k"
  ensure_git_repo https://github.com/zsh-users/zsh-autosuggestions.git "$custom/plugins/zsh-autosuggestions"
  ensure_git_repo https://github.com/zsh-users/zsh-syntax-highlighting.git "$custom/plugins/zsh-syntax-highlighting"
  ensure_git_repo https://github.com/zsh-users/zsh-history-substring-search.git "$custom/plugins/history-substring-search"
}

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
  local rel target adapter
  while IFS= read -r rel; do
    target="$HOME/$rel"
    if [ -e "$target" ] || [ -L "$target" ]; then
      if link_points_within "$target" "$DOTFILES_DIR/$pkg" || \
         path_is_within "$target" "$DOTFILES_DIR/$pkg"; then
        continue
      fi
      adapter="$DOTFILES_DIR/agents-shared/.agents/adapters/pi/personal"
      if [ "$pkg" = "pi" ] && path_is_within "$target" "$adapter"; then
        continue
      fi
      mkdir -p "$BACKUP_DIR/$(dirname "$rel")"
      mv "$target" "$BACKUP_DIR/$rel"
      warn "backed up $target -> $BACKUP_DIR/$rel"
    fi
  done < <(cd "$DOTFILES_DIR/$pkg" && find . \( -type f -o -type l \) | sed 's|^\./||')
}

is_dotfiles_owned_entry() {
  local entry="$1"
  local child found=0

  if [ -L "$entry" ]; then
    path_is_within "$entry" "$DOTFILES_DIR" && return 0
    path_is_within "$entry" "$HOME/.agents/skills" && return 0
    return 1
  fi
  [ -d "$entry" ] || return 1

  while IFS= read -r child; do
    [ -d "$child" ] && [ ! -L "$child" ] && continue
    if [ -L "$child" ] && path_is_within "$child" "$DOTFILES_DIR"; then
      found=1
    else
      return 1
    fi
  done < <(find "$entry" -mindepth 1)

  [ "$found" -eq 1 ]
}

remove_dotfiles_owned_entries() {
  local dir="$1"
  local entry
  [ -d "$dir" ] || return 0

  while IFS= read -r entry; do
    if is_dotfiles_owned_entry "$entry"; then
      rm -rf "$entry"
      log "removed superseded AI resource wiring $entry"
    fi
  done < <(find "$dir" -mindepth 1 -maxdepth 1)
  rmdir "$dir" 2>/dev/null || true
}

prune_stale_canonical_skills() {
  local canonical="$DOTFILES_DIR/agents-shared/.agents/skills"
  local deployed="$HOME/.agents/skills"
  local entry name

  if [ ! -d "$canonical" ]; then
    warn "canonical skills root is missing; skipping stale-skill cleanup: $canonical"
    return 0
  fi
  [ -d "$deployed" ] || return 0
  while IFS= read -r entry; do
    name="$(basename "$entry")"
    if [ ! -d "$canonical/$name" ] && is_dotfiles_owned_entry "$entry"; then
      rm -rf "$entry"
      log "removed stale deployed canonical skill $entry"
    fi
  done < <(find "$deployed" -mindepth 1 -maxdepth 1)
}

cleanup_removed_ai_wiring() {
  remove_dotfiles_owned_entries "$HOME/.agents/agents"
  remove_dotfiles_owned_entries "$HOME/.agents/rules"
  remove_dotfiles_owned_entries "$HOME/.codex/skills"
  remove_dotfiles_owned_entries "$HOME/.config/opencode/skills"
  remove_dotfiles_owned_entries "$HOME/.grok/skills"
  prune_stale_canonical_skills
}

sync_claude_skills() {
  local canonical="$DOTFILES_DIR/agents-shared/.agents/skills"
  local deployed="$HOME/.agents/skills"
  local live="$HOME/.claude/skills"
  local source destination entry name conflicts=0 changes=0

  mkdir -p "$live"

  # Prune only managed links whose canonical skill was removed or renamed.
  while IFS= read -r entry; do
    name="$(basename "$entry")"
    if is_dotfiles_owned_entry "$entry" && [ ! -d "$canonical/$name" ]; then
      rm -rf "$entry"
      log "removed stale canonical Claude skill link $entry"
      changes=1
    fi
  done < <(find "$live" -mindepth 1 -maxdepth 1)

  while IFS= read -r source; do
    name="$(basename "$source")"
    destination="$live/$name"
    if [ -e "$destination" ] || [ -L "$destination" ]; then
      if is_dotfiles_owned_entry "$destination"; then
        if [ "$(resolved_path "$destination")" = \
             "$(resolved_path "$deployed/$name")" ]; then
          continue
        fi
        rm -rf "$destination"
      else
        warn "canonical Claude skill conflict: $destination is native/foreign; move or rename it"
        conflicts=1
        continue
      fi
    fi
    ln -s "../../.agents/skills/$name" "$destination"
    changes=1
  done < <(find "$canonical" -mindepth 1 -maxdepth 1 -type d | sort)

  [ "$conflicts" -eq 0 ] || return 1
  [ "$changes" -eq 0 ] || log "synced canonical skills into Claude's native discovery directory"
}

ensure_pi_personal_link() {
  local target="$HOME/.pi/agent/personal"
  local source_abs="$DOTFILES_DIR/agents-shared/.agents/adapters/pi/personal"
  local source_rel

  [ -d "$source_abs" ] || return 0
  mkdir -p "$HOME/.pi/agent"
  source_rel="$(python3 - "$source_abs" "$(dirname "$target")" <<'PY'
import os
import sys
print(os.path.relpath(os.path.realpath(sys.argv[1]), os.path.realpath(sys.argv[2])))
PY
)"

  if { [ -e "$target" ] || [ -L "$target" ]; } && \
     [ "$(resolved_path "$target")" = "$(resolved_path "$source_abs")" ]; then
    return 0
  fi

  if [ -e "$target" ] || [ -L "$target" ]; then
    mkdir -p "$BACKUP_DIR/.pi/agent"
    mv "$target" "$BACKUP_DIR/.pi/agent/personal"
    warn "backed up $target -> $BACKUP_DIR/.pi/agent/personal"
  fi
  ln -s "$source_rel" "$target"
  log "linked Pi personal package -> $source_rel"
}


main() {
  local host_os
  host_os="$(uname -s)"
  case "$host_os" in
    Darwin) install_macos ;;
    Linux)  install_ubuntu ;;
    *) warn "unsupported OS $host_os; skipping tool install" ;;
  esac
  ensure_herdr_available
  install_zsh_aesthetics

  command -v stow >/dev/null 2>&1 || { echo "FATAL: stow not installed" >&2; exit 1; }

  cleanup_removed_ai_wiring

  for pkg in "${PACKAGES[@]}"; do
    backup_conflicts "$pkg"
    stow --no-folding --restow -d "$DOTFILES_DIR" -t "$HOME" "$pkg"
    log "stowed $pkg"
  done

  # Claude does not natively scan ~/.agents/skills. Generate one documented
  # per-skill link while preserving native/local entries under ~/.claude/skills.
  sync_claude_skills

  # Pi resolves ./personal relative to ~/.pi/agent/settings.json. Keep a single
  # directory symlink so new extension files appear without per-file restow.
  # (stow --no-folding tree-folds inside the existing ~/.pi/agent directory.)
  ensure_pi_personal_link
  configure_herdr_pi

  python3 "$DOTFILES_DIR/agents-shared/.agents/scripts/verify-ai-resources.py" \
    --repo "$DOTFILES_DIR" \
    --home "$HOME"
  log "validated canonical AI resources"

  [ -d "$BACKUP_DIR" ] && warn "pre-existing files were backed up to $BACKUP_DIR"
  log "done — open a new shell to pick up zsh config"
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  main "$@"
fi

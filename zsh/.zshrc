# Add deno completions to search path
if [[ ":$FPATH:" != *":$HOME/.zsh/completions:"* ]]; then export FPATH="$HOME/.zsh/completions:$FPATH"; fi

# =============================================================================
# Optimized ZSH Configuration - Minimalist Hacker Theme
# =============================================================================

# Source essential shell configs only if they exist
[[ -f ~/.profile ]] && source ~/.profile

# =============================================================================
# Oh My Zsh Configuration - Streamlined
# =============================================================================

# Path to oh-my-zsh installation
export ZSH="$HOME/.oh-my-zsh"

# Theme configuration - Keep agnoster with custom hacker colors
ZSH_THEME="powerlevel10k/powerlevel10k"

# Useful plugins - keeping originals and adding helpful ones
plugins=(
  git
  bundler
  macos
  docker

  # Essential enhancement plugins
  zsh-autosuggestions
  zsh-syntax-highlighting
  history-substring-search
  colored-man-pages

  # Useful utility plugins
  extract
  sudo
  copyfile
  copypath
  command-not-found
  web-search
  jsontools
)

# Load Oh My Zsh
[[ -f "$ZSH/oh-my-zsh.sh" ]] && source "$ZSH/oh-my-zsh.sh"

# source /opt/homebrew/share/powerlevel10k/powerlevel10k.zsh-theme
# =============================================================================
# Hacker Theme Color Configuration
# =============================================================================

# Set default user to hide username in prompt
export DEFAULT_USER=$USER

# Terminal colors for ls and other commands
export LSCOLORS="Gxfxcxdxbxegedabagacad"  # Dark background with green text
export CLICOLOR=1

# Additional terminal color preferences
# Let terminal emulators, tmux, and zellij set TERM correctly.
export COLORTERM=truecolor

# =============================================================================
# PATH Management (Simplified)
# =============================================================================

# Initialize PATH array to avoid duplicates
typeset -U path

# Essential paths only - prioritize homebrew and user paths
path=(
  "$HOME/bin"
  "$HOME/.local/bin"
  "/opt/homebrew/bin"
  "/opt/homebrew/sbin"
  "/usr/local/bin"
  $path  # Keep system defaults
)

# Add development tools only if actively used
[[ -d "$HOME/.cargo/bin" ]] && path=("$HOME/.cargo/bin" $path)

# Prefer Homebrew Python 3.12 over macOS /usr/bin/python3 (3.9).
# Unversioned python/python3/pip3 live in libexec/bin for python@3.12.
if [[ -d "/opt/homebrew/opt/python@3.12/libexec/bin" ]]; then
  path=("/opt/homebrew/opt/python@3.12/libexec/bin" $path)
fi

# Java (OpenJDK via Homebrew)
if [[ -d "/opt/homebrew/opt/openjdk" ]]; then
  path=("/opt/homebrew/opt/openjdk/bin" $path)
  export CPPFLAGS="-I/opt/homebrew/opt/openjdk/include"
fi

# =============================================================================
# Essential Environment Variables
# =============================================================================

# Language and locale
export LANG=en_US.UTF-8
export LC_ALL=en_US.UTF-8

# Essential development environment
export EDITOR=${EDITOR:-nano}
export GPG_TTY=$(tty)

# =============================================================================
# Development Tools (Load only if needed)
# =============================================================================

# Node Version Manager - Load lazily for better performance
export NVM_DIR="$HOME/.nvm"
nvm() {
  [[ -s "$NVM_DIR/nvm.sh" ]] && \. "$NVM_DIR/nvm.sh"
  nvm "$@"
}

# Rust/Cargo - Load only if rust projects are active
rust_env() {
  [[ -f "$HOME/.cargo/env" ]] && source "$HOME/.cargo/env"
}

# Python virtualenv wrapper - Load on demand
pyenv() {
  if command -v pyenv >/dev/null 2>&1; then
    eval "$(pyenv init -)"
    pyenv "$@"
  fi
}

# Uncomment and use only when working with specific tools:
# export PNPM_HOME="$HOME/Library/pnpm"
# export BUN_INSTALL="$HOME/.bun"
# export DOCKER_DEFAULT_PLATFORM=linux/amd64

# =============================================================================
# Essential Tool Initializations
# =============================================================================

# SSH agent - only start if not already running
if [[ -z "$SSH_AGENT_PID" ]] && command -v ssh-agent >/dev/null 2>&1; then
  eval "$(ssh-agent -s)" >/dev/null 2>&1
fi

# direnv - automatic environment loading
command -v direnv >/dev/null 2>&1 && eval "$(direnv hook zsh)"

# =============================================================================
# Minimal Completions
# =============================================================================

# Initialize completions with caching for better performance
autoload -Uz compinit
_zcompdump="${ZDOTDIR:-$HOME}/.zcompdump"
if [[ -f "$_zcompdump" ]]; then
  compinit -C -d "$_zcompdump"
else
  compinit -i -d "$_zcompdump"
fi
unset _zcompdump

# fzf shell integration
[[ -o interactive && -t 0 ]] && command -v fzf >/dev/null 2>&1 && eval "$(fzf --zsh)"

# Essential completions only - add back as needed:
# command -v kubectl >/dev/null 2>&1 && source <(kubectl completion zsh)

# VSCode integration (keep for development)
[[ "$TERM_PROGRAM" == "vscode" ]] && \
  [[ -f "$(code --locate-shell-integration-path zsh 2>/dev/null)" ]] && \
  . "$(code --locate-shell-integration-path zsh)"

# =============================================================================
# Essential Aliases
# =============================================================================

# Python/pip
alias pip='pip3'

# Minimal file listing aliases
alias ll='ls -la'
alias la='ls -A'
alias l='ls -CF'

# Essential git aliases (oh-my-zsh git plugin provides most)
alias gs='git status'
alias ga='git add .'
alias gc='git commit'
alias gp='git push'
alias gl='git pull'

# Quick navigation
alias ..='cd ..'
alias ...='cd ../..'
alias ....='cd ../../..'

# Reload zsh configuration
alias reload='source ~/.zshrc'

# Enhanced aliases that work with plugins
alias x='extract'                    # Extract archives (from extract plugin)
alias cpwd='copypath'                # Copy current directory path
alias cpf='copyfile'                 # Copy file path
alias google='web_search google'     # Quick Google search
alias github='web_search github'     # Quick GitHub search
alias stack='web_search stackoverflow'  # Quick Stack Overflow search

# =============================================================================
# Performance & Behavior Optimizations
# =============================================================================

# Disable untracked files check for better performance
DISABLE_UNTRACKED_FILES_DIRTY="true"

# History optimizations
HISTSIZE=10000
SAVEHIST=10000
HISTFILE=~/.zsh_history
setopt SHARE_HISTORY
setopt HIST_IGNORE_DUPS
setopt HIST_IGNORE_SPACE

# Completion optimizations
zstyle ':completion:*' menu select
zstyle ':completion:*' use-cache on
zstyle ':completion:*' cache-path ~/.zsh/cache

# Enhanced key bindings with history substring search
bindkey '^[[A' history-substring-search-up    # Up arrow
bindkey '^[[B' history-substring-search-down  # Down arrow
bindkey '^P' history-substring-search-up      # Ctrl+P
bindkey '^N' history-substring-search-down    # Ctrl+N

# =============================================================================
# Oh My Zsh Performance Settings
# =============================================================================
typeset -g POWERLEVEL9K_INSTANT_PROMPT=quiet

# Disable magic functions for better performance
DISABLE_MAGIC_FUNCTIONS="true"

# Auto-update settings (commented for manual control)
# zstyle ':omz:update' mode auto
# zstyle ':omz:update' frequency 13

# History timestamp format
HIST_STAMPS="yyyy-mm-dd"

# bun completions
[ -s "$HOME/.bun/_bun" ] && source "$HOME/.bun/_bun"

# bun
export BUN_INSTALL="$HOME/.bun"
export PATH="$BUN_INSTALL/bin:$PATH"

# Added by Windsurf
[[ -d "$HOME/.codeium/windsurf/bin" ]] && export PATH="$HOME/.codeium/windsurf/bin:$PATH"

# To customize prompt, run `p10k configure` or edit ~/.p10k.zsh.
[[ ! -f ~/.p10k.zsh ]] || source ~/.p10k.zsh
alias z="zellij"
alias olhaminhabio='cd ~/workspace/verstand/olhaminha.bio'
alias describe-clothes="python3 ~/workspace/verstand/quantum-store/clothes_descriptor/main.py"

alias claude-mem='bun "$HOME/.claude/plugins/marketplaces/thedotmack/plugin/scripts/worker-service.cjs"'

# Agentic AI development helpers for zsh + WezTerm
[[ -f "$HOME/.config/zsh/agentic-ai.zsh" ]] && source "$HOME/.config/zsh/agentic-ai.zsh"

# Vault auth for bun run secrets:sync
# Machine-local secrets (never committed) — see dotfiles README
[[ -s "$HOME/.zshrc.local" ]] && source "$HOME/.zshrc.local"
export VAULT_ADDR=https://vault.verstand.tech
[[ -s "$HOME/.deno/env" ]] && . "$HOME/.deno/env"

# >>> grok installer >>>
export PATH="$HOME/.grok/bin:$PATH"
fpath=(~/.grok/completions/zsh $fpath)
autoload -Uz compinit && compinit -C
# <<< grok installer <<<

# Cursor owns the `agent` command name; Grok is only available as `grok`.
# Re-assert after Grok path setup so a future Grok update cannot shadow Cursor.
if [[ -x "$HOME/.local/bin/cursor-agent" ]]; then
  ln -sfn "$HOME/.local/bin/cursor-agent" "$HOME/.local/bin/agent" 2>/dev/null
  # Drop Grok's duplicate `agent` shim if present (keeps ~/.grok/bin/grok).
  [[ -L "$HOME/.grok/bin/agent" ]] && rm -f "$HOME/.grok/bin/agent"
fi
# Prefer ~/.local/bin so `agent` resolves to Cursor even if Grok re-adds its shim.
path=("$HOME/.local/bin" ${path:#$HOME/.local/bin})
export PATH

# Cursor shell-integration is opt-in: it `exec`s into `agent record` and replaces
# every interactive shell. Enable only when you want that session capture:
#   eval "$("$HOME/.local/bin/agent" shell-integration zsh)"

alias cx="claude --dangerously-skip-permissions"
# Secrets (JIRA_API_TOKEN, etc.) belong in ~/.zshrc.local — never commit tokens here.


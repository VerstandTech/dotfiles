#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
# Load functions without running install.sh's main entrypoint.
source <(sed '/^main "\$@"$/d' "$REPO_ROOT/install.sh")

ROOT="$(mktemp -d)"
trap 'rm -rf "$ROOT"' EXIT
export HOME="$ROOT/home"
DOTFILES_DIR="$ROOT/checkout-config"
BACKUP_DIR="$ROOT/backup"

mkdir -p \
  "$HOME/.agents/skills/alpha" \
  "$HOME/.agents/skills/beta" \
  "$HOME/.claude/skills/dist" \
  "$DOTFILES_DIR/agents-shared/.agents/skills/alpha" \
  "$DOTFILES_DIR/agents-shared/.agents/skills/beta" \
  "$DOTFILES_DIR/agents-shared/.agents/adapters/pi/personal" \
  "$DOTFILES_DIR/pi/.pi/agent"

echo native > "$HOME/.claude/skills/dist/tool.skill"
echo '{}' > "$DOTFILES_DIR/agents-shared/.agents/adapters/pi/personal/package.json"
ln -s ../../../agents-shared/.agents/adapters/pi/personal \
  "$DOTFILES_DIR/pi/.pi/agent/personal"

# Stale generated links are removed; native entries survive; sync is idempotent.
ln -s ../../.agents/skills/stale "$HOME/.claude/skills/stale"
sync_claude_skills
test ! -e "$HOME/.claude/skills/stale"
test -f "$HOME/.claude/skills/dist/tool.skill"
test "$(find "$HOME/.claude/skills" -maxdepth 1 -type l | wc -l | tr -d ' ')" -eq 2
sync_claude_skills
test "$(find "$HOME/.claude/skills" -maxdepth 1 -type l | wc -l | tr -d ' ')" -eq 2

# Cleanup works outside a checkout named "dotfiles", prunes removed canonical
# skills, and preserves native/foreign entries.
mkdir -p \
  "$HOME/.grok/skills/help" \
  "$HOME/.agents/skills/stale-managed" \
  "$HOME/.agents/skills/native-extra"
echo native > "$HOME/.grok/skills/help/SKILL.md"
echo native > "$HOME/.agents/skills/native-extra/SKILL.md"
ln -s "$DOTFILES_DIR/agents-shared/.agents/skills/removed/SKILL.md" \
  "$HOME/.agents/skills/stale-managed/SKILL.md"
ln -s "$DOTFILES_DIR/agents-shared/.agents/skills/alpha" \
  "$HOME/.grok/skills/managed"
cleanup_removed_ai_wiring
test ! -e "$HOME/.grok/skills/managed"
test ! -e "$HOME/.agents/skills/stale-managed"
test -f "$HOME/.grok/skills/help/SKILL.md"
test -f "$HOME/.agents/skills/native-extra/SKILL.md"

# A correct direct Pi adapter is not backed up by the pi stow package pass.
mkdir -p "$HOME/.pi/agent"
pi_rel="$(python3 - "$DOTFILES_DIR/agents-shared/.agents/adapters/pi/personal" "$HOME/.pi/agent" <<'PY'
import os
import sys
print(os.path.relpath(os.path.realpath(sys.argv[1]), os.path.realpath(sys.argv[2])))
PY
)"
ln -s "$pi_rel" "$HOME/.pi/agent/personal"
backup_conflicts pi
test -L "$HOME/.pi/agent/personal"
test ! -e "$BACKUP_DIR/.pi/agent/personal"

# Foreign local content is backed up, never rm -rf'd, before adapter repair.
rm "$HOME/.pi/agent/personal"
mkdir -p "$HOME/.pi/agent/personal"
echo keep-me > "$HOME/.pi/agent/personal/local.txt"
ensure_pi_personal_link
test -f "$BACKUP_DIR/.pi/agent/personal/local.txt"
test -L "$HOME/.pi/agent/personal"
test "$(resolved_path "$HOME/.pi/agent/personal")" = \
  "$(resolved_path "$DOTFILES_DIR/agents-shared/.agents/adapters/pi/personal")"

mkdir -p "$DOTFILES_DIR/agents-shared/.agents/skills/pi-extension-creator/scripts"
ln -s "$REPO_ROOT/agents-shared/.agents/skills/pi-extension-creator/scripts/scaffold-extension.sh" \
  "$DOTFILES_DIR/agents-shared/.agents/skills/pi-extension-creator/scripts/scaffold-extension.sh"
bash "$DOTFILES_DIR/agents-shared/.agents/skills/pi-extension-creator/scripts/scaffold-extension.sh" \
  --name wiring-smoke --kind minimal >/dev/null
test -f "$DOTFILES_DIR/agents-shared/.agents/adapters/pi/personal/extensions/wiring-smoke.ts"
test "$(resolved_path "$HOME/.pi/agent/personal")" = \
  "$(resolved_path "$DOTFILES_DIR/agents-shared/.agents/adapters/pi/personal")"

echo "install AI wiring tests OK"

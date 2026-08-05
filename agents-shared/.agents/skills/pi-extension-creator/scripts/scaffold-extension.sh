#!/usr/bin/env bash
# Scaffold a local Pi extension into the dotfiles personal package or a project.
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  scaffold-extension.sh --name <slug> [--kind tool|command|hook|minimal] [--project <repo>] [--force]

Defaults:
  --kind tool
  target = ~/dotfiles/agents-shared/.agents/adapters/pi/personal/extensions/<name>.ts

Examples:
  scaffold-extension.sh --name hello --kind tool
  scaffold-extension.sh --name safe-bash --kind hook
  scaffold-extension.sh --name ship-check --kind command --project ~/code/app
EOF
}

NAME=""
KIND="tool"
PROJECT=""
FORCE=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --name) NAME="${2:-}"; shift 2 ;;
    --kind) KIND="${2:-}"; shift 2 ;;
    --project) PROJECT="${2:-}"; shift 2 ;;
    --force) FORCE=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown arg: $1" >&2; usage >&2; exit 2 ;;
  esac
done

if [[ -z "$NAME" ]]; then
  echo "error: --name is required" >&2
  usage >&2
  exit 2
fi

if [[ ! "$NAME" =~ ^[a-z0-9]+([a-z0-9-]*[a-z0-9])?$ ]]; then
  echo "error: --name must be a lowercase slug (a-z0-9-)" >&2
  exit 2
fi

case "$KIND" in
  tool|command|hook|minimal) ;;
  *) echo "error: --kind must be tool|command|hook|minimal" >&2; exit 2 ;;
esac

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AGENTS_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
DOTFILES_PI_PERSONAL="${DOTFILES_PI_PERSONAL:-$AGENTS_ROOT/adapters/pi/personal}"

if [[ -n "$PROJECT" ]]; then
  TARGET_DIR="$PROJECT/.pi/extensions"
else
  TARGET_DIR="$DOTFILES_PI_PERSONAL/extensions"
fi

mkdir -p "$TARGET_DIR"
TARGET="$TARGET_DIR/$NAME.ts"

if [[ -e "$TARGET" && "$FORCE" -ne 1 ]]; then
  echo "error: exists: $TARGET (pass --force to overwrite)" >&2
  exit 1
fi

# Export name for tool identifier (slug -> snake-ish already hyphenated ok for commands)
TOOL_NAME="${NAME//-/_}"
CMD_NAME="$NAME"

write_tool() {
  cat >"$TARGET" <<EOF
/**
 * ${NAME} — personal Pi tool extension
 * Package: ${TARGET_DIR#$HOME/}
 */
import { Type } from "@earendil-works/pi-ai";
import { defineTool, type ExtensionAPI } from "@earendil-works/pi-coding-agent";

const ${TOOL_NAME}Tool = defineTool({
  name: "${TOOL_NAME}",
  label: "${NAME}",
  description: "TODO: describe what this tool does for the model",
  parameters: Type.Object({
    input: Type.String({ description: "TODO: parameter description" }),
  }),
  async execute(_toolCallId, params) {
    return {
      content: [{ type: "text", text: String(params.input) }],
      details: {},
    };
  },
});

export default function (pi: ExtensionAPI) {
  pi.registerTool(${TOOL_NAME}Tool);
}
EOF
}

write_command() {
  cat >"$TARGET" <<EOF
/**
 * ${NAME} — personal Pi slash command
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  pi.registerCommand("${CMD_NAME}", {
    description: "TODO: command description",
    handler: async (args, ctx) => {
      const text = args.trim() || "(no args)";
      if (!ctx.hasUI) {
        console.log("[${CMD_NAME}]", text);
        return;
      }
      ctx.ui.notify(text, "info");
    },
  });
}
EOF
}

write_hook() {
  cat >"$TARGET" <<EOF
/**
 * ${NAME} — personal Pi tool_call hook
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  pi.on("tool_call", async (event, ctx) => {
    // TODO: narrow event.toolName / event.input and optionally block
    // return { block: true, reason: "…" }
    void event;
    void ctx;
    return undefined;
  });
}
EOF
}

write_minimal() {
  cat >"$TARGET" <<EOF
/**
 * ${NAME} — personal Pi extension
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  pi.registerCommand("${CMD_NAME}", {
    description: "Ping that ${NAME} loaded",
    handler: async (_args, ctx) => {
      ctx.ui?.notify?.("${NAME} loaded", "info");
    },
  });
}
EOF
}

case "$KIND" in
  tool) write_tool ;;
  command) write_command ;;
  hook) write_hook ;;
  minimal) write_minimal ;;
esac

# Pi loads ./personal from ~/.pi/agent/personal. Prefer a single dir symlink so
# new files are visible without stow restow (see install.sh ensure_pi_personal_link).
if [[ -z "$PROJECT" ]]; then
  live="$HOME/.pi/agent/personal"
  source_abs="$(python3 - "$DOTFILES_PI_PERSONAL" <<'PY'
import os
import sys
print(os.path.realpath(sys.argv[1]))
PY
)"
  desired_rel="$(python3 - "$source_abs" "$HOME/.pi/agent" <<'PY'
import os
import sys
print(os.path.relpath(sys.argv[1], os.path.realpath(sys.argv[2])))
PY
)"
  mkdir -p "$HOME/.pi/agent"
  if [[ -e "$live" || -L "$live" ]]; then
    live_abs="$(python3 - "$live" <<'PY'
import os
import sys
print(os.path.realpath(sys.argv[1]))
PY
)"
    if [[ "$live_abs" != "$source_abs" ]]; then
      echo "ERROR: $live exists and does not resolve to $source_abs" >&2
      echo "Run the dotfiles install.sh or move the conflicting path before retrying." >&2
      exit 1
    fi
  else
    ln -s "$desired_rel" "$live"
    echo "Linked $live -> $desired_rel"
  fi
fi

echo "Created: $TARGET"
echo
if [[ -z "$PROJECT" ]]; then
  echo "Next:"
  echo "  1. Edit the TODO sections in the file"
  echo "  2. Confirm ~/dotfiles/pi/.pi/agent/settings.json packages includes \"./personal\""
  echo "  3. In Pi: /reload   (or: pi -e \"$TARGET\")"
  echo "  4. cd ~/dotfiles && git add agents-shared/.agents/adapters/pi/personal && git commit"
else
  echo "Next:"
  echo "  1. Edit the TODO sections"
  echo "  2. Trust the project in Pi if prompted"
  echo "  3. /reload"
  echo "  4. Commit inside the project repo (not only dotfiles)"
fi

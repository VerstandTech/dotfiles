---
name: pi-extension-creator
description: >
  Create, scaffold, test, and sync local pi.dev / Pi coding-agent extensions in
  the user's GNU Stow dotfiles setup. Use when the user wants to build a Pi
  extension, add a custom tool/command/event hook/UI, scaffold a personal or
  project extension, install a local path package, hot-reload with /reload, or
  keep extensions versioned under ~/dotfiles (not ad-hoc only in ~/.pi).
---

# Pi Extension Creator

Help the user ship **local Pi extensions** that are:

1. Correct against current Pi extension APIs
2. Loadable in this install
3. **Synced via `~/dotfiles`** (stow), not trapped as machine-only junk

## Source of truth on this machine

| What | Path | Live target |
|---|---|---|
| Shared skills (this skill) | `~/dotfiles/agents-shared/.agents/skills/` | `~/.agents/skills/` |
| Pi settings / models | `~/dotfiles/pi/.pi/agent/` | `~/.pi/agent/` |
| **Personal extensions package** | `~/dotfiles/agents-shared/.agents/adapters/pi/personal/` | `~/.pi/agent/personal` → dir symlink; `settings.json` → `packages: ["./personal"]` |
| Project-local extensions | `<repo>/.pi/extensions/` | auto after project trust |
| Official docs | Pi install `docs/extensions.md`, `docs/packages.md` | also https://pi.dev |
| Official examples | Pi install `examples/extensions/` | copy patterns, do not edit in place |

**Important:** User said “dotenv” → this repo is **`~/dotfiles`**. Edit there (or the live symlink targets, which point into it), then commit/push.

Runtime-only dirs — **never commit**:

- `~/.pi/agent/auth.json`, `sessions/`, `state/`, `tmp/`, `npm/`, `trust.json`
- Package state under `~/.pi/agent/extensions/<pkg>/` (e.g. `pi-crew`)

## Decide scope first

| Goal | Put code here | Load mechanism |
|---|---|---|
| Personal, all projects, synced across machines | `~/dotfiles/agents-shared/.agents/adapters/pi/personal/extensions/*.ts` | `packages: ["./personal"]` in stowed settings |
| One repo only | `<repo>/.pi/extensions/*.ts` or `*/index.ts` | auto-discovery after trust |
| Quick throwaway test | any path | `pi -e ./path.ts` (temp; not synced) |
| Shareable npm/git package | separate package with `package.json` `pi` manifest | `pi install …` |

Default for “make me an extension” → **personal package** in dotfiles.

## Workflow

### 1. Clarify the extension type

Pick one primary shape (can combine later):

- **Tool** — model-callable (`pi.registerTool` / `defineTool`)
- **Command** — user slash command (`pi.registerCommand`)
- **Hook** — lifecycle gate/transform (`pi.on("tool_call" | …)`)
- **UI** — status/footer/widget/dialog (`ctx.ui.*`)
- **Provider / resources** — advanced; read docs before scaffolding

### 2. Scaffold

From repo root or anywhere:

```bash
# Personal (dotfiles-synced) — default
bash ~/dotfiles/agents-shared/.agents/skills/pi-extension-creator/scripts/scaffold-extension.sh \
  --name my-thing --kind tool

# Project-local
bash ~/dotfiles/agents-shared/.agents/skills/pi-extension-creator/scripts/scaffold-extension.sh \
  --name my-thing --kind hook --project /path/to/repo
```

Kinds: `tool` | `command` | `hook` | `minimal`

The script:

- Writes a single `.ts` entry under the chosen extensions root
- Refuses to overwrite unless `--force`
- Prints reload / commit next steps

### 3. Implement

Use templates in [references/extension-templates.md](references/extension-templates.md).

Hard rules:

- Default export: `export default function (pi: ExtensionAPI) { … }` (async factory OK)
- Import types from `@earendil-works/pi-coding-agent`
- Schemas: `Type` from `@earendil-works/pi-ai` **or** `typebox` (both appear in official examples)
- List Pi peer imports only as peers if packaging for npm; local personal package needs no install for bundled Pi modules
- Third-party runtime deps: put `package.json` beside the extension or in the personal package root, `npm install`, use `dependencies` (not only `devDependencies`)
- Extensions run with **full user permissions** — treat like shell access
- Do not store secrets in extension source; read machine-local env / `~/.zshrc.local` patterns instead

### 4. Ensure settings load the personal package

Stowed settings live at `~/dotfiles/pi/.pi/agent/settings.json` (→ `~/.pi/agent/settings.json`).

Must include the relative local package (path resolved against the settings file):

```json
"packages": [
  "npm:pi-subagents",
  "npm:context-mode",
  "npm:pi-markdown-preview",
  "npm:pi-crew",
  "./personal"
]
```

`./personal` is the directory next to `settings.json` that contains `package.json` + `extensions/`.

If missing, add it, then restow or rely on the existing settings symlink.

### 5. Load and verify

```bash
# Already in a Pi session:
 /reload

# Or start with explicit path while iterating:
pi -e ~/dotfiles/agents-shared/.agents/adapters/pi/personal/extensions/my-thing.ts

# Confirm package is known
pi list
```

Checks:

- No `[Extension issues]` / load errors on startup
- Tool appears to the model, or command appears in the command list
- For hooks: trigger the guarded path once
- Project-local: project must be trusted (`project_trust` / `trust.json`)

### 6. Sync via dotfiles

```bash
cd ~/dotfiles
git status
git add agents-shared/.agents/adapters/pi/personal pi/.pi/agent/settings.json \
  agents-shared/.agents/skills/pi-extension-creator
git commit -m "feat(pi): add <extension-name> extension"
git push
```

Other machines:

```bash
cd ~/dotfiles && git pull && ./install.sh
```

Details: [references/dotfiles-sync.md](references/dotfiles-sync.md).

## Placement cheat sheet

```text
~/dotfiles/
  agents-shared/.agents/
    skills/pi-extension-creator/      # this skill
    adapters/pi/personal/             # canonical local Pi package
      package.json
      extensions/
        my-thing.ts
  pi/.pi/agent/
    settings.json                     # packages includes "./personal"
    models.json
    personal -> ../../../agents-shared/.agents/adapters/pi/personal
```

Do **not** put long-lived custom entrypoints only in `~/.pi/agent/extensions/` — that tree is shared with third-party package state and is easy to leave untracked. The personal package keeps source in git.

## API quick reference

```ts
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "@earendil-works/pi-ai";

export default function (pi: ExtensionAPI) {
  pi.registerTool(/* … */);
  pi.registerCommand("name", { description, handler });
  pi.on("tool_call", async (event, ctx) => { /* block/modify */ });
  pi.on("session_start", async (event, ctx) => { /* … */ });
}
```

Common events: `tool_call`, `tool_result`, `session_start`, `session_shutdown`, `agent_start`, `agent_end`, `input`, `before_agent_start`, `project_trust`.

UI (when `ctx.hasUI`): `ctx.ui.notify`, `confirm`, `input`, `select`, `custom`.

Full event list and tool rendering: installed `docs/extensions.md`. Patterns: `examples/extensions/` (`hello.ts`, `commands.ts`, `permission-gate.ts`, `protected-paths.ts`, `with-deps/`).

## Packaging (optional)

When the extension should leave this machine:

1. Promote `personal/extensions/foo.ts` into its own folder with `package.json`:

```json
{
  "name": "my-pi-extension",
  "keywords": ["pi-package"],
  "type": "module",
  "pi": { "extensions": ["./index.ts"] }
}
```

2. Install: `pi install /absolute/path` or publish npm/git and `pi install npm:name`.

3. Keep using relative `./personal` for private always-on extensions.

See installed `docs/packages.md`.

## Done checklist

- [ ] Entry file default-exports an extension factory
- [ ] Lives under `personal/extensions/` (synced) or project `.pi/extensions/`
- [ ] `settings.json` includes `"./personal"` when using the personal package
- [ ] Verified with `/reload` or `pi -e`
- [ ] No secrets in source
- [ ] Dotfiles commit prepared (or project commit for project-local)

## Anti-patterns

- Editing only `~/.pi/agent/extensions/*.ts` without a dotfiles path (won’t travel machines)
- Absolute `/Users/…` paths in `settings.json` packages (breaks Linux home layout) — use `./personal`
- Committing `auth.json`, sessions, or package state
- Overriding built-in tools without matching result `details` shapes
- Adding heavy logic to the skill itself — keep skill procedural; put code in extensions

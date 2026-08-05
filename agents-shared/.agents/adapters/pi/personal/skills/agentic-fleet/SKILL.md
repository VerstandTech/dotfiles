---
name: agentic-fleet
description: >
  Large multi-agent fanout on Pi: dispatch N researchers, code reviewers, or UX
  personas with optional model rotation. Use when the user wants many sub-agents,
  swarms, parallel perspectives, fleet research, multi-lens review, or
  /skill:agentic-fleet. Pairs with fleet_dispatch / /fleet and pi-subagents.
---

# Agentic fleet (heavy multi-agent)

Use this when the user wants **many** concurrent specialists — not a single reviewer.

**With BDD mode on:** review fleets only in **`verify`** (or `/bdd off` / `fleet-bypass`). See `docs/bdd-fleet-cheatsheet.md`.

## Prefer these entry points

| User intent | Command / tool |
|---|---|
| N web researchers | `/fleet research [count] <topic>` (default 5) or `fleet_dispatch` kind=research |
| N code-review lenses | `/fleet review [count] <scope>` (**default 3**) |
| N UX personas | `/fleet ux [count] <flow>` (**default 3**) |
| Plan only | `/fleet plan review 3 <topic>` or `fleet_plan` |
| Snapshot outputs | `/fleet collect <runId>` or `fleet_collect` |
| Diagnostics | `/agentic doctor` or `agentic_doctor` |
| Caps / config | `fleet_status` |

Also works via plain language: “dispatch 10 sub-agents to research X” → **fleet_dispatch**.

## Under the hood

1. **Personas** expand to distinct angles (see `lib/fleet/personas.ts`).
2. **Models** rotate from `~/.pi/agent/fleet.json` or tool args.
3. **Launch** goes through **pi-subagents** (`subagent` tool or RPC `spawn`).
4. **Caps** auto-raised in `~/.pi/agent/extensions/subagent/config.json` (maxTasks/concurrency).
5. **Agents**: `fleet-researcher` (xai_web_search), `fleet-reviewer`, `fleet-ux` from the personal package.

## Parent orchestrator rules

1. **One writer** in the shared worktree. Fleet children are read-only.
2. After completion, **synthesize** — agreements, disagreements, ranked actions — do not paste 10 raw dumps.
3. Watch progress: `/subagents-fleet` or **Ctrl+Alt+F**.
4. If RPC spawn fails, call the **`subagent`** tool with the JSON payload from `fleet_plan`.
5. For implementation after review: one `worker` (or parent edits), not 10 writers.

## Model control

**Native providers first.** Fleet planning rewrites OpenRouter ids to first-party providers when those providers are authenticated:

| Requested | Preferred native | Fallback |
|---|---|---|
| `openrouter/anthropic/claude-fable-5` | `anthropic/claude-fable-5` | OpenRouter |
| `openrouter/openai/gpt-5.6-sol:high` | `openai-codex/gpt-5.6-sol:high` | OpenRouter |
| `openrouter/x-ai/grok-4.5` | `xai/grok-4.5` | OpenRouter |

Prefer writing native ids in configs and tool args. OpenRouter is only used when the native provider is not logged in.

Optional `~/.pi/agent/fleet.json`:

```json
{
  "defaultConcurrency": 12,
  "defaultVerifyCount": 3,
  "asyncByDefault": true,
  "caps": { "maxTasks": 48, "concurrency": 16, "globalConcurrencyLimit": 48 },
  "models": {
    "default": "xai/grok-4.5",
    "pool": ["xai/grok-4.5", "xai/grok-4-1-fast-reasoning"],
    "research": ["xai/grok-4.5"],
    "review": "xai/grok-4.5",
    "ux": "xai/grok-4.5"
  }
}
```

Project overlay (merged on top): `<cwd>/.pi/fleet.json`.

Per-call overrides: `fleet_dispatch` `model` / `models[]`.

Per-agent persistent defaults still live in `settings.json` → `subagents.agentOverrides` / `subagents.defaultModel`.

## Example tool call

```js
fleet_dispatch({
  kind: "review",
  count: 10,
  topic: "Review the current git diff for release readiness",
  scope: "git diff develop...HEAD",
  models: ["xai/grok-4.5", "xai/grok-4-1-fast-reasoning"],
  concurrency: 10
})
```

## Related pi-subagents commands

- `/parallel-review` — smaller built-in 3-angle recipe  
- `/parallel-research` — researcher + scout  
- `/subagents-models` — inspect model mapping  
- `/run reviewer[model=…] "…"` — single agent model pin  

Use **fleet_*** when the user wants **scale + personas** (8–48 agents). Use parallel-review when 2–4 angles suffice.

## Safety

- Do not grant fleet children `edit`/`write` unless the user explicitly wants writer fleets (then use worktrees).
- Cost scales with N × model price — confirm when N is large and the topic is vague.
- `grant-spawn-budget` only if session spawn caps block a run the user requested.

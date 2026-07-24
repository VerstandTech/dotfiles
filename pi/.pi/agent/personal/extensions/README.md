# Personal Pi extensions

TypeScript entry files in this directory are loaded by Pi through the local
package `../package.json` (`pi.extensions: ["./extensions/*.ts"]`).

Settings entry (relative to `../settings.json`):

```json
"packages": ["./personal"]
```

## Subagent: project `researcher` (olhaminha.bio only)

Project agent (not global) overrides builtin researcher so children use **`xai_web_search`**:

- Definition: `olhaminha.bio/.pi/agents/researcher.md`
- Loads personal extension via absolute `subagentOnlyExtensions` → `~/.pi/agent/personal/extensions/xai-web-search.ts`
- Tools: `read, write, xai_web_search, bash, contact_supervisor, intercom`

Only active when Pi cwd is that project (project agent discovery). `/reload` after edits.

## Bundled: `worktree-board.ts`

Mission-control for **git worktrees** from a root Pi session.

| Surface | Name |
|---------|------|
| Commands | `/wt`, `/wt-board` |
| Shortcut | **Ctrl+Alt+W** (left overlay) |
| Lib | `lib/worktree/*` |
| Registry | `<repo>/.pi/worktree-board.json` |

Does **not** change session cwd on focus. Writer cap default 2 (`/wt acquire`).

## Bundled: `ops-hud.ts`

Richer TUI while multi-agent / multi-web work is running:

- footer status chips (`🌐×N`, `🤖×N`)
- above-editor live ops board
- working message + spinner + titlebar animation
- `/ops-hud` toggle (`/ops-hud off`)

Pairs with pi-subagents:

- async widget (enabled via `~/.pi/agent/extensions/subagent/config.json`)
- `/subagents-fleet` or **Ctrl+Alt+F** for the full inspector

## Bundled: `agentic-fleet.ts` (heavy multi-agent)

Dispatch **N** specialists with distinct personas + optional model rotation on top of `npm:pi-subagents`.

| Surface | Name |
|---------|------|
| Command | `/fleet research\|review\|ux [count] <topic>`, `/fleet plan …`, `/fleet collect <runId>`, `/fleet status` |
| Tools | `fleet_plan`, `fleet_dispatch`, `fleet_status`, `fleet_collect` |
| Skill | `agentic-fleet`, `ship` |
| Prompts | `/fleet-research`, `/fleet-review`, `/fleet-ux`, `/ship` |
| Agents | `fleet-researcher`, `fleet-reviewer`, `fleet-ux` |
| Config | `~/.pi/agent/fleet.json` + project `.pi/fleet.json` overlay; caps via `extensions/subagent/config.json` |
| Doctor | `/agentic doctor` / `/bdd doctor` / tool `agentic_doctor` |

Defaults: **review/ux N=3**, research N=5 (override with count). Cost warning when N>5.

Examples:

```text
/fleet research state of multi-agent coding harnesses 2026
/fleet review git diff develop...HEAD
/fleet ux checkout flow in app/checkout
/fleet collect 083f47de-c45e-48f4-a254-7d2cfab8c459
/agentic doctor
/agentic ship
```

Live inspector: `/subagents-fleet` or **Ctrl+Alt+F**.

**Tests:** `bun test lib/fleet`

## Docs (check anytime)

| Doc | Purpose |
|-----|--------|
| [`../docs/bdd-fleet-cheatsheet.md`](../docs/bdd-fleet-cheatsheet.md) | **Operator guide** — phases, red→green→verify, fleet gates, troubleshooting |
| [`../docs/agentic-bdd-roadmap.md`](../docs/agentic-bdd-roadmap.md) | Design locks + P0/P1 implementation roadmap |

## Bundled: `bdd-mode.ts` (cross-project BDD → TDD)

Enforces **Example Map → formulation → red → green → refactor → verify** with path gates and recorded evidence. Works in **any** repo; configure per project with `.pi/bdd.json`.

| Surface | Name |
|---------|------|
| Command | `/bdd status\|on\|off\|discovery\|formulation\|red\|green\|refactor\|verify\|handoff\|init\|bypass\|doctor` |
| Tools | `bdd_status`, `bdd_set_phase`, `bdd_assert_red`, `bdd_assert_green`, `bdd_assert_mutation`, `bdd_record_evidence`, `bdd_handoff`, `agentic_doctor` |
| Skill | `bdd-tdd`, `ship` |
| Prompts | `/example-map`, `/formulate`, `/tdd`, `/green`, `/handoff`, `/ship` |
| Auto | Phrases like “TDD”, “Example Map”, “Gherkin”, “red-green-refactor” append a workflow reminder |

Handoff: `/bdd handoff` or `/bdd handoff pr` (PR body). Mutation: `bdd_assert_mutation` (parent breaks/restores; tool only runs commands).

**Per-project config** (first hit wins):

1. `.pi/bdd.json`
2. `bdd.json`
3. `.bdd-tdd.json`
4. Infer `commands` from `package.json` scripts (`test`, `gherkin:test`, `test:e2e`, …)

```text
/bdd init     # write .pi/bdd.json template in the current project
/bdd on       # start discovery
/tdd …        # prompt → red phase
```

**Hard gates:**
- Cannot `/bdd green` or `/bdd verify` without recorded **red** (failing test via `bdd_assert_red`).
- `edit`/`write` to implementation paths blocked until red evidence; mutating `bash` blocked in discovery/formulation/red.
- Fleets / multi-agent `subagent` blocked in red/green/refactor (use verify).
- Green must **cover** red (`strictGreenCoversRed` default on).
- Escape paths: `/bdd bypass <reason>` · fleets: `/bdd fleet-bypass <reason>`.

**Tests:**

```bash
cd ~/dotfiles/pi/.pi/agent/personal && bun test lib/bdd
```

See skill: `../skills/bdd-tdd/SKILL.md` and `../skills/bdd-tdd/references/bdd-json-schema.md`.

## Bundled: `xai-web-search.ts`

Live web research via Grok/xAI.

| Surface | Name |
|---------|------|
| Tool | `xai_web_search` |
| Commands | `/web-search <query>`, `/web-search-status` |
| Auto | Phrases like “research on the web” / “search the web” / “latest price” transform the turn + system guidelines so the model must call `xai_web_search` |

Opt out in a turn: say `no web search` / `don't search the web`.

**Auth (first match):** `XAI_API_KEY` → `GROK_API_KEY` → `~/.pi/agent/auth.json` xAI OAuth/API key.

**Optional env:**

| Var | Purpose |
|-----|--------|
| `XAI_WEB_SEARCH_MODEL` | Model override (default `grok-4-1-fast-reasoning`) |
| `XAI_API_BASE_URL` / `GROK_API_BASE_URL` | API base (default `https://api.x.ai/v1`) |
| `XAI_WEB_SEARCH_ALLOW_GROK_CLI=0` | Disable `grok` CLI fallback |

**Tests:**

```bash
cd ~/dotfiles/pi/.pi/agent/personal && bun test lib/xai-web-search
```

## Package layout

```text
personal/
  extensions/          # agentic-fleet, bdd-mode, ops-hud, xai-web-search
  agents/              # fleet-researcher, fleet-reviewer, fleet-ux
  lib/bdd/             # pure phase/path/config logic + tests
  lib/fleet/           # personas, plan, caps, rpc + tests
  lib/ops-hud/
  lib/xai-web-search/
  skills/bdd-tdd/ + skills/agentic-fleet/
  prompts/             # bdd + fleet slash templates
```

`package.json` `pi` manifest loads extensions, skills, and prompts.

## Add one

```bash
bash ~/dotfiles/agents-shared/.agents/skills/pi-extension-creator/scripts/scaffold-extension.sh \
  --name my-extension --kind tool
```

Then `/reload` in Pi and commit under `~/dotfiles`.

Do not put secrets here. Machine-local state belongs outside this tree.

## Project BDD template

Copy `../templates/bdd.project.json` → `<repo>/.pi/bdd.json` (local/gitignored), or run `/bdd init`.

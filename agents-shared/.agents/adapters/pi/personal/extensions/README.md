# Personal Pi extensions

TypeScript entry files in this directory are loaded by Pi through the local
package `../package.json` (`pi.extensions: ["./extensions/*.ts"]`).

Settings entry (relative to `../settings.json`):

```json
"packages": ["./personal"]
```

Package version: **0.7.0** (high-assurance v1.2 scaffolding: CAID, trajectory, decisions, cost budgets).

## Subagent: project `researcher` (olhaminha.bio only)

Project agent (not global) overrides builtin researcher so children use **`xai_web_search`**:

- Definition: `olhaminha.bio/.pi/agents/researcher.md`
- Loads personal extension via absolute `subagentOnlyExtensions` → `~/.pi/agent/personal/extensions/xai-web-search.ts`
- Tools: `read, write, xai_web_search, bash, contact_supervisor, intercom`

Only active when Pi cwd is that project (project agent discovery). `/reload` after edits.

## Bundled: `tui-chrome.ts`

Component chrome matched to the reference agent TUI (structure, not just colors):

| Piece | Behavior |
|-------|----------|
| Working row | `◐ Working... ████████` above editor (hides built-in loader) |
| Editor | `> ` prompt via `CustomEditor`; forces `paddingX: 2` (Pi would otherwise reset it to settings `editorPaddingX`, default 0) |
| Footer | Single-line mode chips: `mode agent model thinking: lvl path` |
| Command | `/chrome [on\|off\|footer]` |
| Lib | `lib/tui-chrome/*` (pure renderers + tests) |
| Safety | All chrome lines pass `truncateToWidth` — pi-tui aborts on any line wider than the terminal |

Pairs with `ops-hud` (ops board/status only) and `herd` (sibling agent widget).

## Bundled: `worktree-board.ts`

Mission-control for **git worktrees** from a root Pi session.

| Surface | Name |
|---------|------|
| Commands | `/wt`, `/wt-board` |
| Shortcut | **Ctrl+Alt+W** (left overlay) |
| Lib | `lib/worktree/*` (+ **`caid.ts`** for CAID planning) |
| Registry | `<repo>/.pi/worktree-board.json` |
| CAID board | `<repo>/.pi/caid-board.json` (via `lib/worktree/caid.ts`) |
| Skill | `caid` |

Does **not** change session cwd on focus. Writer cap default 2 (`/wt acquire`).

CAID helpers plan isolated paths under `.worktrees/caid/<task>/<role>/`, emit handoff markdown, and detect designer/implementer collisions. Extension UI wiring for `/wt caid` may follow; the library is usable now from orchestrator skills.

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
| [`../docs/high-assurance-playbook.md`](../docs/high-assurance-playbook.md) | Canonical High-Assurance Multi-Agent Software Development Playbook **v1.2** |
| [`../docs/high-assurance-pi-implementation.md`](../docs/high-assurance-pi-implementation.md) | Enforced vs scaffolding vs roadmap mapping for this Pi package |
| [`../docs/overnight-rhythm.md`](../docs/overnight-rhythm.md) | 24h day/night agent cadence + queue format |

## High-assurance v1.2 libraries (not separate extensions)

| Lib | Purpose | Tests |
|-----|---------|-------|
| `lib/worktree/caid.ts` | CAID isolation planning | `bun test lib/worktree/caid.test.ts` |
| `lib/trajectory/*` | Trajectory eval, anti-patterns, golden suite | `bun test lib/trajectory` |
| `lib/decisions/*` | Requirements-as-Code decision store | `bun test lib/decisions` |
| `lib/bdd/cost-budget.ts` | Cost/latency/iteration budgets | `bun test lib/bdd/cost-budget.test.ts` |

Skills: `skills/caid`, `skills/trajectory` (plus existing `bdd-tdd`, `ship`, `agentic-fleet`, `herdr`).

Templates: `templates/AGENTS.md`, `templates/decisions.store.json`, `templates/bdd.project.json`.

## Bundled: `bdd-mode.ts` (cross-project BDD → TDD)

Enforces **Example Map → formulation → red → green → refactor → verify** with path gates and recorded evidence. Works in **any** repo; configure per project with `.pi/bdd.json`. Use `/bdd playbook` or tool `bdd_playbook` to locate the canonical policy and the honest Pi implementation profile.

| Surface | Name |
|---------|------|
| Command | `/bdd status\|playbook\|profile\|gates\|on\|off\|discovery\|formulation\|red\|green\|refactor\|verify\|handoff\|init\|bypass\|doctor` |
| Core tools | `bdd_status`, `bdd_playbook`, `bdd_set_phase`, `bdd_assert_red`, `bdd_assert_green`, `bdd_assert_mutation`, `bdd_record_evidence`, `bdd_handoff`, `agentic_doctor` |
| Assurance tools | `bdd_project_profile`, `bdd_assurance_plan`, `bdd_run_quality_gates`, `bdd_delegate_role` |
| Bounded agents | `bdd-specifier`, `bdd-test-designer`, `bdd-implementer`, `bdd-refactorer`, `bdd-breaker`, `bdd-fitness-guardian`, `bdd-qa` |
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
/bdd playbook # canonical v1.2 policy + honest Pi implementation status
/bdd init     # write .pi/bdd.json template in the current project
/bdd on       # start discovery
/tdd …        # prompt → red phase
```

**Hard gates:**
- Cannot `/bdd green` or `/bdd verify` without recorded **red** (failing test via `bdd_assert_red`).
- `/bdd profile` detects JavaScript/TypeScript, Rust, Go, Python, and Swift signals without installing tools or calling the network.
- `bdd_run_quality_gates` executes the ordered local plan only in verify; missing/failing required gates fail closed.
- Assurance handoff rejects stale plan fingerprints/evidence, note-only mutation claims, missing fleet synthesis files, and missing blocker dispositions.
- `edit`/`write` to implementation paths blocked until red evidence; mutating `bash` blocked in discovery/formulation/red.
- Fleets / multi-agent `subagent` blocked in red/green/refactor (use verify).
- Green must **cover** red (`strictGreenCoversRed` default on).
- Escape paths: `/bdd bypass <reason>` · fleets: `/bdd fleet-bypass <reason>`.

**Tests:**

```bash
cd ~/dotfiles/agents-shared/.agents/adapters/pi/personal && bun test lib/bdd
```

See:
- [`../docs/high-assurance-playbook.md`](../docs/high-assurance-playbook.md)
- [`../docs/high-assurance-pi-implementation.md`](../docs/high-assurance-pi-implementation.md)
- [`../docs/high-assurance-example-map.md`](../docs/high-assurance-example-map.md)
- [`../docs/overnight-rhythm.md`](../docs/overnight-rhythm.md)
- skill `../skills/bdd-tdd/SKILL.md`
- config reference `../skills/bdd-tdd/references/bdd-json-schema.md`.

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
cd ~/dotfiles/agents-shared/.agents/adapters/pi/personal && bun test lib/xai-web-search
```

## Package layout

```text
personal/
  extensions/          # agentic-fleet, bdd-mode, ops-hud, worktree-board, xai-web-search
  agents/              # bdd-* roles + fleet-*
  lib/bdd/             # phase/path/config + quality gates + cost-budget + tests
  lib/worktree/        # board + CAID
  lib/trajectory/      # process supervision
  lib/decisions/       # Requirements-as-Code store
  lib/fleet/           # personas, plan, caps, rpc + tests
  lib/ops-hud/
  lib/xai-web-search/
  skills/              # bdd-tdd, caid, trajectory, agentic-fleet, ship, herdr
  templates/           # bdd.project.json, AGENTS.md, decisions.store.json
  prompts/             # bdd + fleet slash templates
  docs/                # playbook v1.2, implementation profile, overnight rhythm, …
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

Also consider:

- `../templates/AGENTS.md` → `<repo>/AGENTS.md`
- `../templates/decisions.store.json` → `<repo>/docs/decisions/decisions.json`

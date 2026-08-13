# Graphiti + FalkorDB memory for Pi and Herdr

Issue: [#30](https://github.com/VerstandTech/dotfiles/issues/30)

`pi-graphiti` is a Pi package. It is **not** a new approval, merge, budget, or cleanup authority. It stores temporal facts. Secrets stay out of the graph.

## Current pin

- Package: `npm:pi-graphiti@0.6.0`
- Declared in `pi/.pi/agent/settings.json` and `agents-shared/.agents/manifest.json`
- Config (created by the setup script, not committed): `~/.pi/agent/pi-graphiti-config.json`

## Scoping

`/graph setup` is a **global** wizard. It does not create a database per directory.

With `projectScoping: true` (required):

| Scope | Group ID | Use |
|---|---|---|
| project | `<groupId>_proj_<cwd-basename>` | architecture, product, campaign facts for this repo |
| global | `<groupId>_global` | tastes, audience, cross-project lessons |

## Backend

Tracked compose: `docs/graphiti/docker-compose-falkordb.yml`

This is the official FalkorDB + Graphiti MCP pair with **host port 3000 remapped to 3001** so it does not collide with other local apps.

| Host port | Service |
|---|---|
| 6379 | FalkorDB |
| 3001 | FalkorDB Browser |
| 8000 | Graphiti MCP (`http://localhost:8000/mcp/`) |

Do **not** use the stock getzep compose on this machine. It binds `:3000`.

## Start on this machine or another

```bash
bash scripts/setup-graphiti.sh
```

The script:

1. Requires Docker.
2. Uses `OPENAI_API_KEY` when it is a real cloud/OpenAI-compatible key.
3. Otherwise installs/starts Ollama and pulls `llama3.2` + `nomic-embed-text`.
4. Starts the remapped compose project `graphiti`.
5. Writes `~/.pi/agent/pi-graphiti-config.json` with `projectScoping: true` and `url: http://localhost:8000/mcp/`.

Then in Pi:

```
/reload
/graph
```

`/graph setup` is optional after the script. If you still run the wizard, choose **existing MCP server** and `http://localhost:8000/mcp/`. The wizard's 8431 default is wrong for this compose.

Pi's xAI OAuth token is **not** an OpenAI embedder key. Do not paste it into compose.

Status later:

```bash
bash scripts/setup-graphiti.sh --status
```

## Daily use

- Project decisions → default `graph` add / ingest (project scope)
- Tastes, audience, cross-project lessons → `scope: "global"`
- Search defaults to `both`
- `/graph dump` for backup
- `/graph uninstall` only tears down a stack **the wizard started**

## Hard no

- No HOME/Downloads memory allowlist
- No raw secrets, tokens, or private keys in episodes
- No using graph search as approval / merge / budget authority
- No starting the MCP container without an LLM+embedder endpoint

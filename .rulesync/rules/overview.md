---
root: true
targets: ["*"]
description: Canonical always-on rules for this dotfiles repository
---

# Delta Tools / dotfiles

This repository is the shared home for personal tooling, AI resources, skills, scripts, and related automation.

## AI rule governance

- Treat `rulesync.jsonc` and `.rulesync/**` as the canonical source of truth for always-on AI rule configuration.
- Do not manually edit generated files such as `AGENTS.md`. Regenerate them from Rulesync instead.
- `agents-shared/.agents` remains the canonical source for reusable skills, agents, adapters, and scripts. Rulesync does not own those resources.

## Ownership split

| Concern | Owner |
|---|---|
| Always-on generated rules (`AGENTS.md`) | `rulesync.jsonc` + `.rulesync/**` |
| Reusable AI resources (skills, adapters, scripts) | `agents-shared/.agents/**` |

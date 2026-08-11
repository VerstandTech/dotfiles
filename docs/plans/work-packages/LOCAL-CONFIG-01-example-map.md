# LOCAL-CONFIG-01 Example Map

## Story

Curate the approved dirty Codex, Pi, and zsh preferences so stable operator intent is versioned while volatile machine state, broad trust additions, secret-bearing helpers, and shell-startup regressions are excluded.

## Rules

### R1 — Codex keeps stable preferences, not incidental authority or runtime state
- Keep xhigh reasoning, hooks, queued follow-ups, current ChatGPT Node REPL paths, and explicitly enabled plugins.
- Do not version newly observed project trust entries, hook approval hashes, shell capability injection, marketplace refresh metadata, or the disabled computer-use server.

Examples:
1. Codex hooks and xhigh reasoning remain enabled after checkout.
2. The Node REPL resolves through the installed ChatGPT application rather than the absent Codex application.
3. Downloads and dated scratch-project trust entries are not added.
4. Hook trusted hashes are not committed.

### R2 — Pi keeps the deliberate thinking preference only
- Keep `defaultThinkingLevel: medium`.
- Do not include the observed changelog-marker update in the curated diff.

Examples:
5. New Pi sessions default to medium thinking.
6. The PR does not change `lastChangelogVersion`.

### R3 — zsh keeps deterministic tool access without startup regression
- Prefer Homebrew Python 3.12 when installed.
- Preserve lazy NVM loading; do not eagerly run `nvm use default` in every shell.

Examples:
7. `python3` resolves to Homebrew 3.12 on this host.
8. zsh remains syntactically valid and avoids the measured ~0.84-second eager-NVM regression.

### R4 — token-generating aliases are not versioned
- Remove the alias that expands `cloudflared tunnel token` into a command line.

Examples:
9. No tracked zsh alias obtains or embeds the Megazord tunnel token.

## Questions

1. Should Codex marketplace timestamps and trusted hashes move to a machine-local ignored state file if the application gains overlay support?
2. Should a later host package replace NVM shell sourcing with a version-manager-neutral Node shim?

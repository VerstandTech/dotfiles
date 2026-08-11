# HOST-01 Example Map — Reproducible Herdr package and Pi integration

## Story

As a trusted local operator on macOS or Ubuntu, I want Herdr installed, configured, stowed, validated, and integrated with Pi through one repeatable dotfiles flow so that WezTerm → Herdr → Pi starts from an explicit supported state instead of machine-local drift.

## Scope and ownership

- Package: `HOST-01`
- Owned production paths: `herdr/.config/herdr/config.toml`, `Brewfile`, `install.sh`, and Herdr installation/rollback documentation.
- Focused validation command: `cd pi && bun test tests/herdr-bootstrap.test.ts`.
- Supported runtime inherited from CMP-01: Herdr `0.8.x`; observed operator runtime is `0.8.0`.
- Approved writer workspace: `/Users/leonardoribeiro/worktrees/dotfiles-host01` on `feat/pi-herdr-host01`, one parent writer.

## Rules

### R1 — Herdr is an explicit cross-platform dependency

- macOS declares the official Homebrew `herdr` formula in `Brewfile`.
- Ubuntu never reports success when `herdr` is absent.
- Because automatic `curl | sh` execution is a supply-chain decision owned by SEC-01, Ubuntu fails closed with the exact official action: `curl -fsSL https://herdr.dev/install.sh | sh`.

Examples:
1. macOS `brew bundle` includes Herdr and a subsequent binary check succeeds.
2. Ubuntu with Herdr already on `PATH` continues without network installation.
3. Ubuntu without Herdr exits non-zero and prints the exact official installation action.
4. An unsupported OS exits the Herdr bootstrap with an explicit unsupported-platform diagnostic.

### R2 — CMP-01 remains version authority

- HOST-01 accepts only the already-approved Herdr `0.8.x` runtime family.
- Missing, malformed, older, or newer versions fail before integration mutation.
- HOST-01 does not invent a second version policy or use the nonexistent `herdr protocol-version` command.

Examples:
5. `herdr 0.8.0` and `herdr 0.8.9` pass the host version check.
6. `herdr 0.7.5`, `herdr 0.9.0`, malformed output, or exit 126/127 fails with an actionable version diagnostic.

### R3 — Herdr configuration is a first-class Stow package

- `herdr` is included in the installer package list.
- The package owns only `~/.config/herdr/config.toml`; runtime logs, sockets, release notes, and session state stay machine-local.
- Existing foreign configuration is backed up by the installer's established conflict policy before Stow takes ownership.

Examples:
7. First install backs up a real pre-existing `config.toml`, then links the tracked file.
8. Re-running Stow leaves the same repository-owned link in place without a second backup.
9. `herdr-client.log`, `herdr-server.log`, sockets, `session.json`, and release metadata remain untracked and untouched.

### R4 — Defaults are conservative and operator-visible

The tracked Herdr 0.8 configuration must validate and use:

- onboarding disabled after the operator has chosen defaults;
- expanded compact-capable sidebar with bounded width (`18..36`, preferred `26`);
- in-app Herdr toasts only, delayed one second;
- sound disabled;
- automatic agent resume disabled until ISO-01/ROLE-01 writer leases and recovery policy are enforced;
- redraw on terminal focus enabled.

Examples:
10. `HERDR_CONFIG_PATH=<tracked-config> herdr config check` exits zero.
11. Background completion produces an in-app toast, not an OS/terminal notification or sound.
12. Restarting Herdr does not silently resume agent writers.
13. No token, credential, absolute personal worktree, or machine-local runtime path appears in the tracked config.

### R5 — Pi integration is validated, repaired once, and revalidated

- After packages are stowed and the Pi personal link exists, the installer runs `herdr config check` against the canonical stowed path, ignoring inherited `HERDR_CONFIG_PATH` overrides.
- Config validation, status, and integration repair all use that same canonical path.
- It reads `herdr integration status` and treats only an exact `pi: current ...` line as current.
- If Pi is missing or outdated, it runs `herdr integration install pi` once, then rechecks status.
- A failed install or non-current post-status is fatal; warnings cannot rehabilitate false success.

Examples:
14. Current Pi integration performs zero install calls and succeeds.
15. Missing Pi integration performs exactly one install, becomes current, and succeeds.
16. Outdated Pi integration performs exactly one repair, becomes current, and succeeds.
17. Install exit non-zero or post-status still missing/outdated fails the installer.
18. Re-running the full bootstrap after success performs no additional integration mutation.
19. An inherited hostile `HERDR_CONFIG_PATH` is ignored in favor of `~/.config/herdr/config.toml`.

### R6 — Hermetic tests own deterministic truth

- Tests inject a fake Herdr executable and isolated HOME/PATH/config state.
- Tests do not run Homebrew, apt, Stow against the real home, network installers, live integration mutation, server stop, or session restart.
- Fixture state records call count and status transitions so false success and non-idempotence are observable.

Examples:
20. An injected absent/current/install-status fixture fails the locked test before production changes.
21. The green fixture proves exact call order: version → config check → status → optional install → status.
22. A surviving mutant that accepts missing status, skips recheck, or installs twice fails the same focused suite.

### R7 — Live operator acceptance is separate from the hermetic gate

- After hermetic green and human confirmation, the operator may run the real installer on the first MacBook.
- Live acceptance records `herdr config check` and `herdr integration status`; it does not stop/restart the current Herdr server automatically.
- Pi and zsh are reloaded explicitly after Stow.

Examples:
23. The existing Herdr `0.8.0` config validates before and after Stow.
24. Live status changes from `pi: not installed` to `pi: current` without touching unrelated integrations.
25. Re-running the installer preserves current integration and produces no duplicate hook.

### R8 — Rollback is documented but never automatic

- Removing Herdr from Stow/package ownership and restoring the prior config is reversible.
- `herdr integration uninstall pi` requires separate human confirmation because it mutates machine-local integration state.
- Rollback never deletes logs, sockets, sessions, or unrelated integration hooks.

Examples:
26. Documentation distinguishes repository rollback from machine-local integration uninstall.
27. No test or installer path invokes `herdr integration uninstall pi`.

## Questions and decisions

1. **Should Ubuntu execute the official `curl | sh` installer automatically?** No for HOST-01. Emit the exact official action and fail closed; SEC-01 owns stronger supply-chain policy.
2. **Should Herdr auto-resume agents after server restart?** No until ISO-01 and ROLE-01 enforce leases and recovery authority.
3. **Which notification channel is safe by default?** In-app Herdr toast only; sound, terminal, and OS delivery stay disabled.
4. **Should HOST-01 restart a running Herdr server after config changes?** No. Reload/restart is explicit operator acceptance because stopping can terminate pane processes.
5. **How is protocol compatibility checked?** Through CMP-01's approved `0.8.x` version/fixture policy and existing status provenance, not a nonexistent CLI subcommand.
6. **Should Pi integration uninstall be part of rollback automation?** No; document the exact command but require separate human confirmation.
7. **Can product-code fleets run after HOST-01?** No. Product-code fleet execution remains blocked until SEC-01/G7.

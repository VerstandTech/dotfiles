# Herdr installation and rollback

Herdr is the durable terminal/session layer for the local WezTerm → Herdr → Pi workflow. HOST-01 supports the CMP-01-approved Herdr `0.8.x` runtime family.

## Install

Run the repository installer:

```sh
cd ~/dotfiles
./install.sh
```

On macOS, `Brewfile` declares the official `herdr` formula. On Ubuntu, HOST-01 does not execute a remote installer automatically. If Herdr is absent, the installer fails closed and prints the official action:

```sh
curl -fsSL https://herdr.dev/install.sh | sh
```

Review and run that action explicitly, then rerun `./install.sh`.

The installer:

1. verifies that `herdr --version` is in the supported `0.8.x` family;
2. stows `herdr/.config/herdr/config.toml` into `~/.config/herdr/config.toml` while preserving the existing conflict-backup policy;
3. runs `herdr config check`;
4. checks `herdr integration status` and installs or refreshes only the Pi integration when necessary;
5. rechecks that Pi reports `current` before reporting success.

The tracked package owns only `config.toml`. Logs, sockets, release metadata, and session state remain machine-local.

After installation, open a new shell and run `/reload` in Pi. HOST-01 never stops or restarts a running Herdr server automatically because doing so can terminate pane processes.

## Verify

```sh
herdr --version
herdr config check
herdr integration status
```

Expected results include Herdr `0.8.x`, `config: ok`, and a `pi: current` integration line. Re-running `./install.sh` must leave an already-current integration unchanged.

## Rollback

Repository rollback and machine-local integration removal are separate operations:

1. Revert the HOST-01 dotfiles commit, restow the previous packages, and restore the installer-created config backup if needed.
2. Preserve `~/.config/herdr` logs, sockets, release metadata, and sessions.
3. Only with separate **human confirmation**, remove the generated Pi integration:

   ```sh
   herdr integration uninstall pi
   ```

The installer never invokes that uninstall command automatically and never removes unrelated Herdr integrations.

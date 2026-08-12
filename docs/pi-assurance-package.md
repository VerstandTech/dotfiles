# Pi assurance package operations

PKG-01 freezes and validates the personal Pi assurance package and shared AI-resource links already approved by the compatibility work. Herdr host installation remains governed by the separate HOST packages. PKG-01 does not choose or install dependency versions, mint trust or approval, execute cleanup, merge branches, or overwrite user-owned state.

## Frozen compatibility pins

The canonical package declaration is `agents-shared/.agents/manifest.json`. Its `packages.piPersonal` entry binds:

- Pi `0.84.1`
- pi-subagents `0.45.2`
- context-mode `1.0.169`
- Rulesync `16.9.1`
- the version from `agents-shared/.agents/adapters/pi/personal/package.json`

`verify-ai-resources.py` fails closed on missing package metadata, pin drift, version drift, or an unsafe package path. Packaging applies these pins; upgrades remain separate human-reviewed work.

## Temporary-HOME validation

Automated deployed-resource acceptance always uses a newly created empty directory and never targets the process HOME:

```bash
stage_home="$(mktemp -d)"
host="$(case "$(uname -s)" in Darwin) echo macos ;; Linux) echo ubuntu ;; *) echo unsupported ;; esac)"
HOME="$PWD" python3 scripts/stage-ai-resources.py --repo "$PWD" --home "$stage_home" --host "$host"
python3 agents-shared/.agents/scripts/verify-ai-resources.py \
  --repo "$PWD" \
  --home "$stage_home"
rm -rf -- "$stage_home"
```

The staging command refuses the process HOME, a non-empty directory, missing resources, or a source outside the repository. It performs no network access and installs no dependency.

## Existing-machine migration

1. Pull and review the exact repository revision and frozen package manifest.
2. Run repository-only validation:
   `python3 agents-shared/.agents/scripts/verify-ai-resources.py --repo "$PWD"`.
3. Run the temporary-HOME validation above.
4. Inspect conflicts under `~/.pi/agent/personal`, `~/.agents/skills`, and other managed targets.
5. Treat `./install.sh` as a legacy network bootstrap, not as PKG-01's high-assurance migration executor. It may install tools and mutate the real HOME; review it separately and do not infer package-fingerprint approval from it.
6. Apply managed links only through an operator-reviewed, transaction-recorded Stow action after preserving every conflict; PKG-01 intentionally supplies planning and validation rather than an automatic real-HOME executor.
7. Run deployed validation against the real HOME only as an explicit operator action:
   `python3 agents-shared/.agents/scripts/verify-ai-resources.py --repo "$PWD" --home "$HOME"`.

Rulesync-generated outputs are regenerated from `rulesync.jsonc` and `.rulesync/**`; they are not edited as source. Machine-local approvals, capabilities, sessions, secrets, and trust decisions are not migrated as package authority.

## Disable

Disable is deliberately manual and link-scoped:

1. Record the exact package manifest fingerprint and target list.
2. Confirm each target is still a symlink resolving inside this repository.
3. Remove only those verified managed links.
4. Retain foreign files, backups, runtimes, repositories, branches, worktrees, and sessions.
5. Re-run deployed verification and expect missing managed resources while disabled.

Disabling the package does not uninstall Pi, Herdr, shared runtimes, dependencies, or user-owned resources. Re-enable by re-running the approved install with the same frozen manifest.

## Rollback

The pure rollback planner is scoped to one recorded install transaction:

- remove only links created by that transaction and still owned by it;
- restore only backups recorded by that transaction;
- stop when transaction identity, ownership, completion evidence, or backup identity is missing;
- never reset Git, merge or push a branch, delete unrelated paths, or remove another worktree.

If installation is interrupted, preserve the backup directory and classify the state as `recovery-required`. Re-run repository and temporary-HOME validation before deciding whether to resume or roll back. Post-merge repository cleanup remains governed by the cleanup-lock driver, not this package.

## Stable failure codes

Package planning and staging use bounded non-echoing codes:

- `invalid-package-input`
- `pin-mismatch`
- `unsafe-link`
- `staging-required`
- `PKG-01 staging blocked: real-home-refused`
- `PKG-01 staging blocked: home-not-empty`
- `PKG-01 staging blocked: missing-resources`
- `PKG-01 staging blocked: unsafe-source`
- `PKG-01 staging blocked: staging-failed`
- `PKG01_PACKAGE_MANIFEST_MISSING: missing-package`
- `PKG01_PACKAGE_MANIFEST_MISSING: pin-mismatch`
- `PKG01_PACKAGE_MANIFEST_MISSING: version-mismatch`
- `PKG01_PACKAGE_MANIFEST_MISSING: unsafe-path`

Arbitrary OS, provider, input, or dependency messages are not package authority.

## CLOSE-01 live acceptance and review fleet

Cross-machine install, selected-product adoption, live disable/rollback/restow, and the post-E2E three-person review fleet remain planner-only until a named human approval and current backend/security evidence exist. Missing approval is `operator-approval-required`. Lost historical OPS-01 red/green stay `missing`; they are never invented. Tests and planners must not mutate this machine's real HOME.

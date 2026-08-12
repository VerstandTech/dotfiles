# PKG-01 Example Map — Reproducible packaging, migration, disable, and rollback

## Story
As a dotfiles operator moving the frozen Pi/Herdr assurance stack between machines, I want deterministic staged validation, conflict-safe installation, explicit disable/rollback, and truthful package metadata so approved resources install reproducibly without overwriting user-owned state or inventing dependency versions.

## Personas
- Leo — operator installing on a new or existing machine.
- Maya — platform approver reviewing exact pins and staged manifests.
- Nikhil — security reviewer requiring no ambient trust or unsafe link traversal.
- Sofia — engineer with dirty local configuration needing recovery, not overwrite.
- André — package maintainer preserving Rulesync/Stow ownership and cross-machine compatibility.

## Rules and examples

### R1 — Frozen pins are applied, never chosen
- E1: package metadata matches the approved CMP-01 pin set.
- E2: missing approved pin blocks packaging.
- E3: changed pin blocks packaging.
- E4: unapproved dependency blocks packaging.
- E5: package step never resolves latest versions.
- E6: no network install occurs during validation.

### R2 — Manifest is closed and deterministic
- E7: same inputs yield identical canonical manifest.
- E8: manifest binds package version, resource paths, hashes, and target roots.
- E9: unknown fields are rejected.
- E10: duplicate resource paths are rejected.
- E11: unsorted input canonicalizes deterministically.
- E12: manifest output is deeply frozen.

### R3 — Staging precedes deployment
- E13: verifier runs against a temporary HOME.
- E14: staged resources are complete before touching real HOME.
- E15: staged manifest mismatch blocks deployment.
- E16: staged symlink escape blocks deployment.
- E17: staged missing package blocks deployment.
- E18: real HOME remains unchanged on staging failure.

### R4 — User-owned dirty state is preserved
- E19: real file conflict is backed up before managed link.
- E20: foreign symlink is backed up.
- E21: dotfiles-owned correct link is reused.
- E22: dotfiles-owned stale link is replaced after verification.
- E23: dirty tracked local preference is not overwritten silently.
- E24: backup location is reported deterministically.

### R5 — Link ownership is exact
- E25: managed links resolve within repository roots.
- E26: escaped links are rejected.
- E27: multi-hop links are resolved safely.
- E28: broken links are rejected or repaired from manifest.
- E29: generated files are not edited as source.
- E30: reusable resources originate under agents-shared/.agents.

### R6 — Installation is idempotent
- E31: first install creates expected links.
- E32: second install produces no semantic drift.
- E33: repeated validation yields same report.
- E34: existing correct Herdr/Pi integration stays current.
- E35: no duplicate package registration occurs.
- E36: no duplicate extension/poller registration occurs.

### R7 — Disable is explicit and reversible
- E37: disable plan lists exact managed links only.
- E38: disable never deletes user files.
- E39: disable never deletes backups.
- E40: disable does not uninstall shared runtimes automatically.
- E41: disabled state verifies no active package links remain.
- E42: re-enable uses the same frozen manifest.

### R8 — Rollback is scoped to one install transaction
- E43: rollback restores backed-up conflicts.
- E44: rollback removes only links created by that transaction.
- E45: rollback refuses mismatched transaction identity.
- E46: rollback stops on unknown ownership.
- E47: rollback report distinguishes restored, retained, and blocked.
- E48: rollback never merges, resets Git, or deletes unrelated worktrees.

### R9 — Migration from legacy layouts is conservative
- E49: legacy Pi personal directory is backed up before link replacement.
- E50: canonical shared resource link is created after validation.
- E51: stale canonical skills are pruned only when dotfiles-owned.
- E52: foreign skill directories are retained.
- E53: legacy generated config is regenerated from Rulesync source.
- E54: migration can be dry-run.

### R10 — Verification covers repository and deployed state
- E55: repository manifest validates all canonical resources.
- E56: deployed HOME validates link targets.
- E57: missing deployed resources fail.
- E58: unexpected managed-name collisions fail.
- E59: rules and Grok/Pi configuration validate.
- E60: report is stable and non-echoing.

### R11 — Errors use stable codes
- E61: invalid manifest returns invalid-manifest.
- E62: pin mismatch returns pin-mismatch.
- E63: staging failure returns staging-failed.
- E64: conflict backup failure returns backup-failed.
- E65: escaped link returns unsafe-link.
- E66: arbitrary OS/provider messages are absent.

### R12 — Package plan is pure
- E67: planning reads no ambient files/env/network/process/clock.
- E68: repository/home facts are injected.
- E69: planning executes no install.
- E70: planning returns exact argv descriptors only when safe.
- E71: hostile getters/proxies yield stable refusal.
- E72: outputs are bounded and frozen.

### R13 — Installation execution remains human-controlled
- E73: planner cannot write HOME.
- E74: human approval binds exact manifest fingerprint.
- E75: changed manifest invalidates approval.
- E76: headless missing approval blocks execution.
- E77: project files cannot self-approve.
- E78: install never auto-merges or pushes.

### R14 — Deferred fleet budget wiring is serialized
- E79: fleet dispatch consults BUD-01 before RPC spawn.
- E80: strict/overnight unknown usage blocks spawn.
- E81: hard exceed blocks spawn and sets circuit-broken only there.
- E82: high count requires external confirmation.
- E83: interactive within budget remains compatible.
- E84: no second budget authority is introduced.

### R15 — Package entry points remain thin
- E85: install.sh composes validated helpers.
- E86: verifier owns resource checks.
- E87: pure package library owns planning/fingerprinting.
- E88: Rulesync source owns generated rules.
- E89: Pi package metadata owns extension/skill discovery.
- E90: docs describe operator decisions, not hidden code paths.

### R16 — Cross-machine behavior is explicit
- E91: macOS and Ubuntu supported paths are documented.
- E92: unsupported OS blocks with stable code.
- E93: machine-local trust/approval/capabilities are not packaged as authority.
- E94: HOME-specific absolute paths are absent from manifest.
- E95: optional tools report unavailable without false failure.
- E96: no remote install script is piped to shell.

### R17 — Acceptance includes disable and recovery
- E97: staged install then verify passes.
- E98: inconsistent staged manifest fails.
- E99: dirty user state creates backup and preserves bytes.
- E100: disable removes managed links only.
- E101: rollback restores exact conflict bytes.
- E102: interrupted install remains recovery-required.

### R18 — Mutations prove packaging gates
- E103: skip staging mutation fails.
- E104: accept pin drift mutation fails.
- E105: overwrite dirty file mutation fails.
- E106: escaped symlink mutation fails.
- E107: unknown fleet usage spawn mutation fails.
- E108: disable deletes foreign file mutation fails.

## Resolved questions
- Q1: Does PKG choose versions? No, CMP-01 owns pins.
- Q2: Does validation install dependencies? No.
- Q3: Is real HOME used in automated tests? No, temporary HOME only.
- Q4: Can installer overwrite dirty state? No, backup or block.
- Q5: Who owns generated rules? Rulesync sources.
- Q6: Are machine-local approvals packaged? No.
- Q7: Does disable uninstall Herdr/Pi? No, only managed integration links.
- Q8: Can rollback delete unrelated files? No.
- Q9: Are absolute HOME paths in manifests? No.
- Q10: Does package plan execute? No.
- Q11: Is install human-approved? Yes, exact fingerprint.
- Q12: What if staged verifier fails? Real HOME remains untouched.
- Q13: What if backup fails? Installation stops.
- Q14: Are foreign symlinks trusted? No, preserve then replace only with approval.
- Q15: Can stale dotfiles-owned links be pruned? Yes, when exact ownership is proven.
- Q16: Does PKG add a second budget FSM? No, it wires BUD-01.
- Q17: Unknown usage in strict mode? Spawn blocked.
- Q18: Missing optional tool? Explicit unavailable.
- Q19: Unsupported OS? Stable blocked result.
- Q20: Network allowed in verifier? No.
- Q21: Dry-run supported? Yes.
- Q22: Transaction identity required for rollback? Yes.
- Q23: Causal red? `PKG01_PACKAGE_PLAN_MISSING`.
- Q24: Required mutations? pin drift, staging bypass, dirty overwrite, unsafe link, unknown-budget spawn.

## Out of scope
- Choosing/upgrading dependency versions.
- Installing packages during automated tests.
- Packaging machine-local approvals, trust capabilities, session state, or secrets.
- Automatic merge, push, PR creation, runtime uninstall, or destructive cleanup.

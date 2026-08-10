# SEC-00 Final Security Fixer Contract

- **Objective:** make the two final locked security regressions green with the smallest fail-closed change.
- **Owned worktree:** `/Users/leonardoribeiro/worktrees/dotfiles-sec00-final-fix` on `feat/pi-herdr-sec00-final-fix`.
- **Owned production path only:** `agents-shared/.agents/adapters/pi/personal/lib/fleet/child-policy.ts`.
- **Read-only:** all tests/features/maps/contracts/reviews and other production.
- **Forbidden:** every other path, installs, merge/push/cleanup, delegation/fleets/live RPC/network.
- **Model:** `xai/grok-4.5`, high; 240000 ms; one focused follow-up maximum.

Required behavior:

1. Deny a benign-name hardlinked regular file that aliases `.env.local`, `.npmrc`, or other secret material. Prefer a simple fail-closed inode/link-count rule over an incomplete secret graph; preserve ordinary in-cwd source reads and existing auth hardlink behavior.
2. Extend preflight input with deterministic `installedPolicyExtensionPath?: string`. If supplied, require that exact path. Otherwise require the expanded agent-declared `CHILD_POLICY_EXTENSION` path; local `import.meta.dir` source existence must not satisfy a missing installed path. Keep existing boolean injection compatibility if locked tests still use it.

Run focused, fleet, and full personal suites. Commit only the owned file. End `SEC00 FINAL SECURITY FIX COMPLETE` with SHA/results/residuals.

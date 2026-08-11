# SEC-00 Final Security Regression Test Contract

- **Objective:** lock the two remaining independent security P1s before final SEC-00 handoff.
- **Owned worktree:** `/Users/leonardoribeiro/worktrees/dotfiles-sec00-final-tests` on `feat/pi-herdr-sec00-final-tests`.
- **Owned paths only:** `lib/fleet/child-policy.test.ts` and `docs/plans/work-packages/SEC-00.feature`.
- **Forbidden:** production, other tests/docs/config/package/locks/generated files, installs, merge/push/cleanup, delegation/fleets/live RPC/network.
- **Model:** `xai/grok-4.5`, high; 240000 ms; no follow-up.

Add two assertion-based regressions:

1. A benign-name hardlink inside cwd to an in-cwd `.env.local` (and, if practical, another known secret file) is denied even though realpath/basename look benign. This must not rely only on the existing auth.json inode special case.
2. Production preflight validates the extension path agents will actually load. Add a deterministic path/dependency input (for example `installedPolicyExtensionPath`) so a missing injected installed path returns `missing-policy` even while the module source itself exists, and an existing injected policy path permits the otherwise-clean exact `{ok:true}` path. The default remains the expanded `CHILD_POLICY_EXTENSION` path.

Update the feature succinctly. Focused command:

```bash
cd agents-shared/.agents/adapters/pi/personal && bun test lib/fleet/child-policy.test.ts
```

Expected red ids/signatures mention `benign hardlink to .env.local` and `missing installed policy path must not be satisfied by module source`; no setup/import failures. Commit only owned files and end `SEC00 FINAL SECURITY TEST COMPLETE` with SHA/red evidence.

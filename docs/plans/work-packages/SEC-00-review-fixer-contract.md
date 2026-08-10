# SEC-00 Review Remediation Implementer Contract

- **Objective:** clear every locked SEC-00 adversarial review regression without weakening tests or broadening into SEC-01.
- **Owned worktree:** `/Users/leonardoribeiro/worktrees/dotfiles-sec00-review-fix` on `feat/pi-herdr-sec00-review-fix`.
- **Owned production paths only:**
  - `agents-shared/.agents/adapters/pi/personal/lib/fleet/child-policy.ts`
  - `agents-shared/.agents/adapters/pi/personal/lib/fleet/plan.ts`
  - `agents-shared/.agents/adapters/pi/personal/lib/fleet/personas.ts`
  - the three `agents/fleet-*.md` files only if the locked exact contract proves current frontmatter wrong
- **Read-only:** all tests/features/maps/contracts/reviews, `extensions/agentic-fleet.ts`, installed Pi/pi-subagents source.
- **Forbidden:** tests/docs/agentic-fleet/config/package/locks/generated paths; installs; merge/push/cleanup; delegation/subagents/fleets/live RPC/model/network.
- **Model:** `xai/grok-4.5`, thinking high; 480000 ms; at most two focused follow-ups.

## Required fixes

1. Match Pi 0.84 path semantics before policy resolution: trim/Unicode spaces, strip leading `@`, decode local `file://`, expand tilde, then lexical+realpath containment. Secret names and auth path checks are case-insensitive. Deny a hardlinked secret inode and fix repeated-segment realpath reconstruction.
2. Make the default child extension mechanically testable and correct: ack once, sanitize before tool work, normalize tool names, default missing/empty grep/find/ls path to `.`, keep missing read denied, and preserve role/network/mutation/default-deny behavior.
3. Enforce exact canonical tool and extension sets. Researcher is exactly policy+xAI; reviewer/UX exactly policy. Permissions follow pi-subagents 0.45.2: deny write/edit/apply_patch/subagent/notebook_edit; no `permissions.bash`.
4. Expand fixed pre-start rejection with `PI_SUBAGENT_PI_BINARY`, `NODE_PATH`, `BUN_OPTIONS` and locked loader keys. Secret-shaped `PI_SUBAGENT_*` must be removed before broad control-prefix allowance.
5. Make preflight validate the installed extension path and accept the locked deterministic `installedPolicyExtensionExists` injection. Clean known-good input must return exactly `{ok:true}`.
6. Ensure every generated plan is contained: local-scout and custom fallback use canonical fleet agents; explicit noncanonical override throws before WorkflowScript generation. Keep `agentScope:"user"` and CMP-02 shape.
7. Audit tool/action names are lowercase; records remain bounded and redacted. Do not implement RED-01 general persistence.

## Validation

```bash
cd agents-shared/.agents/adapters/pi/personal
bun test lib/fleet/child-policy.test.ts lib/fleet/plan.test.ts lib/fleet/personas.test.ts
bun test lib/fleet lib/bdd/fleet-gate.test.ts
bun test lib
```

No live fleet. Commit only owned production paths. End `SEC00 REVIEW FIX COMPLETE` with SHA, paths, exact results, residual SEC-01 risks, and any locked behavior that could not be made green.

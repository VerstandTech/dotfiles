# SEC-00 Implementer Contract

- **Objective:** implement the minimum primary containment behavior locked by SEC-00 tests; leave the serialized parent-owned `agentic-fleet.ts` call-site seam untouched.
- **Owned worktree:** `/Users/leonardoribeiro/worktrees/dotfiles-sec00-implementer` on `feat/pi-herdr-sec00-implementer`.
- **Owned production paths only:**
  - `agents-shared/.agents/adapters/pi/personal/lib/fleet/child-policy.ts`
  - `agents-shared/.agents/adapters/pi/personal/agents/fleet-researcher.md`
  - `agents-shared/.agents/adapters/pi/personal/agents/fleet-reviewer.md`
  - `agents-shared/.agents/adapters/pi/personal/agents/fleet-ux.md`
  - `agents-shared/.agents/adapters/pi/personal/lib/fleet/plan.ts`
  - `agents-shared/.agents/adapters/pi/personal/lib/fleet/public-execution-0.45.2.fixture.ts` only if required for the additive `agentScope:"user"` public type.
- **Read-only:** `lib/fleet/child-policy.test.ts`, `SEC-00.feature`, Example Map, existing fleet/BDD tests, installed Pi/pi-subagents source/docs.
- **Forbidden:** `extensions/agentic-fleet.ts` (parent integration owner), all tests/docs/config/package/locks/generated files, installs, merge/push/cleanup, delegation/subagents/fleets, and live child/RPC/model execution.
- **Model:** `xai/grok-4.5`, thinking high; wall timeout 420000 ms; at most two focused follow-ups.

## Required implementation

1. Implement every pure export/API locked in `child-policy.test.ts`, plus the default Pi child extension hook:
   - exact acknowledgement id `fleet-child-policy-v1` via `subagent:acknowledge-extension`;
   - sanitize `process.env` immediately when the extension registers, before child model/tool work;
   - block undeclared/mutation/shell/network/read-like path violations in `tool_call`;
   - canonical cwd/realpath + secret-path checks;
   - bounded mode-0600 redacted JSONL audit through `PI_SUBAGENT_PERMISSION_AUDIT_PATH` when present;
   - fail-closed preflight for canonical agents, `agentScope:"user"`, dangerous pre-start env, and definition drift.
2. Harden all three fleet agent frontmatters mechanically: no bash/mutation/subagent/generic egress, fresh read-only context, `maxSubagentDepth: 0`, exact explicit `extensions` so ambient extensions are disabled, mutation-deny permissions, policy extension for every role, xAI extension/tool only for researcher, and no default checkout output.
3. Add `agentScope:"user"` to `FleetSubagentParams` and every built plan. Preserve WorkflowScript-only CMP-02 shape and all path/batching behavior.
4. Do not claim OS sandboxing or pre-spawn environment replacement; dangerous loader/startup env must block preflight and SEC-01 remains the stronger boundary.
5. Never include raw env values, topic/task text, credentials, or bearer strings in denial records.

## Validation

Run:

```bash
cd agents-shared/.agents/adapters/pi/personal
bun test lib/fleet/child-policy.test.ts
bun test lib/fleet lib/bdd/fleet-gate.test.ts
```

The focused suite is expected to retain only the parent-owned `agentic-fleet.ts` call-site failure; if additional failures remain, fix only owned production. Do not weaken locked tests. Commit only owned paths and finish `SEC00 PRIMARY IMPLEMENTATION COMPLETE` with SHA, paths, commands, exact remaining parent seam if any, and residual risks.

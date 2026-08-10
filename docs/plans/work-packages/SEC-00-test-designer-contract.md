# SEC-00 Test Designer Contract

- **Objective:** formulate and lock the deterministic red for minimum fleet containment before any live Grok dispatch.
- **Owned worktree:** `/Users/leonardoribeiro/worktrees/dotfiles-sec00-tests` on `feat/pi-herdr-sec00-tests`.
- **Owned paths only:**
  - `docs/plans/work-packages/SEC-00.feature`
  - `agents-shared/.agents/adapters/pi/personal/lib/fleet/child-policy.test.ts`
- **Read-only references:** `SEC-00-example-map.md`, `lib/fleet/{plan,public-execution-0.45.2.fixture}.ts`, `extensions/agentic-fleet.ts`, `agents/fleet-*.md`, installed pi-subagents 0.45.2 source/docs, and existing fleet tests.
- **Forbidden:** every production/config/package/lock/generated path; all other tests/docs; installs; merge/push/cleanup; delegation, subagents, or fleets; any live RPC/fleet/model child.
- **Model:** `xai/grok-4.5`, thinking high; wall timeout 300000 ms; at most one focused follow-up.

## Locked behavior

Translate R1–R12/E1–E35 into concise Gherkin and a single focused Bun contract test. The test must cover:

1. Canonical agent definitions contain no `bash`, mutation, generic network, or `subagent` tools; set `maxSubagentDepth: 0`, read-only permission defense, exact explicit extensions, fresh context, and no default checkout output.
2. Researcher alone may expose `xai_web_search`; reviewer/UX may not expose any network tool.
3. Read/grep/find/ls are cwd-confined after lexical + realpath resolution and reject auth/secret/pseudo-filesystem/symlink escapes.
4. Environment sanitization removes synthetic secret/provider/proxy/auth-path/loader values while retaining minimum Pi child coordination and ordinary runtime keys. Secret values never enter outputs/audits.
5. Blocked attempts produce bounded redacted mode-0600 JSONL metadata.
6. Uncontained/custom agents, missing `agentScope:"user"`, dangerous pre-start env, and agent-contract drift fail before RPC; `agentic-fleet.ts` must call the fail-closed preflight before `callSubagentRpc`.
7. Policy runtime acknowledgement id is `fleet-child-policy-v1`; tests are fixture-only and launch no child.

`child-policy.ts` does not yet exist. Do **not** use a static import that turns red into module/setup failure. Guard dynamic import, convert absence into the named contract assertion, and ensure Bun actually executes assertions. Existing modules may be imported normally. A module-not-found/syntax/setup/timeout/126/127 result is invalid.

## ValidationContractV1

- Focused command: `cd agents-shared/.agents/adapters/pi/personal && bun test lib/fleet/child-policy.test.ts`
- Expected IDs: the five exact IDs under `SEC-00-example-map.md` ValidationContractV1.
- Expected red: assertion failures naming current `bash`/missing policy extension/missing `agentScope` and/or missing child-policy exports. No production edits before this red is independently recorded.
- Green relation: same command, then `bun test lib/fleet lib/bdd/fleet-gate.test.ts`, then root aggregate.
- Sensitivity: reintroducing bash, preserving a synthetic secret, accepting missing scope, or skipping symlink canonicalization must fail.

Commit only the two owned files and finish with `SEC00 TEST DESIGN COMPLETE`, SHA, exact red assertion/signature, changed paths, commands, and residual risks.

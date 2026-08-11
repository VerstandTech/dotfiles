# SEC-00 Review Remediation Test Designer Contract

- **Objective:** lock causal regressions for every accepted SEC-00 review blocker before remediation.
- **Owned worktree:** `/Users/leonardoribeiro/worktrees/dotfiles-sec00-review-tests` on `feat/pi-herdr-sec00-review-tests`.
- **Owned paths only:**
  - `agents-shared/.agents/adapters/pi/personal/lib/fleet/child-policy.test.ts`
  - `agents-shared/.agents/adapters/pi/personal/lib/fleet/plan.test.ts`
  - `agents-shared/.agents/adapters/pi/personal/lib/fleet/personas.test.ts`
  - `docs/plans/work-packages/SEC-00.feature`
- **Forbidden:** production/agent/config/package/lock/generated files; other tests/docs; installs; merge/push/cleanup; delegation/subagents/fleets; live RPC/model/network.
- **Model:** `xai/grok-4.5`, thinking high; wall timeout 420000 ms; one focused follow-up maximum.

## Accepted findings to lock

1. Pi-compatible path normalization: trim/Unicode-space parity, leading `@`, `file://`, tilde, absolute/relative, realpath, case-insensitive secret names on Darwin, repeated path segments, and hardlink-to-secret denial.
2. Runtime extension harness: exact acknowledgement, env sanitization, mutation/network/unknown tool denials, pathless `grep`/`find`/`ls` defaulting to cwd, missing `read` denied, reviewer xAI denied, researcher xAI allowed, outside/secret read-like targets denied.
3. Exact agent contracts: exact tools and exact extensions for all roles; researcher exactly policy + xAI; no extra ambient/network/mutation tool or extension; permission denies are asserted even when forbidden tools are absent.
4. Parent/preflight environment: fixed dangerous set includes `PI_SUBAGENT_PI_BINARY`, `NODE_PATH`, `BUN_OPTIONS` and platform loader/startup keys; secret-shaped `PI_SUBAGENT_*` keys are stripped; clean preflight is exactly `{ok:true}` through injected installed-extension existence; missing installed extension fails closed.
5. Every generated plan is contained: research local-scout uses `fleet-researcher`; count 12 stays canonical; custom fallback is canonical; explicit `worker`/`scout` override is rejected at plan build so `fleet_plan` and RPC-failure payloads cannot emit executable uncontained WorkflowScripts. `agentScope:"user"` is pinned in the existing public payload test.
6. Audit records are bounded and redacted; tool-name matching is case-normalized. Do not broaden into RED-01 general sink work.

Use real Pi 0.84 path semantics from installed `dist/utils/paths.js` and pi-subagents 0.45.2 contracts. Prefer behavior tests over source-slice assertions. If a tiny exported registration helper is needed for a deterministic extension harness, lock its behavior/API without prescribing internal layout.

## ValidationContractV1

- Focused command: `cd agents-shared/.agents/adapters/pi/personal && bun test lib/fleet/child-policy.test.ts lib/fleet/plan.test.ts lib/fleet/personas.test.ts`
- Expected red IDs/signatures must name the accepted behavior (`@`, `file://`, `AUTH.JSON`, hardlink, pathless grep/find, ack, extra extension/tool, `PI_SUBAGENT_PI_BINARY`, missing installed policy, scout/worker override, `agentScope`, bounded audit), not setup/import failures.
- Production stays untouched at the red SHA.
- Covering green is the same command plus `bun test lib/fleet lib/bdd/fleet-gate.test.ts`, full personal, and root aggregate.
- Mutation sensitivity must later prove at least path-alias, env injector, and unsafe-agent reintroduction.

Commit only owned files. End `SEC00 REVIEW TEST DESIGN COMPLETE` with SHA, exact causal reds, paths, commands, and residual risks.

# SEC-00 Example Map — Minimum Fleet Containment

**Focus:** make read-only fleet claims enforceable before any live Grok dispatch.

**Trust boundary:** SEC-00 constrains model-callable fleet capabilities and removes inherited secrets before the first child model/tool turn. It is not an OS sandbox. SEC-01 retains host-process isolation, supply-chain, full egress, and unattended-runtime hardening.

## Rules

### R1 — Enforcement is mechanical
Prompt prose is not a security boundary. Containment must be enforced by strict child tool allowlists, exact extension sets, runtime tool-call guards, sanitized environment state, and dispatch preflight.

- **E1:** Existing `bash` declarations make the current fleet agents uncontained even though their prompts say “no edits.”
- **E2:** Removing only prompt references while leaving `bash` available remains a failure.

### R2 — Only canonical fleet agents may execute
Live fleet plans may use only `fleet-researcher`, `fleet-reviewer`, and `fleet-ux`. Public execution is bound to `agentScope: "user"` so project-local same-name overrides cannot replace the reviewed package agents. Custom or builtin agent overrides remain plan-only and are rejected before RPC spawn.

- **E3:** `agent: "worker"` is rejected as `uncontained-agent` before spawn.
- **E4:** A valid review plan using only `fleet-reviewer` passes containment preflight.
- **E5:** Missing or non-user `agentScope` is rejected as `untrusted-agent-scope`.

### R3 — Fleet children have no mutation or delegation capability
`write`, `edit`, patch/apply, shell/exec/terminal, notebook mutation, and subagent spawning are unavailable. Defense-in-depth permission rules deny mutation tools if a future allowlist drifts. `maxSubagentDepth` is zero.

- **E6:** A review child cannot invoke `write`, `edit`, `bash`, `apply_patch`, or `subagent`.
- **E7:** Reintroducing `bash` or a mutation tool in any fleet agent definition fails the contract test.
- **E8:** Trusted runtime artifact capture under `.pi/fleet-runs/**` is allowed; it is not a model-callable checkout write.

### R4 — Local inspection is repository-confined and secret-aware
`read`, `grep`, `find`, and `ls` may inspect only the child cwd after lexical and canonical path resolution. Absolute paths, `..` escapes, NUL, home-secret paths, pseudo-filesystems, `.env*`, private keys, credential files, and symlink escapes are denied.

- **E9:** Reading `~/.pi/agent/auth.json` is blocked.
- **E10:** A cwd symlink resolving to `~/.pi/agent/auth.json` is blocked.
- **E11:** `grep` rooted at `$HOME` is blocked even if the pattern is benign.
- **E12:** Reading `src/example.ts` inside cwd is allowed.
- **E13:** Reading a repository `.env.local`, `.npmrc`, private key, `/proc/*/environ`, or `/dev/fd/*` is blocked.

### R5 — Child environment is allowlisted before model/tool work
The child policy removes inherited keys except a minimal runtime/control allowlist. Secret/provider tokens, auth-path overrides, proxy/base-URL overrides, cloud credentials, shell startup hooks, and language loader injection variables do not remain model/tool-visible. Reports include key names only, never values.

- **E14:** `GITHUB_TOKEN`, `XAI_API_KEY`, `AWS_SECRET_ACCESS_KEY`, `PI_AUTH_PATH`, and `HTTPS_PROXY` are absent after sanitization.
- **E15:** `PATH`, `HOME`, locale/temp keys, and required `PI_SUBAGENT_*`/`PI_INTERCOM_*` controls remain.
- **E16:** A synthetic secret value appears in neither the sanitized environment result nor audit JSON.
- **E17:** Parent launch preflight rejects pre-start injection variables such as `NODE_OPTIONS`, `BASH_ENV`, `LD_PRELOAD`, or `DYLD_INSERT_LIBRARIES` rather than pretending a post-start delete neutralized them.

### R6 — Egress is explicit and role-specific
Review and UX children have no network-capable tool. Research children may use only `xai_web_search`; they receive no shell, curl, generic fetch, browser, or arbitrary HTTP tool.

- **E18:** `xai_web_search` is allowed for `fleet-researcher` and denied for reviewer/UX.
- **E19:** `curl`, `fetch`, generic web/browser, and shell tool names are denied for every fleet role.
- **E20:** The trusted xAI extension may resolve its own credential, but token bytes are never exposed to the model or audit record.

### R7 — Ambient extensions are disabled
Each fleet agent declares an explicit `extensions` list. All roles load the child-policy extension; only the researcher additionally loads xAI web search. Undeclared ambient/provider extensions do not load.

- **E21:** Reviewer/UX have exactly the policy extension.
- **E22:** Researcher has exactly policy + xAI search extensions.
- **E23:** Missing policy extension or an extra extension fails static contract validation.

### R8 — Blocked attempts are recorded safely
Every runtime denial and parent dispatch-preflight denial emits bounded JSONL metadata with timestamp, agent, run id when available, tool/action, reason code, and redacted argument shape. Audit files use mode 0600. Raw environment values, prompt/task text, credentials, and bearer strings are never persisted.

- **E24:** An auth-read denial appends one `blocked` record without the attempted token value.
- **E25:** A mutation attempt records `mutation-tool-denied`.
- **E26:** A custom-agent dispatch attempt records `uncontained-agent` without storing the fleet topic.

### R9 — Drift fails before spawn
Dispatch preflight validates every plan member, the user-only agent scope, launch environment, and canonical agent definition contract before calling pi-subagents RPC. Failure returns an explicit blocked result and never falls back to an unrestricted child or legacy payload.

- **E27:** A changed agent tool declaration blocks the entire plan before RPC.
- **E28:** A dangerous launch environment blocks the entire plan before RPC.
- **E29:** A blocked dispatch response is distinct from RPC failure and from successful launch.

### R10 — Runtime policy presence is observable
The child extension emits the pi-subagents runtime acknowledgement id `fleet-child-policy-v1`; policy evaluation and audit functions are deterministic and fixture-testable without launching a model.

- **E30:** Runtime acknowledgement uses the documented `subagent:acknowledge-extension` event.
- **E31:** Deterministic tests exercise hooks/helpers only; no live fleet runs during SEC-00 red/green.

### R11 — Rollback fails closed
If containment cannot initialize or validate, live fleet dispatch is disabled and plan-only/mock workflows remain available. No fallback restores bash, mutation, ambient extensions, inherited secrets, or arbitrary egress.

- **E32:** Missing child-policy file blocks dispatch.
- **E33:** Rollback guidance is “disable live fleets,” never “use unrestricted children.”

### R12 — SEC-01 owns the stronger host boundary
SEC-00 does not claim protection from malicious trusted extension code, Pi core/provider code, same-user host processes, or pre-extension process startup. Product-code review fleets, strict/overnight execution, OS sandboxing, broad egress controls, supply-chain gates, and centralized RED-01 sink redaction wait for SEC-01/G7.

- **E34:** A non-secret fixture smoke may be advisory only after SEC-00 is integrated.
- **E35:** Product-code review and unattended execution remain blocked until SEC-01.

## Questions and resolutions

1. **Q1 — Can the current pi-subagents RPC provide a sanitized spawn environment?** No. Version 0.45.2 inherits `process.env` before overlays. SEC-00 therefore removes secrets before model/tool work, rejects known pre-start injection variables before spawn, and states the residual honestly. SEC-01 owns an OS-level/pre-spawn boundary.
2. **Q2 — How can xAI search authenticate after sanitization?** The trusted xAI extension may resolve canonical Pi auth internally. Model-facing file tools cannot read that file, and no token value may enter tool results/audit. If authentication cannot work under the sanitized policy, research dispatch fails closed.
3. **Q3 — Is a shared `agentic-fleet.ts` integration seam required?** Yes. SEC-00 may make one serialized pre-RPC containment call after CMP-02 is green. The integration parent owns this edit; CMP-02 transport regression is mandatory. No concurrent writer may touch the entrypoint.
4. **Q4 — Why add `agentScope: "user"`?** It prevents an untrusted project checkout from shadowing reviewed package fleet agents. The local console/user package remains trusted in v1.
5. **Q5 — Are `.pi/fleet-runs/**` writes forbidden?** Model-callable writes are forbidden. Bounded trusted runtime artifacts in the already gitignored run directory remain allowed and audited by pi-subagents.
6. **Q6 — Is a live Grok smoke part of deterministic green?** No. Tests and mocked transport are required. An advisory non-secret smoke is optional only after SEC-00 integration; product-code review waits for SEC-01.
7. **Q7 — May read-like tools inspect outside cwd?** No. SEC-00 uses repository-confined inspection; web evidence goes through the explicit researcher tool.
8. **Q8 — Does SEC-00 replace RED-01?** No. SEC-00 records only bounded denial metadata and never stores raw values/content. RED-01 remains the mandatory general pre-persistence redaction authority for later sinks.

## ValidationContractV1

- **Package:** `SEC-00`
- **Owner:** fleet-security Test Designer → isolated Implementer → parent integration owner for the serialized `agentic-fleet.ts` seam.
- **Focused command:** `cd agents-shared/.agents/adapters/pi/personal && bun test lib/fleet/child-policy.test.ts`
- **Expected red test ids/signatures:**
  - `SEC-00 R2/R3/R6/R7 > locks canonical fleet agent capabilities`
  - `SEC-00 R4 > blocks secret and path-escape inspection`
  - `SEC-00 R5 > sanitizes inherited child environment`
  - `SEC-00 R8 > records bounded redacted blocked attempts`
  - `SEC-00 R2/R9 > rejects uncontained dispatch before RPC`
  - failure text contains one or more of: `bash`, `mutation`, `auth`, `outside child cwd`, `secret environment`, `agentScope`, `uncontained-agent`, `policy extension`.
- **Forbidden production paths before red SHA:**
  - `agents-shared/.agents/adapters/pi/personal/lib/fleet/child-policy.ts`
  - `agents-shared/.agents/adapters/pi/personal/agents/fleet-{researcher,reviewer,ux}.md`
  - `agents-shared/.agents/adapters/pi/personal/lib/fleet/plan.ts`
  - `agents-shared/.agents/adapters/pi/personal/extensions/agentic-fleet.ts`
- **Import/harness rule:** the Test Designer must guard the dynamic policy-module load and turn absence into the named contract assertion; module-not-found, syntax, setup, timeout, 126, or 127 is not valid red.
- **Covering green:** the focused command at the Implementer SHA, followed by `bun test lib/fleet lib/bdd/fleet-gate.test.ts` and the root aggregate.
- **Sensitivity/mutation:** at minimum, reintroducing `bash`, trusting a missing/uncontained agent scope, preserving a synthetic secret env key, or skipping symlink canonicalization must fail the focused oracle and pass after restore.
- **No-live rule:** tests use fixtures/mocks only; no `fleet_dispatch`/RPC spawn until SEC-00 green and integrated.

## Ownership and rollback

- Primary SEC-00 production ownership: `lib/fleet/child-policy*` and `agents/fleet-*.md`.
- Serialized integration exceptions: `lib/fleet/plan.ts` for user-only agent scope and `extensions/agentic-fleet.ts` for pre-RPC fail-closed validation/audit. CMP-02 regression must remain green.
- Rollback: disable live dispatch and retain plan-only/mock transport. Never restore unrestricted children.

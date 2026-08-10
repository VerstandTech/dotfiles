Feature: SEC-00 minimum fleet containment
  Read-only fleet claims must be mechanically enforceable before any live
  Grok dispatch. Containment is tool allowlists, exact extensions, path
  guards, sanitized env, bounded audits, and pre-RPC preflight — not prompt
  prose. Tests are fixture-only; no child is launched.

  Background:
    Given the focused command is "cd agents-shared/.agents/adapters/pi/personal && bun test lib/fleet/child-policy.test.ts"
    And production paths "lib/fleet/child-policy.ts", "agents/fleet-*.md", "lib/fleet/plan.ts", and "extensions/agentic-fleet.ts" stay untouched during red
    And child-policy.ts is loaded via a guarded dynamic import so absence is an assertion failure, not module/setup failure
    And no live fleet_dispatch or pi-subagents RPC child is started

  # --- R1/R2/R3/R6/R7 agent capability lock ---

  Scenario: Current bash declarations are the causal red for uncontained agents (E1, E2, R1)
    Given canonical fleet-researcher, fleet-reviewer, and fleet-ux agent definitions
    When the focused SEC-00 capability contract runs
    Then it fails at "SEC-00 R2/R3/R6/R7 > locks canonical fleet agent capabilities"
    And the failure names bash and/or missing policy extension
    And it does not fail because of import, setup, timeout, 126, or 127

  Scenario: Only canonical fleet agents may execute (E3, E4, E5, R2)
    Given a live fleet plan
    When containment preflight runs before RPC
    Then agent "worker" is rejected as uncontained-agent
    And a review plan using only fleet-reviewer is accepted when other contracts hold
    And missing or non-user agentScope is rejected as untrusted-agent-scope
    And public execution binds agentScope to "user"

  Scenario: Fleet children have no mutation or delegation capability (E6, E7, E8, R3)
    Given each canonical fleet agent definition
    When tools, permissions, and maxSubagentDepth are inspected
    Then write, edit, apply_patch, bash, shell/exec/terminal, notebook mutation, and subagent are absent
    And permissions deny mutation tools as defense-in-depth
    And maxSubagentDepth is 0
    And defaultContext is fresh
    And no default checkout-writing output is declared
    And trusted runtime artifacts under .pi/fleet-runs/** remain out of model-callable writes
    And reintroducing bash or a mutation tool fails the contract

  Scenario: Egress is explicit and role-specific (E18, E19, E20, R6)
    Given the three canonical fleet roles
    When tool allowlists are checked
    Then only fleet-researcher may expose xai_web_search
    And reviewer and UX expose no network-capable tool
    And curl, fetch, generic web/browser, and shell tool names are denied for every role
    And token bytes never appear in model or audit output

  Scenario: Ambient extensions are disabled (E21, E22, E23, R7)
    Given each canonical fleet agent definition
    When extensions and subagentOnlyExtensions are inspected
    Then reviewer and UX load exactly the child-policy extension
    And researcher loads exactly the child-policy extension plus xAI web search
    And missing policy extension or an extra extension fails static validation

  # --- R4 path confinement ---

  Scenario: Local inspection is repository-confined and secret-aware (E9–E13, R4)
    Given a child cwd and the path inspection policy
    When read, grep, find, or ls targets are evaluated after lexical and realpath resolution
    Then reading ~/.pi/agent/auth.json is blocked
    And a cwd symlink resolving to ~/.pi/agent/auth.json is blocked
    And grep rooted at $HOME is blocked even for a benign pattern
    And reading src/example.ts inside cwd is allowed
    And reading repository .env.local, .npmrc, private keys, /proc/*/environ, or /dev/fd/* is blocked
    And absolute paths, ".." escapes, and NUL are denied
    And the focused failure id is "SEC-00 R4 > blocks secret and path-escape inspection" while policy is missing

  # --- R5 environment sanitization ---

  Scenario: Child environment is allowlisted before model/tool work (E14–E17, R5)
    Given a synthetic inherited environment with secrets and ordinary runtime keys
    When sanitizeChildEnvironment runs
    Then GITHUB_TOKEN, XAI_API_KEY, AWS_SECRET_ACCESS_KEY, PI_AUTH_PATH, and HTTPS_PROXY are absent
    And PATH, HOME, locale/temp keys, and required PI_SUBAGENT_*/PI_INTERCOM_* controls remain
    And the synthetic secret value appears in neither the sanitized env nor audit JSON
    And parent preflight rejects NODE_OPTIONS, BASH_ENV, LD_PRELOAD, and DYLD_INSERT_LIBRARIES before spawn
    And the focused failure id is "SEC-00 R5 > sanitizes inherited child environment" while policy is missing

  # --- R8 bounded audit ---

  Scenario: Blocked attempts are recorded safely (E24–E26, R8)
    Given a temporary audit sink
    When an auth-read denial, a mutation attempt, and a custom-agent dispatch attempt are recorded
    Then each appends one blocked JSONL record with timestamp, agent, run id when available, tool/action, reason code, and redacted argument shape
    And audit files use mode 0600
    And raw environment values, prompt/task text, credentials, and bearer strings are never persisted
    And reason codes include mutation-tool-denied and uncontained-agent without storing the fleet topic
    And the focused failure id is "SEC-00 R8 > records bounded redacted blocked attempts" while policy is missing

  # --- R9/R11 preflight and fail-closed rollback ---

  Scenario: Drift fails before spawn (E27–E29, E32, E33, R9, R11)
    Given dispatch preflight validates plan members, user-only agent scope, launch env, and agent contracts
    When an agent tool declaration drifts, launch env is dangerous, child-policy is missing, or agentScope is absent
    Then the entire plan is blocked before callSubagentRpc
    And the blocked response is distinct from RPC failure and from successful launch
    And agentic-fleet.ts invokes the fail-closed preflight before callSubagentRpc
    And rollback guidance is disable live fleets, never unrestricted children
    And the focused failure id is "SEC-00 R2/R9 > rejects uncontained dispatch before RPC"

  # --- R10 runtime acknowledgement ---

  Scenario: Runtime policy presence is observable without launching a child (E30, E31, R10)
    Given the child-policy module
    When runtime acknowledgement metadata is inspected
    Then the acknowledgement id is fleet-child-policy-v1
    And it is intended for the subagent:acknowledge-extension event
    And deterministic tests exercise hooks/helpers only with fixtures and mocks

  # --- R12 trust boundary honesty ---

  Scenario: SEC-00 does not claim the SEC-01 host boundary (E34, E35, R12)
    Given SEC-00 containment is the model-callable boundary only
    When operators ask about product-code review or unattended execution
    Then those remain blocked until SEC-01
    And any non-secret fixture smoke after integration is advisory only
    And no live Grok fleet is part of deterministic green

Feature: CMP-02 fleet_dispatch WorkflowScript compatibility
  The agentic fleet planner must emit the pi-subagents 0.45.2 public
  execution shape: non-empty workflowScript, outer async true, no removed
  top-level orchestration or direct-execution fields. CMP-02 is mocked and
  contract-only; live research/review fleets stay disabled until SEC-00.

  Background:
    Given the focused command is "cd agents-shared/.agents/adapters/pi/personal && bun test lib/fleet/plan.test.ts lib/fleet/rpc.test.ts"
    And production paths "lib/fleet/plan.ts", "lib/fleet/rpc.ts", and "extensions/agentic-fleet.ts" stay untouched during red
    And pi-subagents 0.45.2 rejects top-level tasks, chain, parallel, concurrency, chainDir, action, and direct agent/task/step for execution

  Scenario: Legacy top-level tasks payload is the causal red (E1)
    Given buildFleetPlan still produces the discovery-era public payload
    When the focused CMP-02 test runs
    Then it fails at "buildFleetPlan current RPC payload > emits WorkflowScript-only public spawn params"
    And the failure says "legacy top-level tasks payload is still emitted"
    And it does not fail because of import, setup, timeout, or command-not-found

  Scenario: Public spawn params are WorkflowScript-only (E2, R1)
    Given five research personas and a built fleet plan
    When public subagentParams are inspected
    Then workflowScript is a non-empty string
    And async is true
    And context is present
    And action, tasks, chain, parallel, concurrency, chainDir, agent, task, and step are absent

  Scenario: Stable unique keys preserve persona associations (E2, E4, R2)
    Given models rotate across Grok A and B for five research children
    When the generated workflowScript is executed with a mock runs object
    Then every child key matches the pi-subagents key contract
    And keys are unique
    And each child keeps its persona agent, task, model, and output association

  Scenario: Concurrency two batches five children as 2,2,1 (E3, R4)
    Given count 5 and concurrency 2
    When the workflowScript runs against mock runs.all
    Then runs.all is called three times with batch sizes 2, 2, and 1
    And no top-level or child concurrency field is emitted
    And returned results stay in original persona order

  Scenario: Dangerous task text stays inert JSON data (E5, R3)
    Given topic, scope, and task content containing backticks, "${...}", quotes, backslashes, Unicode, and newlines
    When the workflowScript is compiled and executed with a mock runs object
    Then the script parses and runs without treating that content as JavaScript
    And mock runs receives the original strings as task data only

  Scenario: Duplicate persona ids cannot collide keys or outputs (E6)
    Given custom personas that reuse the same id
    When keys and output paths are built
    Then keys remain unique
    And output paths remain unique by index

  Scenario: Async false is forced true with warning (E7, R5)
    Given the caller requests async false
    When the plan is built
    Then outer async is true
    And subagentParams.async is true
    And a warning mentions async

  Scenario: Context fork survives on the public payload (E8, R5)
    Given context fork
    When the plan is built
    Then public subagentParams.context remains fork

  Scenario: Mock RPC spawn uses v1 envelope and current params (E9, R7, R8)
    Given a WorkflowScript-only spawn payload
    When callSubagentRpc is invoked with method spawn against a mock bus
    Then the request version is 1
    And the method is spawn
    And params match the current public shape
    And a successful reply returns data without claiming false identity

  Scenario: Timeout and malformed RPC replies stay honest (E10, R7)
    Given a mock bus that times out or replies with a malformed body
    When callSubagentRpc completes
    Then success is false
    And the error is typed
    And no run id is claimed
    And the reply listener is removed

  Scenario: Cutover mirror rejects legacy and accepts WorkflowScript (E1, sensitivity)
    Given a test-local mirror of the pi-subagents 0.45.2 public cutover message
    When legacy tasks and concurrency params are normalized
    Then normalization fails with "Legacy top-level chain and parallel inputs were removed; use workflowScript."
    When current WorkflowScript-only params are normalized
    Then normalization succeeds
    And the production plan public payload must also pass the mirror

  Scenario: Run-ledger fixtures accept the new public payload (E11, R8)
    Given a plan fixture whose subagentParams use workflowScript
    When writePlanManifest and extractRunIdentity run
    Then runId and asyncDir identity assertions remain intact
    And the fixture compiles without weakening ledger checks

  Scenario: No live fleet is launched (E12, R9)
    Given SEC-00 containment is not green
    When CMP-02 validation runs
    Then only mocked transport and fixture checks execute
    And no live research or review fleet is dispatched

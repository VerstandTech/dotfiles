Feature: CMP-01 Herdr 0.8 compatibility matrix and parser rebaseline
  The Pi Herdr integration must treat installed Herdr 0.8 interfaces as the
  compatibility authority, keep legacy 0.7.5 envelopes parser-only, and fail
  actionably when protocol or schema drift is observed. CMP-01 records versions
  and fixtures only; it never installs integrations or upgrades packages.

  Background:
    Given the focused command is "cd pi && bun test tests/herd-compat.test.ts"
    And production path "pi/.pi/agent/personal/extensions/herd/herd-compat.ts" is the contract owner
    And fixtures under "pi/tests/fixtures/herdr/**" use only synthetic ids and paths

  Scenario: Missing compatibility contract is the causal red
    Given the Herdr compatibility matrix test exists
    And herd-compat.ts does not exist yet
    When the focused CMP-01 test runs
    Then it fails at "Herdr compatibility matrix > declares the current compatibility contract"
    And the failure says "Herdr 0.8 compatibility contract is missing"
    And it does not fail because of import, setup, timeout, or command-not-found

  Scenario: Supported runtime matrix is explicit
    Given Herdr runtime policy 0.8.x with protocol 19 and schema version 1
    And observed Pi 0.84.1, pi-subagents 0.45.2, context-mode 1.0.169, Rulesync 16.9.1
    When the compatibility contract is loaded
    Then the matrix names those exact tested values
    And package or settings files are not mutated by CMP-01

  Scenario: Compatible observation is typed and named
    Given Herdr 0.8.0 with protocol 19 and schema version 1
    When checkHerdrCompatibility runs
    Then the result status is "compatible"
    And the message names the tested matrix

  Scenario: Protocol drift is incompatible and actionable
    Given protocol 18 or protocol 20 with otherwise valid fields
    When checkHerdrCompatibility runs
    Then the result status is "incompatible"
    And the message names observed protocol and expected 19
    And the message instructs the operator to run the compatibility doctor

  Scenario: Schema drift is incompatible and actionable
    Given schema version 2 with protocol 19
    When checkHerdrCompatibility runs
    Then the result status is "incompatible"
    And the message names observed schema version and expected 1

  Scenario: Missing protocol or schema is unknown never compatible
    Given protocol or schema version is missing
    When checkHerdrCompatibility runs
    Then the result status is "unknown"
    And the result is never treated as compatible

  Scenario: Legacy and current envelopes remain parser-compatible
    Given the normalized 0.7.5 agent-list fixture
    And the normalized 0.8.0 agent-list fixture with extra fields
    When formatHerdRows runs on each fixture
    Then both render public agent rows
    And extra 0.8 fields are ignored without breaking the formatter

  Scenario: Pane ids stay opaque and envelope-sourced
    Given the normalized 0.8.0 worktree-created fixture
    When extractPaneId runs
    Then result.root_pane.pane_id wins
    And no pane id is derived from display order

  Scenario: Task launch is explicitly detach-safe on Herdr 0.8
    Given buildTaskLaunch for a valid agent name
    When the argv is built
    Then it includes "--no-focus"
    And it never includes "--focus"
    And it never includes "--json"

  Scenario: Missing Pi integration is documented not installed
    Given integration status text that says Pi is not installed
    When CMP-01 interprets the status
    Then it reports Pi integration absent
    And it does not install hooks or packages

  Scenario: Docs and vendored skill mark current versus legacy
    Given compatibility documentation and the vendored Herdr skill
    When the compatibility regression assertions run
    Then 0.7.5 wording is marked legacy rather than current
    And the vendored skill footer records Herdr 0.8.0
    And local "--kind pi" adaptation remains

  Scenario: Future version support requires fixture and test refresh
    Given a proposal to claim a new Herdr protocol or major runtime
    When the version policy is applied
    Then fixtures and compatibility tests must change before the support claim changes

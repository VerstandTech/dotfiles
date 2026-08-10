Feature: BASE-01 canonical playbook v1.2 and bounded Test Designer baseline
  The personal Pi package must advertise the living high-assurance playbook
  (v1.2 — August 2026) at runtime and lock an explicit Test Designer contract
  for writable paths, plain no-delegation, and layered oracles. BASE-01 is
  formulation-only until Implementer repairs production metadata and role text.
  ROLE-01 later may add schema/tool enforcement but must not weaken this baseline.

  Background:
    Given the focused command is "cd agents-shared/.agents/adapters/pi/personal && bun test lib/bdd/playbook.test.ts lib/bdd/assurance-agents.test.ts"
    And the canonical document is "docs/high-assurance-playbook.md" at Version 1.2 — August 2026
    And production paths "lib/bdd/playbook.ts", "agents/bdd-test-designer.md", and "docs/high-assurance-playbook.md" stay untouched during red
    And no live fleet or subagent delegation is used for BASE-01

  Scenario: Stale v1.0 runtime metadata is the causal red (E1, R1, R2)
    Given HIGH_ASSURANCE_PLAYBOOK still reports version "1.0" and published "July 2026"
    And the focused test "reports the canonical v1.2 runtime metadata" exists
    When the focused BASE-01 test runs
    Then it fails at "playbook discovery surfaces > reports the canonical v1.2 runtime metadata"
    And the failure expects version "1.2" and receives "1.0"
    And it does not fail because of import, setup, timeout, or command-not-found

  Scenario: Structural tests track the living v1.2 shape not obsolete v1.0 (E2, E3, R3)
    Given the canonical playbook contains title, process-determinism purpose, changelog, sections 1–20, and the v1.2 closing claim
    When the structural playbook oracle runs
    Then it requires "*Version 1.2 — August 2026*"
    And it requires "## Changelog (1.0 → 1.2)"
    And it requires numbered sections 1 through 20
    And it requires "The process itself is the primary source of determinism."
    And it does not require obsolete "*Version 1.0 — July 2026*" or a 1–13-only section ceiling
    And the production canonical document is not rewritten backward to satisfy stale tests

  Scenario: Runtime formatter advertises current metadata and unchanged paths (E4, R2)
    Given HIGH_ASSURANCE_PLAYBOOK is repaired to version "1.2" and published "August 2026"
    When formatHighAssurancePlaybookReference runs
    Then the output contains "High-Assurance Multi-Agent Software Development Playbook v1.2"
    And the output contains "Published: August 2026"
    And canonicalPath remains "docs/high-assurance-playbook.md"
    And implementationPath remains "docs/high-assurance-pi-implementation.md"
    And the output still states the no-auto-install / configured-local-commands policy

  Scenario: Discovery surfaces stay linked to the canonical playbook (R3)
    Given skills bdd-tdd and ship, extensions README, and bdd-mode expose playbook discovery
    When the discovery operationalization oracle runs
    Then each surface references docs/high-assurance-playbook.md and docs/high-assurance-pi-implementation.md
    And bdd_playbook / "/bdd playbook" remain wired

  Scenario: Test Designer plain no-delegation language is required (E5, R5)
    Given the Test Designer role definition
    When the isolation oracle runs
    Then plain text "Do not run, launch, or delegate to subagents or fleets" is present
    And markdown emphasis is not the only carrier of the no-delegation rule

  Scenario: Test Designer writable-path boundary is explicit (E6, R4)
    Given the Test Designer role definition
    When the writable-path oracle runs
    Then it matches "only specification and test paths"
    And production implementation, dependency, threshold, and deployment edits remain forbidden

  Scenario: Test Designer owns layered oracle techniques (E7, R6)
    Given the Test Designer role definition
    When the oracle-responsibility test runs
    Then contracts/invariants, fuzz, differential, and golden-master are explicit
    And acceptance, property, trajectory, unit, and adversarial coverage remain in scope by risk

  Scenario: All seven bounded roles keep isolation intact (E8, R7)
    Given the seven packaged roles specifier through qa
    When existing isolation and tool-restriction tests run
    Then every role keeps defaultContext fresh and inheritSkills false
    And every role carries no-run/no-launch/no-delegate-to-subagents language
    And read-only roles have no edit or write tools
    And Implementer must not modify tests
    And Refactorer behavior must remain unchanged
    And BASE-01 does not broaden Test Designer tools

  Scenario: Focused baseline is green after implementation (E9, R8)
    Given production runtime metadata and Test Designer contract are repaired
    When the focused BASE-01 command runs
    Then playbook.test.ts and assurance-agents.test.ts pass

  Scenario: Complete personal suite and root aggregate become honestly green (E10, E11, R8)
    Given the focused baseline is green
    When bun test lib runs under the personal package
    And scripts/test-root.sh runs at the repository root
    Then no playbook or agent-contract failure remains
    And Rulesync, AI resources, Pi tests, and personal tests all pass without skipping the former baseline failures

  Scenario: Metadata sensitivity proves the runtime authority (E12, R9)
    Given the focused baseline is green
    When HIGH_ASSURANCE_PLAYBOOK.version is deliberately reverted to "1.0"
    Then the focused command fails at reports the canonical v1.2 runtime metadata
    When the version is restored to "1.2"
    Then the focused command passes

  Scenario: Test Designer contract sensitivity proves path and oracle authorities (E13, R9)
    Given the focused baseline is green
    When a required Test Designer fuzz or writable-path rule is deliberately removed
    Then the focused command fails on the Test Designer contract oracle
    When the required rule is restored
    Then the focused command passes

  Scenario: Later ROLE-01 cannot weaken BASE-01 (R10)
    Given BASE-01 baseline authorities are locked
    When ROLE-01 later adds schema or tool-policy enforcement after Gate B
    Then it must not downgrade v1.2 runtime metadata
    And it must not weaken plain no-delegation isolation
    And it must not narrow the specification/test writable-path scope
    And it must not drop contracts/invariants, fuzz, differential, or golden-master responsibilities

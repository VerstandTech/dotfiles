@ROLE-01 @high-assurance @persona-driven
Feature: ROLE-01 bounded role contracts and skill reconciliation
  As Leo, Maya, Nikhil, Sofia, and André
  I want every ROLE-owned BDD role to consume and return one bounded V1 contract
  So role separation is portable without confusing prompts with authority

  Background:
    Given CON-01 RoleRequestV1 and RoleResultV1 are merged
    And ISO-01 remains the writer lease and realpath authority
    And SEC-00 remains the fleet containment authority
    And ROLE-01 owns six role prompts and five existing skills
    And ROLE-01 does not edit bdd-fitness-guardian.md, BDD enforcement, fleet policy, lifecycle production, budget production, or trajectory production
    And no role may delegate under the ROLE-01 V1 contract

  @Leo @Andre @R1 @R2
  Scenario Outline: An owned role starts only from a versioned locked request
    Given the <role> agent declares Role contract v1
    And its input is a validated RoleRequestV1 with schemaVersion 1
    And the request contains taskId, goal, phase, ownedPaths, forbiddenPaths, model, thinking, tools, budget, and locked artifact refs
    When the role begins <focus>
    Then it acts only inside the locked focus and paths
    And it does not infer missing input from chat lore
    And an unsupported or missing version returns blocked

    Examples:
      | role          | focus                                      |
      | specifier     | requirements and acceptance discovery      |
      | test-designer | independent specification and test design   |
      | implementer   | minimum production green                     |
      | breaker       | adversarial findings                         |
      | refactorer    | behavior-preserving production structure     |
      | qa            | read-only QA evidence review                 |

  @Nikhil @Sofia @R3 @R10
  Scenario Outline: Unsafe or ambiguous scope blocks without guessing
    Given a validated request for <role>
    When <ambiguity> is encountered
    Then the result status is blocked
    And blockers contain the exact unresolved condition or parent question
    And no unlisted path is read or changed to resolve it
    And no approval, lease, or expanded scope is inferred

    Examples:
      | role          | ambiguity                                  |
      | test-designer | production and test paths overlap           |
      | implementer   | locked tests contradict the specification   |
      | refactorer    | current green evidence is absent             |
      | breaker       | a secret-bearing artifact would be required |
      | qa            | a destructive live check would be required  |
      | specifier     | a public API decision lacks human approval   |

  @Leo @Nikhil @R4
  Scenario: Test Designer is a specification-and-test-only writer
    Given the Test Designer request owns only specification and test paths
    When it designs acceptance, unit, property, trajectory, contract, fuzz, differential, or golden-master oracles
    Then it may change only those owned specification and test paths
    And it must not modify production implementation
    And it must not modify dependencies, quality thresholds, gates, or deploy configuration
    And it must not inspect an Implementer production-diff handoff
    And it reports causal red without claiming green or ship readiness

  @Leo @Maya @R5
  Scenario: Implementer treats tests and evidence as immutable
    Given the Implementer receives locked specs, tests, and a causal red command
    When it implements minimum green
    Then it may change only owned production paths
    And it must not modify tests, specifications, acceptance artifacts, thresholds, gate configuration, or reviewer evidence
    And contradictory locked tests return blocked instead of being edited
    And the result does not claim final assurance or merge authority

  @Leo @R7
  Scenario: Refactorer remains a serial post-green production writer
    Given the Refactorer receives current locked green evidence
    And no Implementer owns the same worktree lease
    When it reduces complexity in owned production paths
    Then behavior remains unchanged
    And tests, acceptance artifacts, gates, and thresholds remain unchanged
    And the locked green command is reported as command evidence
    And a desired change outside scope is reported as residual risk

  @Nikhil @R6
  Scenario Outline: ROLE-owned read-only agents have no mutation-capable tool
    Given the <role> frontmatter has acceptanceRole read-only
    When its tool allowlist is inspected
    Then edit is absent
    And write is absent
    And bash is absent
    And subagent is absent
    And findings use evidence or artifact refs with changedPaths empty

    Examples:
      | role      |
      | specifier |
      | breaker   |
      | qa        |

  @Maya @Leo @R8
  Scenario Outline: Each role has an explicit bounded launch profile
    Given the <role> default profile declares a model, thinking level, exact tools, and a RoleRequestV1 budget ceiling
    When a validated request remains at or below that ceiling
    Then the role may act within its declared capability
    When the request omits launch data, requests an undeclared tool, or exceeds a ceiling
    Then the role returns blocked before action
    And it does not raise its own budget

    Examples:
      | role          |
      | specifier     |
      | test-designer |
      | implementer   |
      | breaker       |
      | refactorer    |
      | qa            |

  @Nikhil @R9
  Scenario Outline: Delegation is absent by default
    Given the <role> agent has no subagent tool
    When it needs additional expertise
    Then plain text says "Do not run, launch, or delegate to subagents or fleets"
    And it returns a blocker or residual question to the parent
    And a future exception would require a separately validated orchestrator contract and actual capability
    And ROLE-01 V1 grants no exception

    Examples:
      | role          |
      | specifier     |
      | test-designer |
      | implementer   |
      | breaker       |
      | refactorer    |
      | qa            |

  @Maya @Sofia @R11
  Scenario Outline: Every result is schema-ready and honest
    Given the <role> finishes with <condition>
    When it returns RoleResultV1
    Then it includes schemaVersion 1, kind role-result, taskId, role, and exact result status
    And it includes headSha, dirty state, commands, evidence refs, artifact refs, blockers, residual risks, and usage
    And it includes exact changed files for a writer or changedPaths empty plus finding refs for a reader
    And questions are represented through blockers, residual risks, or bounded artifact refs
    And missing usage remains unknown rather than zero

    Examples:
      | role          | condition                         |
      | specifier     | unresolved product decision       |
      | test-designer | causal red proven                  |
      | implementer   | local green command passed         |
      | breaker       | no evidence-backed blocker found  |
      | refactorer    | post-refactor green passed         |
      | qa            | safe executor unavailable          |

  @Maya @Nikhil @R12 @R13
  Scenario Outline: A role result supplies evidence but no authority
    Given a valid result reports <evidence>
    When the parent receives it
    Then the result does not grant <authority>
    And the parent validates the result before accepting it
    And the relevant runtime authority remains external to ROLE-01 prompts

    Examples:
      | evidence                       | authority                 |
      | causal red                     | BDD phase transition      |
      | local green                    | final assurance handoff   |
      | no reviewer blockers           | merge approval            |
      | clean SHA                      | writer lease              |
      | QA observations                | destructive cleanup       |
      | model-emitted approval wording | human approval             |

  @Andre @R14
  Scenario Outline: Existing skills compose the same V1 boundary
    Given the <skill> skill already owns <surface>
    When ROLE-01 reconciles it
    Then it requires validated RoleRequestV1 before role action or spawn where applicable
    And it requires validated RoleResultV1 before accepting completion where applicable
    And it states that the contract grants no approval, lease, phase, merge, or cleanup authority
    And it preserves the existing skill entry point

    Examples:
      | skill                       | surface                         |
      | bdd-tdd                     | BDD phase and evidence guidance |
      | caid                        | isolated assignment handoffs    |
      | trajectory                  | process evidence recording       |
      | ship                        | end-to-end parent recipe         |
      | herdr-delivery-supervisor   | bounded worker supervision       |

  @Andre @R14
  Scenario: Reconciliation creates no duplicate role or support skill
    Given existing roles and skills can express the V1 request/result boundary
    When ROLE-01 reaches green
    Then no specifier skill is added
    And no test-designer skill is added
    And no implementer skill is added
    And no new support skill is added
    And existing names and phase mappings remain compatible

  @Nikhil @R13
  Scenario: Prompt regression tests do not claim sandbox enforcement
    Given the focused assurance-agents test checks role and skill text
    When it passes
    Then it proves prompt/schema regression coverage only
    And it does not claim OS sandbox, lease, path-gate, or fleet containment enforcement
    And SEC, ISO, CON, BDD, and FIT ownership remain explicit

  @Maya @Andre @red
  Scenario: Missing V1 contract produces the named causal red
    Given ROLE-01 formulation documents exist
    And production role prompts and skills do not yet contain the complete V1 contract
    When "cd agents-shared/.agents/adapters/pi/personal && bun test lib/bdd/assurance-agents.test.ts" runs
    Then the test "ROLE01_ROLE_CONTRACT_MISSING: owned roles require bounded V1 request and result contracts" fails
    And the output contains "ROLE01_ROLE_CONTRACT_MISSING"
    And the failure is a missing role-contract assertion
    And it is not a timeout, import, setup, or command-not-found failure

  @Leo @green
  Scenario: Minimum prompt and skill reconciliation reaches focused and full green
    Given the named causal red is recorded
    When only the six owned prompts and five owned skills receive minimum V1 reconciliation
    Then the focused assurance-agents command passes
    And the complete personal "bun test" passes
    And no forbidden path is changed

  @Nikhil @mutation
  Scenario Outline: Separation rules are mutation-sensitive
    Given the focused suite is green
    When the <rule> is temporarily weakened
    Then the named separation test fails with "ROLE01_ROLE_CONTRACT_MISSING"
    When the exact rule is restored
    Then the focused suite passes

    Examples:
      | rule                                           |
      | Test Designer no-production-write prohibition |
      | Implementer no-test-write prohibition         |

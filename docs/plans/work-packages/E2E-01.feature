# Example Map: E2E-01 R1-R18 / E1-E37 / Q1-Q3
@E2E-01 @golden @high-assurance @hermetic
Feature: Golden high-assurance workflow
  As an operator preparing wider adoption
  I want one deterministic harmless story across the merged assurance components
  So that no missing, stale, forged, or colluding evidence can become success

  Background:
    Given a closed schema-v1 fixture with no ambient authority
    And all role, worktree, gate, budget, security, review, approval, and cleanup facts are explicit
    And the fixture cannot execute agents, networks, installs, PRs, merges, or cleanup

  Scenario: Complete positive story becomes ready for human merge
    Given discovery and formulation are complete
    And a test designer records a named causal red in an isolated context and worktree
    And a different implementer records a covering green
    And security, budget, trajectory, review, and fitness evidence is current at one candidate fingerprint
    And current human approval binds the exact diff action, risk, effect, fingerprint, and paths
    And cleanup prerequisites are modeled but cleanup execution is disabled
    When the golden story is evaluated twice
    Then both results are identical and deeply immutable
    And the result is "ready-for-human-merge"
    And the result is never "merged"

  Scenario Outline: Negative golden fixtures fail for one named invariant
    Given the otherwise-valid story has <mutation>
    When the golden story is evaluated
    Then it is blocked with <code>
    And no completion, handoff, merge, or cleanup authority is emitted

    Examples:
      | mutation                                      | code                         |
      | a simulated blocker                          | blocker-present              |
      | raw secret-shaped content                    | security-evidence-invalid    |
      | unknown budget usage                         | budget-evidence-invalid      |
      | stale gate evidence                          | fitness-evidence-invalid     |
      | designer and implementer share identity      | role-isolation-invalid       |
      | role worktrees collide                       | worktree-isolation-invalid   |
      | red is missing or unrelated                  | causal-red-invalid           |
      | green does not cover the same behavior       | covering-green-invalid       |
      | trajectory sequence is non-contiguous        | trajectory-invalid           |
      | review synthesis has an undispositioned P1   | review-evidence-invalid      |
      | approval binds a different candidate         | approval-evidence-invalid    |
      | cleanup sees an active lease                  | cleanup-refused              |
      | automatic merge or cleanup execution claimed | authority-escalation-refused |

  Scenario: Required phases are ordered and complete
    Given a story phase list
    When it omits, duplicates, or reorders discovery, formulation, causal-red, covering-green, or verify
    Then it is blocked with "phase-order-invalid"

  Scenario: Evidence fingerprints cannot be mixed
    Given every required gate except one binds candidate A
    And one gate binds candidate B
    When the golden story is evaluated
    Then it is blocked with "candidate-fingerprint-mismatch"

  Scenario: Current budget is refreshed after high-count confirmation
    Given the modeled dispatch needs human confirmation
    And confirmation is current
    But post-confirmation usage is missing, stale, or hard-exceeded
    When the golden story is evaluated
    Then it is blocked with "budget-evidence-invalid"

  Scenario: Full child startup failure remains non-passing
    Given full child Pi startup fails while loading an extension
    And extension-free Pi can run an advisory check
    When acceptance is evaluated
    Then it is blocked with "child-startup-unavailable"
    And the advisory check cannot convert it to success

  Scenario Outline: Live operator actions stay outside hermetic acceptance
    Given the story requests <operation>
    When the golden story is evaluated without durable human approval
    Then it is blocked with "operator-approval-required"

    Examples:
      | operation       |
      | live fleet      |
      | file sink       |
      | purge           |
      | strict profile  |
      | overnight run   |
      | network access  |
      | package install |
      | real cleanup    |

  Scenario: Cleanup is conservative and planner-only
    Given merge, remote head, gates, lease, process, and resource ownership facts are current
    When cleanup readiness is evaluated
    Then a cleanup plan may be described
    But no cleanup action is executed

  Scenario Outline: Closed input refuses hostile structure
    Given the fixture contains <hostility>
    When the golden story is evaluated
    Then it is blocked with "fixture-invalid"

    Examples:
      | hostility            |
      | an unknown key       |
      | an accessor property |
      | a cyclic value       |
      | a custom prototype   |
      | a control character  |
      | an oversized string  |

  Scenario: Golden safeguards are mutation-sensitive
    Given the accepted E2E implementation
    When red, fingerprint, security, usage, isolation, secret, merge, or cleanup safeguards are deliberately weakened one at a time
    Then a named E2E-01 test fails for each mutation

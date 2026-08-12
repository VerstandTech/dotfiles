# Example Map: CLOSE-01 R1-R9 / E1-E22 / Q1-Q3
@CLOSE-01 @closeout @worktree @startup @ops @package @fleet
Feature: Post-E2E closeout
  As an operator finishing the 23-package plan
  I want remaining defects and acceptance gaps closed in one human-merged PR
  So that later worktrees, child Pi sessions, and live adoption do not invent authority or lose evidence

  Background:
    Given CLOSE-01 runs in an isolated worktree
    And the three intentional local config files stay outside this package
    And no merge, live fleet, real-HOME install, or product-repo mutation occurs without explicit approval

  Scenario: Worktree-recorded red and green survive parent VERIFY
    Given an isolated worktree records causal red and covering green
    When a later parent-session VERIFY reads BDD evidence
    Then the worktree still reports those red and green records
    And the parent session does not claim or clear them

  Scenario: Missing worktree identity is unknown
    Given the recording worktree identity cannot be established
    When handoff evidence is requested
    Then the result is unknown or missing
    And no empty success is emitted

  Scenario: Personal package discovery excludes test files as extensions
    Given the personal package extension globs
    When package discovery is evaluated
    Then "*.test.ts" files are not loaded as extensions
    And approval-seams tests live outside the extension load set

  Scenario: Full child startup no longer fails on undefined path
    Given a staged temporary HOME with the personal package
    When packaged Pi discovery or --list-models runs
    Then it does not emit The "path" argument must be of type string
    And agentic-fleet resolves its module path from a real file URL

  Scenario Outline: Live child delegation is proven or honestly blocked
    Given a bounded pi-subagents spawn through the loaded personal package
    When the child <condition>
    Then the result is <code>
    And no product fleet is launched

    Examples:
      | condition                         | code                        |
      | starts with loaded extensions     | child-started               |
      | fails while loading an extension  | child-startup-unavailable   |
      | lacks operator approval for fleet | operator-approval-required  |

  Scenario: OPS-01 evidence is reconstructed without fabrication
    Given OPS-01 is already merged and root-green
    When CLOSE-01 records package evidence
    Then acceptance and mutation notes come from existing artifacts
    And lost historical red/green remain missing or unknown

  Scenario Outline: Live package acceptance stays planner-only
    Given the operator requests <operation>
    And no named approved target exists
    When the acceptance planner runs
    Then it is blocked with operator-approval-required
    And this machine's real HOME is unchanged

    Examples:
      | operation              |
      | second-machine install |
      | product-repo adoption  |
      | live disable           |
      | live rollback          |
      | live restow            |

  Scenario: Review fleet remains gated
    Given current operator approval or backend/security evidence is missing
    When C5 is evaluated
    Then it remains blocked
    And no live three-person fleet is dispatched

  Scenario: Closeout cannot invent authority
    Given a CLOSE-01 planner or fixture
    When merge, budget increase, foreign lease release, or cleanup execution is claimed
    Then the claim is refused

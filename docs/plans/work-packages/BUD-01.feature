Feature: BUD-01 usage accounting and spawn circuit breakers
  As Leo, Maya, Nikhil, Sofia, and André
  We need typed budget evaluation that treats missing usage as unknown and blocks unsafe spawns
  So cost and iteration caps are real controls rather than silent zeros

  Background:
    Given CMP-02, CON-01, and OBS-01 are merged on main
    And BUD-01 owns cost-budget evaluation and pure fleet budget preflight helpers
    And extensions/agentic-fleet.ts integration is deferred to a serialized follow-up

  Scenario: Missing usage is unknown not ok
    Given a policy with maxTokens set
    And usage omits tokens
    When evaluateCostBudget runs
    Then the tokens dimension status is unknown
    And the overall status is not ok for hard spawn gating

  Scenario: Explicit zero usage is ok when under limit
    Given a policy with maxTokens 100
    And usage tokens is 0
    When evaluateCostBudget runs
    Then the tokens dimension status is ok

  Scenario Outline: Hard exceed breaks the circuit
    Given a policy with <dimension> limit <limit>
    And usage <dimension> is <used>
    When evaluateCostBudget runs
    Then status is exceeded
    And circuitBroken is true

    Examples:
      | dimension   | limit | used |
      | tokens      | 100   | 101  |
      | costUsd     | 1     | 1.01 |
      | durationMs  | 1000  | 1001 |
      | iterations  | 10    | 11   |

  Scenario: Warn does not break the circuit
    Given a policy with maxTokens 100 and warnFraction 0.8
    And usage tokens is 80
    When evaluateCostBudget runs
    Then status is warn
    And circuitBroken is false

  Scenario: Exact limit is not exceeded
    Given a policy with maxTokens 100
    And usage tokens is 100
    When evaluateCostBudget runs
    Then the tokens dimension status is ok or warn by fraction
    And circuitBroken is false

  Scenario: Unknown does not set circuitBroken alone
    Given a limited dimension with missing usage
    When evaluateCostBudget runs
    Then circuitBroken is false
    And spawn preflight still blocks under hardBudgetOnUnknown

  Scenario: Strict profile blocks spawn on unknown usage
    Given profile strict with hardBudgetOnUnknown true
    And a limited dimension has unknown usage
    When planSpawnBudgetGateV1 runs for one child
    Then the decision is spawn-blocked

  Scenario: Overnight profile blocks spawn on unknown usage
    Given profile overnight with hardBudgetOnUnknown true
    And a limited dimension has unknown usage
    When planSpawnBudgetGateV1 runs
    Then the decision is spawn-blocked

  Scenario: Exceeded usage blocks spawn
    Given circuitBroken true from evaluateCostBudget
    When planSpawnBudgetGateV1 runs
    Then the decision is spawn-blocked

  Scenario: Child count above policy requires confirmation reference
    Given maxChildren 2 and requested count 5
    When planSpawnBudgetGateV1 runs without an external confirmation ref
    Then the decision is confirmation-required

  Scenario: Model boolean confirmation is ignored
    Given count requires confirmation
    And the request includes confirmed true without approval ref
    When planSpawnBudgetGateV1 runs under strict profile
    Then the decision remains confirmation-required

  Scenario: Valid confirmation ref allows count when budget otherwise ok
    Given count requires confirmation
    And a current external confirmation ref is supplied
    And usage is finite and under limits
    When planSpawnBudgetGateV1 runs
    Then the decision is allow

  Scenario: Negative or non-finite usage is refused
    When evaluateCostBudget receives negative or NaN usage
    Then a stable invalid-usage refusal is returned

  Scenario: Negative limits are refused
    When a policy with negative maxTokens is evaluated
    Then a stable invalid-policy refusal is returned

  Scenario: No automatic budget increase API exists
    When the budget module surface is inspected
    Then no increaseBudget or unlimited escape helper is exported

  Scenario: mergeCostBudgetPolicy keeps base defaults
    Given DEFAULT_INTERACTIVE_BUDGET
    When merged with a partial overlay of maxTokens only
    Then other base caps remain unchanged

  Scenario: format distinguishes unknown from ok
    Given a result with an unknown dimension
    When formatCostBudgetResult runs
    Then the output includes unknown status marking
    And it does not claim overall OK for that dimension

  Scenario: Fleet budget helper stays pure
    Given lib/fleet/budget.ts preflight helpers
    When called with explicit policy and usage facts
    Then no process env, network, or filesystem is read

  Scenario: agentic-fleet integration is out of this package merge
    When BUD-01 first candidate is prepared
    Then extensions/agentic-fleet.ts is unmodified
    And a deferred integration note is recorded for the serial wave

  Scenario: BUD results are FIT-consumable but not gate enums
    When a budget decision is produced
    Then it is a typed internal budget result
    And quality-gate enums and bdd-mode.ts are not edited

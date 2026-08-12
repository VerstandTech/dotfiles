# Personas: Leo operator, Maya approver, Nikhil security reviewer, Sofia recovering engineer, André adapter maintainer
# Example Map: OPS-01 R1-R18 / E1-E108 / Q1-Q24
@OPS-01 @herdr @operations @recovery
Feature: Operator notifications and cleanup recovery remain bounded and human-controlled
  As a local operator supervising Pi through Herdr
  I want closed notifications and conservative recovery plans
  So timeouts and partial resources never become false success or automatic destruction

  Background:
    Given Herdr observations were validated by HDR-01
    And writer facts come from ISO-01
    And human authority comes from APR-01
    And OPS-01 cannot execute cleanup, merge, PR, lease, or approval actions

  Scenario Outline: Only meaningful current transitions notify
    Given an identity with a current state snapshot
    When a <transition> is observed
    Then <notification> is emitted at most once
    And no terminal output, prompt, diff, or provider message is included

    Examples:
      | transition                 | notification |
      | initial to working         | none         |
      | working to idle            | completed    |
      | working to needs-attention | attention    |
      | idle to working            | started      |
      | idle to idle               | none         |
      | unknown to idle            | none         |

  Scenario: Stale or contradictory sequence cannot notify
    Given a recorded agent identity and state-change sequence
    When a stale sequence or contradictory same-sequence state arrives
    Then no completion notification is emitted
    And the result is stale or invalid with a stable code

  Scenario: Notification rate is bounded without timers
    Given one agent generation changes state beyond the transition budget
    When explicit observations continue
    Then excess messages are suppressed deterministically
    And limits do not auto-increase
    And no interval or retry loop is created

  Scenario Outline: Wait outcomes never turn uncertainty into success
    Given a bounded operator wait
    When the outcome is <outcome>
    Then the operation status is <status>
    And completion is not notified unless explicit current completion evidence exists

    Examples:
      | outcome                | status      |
      | timeout                | unknown     |
      | backend unavailable    | unavailable |
      | malformed envelope     | invalid     |
      | explicit current idle  | completed   |
      | explicit current error | failed      |

  Scenario Outline: Partial launches produce typed recovery plans
    Given current launch facts contain <partial-state>
    When the operator recovery planner evaluates them
    Then the plan is <plan-state>
    And it executes no action

    Examples:
      | partial-state                 | plan-state        |
      | pane only                     | cleanup-required  |
      | worktree only                 | cleanup-required  |
      | agent started status unknown  | inspect-required  |
      | all identities current        | resumable         |
      | contradictory resource facts | manual-intervention |

  Scenario Outline: Cleanup readiness fails closed
    Given cleanup facts contain <condition>
    When cleanup readiness is planned
    Then readiness is <readiness>
    And no runnable cleanup action is executed

    Examples:
      | condition                    | readiness |
      | exact clean merged resources | ready     |
      | dirty worktree               | blocked   |
      | unmerged candidate           | blocked   |
      | missing merge evidence       | unknown   |
      | mismatched candidate SHA     | blocked   |
      | active writer lease          | blocked   |
      | changed pane identity        | blocked   |

  Scenario: Cleanup ordering is deterministic and stop-on-failure
    Given exact current cleanup facts and human approval
    When a typed cleanup plan is rendered
    Then agent release precedes pane close
    And pane close precedes worktree removal
    And worktree removal precedes branch deletion
    And each step requires verification before the next
    And a failed or unknown step blocks all later steps

  Scenario: Cleanup planning has no destructive authority
    Given a cleanup-ready plan
    When the pure operator core returns it
    Then no worktree, branch, pane, lease, PR, or merge is changed
    And only an external human-controlled executor may act

  Scenario Outline: Launch failures are stable and recoverable
    Given herd task launch reaches <failure-point>
    When the adapter handles the failure
    Then it returns <code>
    And arbitrary exception text is absent
    And any safely known partial resource identity is retained

    Examples:
      | failure-point       | code             |
      | invalid name        | invalid-name     |
      | worktree create     | create-failed    |
      | invalid create JSON | missing-pane     |
      | agent start         | start-failed     |

  Scenario: OPS consumes the existing observation source
    Given the current Herdr source and status widget
    When OPS-01 notifications are integrated
    Then no second poller is registered
    And reload does not duplicate subscriptions
    And shutdown clears process-local notification state

  Scenario: Headless operation remains valid
    Given a meaningful transition and no UI delivery channel
    When notification planning occurs
    Then a closed notification event is available
    And UI unavailability does not make the operation fail
    And no desktop side effect is attempted by the pure core

  Scenario: Pure operator outcomes are hostile-safe and frozen
    Given equal bounded facts including hostile getters or proxy traps
    When planning is attempted twice
    Then equal valid inputs yield equal canonical outputs
    And hostile inputs yield stable non-echoing refusal codes
    And all returned outcomes are deeply frozen
    And no ambient host authority is read

  Scenario Outline: OPS behavior is mutation-sensitive
    Given the green OPS-01 implementation
    When it is mutated to <mutation>
    Then a named OPS-01 test fails

    Examples:
      | mutation                         |
      | timeout becomes completed        |
      | dirty worktree becomes ready     |
      | stale sequence emits completion  |
      | raw exception text is forwarded  |
      | cleanup planner executes a step  |
      | a second poller is registered    |

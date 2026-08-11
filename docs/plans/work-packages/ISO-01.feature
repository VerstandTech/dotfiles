Feature: ISO-01 CAID lifecycle, writer leases, and collision hard-fail
  As Leo, Maya, Nikhil, Sofia, and André
  We need one durable writer authority with realpath-bound leases and fail-closed cleanup planning
  So isolated roles cannot share writable paths and stale ownership never auto-releases

  Background:
    Given CON-01 and HDR-01 are merged on main
    And ISO-01 owns lib/worktree lifecycle helpers and the worktree-board adapter
    And pure helpers receive injected clock, realpath, lock, and board facts

  Scenario: Planning is side-effect free
    When a CAID lifecycle plan is requested for Implementer isolation
    Then the plan includes branch, worktree path, role, isolation mode, and card id
    And no worktree is created and no board file is written

  Scenario: Acquire honors maxBusyWriters
    Given maxBusyWriters is 1 and another card is already busy
    When acquire is requested for a free card
    Then the result is denied with code cap-exceeded

  Scenario: Re-acquire of the held card is idempotent
    Given the same card is already busy under the caller identity
    When acquire is requested again
    Then the result succeeds as lease-held without consuming an extra cap slot

  Scenario: Release clears busy and run bindings
    Given a busy card with agentRunId and session binding
    When release is requested by the parent
    Then the card is idle and run bindings are cleared

  Scenario: Realpath alias collides
    Given two lexical paths that resolve to the same realpath fact
    When collision detection runs for exclusive writers
    Then the result is collision and acquire is denied

  Scenario: Nested worktree path collides for strict roles
    Given a live parent worktree path and a nested child path
    When Test Designer and Implementer are both planned onto the nest
    Then the nested exclusive assignment is refused

  Scenario: Symlink escape is refused
    Given a worktree path whose realpath fact escapes the repository root
    When open or register is attempted
    Then the result is denied with a stable path code

  Scenario: Heartbeat requires bound token identity
    Given a parent-issued heartbeat token bound to session, pane, and realpath
    When a heartbeat arrives with a mismatched token
    Then the heartbeat is refused and the prior timestamp remains unchanged

  Scenario: Stale heartbeat does not auto-release
    Given a busy lease whose heartbeat is older than the configured TTL fact
    When stale classification runs
    Then the lease is observed as stale
    And busy ownership remains until explicit parent release

  Scenario: Working or blocked status never auto-releases
    Given a busy lease with agent status working or blocked
    When lifecycle maintenance runs
    Then ownership is retained

  Scenario: Board and CAID disagreement blocks mutation
    Given a CAID assignment path absent from the worktree board
    When acquire or handoff success is requested
    Then the result is board-caid-mismatch

  Scenario: Parent lock protects board replace
    Given the board lock is unavailable
    When save board is attempted
    Then the result is lock-unavailable
    And prior board bytes remain intact

  Scenario: Atomic save replaces completely
    Given a valid board mutation under lock
    When save completes
    Then readers observe either the previous full board or the new full board

  Scenario Outline: Cleanup readiness denies unsafe states
    Given cleanup facts include <condition>
    When evaluateCleanupReadinessV1 runs
    Then readiness is denied with code <code>

    Examples:
      | condition           | code          |
      | dirty worktree      | dirty         |
      | busy writer         | busy          |
      | stale but leased    | leased        |
      | unknown agent       | unknown-status|
      | blocked pane        | blocked       |
      | head sha mismatch   | sha-mismatch  |

  Scenario: Cleanup readiness allows only clean idle matching candidates
    Given an idle non-main worktree with clean tree and matching expected SHA
    When evaluateCleanupReadinessV1 runs
    Then readiness allows the candidate
    And no filesystem delete is performed

  Scenario: Main worktree is not auto-cleanable
    Given the primary repository worktree card
    When cleanup readiness is evaluated
    Then readiness is denied by default

  Scenario: Assignment history is append-only and bounded
    Given a lifecycle release event
    When history is recorded beyond the bound
    Then history-limit is returned without deleting required current assignment fields

  Scenario: Handoff snapshot is observational
    When a handoff document is formatted from an assignment and head SHA fact
    Then it includes path, role, lease id, and head
    And it does not mark the next agent as busy writer

  Scenario: Closed V1 validation refuses hostile board payloads
    When board load receives unknown fields, accessors, or unsupported version
    Then a stable non-echoing refusal is returned

  Scenario: Extension disable leaves pure library importable
    Given the worktree-board extension is disabled
    When pure lifecycle helpers are imported in tests
    Then they remain callable with injected facts

  Scenario: ISO-01 does not claim foreign authority
    When lifecycle results are produced
    Then they do not change BDD phase, spawn fleets, approve actions, or merge PRs

# Personas: A Leo (expert local operator), B Maya (platform approver), D Sofia (recovering product engineer)
# Confusion covered: accepted-vs-approved, stale state, scope boundary, authority, advisory-vs-required, recovery, non-echoing failure
# Example Map: DEC-01 R1-R10 / E1-E55 / Q1-Q16
@DEC-01 @decisions @requirements-as-code @high-assurance
Feature: Decision-store evidence blocks stale or contradictory agent actions
  As Leo and Maya, who retain implementation and approval authority
  I want decision policy evaluated from a current human-approved fingerprint
  So agent actions and handoffs cannot claim trust from mutable, fuzzy, or stale governance

  Background:
    Given CON-01 bounded concrete-path policy and BDD-01 trusted internal-result metadata
    And a pure DEC-01 snapshot, pre-action, and handoff library
    And caller-supplied source authority with no filesystem, environment, network, clock, process, or persistence access
    And RED-01 remains mandatory before any future evidence sink

  Scenario: A valid store becomes a detached immutable trusted snapshot
    Given a plain version-one decision store within all published bounds
    And a safe repository-relative source path with explicit source authority
    When the store is loaded as a DEC-01 snapshot
    Then the operation succeeds with normalized canonical JSON and a lowercase SHA-256 fingerprint
    And the snapshot is deeply frozen and detached from the caller's object graph
    And mutating the caller's input cannot change the snapshot, canonical JSON, or fingerprint

  Scenario Outline: Invalid or hostile stores refuse as a whole without echoing input
    Given a decision-store candidate containing <case>
    When the store is loaded as a DEC-01 snapshot
    Then it refuses with stable code <code>
    And it returns no partial snapshot, canonical JSON, fingerprint, source path, raw key, value, or object-generated error

    Examples:
      | case                                                | code               |
      | an unsupported schema version                       | invalid-store      |
      | duplicate decision ids                              | duplicate-id       |
      | an accessor, symbol key, cycle, or hostile proxy     | invalid-store      |
      | a class, binary, function, bigint, or non-finite value | invalid-store    |
      | a string, array, object, depth, or byte bound excess | bounds             |
      | an unsafe or credential-bearing source path         | unsafe-source-path |
      | an unsafe decision scope path                       | unsafe-scope-path  |
      | a malformed decision, action id, status, or kind    | invalid-store      |

  Scenario: Equivalent semantics produce one current fingerprint
    Given equivalent stores with different object-key, decision-record, tag, scope, related-id, and action-id ordering
    When each store is loaded with the same source authority
    Then their normalized snapshots, canonical JSON, and fingerprints are byte-identical
    But changing status, review, enforcement, prose, timestamps, alternatives, or scope changes the fingerprint
    And no caller-supplied fingerprint, clock, or random value affects the result

  Scenario: Agent-writable mutation invalidates prior human approval
    Given an agent-writable source whose current snapshot differs from its human-approved fingerprint
    When a required pre-action result is requested
    Then the result fails with agent-mutation-detected and human-review-required
    And it contains no partial policy match or decision prose
    When a human approves the exact new fingerprint
    Then an otherwise allowed action becomes eligible for current evaluation
    And DEC-01 never creates or refreshes that approval itself

  Scenario: A contradictory structured accepted constraint blocks the exact action
    Given a current approved snapshot containing an individually approved accepted constraint
    And the constraint explicitly forbids action database.raw-sql.expose
    When action database.raw-sql.expose is evaluated in its governed scope
    Then the trusted internal result fails with constraint-conflict
    And the result identifies only the validated matching decision id
    But action database.raw-sql.expose-debug does not match by substring
    And title, context, decision prose, regex, and fuzzy words cannot create a blocker

  Scenario Outline: Decision scopes match only concrete segment-safe paths
    Given an approved accepted constraint with scope <scope>
    When its forbidden action is requested for <path-case>
    Then the policy match is <result>

    Examples:
      | scope           | path-case                         | result      |
      | src/ui          | src/ui                             | governing   |
      | src/ui          | src/ui/debug.ts                    | governing   |
      | src/ui          | src/uis/debug.ts                   | unrelated   |
      | src/services/** | src/services/billing/index.ts      | governing   |
      | src/services/** | no paths                           | unrelated   |
      | **              | no paths                           | governing   |
      | **              | docs/plans/work-packages/DEC-01.feature | governing |

  Scenario Outline: Unsafe action paths fail before policy matching
    Given an action request containing <path>
    When required pre-action evidence is evaluated
    Then it refuses with unsafe-action-path
    And it reports no matched or inactive decision ids

    Examples:
      | path                 |
      | /tmp/outside         |
      | ~/outside            |
      | ../escape            |
      | src/**               |
      | .env                 |
      | a NUL-bearing path   |
      | a non-NFC path       |

  Scenario Outline: Decision lifecycle status has one deterministic meaning
    Given an otherwise matching structured constraint with status <status>
    When its forbidden action is evaluated from a current approved snapshot
    Then its policy behavior is <behavior>

    Examples:
      | status      | behavior                                      |
      | accepted    | govern only when individually human-approved  |
      | rejected    | remain inactive and never block               |
      | superseded  | remain inactive and never block               |
      | deprecated  | remain inactive and never block               |
      | proposed    | remain inactive and never block               |

  Scenario: An accepted but individually unreviewed decision requires human review
    Given a current store approval containing a matching accepted constraint
    But that decision's human review is pending, missing, or rejected
    When required pre-action evidence is evaluated
    Then the result fails with decision-review-required
    And it cannot silently enforce the decision or allow the action
    And a separately accepted approved replacement may govern while its superseded predecessor stays inactive

  Scenario: Pre-action evidence reuses trusted internal metadata without policy prose
    Given a current approved snapshot and a valid exact action request
    When pre-action evidence is evaluated twice
    Then both immutable results are byte-equivalent
    And each includes executorKind internal, trustTier trusted, stable status and reason codes, the current store fingerprint, normalized action id, and sorted validated ids
    And neither includes title, context, decision prose, consequences, raw source, arbitrary errors, or a second quality-gate kind

  Scenario: Current passing action evidence produces a current handoff
    Given a current approved snapshot
    And an orchestrator expected fingerprint equal to that snapshot
    And bounded unique required pre-action results that all passed for the same fingerprint
    When DEC-01 handoff evidence is evaluated
    Then it passes with the exact current fingerprint and sorted action summaries
    And the result is deterministic, detached, deeply frozen, and free of decision prose
    But copied, reconstructed, serialized, or legacy-shaped action results are invalid evidence

  Scenario Outline: Stale or incomplete action evidence blocks handoff
    Given handoff evidence containing <case>
    When DEC-01 handoff evidence is evaluated
    Then it fails with <code>
    And it never fabricates a passing required decision result

    Examples:
      | case                                             | code                    |
      | a missing or different expected store fingerprint | stale-store-fingerprint |
      | a missing or stale human approval               | human-review-required   |
      | an action result from another store fingerprint | stale-action-evidence   |
      | a failed required pre-action result             | pre-action-failed       |
      | duplicate action ids                            | duplicate-action        |
      | more action results than the published bound    | bounds                  |

  Scenario: Legacy heuristic helpers remain advisory and integration stays serialized
    Given existing CRUD, query, supersede, template, and natural-language decision helpers
    When DEC-01 trusted evidence is requested
    Then existing compatibility behavior remains available
    But heuristic phrase matches and unstructured accepted records cannot authorize a trusted required pass
    And DEC-01 changes only decision-library tests and work-package documentation
    And it adds no bdd-mode integration, quality-gate enum, watcher, timer, live sink, approval authority, or fleet entrypoint
    And FIT-01 remains the sole later owner of canonical gate integration after SEC-01

  Scenario: Decision trust is externally mutation-sensitive
    Given locked tests for stale agent-writable approval and exact structured prohibition
    When stale-fingerprint detection or forbidden-action enforcement is deliberately disabled
    Then the named focused oracle fails for the intended behavior
    When the guard is restored
    Then the focused suite passes without changing the locked oracle

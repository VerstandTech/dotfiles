@CON-01 @contracts @high-assurance
Feature: Versioned contracts fail closed before structured handoff
  As the local high-assurance orchestrator
  I want role, result, approval, artifact, and validation handoffs to use bounded V1 contracts
  So malformed or ambiguous model output cannot authorize work or become assurance evidence

  Background:
    Given every contract input is treated as untrusted
    And CON-01 owns structural validation and deterministic rendering only
    And BDD-01 owns causal failure classification and trusted gate execution
    And RED-01, APR-01, ISO-01, OBS-01, ROLE-01, and ORC-01 retain their declared authorities

  Scenario: Minimal valid V1 fixtures round-trip canonically
    Given a minimal valid fixture for each supported V1 kind
    When each fixture is parsed, canonicalized, and parsed again
    Then each result is valid and semantically equal to its source
    And equivalent object insertion orders produce identical canonical bytes

  Scenario: Unsupported envelopes and unknown fields fail closed
    Given inputs with missing required fields, unknown fields, unknown kinds, or wrong primitive types
    And versions including missing, zero, two, boolean, and string one
    When a V1 parser validates them
    Then each input is rejected with bounded stable issues
    And no field is coerced, dropped, or silently upgraded

  Scenario: Executable or pathological object graphs cannot become contracts
    Given untrusted values containing accessors, functions, symbols, bigint, non-finite numbers, custom prototypes, cycles, sparse arrays, or dangerous own keys
    When a V1 parser validates them
    Then validation rejects without invoking getters
    And Object.prototype remains unchanged
    And no crash is interpreted as success

  Scenario: Published bounds fail closed without truncating authoritative data
    Given strings, paths, commands, arrays, maps, nesting, serialized bytes, rendered Markdown, or issue counts beyond their published limits
    When the value is parsed or rendered
    Then it is rejected with a bound issue
    But exact-bound positive controls pass without silent truncation

  Scenario Outline: Artifact references are safe repository-relative paths
    Given an artifact reference "<path>"
    When structural path policy validates it
    Then the result is "<result>"

    Examples:
      | path                                                        | result  |
      | docs/plans/work-packages/CON-01.feature                     | valid   |
      | agents-shared/.agents/adapters/pi/personal/lib/contracts/x  | valid   |
      | ../outside                                                  | invalid |
      | a/../../outside                                             | invalid |
      | /tmp/outside                                                | invalid |
      | C:\\outside                                                 | invalid |
      | ~/outside                                                   | invalid |
      | file:///tmp/outside                                        | invalid |
      | https://example.invalid/a                                   | invalid |
      | .env                                                        | invalid |
      | auth.json                                                   | invalid |

  Scenario: Role requests obey the assurance role and write-scope matrix
    Given bounded requests for every existing assurance role
    Then valid role, phase, scope, tool, path, model, thinking, and budget combinations pass
    But unknown roles, empty goals, overlapping paths, noncanonical tools, and mismatched write scopes fail before spawn
    And no request field grants a pane, writer lease, or approval authority

  Scenario: Role results preserve uncertainty and repository state
    Given completed, blocked, failed, unknown, clean, dirty, and missing-usage result fixtures
    When RoleResultV1 validates and renders them
    Then every status and dirty state is preserved exactly
    And missing usage remains unknown rather than zero
    But malformed SHAs, unsafe paths, raw transcript fields, contradictions, and completed results with blockers fail

  Scenario: Approval data is structurally bound without claiming authority
    Given an approval request and matching decision with claimed human provenance
    When their identifiers, action, risk, paths, candidate SHA, fingerprint, and expiry are checked
    Then structurally matching unexpired data passes
    But drift, malformed time, expiry, or missing approved-human fields fails closed
    And the result explicitly states that APR-01 must establish actual authority

  Scenario: ValidationContractV1 preserves the BDD causal oracle
    Given a contract with an exact focused command, expected test ID, optional compatible failure signature, green relation, forbidden pre-red paths, and required sensitivity
    When it maps to a BDD-01 ExpectedRedContract
    Then the expected test ID, signature, and identity or signature mode are preserved byte-for-byte
    And no trust or causal classification is added
    But legacy mode, missing sensitivity, signature mode without a signature, or unsafe paths fail

  Scenario: Markdown is derived only from validated data
    Given a valid contract containing heading, link, and code-fence metacharacters
    When its Markdown renderer runs
    Then output is bounded, deterministic, and cannot forge authoritative status or approval sections
    But invalid or unvalidated values are refused

  Scenario: Legacy Markdown remains assurance-ineligible
    Given bounded legacy handoff Markdown that appears to claim completion or approval
    When the explicit legacy adapter parses it
    Then it is labeled legacy and assurance-ineligible
    And it cannot become an authoritative role result or approval decision
    But oversized legacy input is rejected

  Scenario: Contract ownership stays additive and sensitivity is observable
    Then lib/contracts has no runtime dependency on redaction, extension spawn, worktree lease, or trajectory persistence modules
    And no new package dependency or pin is required
    When a version, unknown-field, path, causal-binding, or validated-render guard is deliberately weakened
    Then its named focused acceptance oracle fails
    And restoring the guard makes the same oracle pass

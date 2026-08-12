# Personas: Leo (local operator), Nikhil (security reviewer), André (extension maintainer), Sofia (product engineer)
# Example Map: SEC-UX-01 R1-R18 / E1-E108 / Q1-Q24
@SEC-UX-01 @security @redaction @operator-usability
Feature: Safe tool results remain visible without weakening RED-01
  As Leo and Sofia using guarded local development tools
  I want optional or independently unsafe result metadata handled precisely
  So genuine secrets remain blocked while safe diagnostics remain actionable

  Background:
    Given RED-01 is the sole byte-redaction authority
    And tool-result policy has no tool-name allowlist
    And no project file, model statement, or profile may bypass result redaction

  @causal-red @operator
  Scenario: Safe content with absent details is not falsely refused
    Given a successful safe tool result with readable text content
    And the optional details channel is absent
    When the security result adapter prepares the result
    Then the readable content is returned
    And the result does not contain "security-policy: redaction-refused"
    And security provenance is closed and bounded

  Scenario Outline: Ordinary safe tools need no special allowlist
    Given <tool> returns safe bounded text with no details
    When the security result adapter prepares the result
    Then the safe text remains visible
    And no raw bypass was used

    Examples:
      | tool                         |
      | read                         |
      | bash                         |
      | bdd_status                   |
      | bdd_run_quality_gates        |
      | ctx_execute                  |
      | future-safe-tool             |

  Scenario Outline: Optional undefined channels are normalized as absent
    Given a safe result whose <channel> own data property is undefined
    When the security result adapter prepares the result
    Then the undefined channel is omitted before RED-01
    And the other safe channel remains available

    Examples:
      | channel |
      | content |
      | details |

  @independent-channels
  Scenario Outline: Unsafe auxiliary details do not hide safe primary content
    Given safe bounded primary content
    And details contain a <hostile-shape>
    When the security result adapter prepares the result
    Then the safe primary content remains visible
    And details contain only code "details-redaction-refused"
    And no details keys, values, previews, or exception messages are returned

    Examples:
      | hostile-shape    |
      | cycle            |
      | binary value     |
      | accessor         |
      | proxy trap error |
      | oversized value  |

  @fail-closed
  Scenario Outline: Unsafe primary content never falls back to raw bytes
    Given primary content contains a <hostile-shape>
    And auxiliary details are safe
    When the security result adapter prepares the result
    Then the returned result is an error
    And its primary text is "security-policy: content-redaction-refused"
    And no source bytes or provider messages are returned

    Examples:
      | hostile-shape   |
      | cycle           |
      | binary value    |
      | accessor        |
      | oversized value |

  @secrets
  Scenario Outline: Real secret families remain absent from every returned channel
    Given a result channel contains a synthetic <secret-family>
    When the security result adapter prepares the result
    Then the synthetic secret is absent from content and details
    And only RED-01-safe replacement data may remain

    Examples:
      | secret-family       |
      | authorization token |
      | private key         |
      | URI userinfo        |
      | unknown entropy     |
      | credential path     |

  @tool-errors
  Scenario: Genuine tool failure retains safe diagnostics
    Given a failed tool returns safe bounded diagnostic content
    And optional details are absent
    When the security result adapter prepares the result
    Then the returned result remains an error
    And the safe diagnostic content remains visible
    And the adapter does not replace it with a false redaction refusal

  Scenario: Details-only refusal does not claim the tool failed
    Given a successful tool returns safe content and cyclic details
    When the security result adapter prepares the result
    Then the original success state is retained
    And details disclose only that auxiliary metadata was unavailable

  Scenario: Content refusal cannot claim successful delivery
    Given a successful tool returns unredactable primary content
    When the security result adapter prepares the result
    Then the returned result is an error
    And no safe details can manufacture success

  @closed-envelope
  Scenario Outline: Invalid authority fields refuse before channel handling
    Given a result envelope has <invalid-field>
    When the security result adapter prepares the result
    Then the whole result is replaced by one stable non-echoing refusal
    And neither content nor details is inspected for fallback

    Examples:
      | invalid-field             |
      | missing tool name         |
      | malformed tool name       |
      | hostile tool-name getter  |
      | non-boolean error state   |

  @compatibility
  Scenario: Existing safe two-channel results remain compatible
    Given a result contains safe content and safe details
    When the security result adapter prepares the result
    Then both channels remain JSON-safe and detached
    And content is not double-wrapped as serialized result JSON
    And the V1 exported function names remain unchanged

  Scenario: Both optional channels absent produce a stable empty result
    Given a valid result envelope with neither content nor details
    When the security result adapter prepares the result
    Then it returns deterministic empty text content
    And it returns closed security provenance
    And it does not return a redaction refusal

  @bounds
  Scenario Outline: Channel and aggregate budgets remain bounded
    Given safe result data at <boundary>
    When the security result adapter prepares the result
    Then the outcome follows the locked RED-01 and aggregate limits
    And no retry, truncation loop, or adaptive relaxation occurs

    Examples:
      | boundary                    |
      | exact content limit          |
      | content limit plus one       |
      | exact details limit          |
      | details limit plus one       |
      | exact aggregate output limit |
      | aggregate limit plus one     |

  @purity
  Scenario: Result preparation has no ambient authority
    Given the same closed result input twice
    When the security result adapter prepares both results
    Then their canonical outputs are equal
    And preparation reads no environment, filesystem, network, clock, process, or socket
    And it writes no persistence or telemetry

  @regression
  Scenario: Strict security controls remain unchanged
    Given the existing strict profile and capability tests
    When SEC-UX-01 result precision is enabled
    Then initialization failures still block
    And secret aliases, command denials, egress denials, and unavailable security gates remain non-passing
    And lifecycle disposal remains exactly once

  @mutation
  Scenario Outline: Precision changes are mutation-sensitive
    Given the green implementation
    When it is mutated to <unsafe-or-regressive-change>
    Then a named SEC-UX-01 acceptance test fails

    Examples:
      | unsafe-or-regressive-change          |
      | restore whole-envelope redaction     |
      | serialize absent undefined details   |
      | hide safe content on details refusal |
      | return raw content on refusal         |
      | trust a tool-name allowlist           |

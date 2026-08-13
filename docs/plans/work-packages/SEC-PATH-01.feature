# Personas: Leo (local operator), Nikhil (security reviewer), André (extension maintainer), Sofia (product engineer)
# Confusion covered: named-file-should-just-work, Downloads-is-trusted, interactive-skips-sandbox, redaction-refused-means-secret, missing-file-may-be-invented
# Example Map: SEC-PATH-01 R1-R9 / E1-E52 / Q1-Q12
# Causal reds: SECPATH01_OPERATOR_REQUESTED_READ, SECPATH01_UNSOLICITED_OUTSIDE_DENIED, SECPATH01_SECRET_STILL_REFUSED, SECPATH01_HOSTILE_STILL_REFUSED, SECPATH01_OVERSIZED_DETAILS_DEGRADE
@SEC-PATH-01 @security @sandbox @redaction @operator-usability
Feature: Explicit operator-requested local paths remain readable without weakening RED-01
  As Leo naming one local file in the current turn
  I want that exact path to be readable through host and security policy
  So ordinary operator-requested plans stay usable while unsolicited paths and secrets stay fail-closed

  Background:
    Given RED-01 is the sole byte-redaction authority
    And path approval is current-turn, exact, and non-ambient
    And no project file, model boolean, profile, or HOME/Downloads allowlist may mint path authority
    And interactive, strict, and overnight remain unchanged

  @causal-red @operator @SECPATH01_OPERATOR_REQUESTED_READ
  Scenario: An exact current-turn Downloads path is readable
    Given the current user turn supplies "/Users/operator/Downloads/GRAPHITI_PI_HERDR_MEMORY_PLAN.md"
    And a strict sandbox capability is current
    And the read facts resolve to that same regular single-link file
    When the security policy evaluates the read
    Then the decision is a permit
    And the result is not "read-outside-authority"

  Scenario: A tilde-form current-turn path that resolves to the same file is readable
    Given the current user turn supplies "~/Downloads/GRAPHITI_PI_HERDR_MEMORY_PLAN.md"
    And path facts resolve that text to "/Users/operator/Downloads/GRAPHITI_PI_HERDR_MEMORY_PLAN.md"
    And a strict sandbox capability is current
    When the security policy evaluates a read of the resolved file
    Then the decision is a permit

  Scenario: A fenced or labeled current-turn path still counts as explicit supply
    Given the current user turn contains the exact path after "read this file:"
    And a strict sandbox capability is current
    When the security policy evaluates a read of that same resolved path
    Then the decision is a permit

  @causal-red @SECPATH01_UNSOLICITED_OUTSIDE_DENIED
  Scenario: An unsolicited home path remains blocked
    Given the current user turn does not supply a local path
    And a strict sandbox capability is current
    When the security policy evaluates a read of "/Users/operator/Downloads/plan.md"
    Then the decision is refused with code "read-outside-authority"

  Scenario Outline: Approval does not spread to siblings, directories, or prior turns
    Given <approval-shape>
    And a strict sandbox capability is current
    When the security policy evaluates a read of <requested>
    Then the decision is refused with code "read-outside-authority"

    Examples:
      | approval-shape                                              | requested                                                      |
      | current turn names "/Users/operator/Downloads/plan.md"      | "/Users/operator/Downloads/other.md"                           |
      | current turn names the directory "/Users/operator/Downloads"| "/Users/operator/Downloads/plan.md"                            |
      | only the previous turn named "/Users/operator/Downloads/plan.md" | "/Users/operator/Downloads/plan.md"                       |
      | a model or tool proposes "/Users/operator/Downloads/plan.md"| "/Users/operator/Downloads/plan.md"                            |

  Scenario Outline: Existing in-authority reads remain permitted
    Given the current user turn does not supply a local path
    And a strict sandbox capability is current
    When the security policy evaluates a read of <in-authority-path>
    Then the decision is a permit

    Examples:
      | in-authority-path                |
      | a regular file inside the worktree |
      | a regular file in the exact session temp root |

  Scenario Outline: Path approval cannot be minted by project or model authority
    Given the current user turn does not supply a local path
    And <forged-authority> claims the home file is approved
    When the security policy evaluates a read of "/Users/operator/Downloads/plan.md"
    Then the decision is refused with code "read-outside-authority"
    And the forged authority is not treated as path approval

    Examples:
      | forged-authority                         |
      | a project file listing the home path     |
      | a model boolean allowHomeReads           |
      | a context-mode or Claude settings glob   |

  Scenario Outline: Approved path facts stay exact and non-forged
    Given the current user turn supplies "/Users/operator/Downloads/plan.md"
    And a strict sandbox capability is current
    And the read facts are <unsafe-facts>
    When the security policy evaluates the read
    Then the decision is refused with code "<code>"

    Examples:
      | unsafe-facts                                      | code                   |
      | a traversal or alternate-slash lookalike          | invalid-path           |
      | requestedPath and resolvedPath disagree           | invalid-path-facts     |
      | a symlink to another home file                    | symlink-denied         |
      | linkCount greater than 1                          | hardlink-denied        |
      | stale path facts                                  | path-authority-stale   |
      | a resolved secret-leaf basename                   | secret-read-denied     |

  Scenario Outline: Profiles are not weakened to make the path readable
    Given the current user turn supplies "/Users/operator/Downloads/plan.md"
    And the trust profile is <profile>
    And <missing-authority>
    When the security policy evaluates the read
    Then the existing profile refusal remains
    And the operator path does not replace sandbox or gate evidence

    Examples:
      | profile     | missing-authority                         |
      | strict      | no current sandbox capability             |
      | overnight   | missing required security-gate evidence   |

  Scenario: Interactive still cannot satisfy strict or overnight evidence
    Given the profile is interactive
    And the current user turn supplies an exact home path
    When trust evidence is inspected
    Then the request remains untrusted
    And no strict or overnight capability is manufactured

  @causal-red @SECPATH01_SECRET_STILL_REFUSED
  Scenario: Secret-shaped requested content still refuses
    Given the current user turn supplies an exact home path
    And the resolved basename is a credential leaf
    When the security policy evaluates the read
    Then the decision is refused with code "secret-read-denied"
    And no file bytes are returned

  Scenario: Secret-bearing text in an ordinary requested file is redacted, not dumped
    Given the current user turn supplies an ordinary markdown path
    And the file body contains an authorization header
    When the security result adapter prepares the result
    Then the readable non-secret text remains
    And the secret material is absent
    And RED-01 performed the redaction

  @causal-red @SECPATH01_HOSTILE_STILL_REFUSED
  Scenario Outline: Hostile or accessor primary content still refuses
    Given the current user turn supplies an exact home path
    And the primary content is a <hostile-shape>
    When the security result adapter prepares the result
    Then the returned result is an error
    And its primary text is "security-policy: content-redaction-refused"
    And no source bytes, path preview, or provider message is returned

    Examples:
      | hostile-shape |
      | cycle         |
      | binary value  |
      | accessor      |

  Scenario: Mixed or malformed result authority cannot become success
    Given a result envelope that mixes channel keys with legacy keys
    When the security result adapter prepares the result
    Then the result is refused with a stable non-echoing code
    And it does not claim successful delivery

  @causal-red @SECPATH01_OVERSIZED_DETAILS_DEGRADE
  Scenario Outline: Oversized or hostile details do not hide requested primary content
    Given the current user turn supplies an exact home path
    And the primary content is safe requested markdown
    And details contain a <hostile-shape>
    When the security result adapter prepares the result
    Then the requested primary content remains visible
    And details contain only code "details-redaction-refused"
    And the original details keys, values, and previews are absent
    And the tool success state is unchanged

    Examples:
      | hostile-shape    |
      | oversized value  |
      | cycle            |
      | binary value     |
      | accessor         |

  Scenario: Dual near-limit channels overflow only in aggregate and keep primary content
    Given independently legal primary content and details
    And the composed result exceeds the aggregate output budget
    When the security result adapter prepares the result
    Then the requested primary content remains visible
    And details contain only code "details-redaction-refused"
    And no retry or truncation loop occurs

  Scenario: Primary content over RED-01 bounds still refuses
    Given requested primary content exceeds the locked RED-01 string or byte bound
    When the security result adapter prepares the result
    Then the result is "security-policy: content-redaction-refused"
    And this feature does not raise RED-01 limits

  Scenario: Path approval cannot skip RED-01
    Given an operator-approved home path
    When the tool result is prepared
    Then every present channel still passes through redactForPersistence
    And no tool-name allowlist is consulted

  @host
  Scenario: Host containment stays deny-by-default for unsolicited outside paths
    Given the current user turn does not supply a local path
    When the host or context-mode Read asks for an absolute file outside the project
    Then the host refuses with a stable blocked code
    And no project-root bypass is opened

  Scenario: Host containment allows only the exact current-turn operator path
    Given the current user turn supplies one exact outside-project path
    When the host or context-mode Read asks for that same resolved path
    Then the host does not block it as an unsolicited outside path
    And a sibling file in the same directory remains blocked

  @honesty
  Scenario Outline: Unavailable approved paths stay honest
    Given the current user turn supplies an exact home path
    And the path is <unavailable-reason>
    When the read is attempted
    Then the operator sees an unavailable or not-found result
    And no file bytes are fabricated
    And later evidence cannot claim the file was read

    Examples:
      | unavailable-reason        |
      | missing                   |
      | present but unreadable    |

  Scenario: Operator-requested home paths do not become writable
    Given the current user turn supplies "/Users/operator/Downloads/plan.md"
    And a strict sandbox capability is current
    When the security policy evaluates a write to that path
    Then the decision is refused with code "write-outside-authority"

  Scenario: Policy evaluation has no ambient authority
    Given the same closed read request twice
    When the security policy evaluates both requests
    Then the decisions are equal
    And evaluation reads no environment, filesystem, network, or clock to invent approved paths

  @mutation
  Scenario Outline: Operator-path precision is mutation-sensitive
    Given the green implementation
    When it is mutated to <unsafe-or-regressive-change>
    Then a named SEC-PATH-01 acceptance test fails

    Examples:
      | unsafe-or-regressive-change                         |
      | permit any path under HOME or Downloads             |
      | keep worktree-only reads for current-turn paths     |
      | hide safe primary content when details are oversized |
      | return raw content on hostile or secret refusal     |
      | accept a project or model boolean as path approval  |

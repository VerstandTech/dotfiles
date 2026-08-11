@RED-01 @security @redaction @persistence
Feature: Redact untrusted evidence before any persistence sink
  As the local operator responsible for assurance evidence
  I want one bounded redaction authority in front of future trajectory and handoff sinks
  So that diagnostics remain useful without writing credentials, private material, or unsafe previews

  Background:
    Given the CON-01 field limits and concrete path policy
    And a pure RED-01 candidate-to-canonical-JSON operation
    And unique synthetic secrets that are not live credentials

  Scenario: Safe evidence becomes detached deterministic canonical JSON
    Given two equivalent safe nested objects with different insertion order
    When each object is redacted for persistence
    Then both operations succeed with byte-identical canonical JSON
    And array order and safe contract fields remain unchanged
    And each safe value is deeply frozen and detached from its input graph
    And changing the original object cannot change either successful result

  Scenario: Sensitive fields and secret-bearing containers preserve only safe structure
    Given nested credential fields using case, separator, and camel-case variants
    And an environment object containing synthetic values
    And headers containing authorization, cookie, and safe content-type values
    When the candidate is redacted for persistence
    Then credential and environment values are fixed markers
    And sensitive header values are fixed markers
    And safe field names, environment names, and content-type remain diagnosable
    And maxTokens, tokenBudget, secretScanPassed, secretPathPolicy, and authMode are not false positives

  Scenario: Known tokens, private keys, URI credentials, and credential paths cannot survive free text
    Given free text, command summaries, previews, arrays, and objects containing synthetic known-token shapes
    And a synthetic PEM private-key block
    And a URI with synthetic userinfo
    And SSH, cloud, package-manager, environment, kubeconfig, and service-account credential paths
    When the candidate is redacted for persistence
    Then every secret-bearing substring or uncertain containing string is replaced
    And a URL without userinfo remains readable
    And no raw private-key body or credential path appears in canonical bytes

  Scenario: Unknown high-entropy tokens are removed without destroying recognized identifiers
    Given an unknown whitespace-free token of at least 24 characters and at least 4.2 bits of entropy per character
    And ordinary prose, a UUID task identifier, a Git head SHA, and a caller-supplied SHA-256 digest
    When the candidate is redacted for persistence
    Then the unknown token is replaced
    And recognized identifier and digest fields remain unchanged
    And equivalent token-shaped text in an untyped preview remains subject to conservative inspection
    And RED-01 creates no hash from the removed token

  Scenario: Percent, base64, and base64url secret previews are inspected within fixed bounds
    Given percent-encoded, base64, and unpadded base64url forms of a synthetic API-key assignment
    And bounded encoded prose that reveals no secret
    When the candidate is redacted for persistence
    Then every encoded secret candidate is replaced as a whole
    And no decoded secret is returned or retained
    And safe encoded prose remains when it is not independently secret-like
    And decoding performs at most two percent passes and one base64 or base64url pass

  Scenario: Nested arrays, objects, and secret-bearing object keys satisfy the raw-byte invariant
    Given the same unique synthetic secret at multiple nested values
    And a property whose key itself contains that synthetic secret
    And another property that would collide with a redacted-key marker
    When the candidate is redacted for persistence
    Then all occurrences are removed from the safe value and canonical JSON
    And replacement property names are deterministic and collision-safe
    And the redaction count matches every replacement
    And the input object remains unchanged

  Scenario Outline: Unsupported or hostile structures refuse without echoing input
    Given an untrusted candidate containing <case>
    When the candidate is redacted for persistence
    Then the operation refuses with code <code>
    And it returns no partial value or canonical bytes
    And its refusal contains no raw input key, value, preview, or object-generated message

    Examples:
      | case                                      | code             |
      | a circular reference                      | cycle            |
      | an enumerable getter that would throw     | accessor         |
      | a function, symbol, bigint, or class value | unsupported-type |
      | a non-finite number                       | unsupported-type |
      | a prototype-pollution data key            | unsafe-key       |
      | a proxy whose own-key operation throws    | hostile-object   |

  Scenario Outline: Binary and over-bound candidates refuse before a sink receives bytes
    Given an untrusted candidate exceeding <limit>
    When the candidate is redacted for persistence
    Then the operation refuses with code <code>
    And no truncated preview or partial canonical JSON is returned

    Examples:
      | limit                         | code            |
      | supported binary input        | binary          |
      | nesting depth 16              | max-depth       |
      | string length 4096            | max-string      |
      | array length 256              | max-array       |
      | object own-key count 256      | max-object-keys |
      | total bounded input bytes     | max-input-bytes |
      | canonical serialized bytes    | max-output-bytes |

  Scenario: Safe references survive while unsafe and credential paths do not
    Given safe glob-free repository-relative artifact and evidence paths
    And recognized Git SHA and lowercase SHA-256 fields
    And absolute, home-relative, traversal, glob, NUL-bearing, and credential-leaf paths
    When the candidate is redacted for persistence
    Then safe repository-relative paths and validated caller-supplied hashes remain unchanged
    And every unsafe path is replaced without being normalized into authority
    And a malformed digest is never relabeled as trusted
    And no detected secret is deterministically hashed

  Scenario: A future sink can write only successful RED-01 bytes
    Given one safe candidate and one binary or oversized candidate
    When a prospective sink requests RED-01 output
    Then only the safe candidate exposes canonical JSON bytes
    And the refused candidate disables that persistence attempt
    And no unsafe, force, detector-disable, or raw-fallback API exists
    And RED-01 itself performs no file, environment, network, clock, or process access

  Scenario: Synthetic fixture bytes never appear in any successful output
    Given unique raw, percent-encoded, base64, base64url, private-key, credential-path, and secret-key fixtures
    When all supported nested positions are redacted for persistence
    Then none of those fixture bytes appears in the returned value or canonical JSON
    And semantically safe neighboring fields remain readable

  Scenario: Acceptance remains sensitive to encoded-preview redaction
    Given the focused RED-01 acceptance suite passes
    When bounded encoded-preview inspection is deliberately disabled
    Then the focused suite fails because an encoded synthetic secret survives
    And restoring encoded-preview inspection makes the focused suite pass

Feature: BDD-01 machine-checkable red cause and trusted gate execution
  Assurance-enabled BDD must reject non-causal red evidence and only treat
  trusted argv/internal gates as required-assurance evidence. Interactive shell
  strings remain visible but untrusted. BDD-01 freezes additive red/trust
  semantics without implementing CON-01 schemas, SEC-01 sandbox/egress, or
  FIT-01 internal adapters.

  Background:
    Given the focused command is "cd agents-shared/.agents/adapters/pi/personal && bun test lib/bdd/run-command.test.ts lib/bdd/quality-gates.test.ts"
    And production paths "lib/bdd/run-command.ts", "lib/bdd/config.ts", "lib/bdd/types.ts", "lib/bdd/quality-gates.ts", "lib/bdd/phases.ts", and "extensions/bdd-mode.ts" stay untouched during red
    And existing timeout, infrastructure, green-coverage, and gate-order assertions remain intact
    And no live fleet or subagent delegation is used for BDD-01

  # --- R1 / R2 expected-red classifier ---

  Scenario: Expected identity hit is assurance-causal (E1, R1)
    Given a non-zero result whose failed-test hints include the expected test id
    And an expected-red contract with matchMode "identity"
    When validateRedResult runs with that contract
    Then ok is true
    And the result is assurance-eligible with an expected-assertion cause

  Scenario: Unrelated failing assertion is rejected when expected id is absent (E2, R1, R2)
    Given a non-zero result whose output and hints name only an unrelated test
    And an expected-red contract supplies expectedTestId
    When validateRedResult runs with that contract
    Then ok is false
    And the reason identifies missing or unrelated identity
    And the failure is not timeout, spawn, import, or command-not-found
    And this is the primary focused causal red against current production

  Scenario: Signature mismatch is rejected (E3, R1)
    Given the expected test id appears but the required failure signature does not
    And matchMode is "signature"
    When validateRedResult runs
    Then ok is false with a signature-mismatch cause

  Scenario: Identity plus signature hit is accepted (E4, R1)
    Given the expected test id and expectedFailureSignature both appear
    When the signature classifier runs
    Then ok is true and assurance-eligible

  Scenario: Setup and import failures are never causal red (E5, R2)
    Given non-zero output containing "Cannot find module" or import/setup failure text
    When the classifier runs even with a contract
    Then ok is false with a setup/import reason code

  Scenario: Timeout, spawn, infrastructure, and pass are rejected (E6, E7, E8, E9, R2)
    Given timeout/124, spawn error, exit 126/127, or exit zero
    When validateRedResult runs
    Then each case is rejected with a distinct reason code
    And none can be recorded as assurance-causal red

  Scenario: Classifier precedence is deterministic (R2)
    Given a result that could match multiple invalid classes
    When the classifier runs
    Then precedence is timeout/124, spawn, 126/127, exit zero, setup/import, then identity/signature matching

  # --- R3 legacy interactive red ---

  Scenario: Legacy interactive non-zero remains visible but non-assurance (E10, R3)
    Given a non-zero test-like failure and no expected-red contract
    And the trust profile is interactive
    When validateRedResult runs
    Then ok may be true for backwards compatibility
    And evidence is labeled interactive_untrusted, legacy, and assuranceEligible false

  Scenario: Assurance-enabled workflows require a contract (E11, R3, R4)
    Given assurance is enabled and no expectedTestId is supplied
    When bdd_assert_red runs
    Then the call is rejected as contract-required

  # --- R4 tool wiring / progression ---

  Scenario: Causal contract is recorded with fingerprint (E12, R4, R8)
    Given a matching expected-red contract
    When bdd_assert_red records evidence
    Then evidence includes expectedTestId, optional signature, matchMode, cause, eligibility, trust tier, and config fingerprint

  Scenario: Legacy red cannot enter green under assurance (E13, R4)
    Given only legacy interactive red exists and assurance is enabled
    When a green transition is requested
    Then progression is blocked until causal red exists

  Scenario: Mutation fail-leg reuses the expected-red contract (E30, E31, R4, R9)
    Given command-backed mutation with an expected-red contract
    When the fail step matches an unrelated assertion
    Then mutation evidence is rejected
    When the fail step matches the same id/signature and pass is green
    Then assertion sensitivity is recorded

  # --- R5 trusted argv runner ---

  Scenario: Trusted argv spawns with shell false (E14, R5)
    Given a valid argv executable and args
    When the trusted command runner executes
    Then spawn receives file and args with shell false

  Scenario: Secret-like env keys are scrubbed (E15, R5)
    Given parent env contains API keys, tokens, and passwords
    When a trusted argv command runs
    Then secret-like keys are absent from the child env

  Scenario: Deterministic allowlisted env survives (E16, R5)
    Given PATH, HOME, LANG, TMPDIR, and CI are present
    When a trusted argv command runs
    Then those allowlisted keys survive scrubbing

  Scenario: Invalid executable or cwd is rejected without spawn (E17, E18, R5)
    Given an argv executable with NUL or shell metacharacters
    Or an argv cwd that escapes the project root
    When the runner validates
    Then policyRejected is set and spawn is not called

  Scenario: Output is bounded (E19, R5)
    Given argv output exceeds the configured maximum
    When the command runs
    Then retained output is bounded and deterministically marked or truncated

  # --- R6 shell untrusted ---

  Scenario: Interactive shell gates are visible and untrusted (E20, R6)
    Given a shell string gate in the interactive profile
    When the gate runs
    Then the result is labeled interactive_untrusted
    And it cannot satisfy a required assurance gate

  Scenario: Strict and overnight reject shell before spawn (E21, R6)
    Given a shell string gate in strict or overnight profile
    When the gate plan executes
    Then policy rejects before spawn
    And the rejection is never represented as exit-zero success

  Scenario: Trusted argv can pass under strict (E22, R6, R5)
    Given an argv gate in the strict profile
    When the gate runs successfully
    Then the trusted argv result can pass a required assurance gate

  # --- R7 gate model ---

  Scenario: Unknown internal check fails closed (E23, R7, E36)
    Given a required internal gate with an unknown check id
    When the gate runs
    Then status is failed or unavailable
    And it never passes
    And FIT/SEC capabilities remain unavailable rather than fabricated

  Scenario: Executor specs participate in plan fingerprints (E24, R7)
    Given otherwise-equal shell and argv plans
    When fingerprints are built
    Then the plan fingerprints differ

  # --- R8 config fingerprints ---

  Scenario: Config fingerprints are deterministic and sensitive (E25, E26, R8)
    Given identical config twice
    When fingerprintConfig runs
    Then values are identical
    When gate command, trust profile, threshold, or timeout changes
    Then the fingerprint changes

  Scenario: Dual command config and trust profiles parse (E33, E34, E35, R8)
    Given legacy project command strings in interactive mode
    When config parses
    Then migration is visible and non-assurance rather than silently dropped
    Given an argv or internal command object
    Then the canonical command spec round-trips
    Given a malformed command object or unknown strict gate kind
    Then an integrity error is explicit

  # --- R9 assurance handoff ---

  Scenario: Stale config fingerprint gaps handoff (E27, R8, R9)
    Given assurance evidence bound to an old config fingerprint
    When handoff runs
    Then a stale-config gap is reported

  Scenario: Untrusted required gate leaves assurance incomplete (E28, R6, R9)
    Given a required gate result marked interactive_untrusted
    When handoff runs under assurance
    Then assurance remains incomplete

  Scenario: Note-only mutation cannot complete assurance (E29, R9)
    Given causal red and covering green but note-only mutation
    When handoff requires command-backed matched mutation
    Then a sensitivity gap is reported

  Scenario: Existing green coverage compatibility remains (E32, R9)
    Given a broader green command that covers focused red
    When greenCoversRed runs
    Then compatibility remains green

  # --- R10 ownership / wiring ---

  Scenario: Minimal extension records expected-red contract fields (R4, R10)
    Given extensions/bdd-mode.ts source
    When the bdd-mode contract oracle runs
    Then bdd_assert_red parameters include expectedTestId, expectedFailureSignature, and matchMode
    And recorded red evidence paths reference those fields and config fingerprint
    And the oracle is not solely brittle incidental formatting

  Scenario: Focused baseline is the causal red until implementation (R10)
    Given current production validateRedResult accepts any non-zero without identity matching
    When the focused BDD-01 command runs
    Then it fails at "rejects an unrelated failing assertion when the expected test id is absent"
    And the failure shows ok true received where false was expected for an unrelated assertion under contract
    And it does not fail because of import, setup, timeout, or command-not-found

  # --- Adversarial review lock (E37–E47 / R1,R4–R9,R11–R12) ---

  Scenario: Short reverse-substring hint is not identity (E37, R1)
    Given an expected-red identity contract
    And a failed-test hint that is only a short substring of the expected test id
    When validateRedResult runs
    Then ok is false and the result is not assurance-causal
    And reverse-substring containment alone cannot prove identity

  Scenario: Assurance green refuses legacy non-causal red (E38, R4)
    Given assurance is enabled and only legacy or non-causal red evidence exists
    When bdd_assert_green runs even if the focused suite would pass
    Then green is refused
    And implementation paths are not unlocked from that non-causal red

  Scenario: Mutation matched requires assurance-eligible expected assertion (E39, R4, R9)
    Given mutation fail leg classifies as legacy or unrelated
    When the mutation tool records evidence
    Then matched is false
    And the evidence cannot satisfy assurance handoff

  Scenario: Undefined mutation matched cannot satisfy handoff (E40, R9)
    Given mutation has fail and pass commands but matched is undefined
    When assurance handoff runs
    Then a matched-mutation gap is reported

  Scenario: Red and green bind the current config fingerprint (E41, R8)
    Given red or green evidence carries a config fingerprint different from current config
    When handoff runs under assurance
    Then a stale red or green config fingerprint gap is reported

  Scenario: Shell executor cannot self-label trusted (E42, R6, R11)
    Given a shell executor config that sets trustTier trusted
    When the quality gate plan is built
    Then the shell gate is forced to interactive_untrusted

  Scenario: Forged shell plus trusted tier fails handoff by executor kind (E43, R6, R11)
    Given a required gate result with executorKind shell and trustTier trusted
    When assurance handoff runs
    Then an untrusted executor-kind gap is reported

  Scenario: Strict argv kind without valid argv executor rejects before spawn (E44, R5, R11)
    Given a strict or overnight plan that claims argv kind without a valid matching argv executor
    When the gate plan executes
    Then policy rejects with zero spawns

  Scenario: Trusted runCommand without argv never falls back to shell (E45, R5)
    Given trust is trusted and argv is omitted
    When runCommand is invoked with a legacy shell command string
    Then policy rejects before spawn
    And shell fallback does not occur

  Scenario: Symlink cwd escape is rejected via realpath (E46, R5)
    Given an in-project cwd path that is a symlink resolving outside the project root
    When the trusted argv runner validates cwd
    Then realpath escape is rejected without spawn

  Scenario: policyRejected rejects red regardless of exit code (E47, R12)
    Given a result with policyRejected true, a non-126 exit code, and a matching expected hint
    When validateRedResult runs
    Then ok is false with a policy-rejection reason
    And the result is neither red nor green

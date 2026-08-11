# Personas: A Leo (expert local operator), B Maya (platform lead), C Nikhil (security/reliability engineer), D Sofia (recovering product engineer), E André (cross-harness maintainer)
# Confusion covered: interactive-vs-trusted, policy-vs-sandbox, lexical-vs-resolved-path, denied-vs-redacted, missing-vs-passed-gate, project-request-vs-human-authority, provider-vs-capability, fixture-vs-live-G7
# Example Map: SEC-01 R1-R16 / E1-E134 / Q1-Q26
@SEC-01 @security @sandbox @trust-profile @high-assurance
Feature: Strict agent execution stays inside explicit security authority
  As Leo, Maya, and Nikhil, who must increase agent throughput without turning prompts into a security boundary
  I want every runtime action evaluated through monotonic trust, sandbox, environment, path, egress, redaction, and supply-chain contracts
  So Sofia can recover from a block safely and André can integrate providers without inventing a second authority or a false pass

  Background:
    Given CON-01 bounded contract and concrete-path semantics
    And RED-01 is the sole pre-model and pre-persistence redaction authority
    And SEC-00 owns canonical fleet-child tools, secret names, environment stripping, inspection paths, and hardlink denial
    And BDD-01 owns executor-kind and trust-tier semantics
    And SEC-01 pure policy receives explicit host observations and owns no filesystem, environment, network, clock, process, socket, timer, persistence, lease, approval, role, gate-pass, package-install, or merge authority

  Scenario Outline: Trust profiles remove authority monotonically
    Given human-controlled effective profile <profile>
    And the requested action has <control-state>
    When the security policy evaluates it
    Then the decision is <outcome>
    And a less-trusted profile result cannot satisfy a more-trusted requirement

    Examples:
      | profile     | control-state                                             | outcome                                  |
      | interactive | no active sandbox                                          | permit interactive-untrusted             |
      | strict      | no active sandbox for a command action                     | refuse sandbox-required                  |
      | strict      | active current sandbox and all action controls current     | permit strict                            |
      | overnight   | active sandbox but one required security slot missing      | refuse required-security-gate-unavailable |
      | overnight   | every strict control and required security slot current    | permit overnight                         |
      | unknown     | otherwise valid observations                               | refuse unsupported-profile               |

  Scenario: Project or model input cannot downgrade human-controlled trust
    Given a machine or session authority selects strict or overnight
    And a project file, tool argument, prompt, or object-shaped value requests interactive, force, unsafe, trusted, sandboxed, approved, or allow-all behavior
    When Nikhil computes the effective profile
    Then the stricter human-controlled profile remains effective
    And no caller-supplied boolean or prose creates a capability or permit
    And no arbitrary value is echoed

  Scenario Outline: Sandbox initialization facts create or refuse one process-local capability
    Given backend observation <observation>
    When Leo initializes the session security backend
    Then SEC-01 returns <outcome>
    And no copied, reconstructed, serialized, disposed, or stale capability can protect a later action

    Examples:
      | observation                                                         | outcome                                  |
      | sandbox-runtime with every V1 feature active                         | one active process-local capability      |
      | Gondolin with proven equivalent V1 features and safe workspace mount | one active process-local capability      |
      | provider name without required features                              | refuse sandbox-capability-incomplete     |
      | unsupported provider, platform, or version                           | refuse sandbox-unsupported               |
      | initialization throws or reports failure                             | refuse sandbox-initialization-failed     |
      | contradictory active and failed facts                                | refuse invalid-sandbox-observation       |
      | a capability from another session, worktree, or policy fingerprint   | refuse sandbox-capability-stale          |

  Scenario: Unsupported sandbox cannot silently weaken strict or overnight
    Given strict or overnight is effective
    And the backend is missing, unsupported, initialization-failed, or disposed
    When Sofia requests a protected action
    Then the action is refused before executor invocation
    And the response gives one stable safe recovery action
    And it does not merely display a warning and continue

  Scenario Outline: Runtime policy cannot be replayed across authority classes
    Given a current strict sandbox capability
    And a permit was evaluated for <source-runtime>
    When it is presented for <target-runtime>
    Then the decision is refused runtime-mismatch
    And the protected executor call count is zero

    Examples:
      | source-runtime    | target-runtime      |
      | fleet reviewer    | fleet researcher    |
      | fleet researcher  | Herdr Pi worker     |
      | Herdr Pi worker   | gate command        |
      | gate command      | web tool            |
      | web tool          | fleet reviewer      |

  Scenario Outline: Environment attacks expose only a minimal safe name set
    Given strict or overnight profile for <runtime>
    And the launch environment contains <case>
    When the environment is sanitized
    Then the result is <outcome>
    And no removed value is logged, hashed, fingerprinted, echoed, or recoverable from the decision

    Examples:
      | runtime         | case                                                        | outcome                                  |
      | fleet child     | provider tokens and SEC-00 forbidden keys                   | permit with minimal environment          |
      | Herdr Pi worker | shell startup and dynamic-loader injection variables        | permit with minimal environment          |
      | gate command    | credential helpers and an unknown high-risk secret name     | permit with minimal environment          |
      | web tool        | local filesystem and provider credential values             | permit with no local secret environment  |
      | fleet child     | an accessor, symbol key, polluted prototype, or hostile proxy | refuse invalid-environment              |
      | gate command    | more keys or longer names than the published bounds          | refuse environment-bounds                |

  Scenario Outline: Secret and credential paths are denied before content access
    Given strict or overnight path facts for <request>
    And the trusted resolved/link observation is <resolution>
    When the read policy evaluates the request
    Then the decision is <outcome>
    And a denial contains no requested path, resolved path, content, hash, or object-generated error

    Examples:
      | request                                      | resolution                                      | outcome                    |
      | repository .env                             | ordinary file inside worktree                   | refuse secret-read-denied  |
      | SSH private key                             | ordinary file under home secret root            | refuse secret-read-denied  |
      | GitHub, cloud, package, or Pi auth store     | ordinary credential leaf                        | refuse secret-read-denied  |
      | innocent worktree alias                      | symlink resolves into a denied secret root      | refuse secret-read-denied  |
      | innocent worktree file                       | regular file hardlinked to a secret             | refuse hardlink-denied     |
      | safe repository source fixture               | ordinary single-link file inside worktree       | permit read                |
      | structurally safe source without trusted facts | unresolved or link facts missing              | refuse path-authority-missing |

  Scenario Outline: Writes remain inside one exact worktree or session temp root
    Given strict or overnight write facts for <target>
    When the write policy evaluates the target and all existing ancestors
    Then the decision is <outcome>
    And denial occurs before any write-capable tool or executor runs

    Examples:
      | target                                                        | outcome                         |
      | ordinary new file below the canonical worktree with safe parent facts | permit write              |
      | ordinary file below the exact task-specific session temp root          | permit write              |
      | a sibling worktree, parent directory, or global /tmp                    | refuse write-outside-authority |
      | a path with dot segments, prefix confusion, case collision, or Unicode separator | refuse invalid-path   |
      | .env, credential leaf, .git control data, approval authority, or generated Rulesync output | refuse protected-write |
      | a symlink ancestor or symlink target                                    | refuse symlink-denied     |
      | a multi-link regular file                                               | refuse hardlink-denied    |
      | a device, socket, FIFO, or unknown file kind                            | refuse unsafe-file-kind   |
      | a safe lexical path with stale or missing dispatch-time facts           | refuse path-authority-stale |

  Scenario Outline: Shell and interpreter indirection cannot hide mutation or exfiltration
    Given strict or overnight command policy
    And requested argv uses <case>
    When the command is evaluated
    Then the result is <outcome>
    And no executable, inline source, command argument, or error is echoed

    Examples:
      | case                                                       | outcome                         |
      | sh, bash, or zsh with a command-string flag                | refuse shell-denied             |
      | python -c, node -e, bun -e, ruby -e, or perl -e            | refuse inline-interpreter-denied |
      | env or xargs launching a nested denied executable          | refuse command-indirection-denied |
      | find -exec or package-runner install hook                  | refuse command-indirection-denied |
      | curl piped to a shell                                      | refuse shell-denied             |
      | direct downloader without an exact egress rule             | refuse egress-denied            |
      | sparse, accessor, subclassed, symbol-keyed, or oversized argv | refuse invalid-argv            |
      | exact machine-owned bounded argv with current sandbox      | permit command                  |

  Scenario: A malicious project quality-gate command cannot become trusted evidence
    Given a project config supplies a shell string or inline interpreter gate that reads secrets, writes outside the worktree, or opens network egress
    When strict or overnight evaluates the gate
    Then BDD-01 classifies the executor interactive-untrusted
    And SEC-01 refuses it before execution
    And no project field, title, comment, or model assertion can relabel it trusted

  Scenario Outline: Egress is denied unless runtime, tool, host, port, and redirect remain allowed
    Given strict or overnight egress policy for <runtime>
    And the request targets <destination>
    When the egress request is evaluated
    Then the result is <outcome>
    And denials reveal no URL, host, credentials, headers, query, or response fragment

    Examples:
      | runtime          | destination                                               | outcome                     |
      | fleet reviewer   | any external host                                         | refuse egress-denied       |
      | gate command     | any external host                                         | refuse egress-denied       |
      | Herdr Pi worker  | undeclared host or port                                   | refuse egress-denied       |
      | fleet researcher | canonical web provider with a trusted exact-domain rule  | permit provider egress     |
      | web tool         | trusted exact domain and allowed port                    | permit provider egress     |
      | web tool         | IP literal, localhost, private, link-local, or metadata service | refuse egress-denied |
      | web tool         | malformed host, userinfo, embedded credential, or non-HTTP scheme | refuse invalid-destination |
      | web tool         | suffix-confused, trailing-dot, case, or IDNA variant outside policy | refuse egress-denied |
      | web tool         | redirect from an allowed host to a denied host           | refuse redirect-denied     |

  Scenario: A hostname decision cannot claim socket containment
    Given a pure policy permits one normalized destination
    But the active backend cannot prove redirect re-evaluation, DNS-rebinding defense, or process-tree network enforcement
    When strict or overnight evaluates capability completeness
    Then the action is refused sandbox-capability-incomplete
    And the pure hostname decision is not promoted to transport authority

  Scenario Outline: Tool results are redacted before model-visible or persistent boundaries
    Given an intercepted <result-kind> tool result containing <content>
    When SEC-01 prepares safe security telemetry
    Then RED-01 runs before the boundary
    And the result is <outcome>
    And no raw fallback or partial unsafe value is returned

    Examples:
      | result-kind | content                                         | outcome                         |
      | success     | provider token, URI credential, or private key | safe detached redacted value    |
      | failure     | secret-bearing stderr or exception text        | safe detached redacted value    |
      | success     | binary, cycle, accessor, or hostile object     | refuse redaction-refused        |
      | failure     | oversized, over-depth, or over-key object      | refuse redaction-refused        |

  Scenario: RED-01 refusal cannot become a hash oracle or diagnostic leak
    Given RED-01 refuses a hostile or over-bounds tool result
    When Nikhil inspects the security decision
    Then it contains only stable code redaction-refused and safe action metadata
    And it contains no raw input, preview, canonical bytes, hash, arbitrary message, path, command, URL, or partial result

  Scenario Outline: Security-gate slots require trusted current candidate-bound evidence
    Given security slot <slot>
    And its observation is <observation>
    When Maya evaluates overnight availability
    Then the slot status is <status>
    And SEC-01 does not convert the slot into a canonical FIT-01 pass

    Examples:
      | slot    | observation                                              | status      |
      | secret  | trusted argv result successful and bound to current SHA   | successful  |
      | sast    | trusted internal result successful and bound to current SHA | successful |
      | sca     | scanner missing or unavailable                           | unknown     |
      | license | shell executor or project-owned command                   | untrusted   |
      | secret  | successful result for an older SHA or inventory fingerprint | stale      |
      | sast    | timeout                                                   | timeout     |
      | sca     | abort                                                     | aborted     |
      | license | scanner reports violations                                | failed      |

  Scenario: Missing required security slots block overnight without installing tools
    Given trusted machine policy requires secret, SAST, SCA, and license slots
    And at least one slot is missing, unknown, stale, untrusted, timed out, aborted, or failed
    When Leo requests overnight availability
    Then availability is refused required-security-gate-unavailable
    And SEC-01 neither selects latest versions nor installs, pins, downloads, or invokes an untrusted replacement

  Scenario Outline: Hostile authority values refuse before side effects
    Given a policy request contains <case>
    When the pure policy validates the authority boundary
    Then it refuses invalid-policy-input
    And sandbox, executor, redactor sink, scanner, and persistence call counts remain zero
    And no arbitrary value is echoed

    Examples:
      | case                                                             |
      | an accessor, cycle, subclass, function, symbol, bigint, or hostile reflection |
      | a sparse array or duplicate set-like entry                       |
      | an over-depth, over-key, over-array, over-string, or over-byte value |
      | contradictory allowed and denied, active and failed, or current and stale facts |
      | an additive unknown authority field                              |

  Scenario: Extension reload cannot preserve stale authority or duplicate resources
    Given the security-policy extension has one active capability
    When Pi reloads or the session shuts down
    Then the capability is disposed exactly once
    And no timers, writers, listeners, permits, profile status, or backend resources survive
    And the next protected session must initialize a fresh current capability

  Scenario: Interactive rollback remains available without fabricating strict evidence
    Given strict mode is unavailable or intentionally disabled by human-controlled authority
    When Sofia returns to explicit interactive mode
    Then legacy interactive workflows remain available as interactive-untrusted
    And no prior strict or overnight permit, capability, or required pass survives
    And project files and generated Rulesync outputs remain unchanged

  Scenario: Security decisions remain observations rather than adjacent authorities
    Given a current SEC-01 permit or refusal
    When a caller asks it to grant a worktree lease, select a role, approve a plan, persist trajectory, pass a canonical fitness gate, install a package, notify, clean a pane, or merge
    Then SEC-01 exposes no such authority
    And ISO-01, ROLE-01, APR-01, OBS-01, FIT-01, PKG-01, OPS-01, and humans remain responsible

  Scenario: Product-code fleets remain blocked until live G7 evidence is current
    Given deterministic SEC-01 fixtures pass
    But code is not merged and stowed, Pi has not reloaded it, an active sandbox capability is absent, required security slots are unavailable, or human-controlled non-destructive acceptance is missing
    When a product-code fleet is requested
    Then G7 remains unavailable
    And the fleet does not launch
    But non-secret deterministic fixtures and read-only review remain allowed under prior gates

  Scenario: Strict security behavior is externally mutation-sensitive
    Given locked tests for sandbox-required enforcement, secret-read denial, and egress denial
    When sandbox-required enforcement is removed or a denied secret or egress action becomes permitted
    Then the named focused test fails for that changed behavior
    And restoring the implementation makes focused security, SEC-00, RED-01, and root suites pass

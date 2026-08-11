# Personas: A Leo (expert local operator), C Nikhil (security/reliability engineer), D Sofia (recovering product engineer)
# Confusion covered: outside-vs-inside-Herdr, compatibility-vs-installation, timeout-vs-failure, blocked-vs-done, opaque-id-vs-focus, typed-vs-legacy, non-echoing recovery
# Example Map: HDR-01 R1-R12 / E1-E82 / Q1-Q20
@HDR-01 @herdr-client @protocol @high-assurance
Feature: Typed Herdr operations preserve compatibility, identity, and uncertain states
  As Leo and Nikhil, who coordinate local agents without surrendering host authority
  I want every Herdr operation compatibility-gated, argv-only, bounded, and typed
  So Sofia can recover from blocked, unknown, timed-out, or malformed states without an agent guessing success or controlling the focused pane

  Background:
    Given the CMP-01 Herdr 0.8 compatibility policy for protocol 19 and schema version 1
    And CON-01 published structural bounds
    And an HDR-01 library with an injected argv executor and explicit environment snapshot
    And the library owns no filesystem, environment, network, clock, socket, timer, child-process, persistence, lease, approval, gate, or merge authority

  Scenario: A live compatible observation creates one process-local typed client
    Given exact environment value HERDR_ENV equals "1"
    And the version probe reports Herdr 0.8.0
    And the schema probe reports protocol 19 and schema version 1
    When Leo runs the compatibility doctor
    Then it returns a compatible process-local typed client
    And the executor received exactly "herdr --version" followed by "herdr api schema --json" as argv
    And no compatibility value was inferred from documentation, status prose, or expected constants

  Scenario Outline: Outside-Herdr or hostile environment snapshots never execute
    Given an explicit environment snapshot containing <environment>
    When Sofia requests the compatibility doctor
    Then it returns <outcome>
    And the executor call count is zero
    And no environment value or object-generated error is echoed

    Examples:
      | environment                              | outcome                          |
      | no HERDR_ENV                             | unavailable outside-herdr        |
      | HERDR_ENV equal to "0"                   | unavailable outside-herdr        |
      | HERDR_ENV equal to "true"                | unavailable outside-herdr        |
      | HERDR_ENV equal to whitespace             | unavailable outside-herdr        |
      | a numeric HERDR_ENV                       | refused invalid-environment      |
      | an accessor or hostile reflective object  | refused invalid-environment      |

  Scenario Outline: Runtime, protocol, and schema drift are distinct unavailable outcomes
    Given exact environment value HERDR_ENV equals "1"
    And the doctor observes <version>, protocol <protocol>, and schema <schema>
    When Nikhil requests a typed client
    Then it returns <outcome> without a partial client

    Examples:
      | version | protocol | schema  | outcome                           |
      | 0.8.9   | 19       | 1       | compatible client                 |
      | 0.7.5   | 19       | 1       | unavailable incompatible-runtime  |
      | 0.9.0   | 19       | 1       | unavailable incompatible-runtime  |
      | 0.8.0   | 18       | 1       | unavailable incompatible-protocol |
      | 0.8.0   | 20       | 1       | unavailable incompatible-protocol |
      | 0.8.0   | 19       | 2       | unavailable incompatible-schema   |
      | missing | 19       | 1       | unavailable compatibility-unknown |
      | 0.8.0   | missing  | missing | unavailable compatibility-unknown |

  Scenario Outline: Doctor probe uncertainty never creates a client
    Given exact environment value HERDR_ENV equals "1"
    And the <probe> probe produces <condition>
    When the compatibility doctor evaluates its executor report
    Then it returns <outcome>
    And it returns no partial runtime, protocol, schema, argv, stdout, stderr, or client

    Examples:
      | probe   | condition                | outcome                         |
      | version | explicit timeout         | timeout                         |
      | schema  | explicit abort           | aborted                         |
      | version | executor launch failure  | unavailable executor-failed     |
      | schema  | more than 512 KiB        | refused bounds                  |
      | version | more than 4 KiB           | refused bounds                  |
      | schema  | malformed JSON            | unavailable compatibility-unknown |

  Scenario Outline: Every supported operation builds one deterministic shell-free argv
    Given a compatible process-local client
    And valid normalized inputs for <operation>
    When Leo builds the operation
    Then its argv begins with the exact <prefix>
    And its fixed option order and aggregate bytes are deterministic
    And it contains no shell executable, shell command flag, joined command string, focus-taking option, or explicit JSON option

    Examples:
      | operation         | prefix                       |
      | agent list        | herdr agent list             |
      | agent get         | herdr agent get              |
      | agent read        | herdr agent read             |
      | agent wait        | herdr agent wait             |
      | worktree create   | herdr worktree create        |
      | agent start       | herdr agent start            |
      | agent prompt      | herdr agent prompt           |
      | notification show | herdr notification show      |

  Scenario: Prompt text and native Pi arguments remain inert argv data
    Given a compatible client and valid explicit target identifiers
    And prompt text and native arguments containing spaces, quotes, semicolons, pipes, dollar signs, and command substitutions
    When Leo builds agent prompt and agent start operations
    Then each supplied value occupies exactly one bounded argv element
    And native Pi arguments occur only after a literal separator
    And no shell, redirection, expansion, or command substitution can be invoked by the client

  Scenario Outline: Invalid or hostile builder input refuses before execution
    Given a compatible client
    And an operation input containing <case>
    When Sofia builds or executes the operation
    Then it refuses with stable code <code>
    And the executor call count is zero
    And no input value, path, prompt, label, argv, or object-generated error is echoed

    Examples:
      | case                                                       | code                    |
      | an invalid or overlength agent name                        | invalid-agent-name      |
      | a missing, leading-hyphen, control-bearing, or long target | invalid-target          |
      | a relative, traversing, or overlength cwd                  | invalid-path            |
      | read lines outside 1 through 500                           | invalid-lines           |
      | a timeout outside 1 through 300000 milliseconds            | invalid-timeout         |
      | a prompt or body beyond its published bound                | bounds                  |
      | a sparse, accessor, subclassed, symbol-keyed native array  | invalid-native-args     |
      | a function, bigint, cycle, or hostile proxy                | invalid-operation       |
      | aggregate argv beyond 16 KiB                               | bounds                  |

  Scenario Outline: Explicit timeout and abort remain non-boolean outcomes
    Given a compatible client and one valid operation
    And the executor reports <condition>
    When the client classifies the operation
    Then the outcome is exactly <outcome>
    And it is neither completed nor failed
    And no stdout or stderr is parsed into a partial value

    Examples:
      | condition                                  | outcome |
      | aborted before executor invocation         | aborted |
      | aborted during executor invocation         | aborted |
      | explicit executor timeout                  | timeout |
      | validated Herdr JSON error code timeout    | timeout |

  Scenario: Conflicting executor facts refuse instead of choosing a precedence
    Given a compatible client and one valid operation
    And an executor report is both timed out and aborted
    When Nikhil evaluates the report
    Then it refuses with stable code invalid-executor-report
    And it returns no partial operation value

  Scenario Outline: Malformed or cross-operation envelopes fail closed
    Given a compatible client and one valid <operation> request
    And the executor exits with <report>
    When the typed envelope is parsed
    Then it returns <outcome>
    And it returns no partial agent, pane, worktree, notification, or compatibility value

    Examples:
      | operation | report                                      | outcome                                |
      | agent list | malformed JSON                              | refused malformed-envelope             |
      | agent get  | an empty or primitive success body          | refused malformed-envelope             |
      | agent read | a response id for agent list                | refused mismatched-envelope             |
      | agent wait | a result type for notification show         | refused mismatched-envelope             |
      | agent start | zero exit with an error envelope           | refused inconsistent-executor-report    |
      | agent prompt | nonzero exit with a success envelope      | refused inconsistent-executor-report    |
      | agent list | ordinary output beyond 65536 bytes          | refused bounds                         |

  Scenario Outline: Agent lifecycle observations keep their exact meaning
    Given a valid agent-info envelope for the requested target
    And the observed state is <state>
    When the client classifies agent get or wait
    Then the top-level outcome is <outcome>
    And the returned identity is detached and deeply frozen

    Examples:
      | state             | outcome              |
      | idle              | completed idle       |
      | done              | completed done       |
      | working           | working               |
      | blocked           | blocked               |
      | unknown           | unknown               |
      | an unrecognized value | unknown           |

  Scenario Outline: Command-specific invariants reject ambiguous identity
    Given a compatible client and a valid request for <operation>
    And the executor returns <case>
    When the operation envelope is projected
    Then the result is <outcome>

    Examples:
      | operation       | case                                                | outcome                         |
      | agent list      | more than 256 agents                                | refused bounds                  |
      | agent list      | duplicate pane ids                                  | refused duplicate-pane-id       |
      | agent get       | a pane or agent identity different from the target  | refused mismatched-target        |
      | agent wait      | a missing pane id                                   | refused missing-pane-id         |
      | agent read      | a different pane, source, or format                 | refused mismatched-target        |
      | worktree create | schema-one root_pane with a pane id                 | completed worktree-created      |
      | worktree create | only legacy result.pane or result.worktree ids      | refused missing-pane-id         |
      | agent start     | a different returned name or pane id                | refused mismatched-target        |
      | agent prompt    | a blocked returned agent                            | blocked                         |
      | notification show | reason rate_limited with shown false             | completed notification-not-shown |

  Scenario Outline: Herdr errors map to stable package-owned outcomes
    Given a compatible client and one valid operation
    And the CLI exits nonzero with <stderr>
    When the client classifies the error
    Then it returns <outcome>
    And arbitrary messages and partial stdout are discarded

    Examples:
      | stderr                                                | outcome                    |
      | JSON code agent_not_found with a hostile message      | unavailable not-found      |
      | JSON code timeout with a hostile message              | timeout                    |
      | an unknown JSON error code                            | unavailable cli-error      |
      | empty stderr                                          | unavailable cli-error      |
      | non-JSON text containing the words timed out          | unavailable cli-error      |

  Scenario: Returned client values cannot be forged or mutated
    Given a compatible process-local client and accepted operation result
    When callers mutate the environment snapshot, executor report, parsed envelope, argv input, or returned nested values
    Then prior clients, argv, and outcomes remain byte-equivalent and deeply frozen
    But a copied, reconstructed, serialized, or legacy-shaped client value cannot execute an operation

  Scenario: Legacy operation paths remain available without widening typed trust
    Given the existing herd task, source, widget, footer, and CMP-01 compatibility fixtures
    When HDR-01 is installed without explicit typed-client adapter injection
    Then existing behavior and tests remain unchanged
    And legacy 0.7.5 envelopes remain parser history only
    And disabling the typed injection is a complete rollback with no persisted flag or user configuration change

  Scenario: Integration authority remains with later packages
    Given a valid typed Herdr observation
    When a caller asks it to grant a writer lease, approve an action, pass a required fitness gate, choose notification policy, retry a worker, clean a pane, persist evidence, or merge a branch
    Then HDR-01 exposes no such operation
    And ISO-01, APR-01, FIT-01, OPS-01, OBS-01, and human merge authority remain responsible

  Scenario: The typed client is externally mutation-sensitive
    Given locked tests for timeout classification and shell-free argv
    When timeout is reclassified as completed or failed, or a shell wrapper is introduced
    Then the named focused test fails for that changed behavior
    And restoring the implementation makes the focused and legacy suites pass

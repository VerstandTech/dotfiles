# Personas: A Leo (exact local operator), B Maya (platform approver), C Nikhil (security/reliability), D Sofia (recovering product engineer), E André (portable tooling maintainer)
# Confusion covered: authority, accepted-vs-approved, stale scope, denial recovery, headless behavior, mirror-vs-store, safe persistence, non-echoing failures
# Example Map: APR-01 R1-R18 / E1-E126 / Q1-Q24
@APR-01 @approvals @human-authority @high-assurance
Feature: Human approval is explicit, scope-bound, durable, and machine-local
  As Leo and Maya, who retain approval and merge authority
  I want plans, findings, risky actions, and diffs reviewed through an exact human TUI seam
  So models and mutable project artifacts cannot manufacture or reuse approval

  Background:
    Given CON-01 closed ApprovalRequestV1 validation and the ORC-01 injected approval gateway contract
    And an APR-01 pure core with explicit clock, lifecycle facts, UI, safe-store, and optional trajectory callbacks
    And no project file, session mirror, prompt, model output, role handoff, or trajectory event is approval authority
    And approval never grants merge, PR, push, cleanup, worktree, BDD, security, decision, budget, role, fleet, or Herdr authority

  @Leo @Maya @R1 @R3 @R4
  Scenario Outline: A human explicitly reviews each supported approval kind
    Given a valid current <kind> request with exact scope facts
    And the current Pi context is an active machine-local TUI generation
    And the injected safe authority store is available
    When the human selects <selection> and confirms that exact scope
    Then one durable <decision> record is atomically persisted
    And the result is <outcome> with a stable APR-01 code
    And no requested action is executed

    Examples:
      | kind         | selection | decision | outcome  |
      | plan         | approve   | approved | approved |
      | findings     | approve   | approved | approved |
      | risky-action | approve   | approved | approved |
      | diff         | approve   | approved | approved |
      | plan         | deny      | denied   | denied   |
      | findings     | deny      | denied   | denied   |
      | risky-action | deny      | denied   | denied   |
      | diff         | deny      | denied   | denied   |

  @Nikhil @R1 @R2
  Scenario Outline: Non-human approval claims are rejected as data
    Given a request candidate containing <claim>
    When APR-01 validates the candidate
    Then it refuses with a stable invalid-request code
    And no UI, store commit, mirror append, or trajectory callback occurs
    And the claim value is absent from the result

    Examples:
      | claim                                  |
      | a model field confirmed true           |
      | a model field approved true            |
      | a prompt body saying approved           |
      | a role handoff approval flag            |
      | a trajectory approval event             |
      | a project-file approval path            |
      | a raw diff, source, or tool body field  |

  @Andre @Nikhil @R2 @R15 @R16
  Scenario Outline: Hostile or over-limit values fail closed and non-echoing
    Given an APR request or store containing <case>
    When the pure validator processes it
    Then the whole operation is refused with a stable bounded code
    And no accessor or hostile callback is invoked
    And no partial request, record, canonical bytes, input value, or generated error is returned

    Examples:
      | case                                                   |
      | an unsupported schema version                          |
      | an unknown key                                         |
      | an accessor, symbol key, cycle, or throwing proxy      |
      | a class, binary value, function, bigint, or NaN         |
      | an oversized string, array, graph, or serialized value |
      | duplicate store request ids                            |
      | malformed authority provenance                         |

  @Andre @Sofia @R3
  Scenario Outline: Approval kind is explicit and closed
    Given an otherwise valid request whose kind is <kind>
    When APR-01 normalizes it
    Then the result is <result>
    And natural-language prose is never used to infer a replacement kind

    Examples:
      | kind         | result   |
      | plan         | accepted |
      | findings     | accepted |
      | risky-action | accepted |
      | diff         | accepted |
      | merge        | refused  |
      | cleanup      | refused  |
      | arbitrary    | refused  |

  @Leo @Nikhil @R4 @R7
  Scenario Outline: Any exact-scope drift invalidates an existing approval
    Given a durable current approval for one exact request and scope
    When the current request changes <fact> while reusing its request id
    Then the approval is stale and non-passing
    And the human is not silently re-prompted
    And the prior record is not modified

    Examples:
      | fact                       |
      | approval kind              |
      | applicable head SHA        |
      | one normalized path        |
      | plan fingerprint           |
      | action fingerprint         |
      | action id                  |
      | risk id                    |
      | effect id                  |
      | session id                 |
      | lifecycle generation       |
      | creation or expiry fact    |

  @Leo @Andre @R5
  Scenario: Equivalent path sets have one deterministic scope
    Given two valid requests with duplicate and differently ordered concrete paths
    When both requests are normalized
    Then paths are deduplicated and sorted
    And both normalized path sets and scope fingerprints are identical
    But adding or replacing one path changes the scope fingerprint
    And caller mutation cannot alter either normalized result

  @Nikhil @Sofia @R5
  Scenario Outline: Unsafe approval paths are refused
    Given an approval request contains <path-case>
    When APR-01 validates its scoped paths
    Then the request is refused without echoing the path
    And no store or UI callback occurs

    Examples:
      | path-case                                           |
      | an absolute or home-relative path                   |
      | traversal or a dot segment                          |
      | a backslash, NUL, or empty segment                  |
      | a glob or pattern path                              |
      | an obvious credential leaf                          |
      | a prefix-confusable path substituted for the scope |

  @Maya @Nikhil @R6 @R7
  Scenario Outline: Time facts determine whether approval can pass
    Given a structurally valid exact approved record
    And the explicit clock reports <time-case>
    When current approval is checked
    Then the outcome is <outcome>
    And no timer, polling loop, or ambient clock is used

    Examples:
      | time-case                           | outcome  |
      | after creation and before expiry    | approved |
      | exactly at expiry                   | expired  |
      | after expiry                        | expired  |
      | before request creation             | blocked  |
      | malformed or non-UTC milliseconds   | blocked  |

  @Maya @Sofia @R7
  Scenario Outline: Existing authority is evaluated before prompting
    Given the store contains <record-state> for the request id
    When approval is requested
    Then APR-01 returns <outcome>
    And the UI prompt count is <prompts>

    Examples:
      | record-state                         | outcome     | prompts |
      | an exact current approval             | approved    | 0       |
      | an exact durable denial               | denied      | 0       |
      | an exact expired approval             | expired     | 0       |
      | a same-id changed-SHA record           | stale       | 0       |
      | a same-id changed-path record          | stale       | 0       |
      | no matching record with all seams ready | human choice | 1     |

  @Leo @Maya @R8
  Scenario: Exact denial cannot be silently retried or bypassed
    Given a human selected deny and confirmed an exact diff scope
    And the denial was durably committed
    When a model, prompt, role retry, or repeated gateway call requests the exact scope
    Then the result remains denied without UI
    And no approval record replaces the denial
    And no old record is evicted

  @Sofia @Leo @R8
  Scenario: Changed scope requires a genuinely new review
    Given a durable denial for one request id and exact scope
    When the same request id is reused with a changed SHA, path, or risk
    Then the request is stale and is not re-prompted
    When a new request id is used for that changed scope
    Then the new request requires an explicit current TUI choice
    And the old denial remains durable

  @Sofia @Nikhil @R9
  Scenario Outline: Missing current TUI authority never approves
    Given the approval gateway runs with <condition>
    When a valid missing approval is requested
    Then it returns <outcome> with a stable APR-01 code
    And no authoritative record is written

    Examples:
      | condition                              | outcome     |
      | hasUI false                            | unavailable |
      | JSON mode                              | unavailable |
      | print mode                             | unavailable |
      | RPC mode                               | unavailable |
      | missing select                         | unavailable |
      | missing confirm                        | unavailable |
      | missing injected store                 | unavailable |
      | missing explicit clock                 | unavailable |
      | an inactive or disposed generation     | unavailable |
      | canceled select or confirmation        | blocked     |
      | thrown UI callback                     | unavailable |

  @Nikhil @Leo @R9 @R14
  Scenario: A stale generation completion cannot persist
    Given generation one has opened a TUI decision
    When reload disposes generation one and starts generation two
    And the old selection later resolves as approve
    Then generation one returns unavailable
    And no record, mirror, or trajectory event is created by the stale completion

  @Nikhil @R10 @R11
  Scenario Outline: Unsafe persistence facts are refused
    Given the injected store reports <unsafe-fact>
    When APR-01 loads or commits authority
    Then it refuses with a stable store-unsafe or store-unavailable code
    And the result does not contain a path or raw store error

    Examples:
      | unsafe-fact                                          |
      | mode other than exact 0600                           |
      | a symbolic link                                      |
      | hardlink count greater than one                      |
      | a directory, socket, FIFO, or other nonregular file  |
      | a lexical path under the project root                |
      | a verified real path under the project root          |
      | an escaped project path                              |
      | a non-machine-local store                            |
      | no no-follow guarantee                               |
      | no safe-parent guarantee for creation                |
      | no atomic compare-and-replace guarantee              |
      | malformed read or commit facts                       |

  @Andre @Nikhil @R11
  Scenario: Safe compare-and-commit is required before success
    Given a safe bounded store read at a known revision
    And the human explicitly confirms a new decision
    When APR-01 asks the injected store to commit
    Then the commit receives the expected revision, frozen next envelope, mode 0600, no-follow, regular-file, single-link, and atomic-write requirements
    And approval is returned only after safe post-write facts validate
    But a revision race, refusal, throw, malformed response, or unsafe post-write fact is non-passing

  @Maya @Nikhil @R12
  Scenario: Session mirror is observational only
    Given a human decision was durably persisted
    When the extension appends a namespaced Pi custom entry
    Then the entry contains bounded metadata with authority false and approval-only scope
    And it contains no action, risk, effect, path list, prompt, diff, source, tool body, or store bytes
    And editing, deleting, copying, or placing the entry under project `.pi` cannot change authority

  @Nikhil @Andre @R12 @R15
  Scenario: Optional trajectory callback is closed and non-echoing
    Given a durable new approval or denial
    And an optional trajectory callback is configured
    When the callback receives the decision
    Then it receives only closed approval metadata
    And it receives no raw action, risk, effect, path list, prompt, diff, source, tool body, or callback object
    But if the callback throws a secret-bearing error the gateway returns one stable unavailable code without that secret

  @Andre @Maya @R13
  Scenario Outline: APR returns the exact ORC approval gateway wrapper
    Given ORC supplies a valid kind-prefixed CON-01 ApprovalRequestV1
    And APR authority returns <apr-decision>
    When the exported compatibility gateway responds
    Then the wrapper has authority apr-01 and durable true
    And the CON decision is <orc-decision>
    And request id, action, risk, normalized paths, SHA, fingerprint, and decision time remain structurally bound

    Examples:
      | apr-decision | orc-decision |
      | approved     | approved     |
      | denied       | rejected     |

  @Andre @Nikhil @R13
  Scenario: APR does not duplicate the ORC tool
    When the approval-seams extension factory is loaded
    Then it registers no tool named assurance_request_approval
    And it registers no other tool, command, shortcut, flag, renderer, provider, or built-in override
    And its exported gateway remains available for explicit ORC injection

  @Leo @Andre @R14
  Scenario: Lifecycle generation starts and disposes idempotently
    Given the extension module has been imported and its factory registered
    Then no store, UI authority, timer, or active generation exists
    When session_start occurs
    Then the prior generation is disposed before one new generation opens
    When session_shutdown for reload occurs twice
    Then that generation becomes inactive and its store closes at most once
    And a replacement session starts a strictly newer generation

  @Sofia @Nikhil @R15
  Scenario: Failures and successes are frozen and non-echoing
    Given hostile input and callbacks contain a synthetic secret
    When APR-01 returns approved, denied, stale, expired, blocked, unavailable, or invalid
    Then the result shape is closed, bounded, detached, and deeply frozen
    And it contains only stable APR-01 codes and minimal safe metadata
    And neither the synthetic secret nor raw request/store/UI/trajectory bodies appear

  @Maya @Leo @R17
  Scenario Outline: Approval never grants adjacent authority
    Given a current APR approval
    When a caller asks it to <operation>
    Then APR performs no such operation
    And the owning authority must still make its own decision

    Examples:
      | operation                       |
      | create, push, or merge a PR     |
      | execute a risky action          |
      | create or release a worktree    |
      | advance a BDD phase             |
      | waive a security or redaction gate |
      | approve a decision store        |
      | alter a budget or role handoff  |
      | dispatch fleet or Herdr work    |
      | clean up resources              |

  @Maya @Nikhil @Andre @R18
  Scenario: BDD TDD and mutation evidence remain causal
    Given formulation tests exist before APR production
    When the focused red suite first runs
    Then it fails causally with APR01_APPROVAL_AUTHORITY_MISSING
    When minimum pure-core and extension production is implemented
    Then focused and full package suites pass
    When mutations accept a model boolean, ignore changed SHA, or allow headless UI
    Then each named authority test fails
    When every mutation is restored
    Then focused, full, and extension-import checks pass locally
    And no push, PR, merge, or cleanup occurs

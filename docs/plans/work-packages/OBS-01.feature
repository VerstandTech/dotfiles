# Personas: A Leo (expert operator), B Maya (platform lead), C Nikhil (security/reliability), D Sofia (recovering adopter), E André (portable tooling maintainer)
# Confusion covered: observed-vs-authoritative, redacted-vs-safe-to-persist, append-entry-vs-non-sink, raw-hash-vs-secret-oracle, reload-vs-duplicate-writer, retained-vs-auto-purged, warning-vs-failed-evaluation, trajectory-pass-vs-merge-permission
# Example Map: OBS-01 R1-R17 / E1-E168 / Q1-Q28
@OBS-01 @trajectory @redaction @replay @high-assurance
Feature: Process trajectories are redacted before persistence and replayed deterministically
  As Leo, Maya, and Nikhil, who need evidence about how an agent reached its result
  I want bounded append-only observations and exact positive and negative replay fixtures
  So Sofia can recover from recorder failures safely and André can integrate later authorities without raw logs or a second state machine

  Background:
    Given CON-01 owns bounded contract and repository-relative path semantics
    And RED-01 is the sole production pre-persistence redaction authority
    And BDD mode, writer leases, decisions, security, budget, approval, Herdr, CI, PR, and merge remain external authorities
    And OBS-01 may observe those authorities but cannot mutate or replace them
    And deterministic library tests receive explicit clocks, inventories, path facts, sinks, and prior entries

  Scenario: A trajectory observation never grants external authority
    Given a redacted trajectory contains a phase, lease, gate, decision, approval, budget, Herdr state, and candidate SHA
    When Maya evaluates or renders the trajectory
    Then no BDD phase changes
    And no writer lease, sandbox, decision, approval, budget, pane control, PR action, cleanup action, or merge permission is created
    And a future FIT-01 adapter remains required before trajectory evidence can satisfy a canonical internal gate

  Scenario Outline: Hostile or unbounded V1 candidates refuse without execution or echo
    Given an event candidate contains <hostile-shape>
    When Nikhil prepares it for recording
    Then the result is <code>
    And no getter, sink, digest, arbitrary serialization, clock, filesystem, environment, network, process, socket, timer, or model call is invoked
    And no candidate value appears in the refusal

    Examples:
      | hostile-shape                                      | code                 |
      | unsupported or missing schema version              | unsupported-version  |
      | unknown event kind or unknown enumerable field     | invalid-event        |
      | accessor property                                  | unsafe-accessor      |
      | symbol key or prototype-pollution key              | unsafe-key           |
      | cyclic, sparse, proxy, or hostile reflected shape  | unsafe-shape         |
      | class instance, binary, function, bigint, or NaN    | unsupported-type     |
      | oversized preview, refs, metadata, or serialized value | bound-exceeded   |

  Scenario Outline: RED-01 succeeds before each persistence or disclosure sink
    Given an otherwise valid candidate contains a synthetic secret in <location>
    When the recorder accepts the candidate
    Then RED-01 runs before <sink>
    And the sink receives only detached RED-01 success data or canonical bytes
    And any digest covers only those RED-01 success bytes

    Examples:
      | location                    | sink                         |
      | preview                     | Pi session custom entry      |
      | nested metadata             | process-local memory buffer  |
      | tool input URI credentials  | SHA-256 digest               |
      | tool result PEM             | append-only file writer      |
      | encoded custom-event value  | status or evaluation summary |
      | credential artifact path    | namespaced event forwarding  |

  Scenario: RED-01 refusal creates no raw sink and no raw hash oracle
    Given RED-01 refuses a hostile candidate
    When the recorder handles the refusal
    Then session append, buffer append, file append, event forwarding, report, and candidate digest call counts are zero
    And the raw candidate is discarded
    And a separately constructed constant-only redaction-refused observation must pass RED-01 before it can be recorded
    And no unsafe, force, detector-disable, or raw fallback exists

  Scenario: Recorder-owned sequence is contiguous and serialized
    Given no prior own trajectory entries
    When three accepted observations arrive concurrently in invocation order
    Then they receive sequence 1, 2, and 3
    And callers cannot supply or override a persisted sequence
    And each result and queued record is deeply frozen and detached

  Scenario Outline: Restoration rejects ambiguous history
    Given own prior custom entries have <sequence-history>
    When a replacement recorder restores after reload or resume
    Then restoration is <outcome>
    And an invalid history cannot seed a next sequence or writer

    Examples:
      | sequence-history                     | outcome                         |
      | empty                                | next sequence is 1              |
      | contiguous 1 through 18              | next sequence is 19             |
      | duplicate 7                          | refuse sequence-invalid         |
      | gap between 7 and 9                  | refuse sequence-invalid         |
      | descending 9 then 8                  | refuse sequence-invalid         |
      | zero, negative, fractional, or unsafe integer | refuse sequence-invalid |
      | malformed own entry among valid entries | refuse invalid-prior-entry    |
      | unrelated foreign custom entries     | ignore foreign entries          |

  Scenario: Tool observations store metadata and redacted-byte digests instead of bodies
    Given a tool call and result contain source text, command text, output, details, and credentials
    When the Pi adapter observes them
    Then the events retain only bounded tool name, call id, actor, error flag, bounded usage metadata, safe references, and typed SHA-256 digest
    And no prompt, source body, command body, input body, output body, detail body, transcript, or terminal scrollback is persisted
    And the original tool call and result remain unchanged

  Scenario Outline: Closed event taxonomy preserves observed state without inventing it
    Given a namespaced publisher submits <kind> metadata
    When the trajectory adapter validates and records it
    Then the event preserves <safe-state>
    And the publisher payload remains untrusted

    Examples:
      | kind             | safe-state                                                 |
      | session          | startup, reload, resume, fork, or shutdown reason          |
      | phase_change     | closed observed BDD phase and evidence reference           |
      | gate_result      | gate id, required flag, executor kind, and typed status     |
      | decision         | accepted, rejected, superseded, stale, or invalid status    |
      | handoff          | completed, blocked, failed, or unknown plus SHA/dirty state |
      | budget           | finite non-negative counters or unknown                    |
      | human_approval   | decision, fingerprint, and safe evidence reference          |
      | herdr_state      | working, blocked, idle, done, unknown, or unavailable       |
      | error            | stable code without arbitrary error text                    |

  Scenario: Each accepted observation appends one safe Pi custom entry
    Given session custom-entry recording is enabled
    When startup, a tool call, a tool result, and one namespaced custom observation are accepted
    Then exactly four logger-owned custom entries are appended in sequence
    And each entry contains only the final RED-01 event
    And custom entries are not sent to model context
    And append failure is reported sink-unavailable rather than persisted

  Scenario: File persistence is disabled by default
    Given the default trajectory extension configuration
    When a trusted or untrusted project session starts
    Then session custom-entry observation may start
    But no directory, file, handle, timer, network request, subprocess, socket, package, or model request is created

  Scenario Outline: Explicit file persistence requires current project trust and fixed identity
    Given the operator explicitly enables file persistence
    And the project and session facts are <facts>
    When the extension starts its file adapter
    Then the result is <outcome>

    Examples:
      | facts                                                   | outcome                                      |
      | trusted project and valid Pi session id                  | one fixed-root session writer                |
      | untrusted project                                       | refuse project-untrusted                     |
      | missing or malformed session id                          | refuse invalid-session-id                    |
      | caller-supplied absolute or relative output path         | refuse unknown-field or invalid-file-config  |
      | environment variable attempting to enable or redirect it | ignored; file persistence remains explicit   |

  Scenario Outline: Unsafe file facts disable persistence before opening
    Given the fixed target `.pi/trajectories/<session>-<segment>.ndjson`
    And the observed target has <unsafe-fact>
    When the append-only file adapter validates it
    Then file persistence is <outcome>
    And no unsafe fallback open occurs

    Examples:
      | unsafe-fact                                      | outcome                         |
      | target escapes canonical project root            | refused unsafe-file-target      |
      | `.pi`, trajectories, or target is a symlink      | refused unsafe-file-target      |
      | target has more than one hard link               | refused unsafe-file-target      |
      | target is directory, FIFO, socket, or device     | refused unsafe-file-kind        |
      | facts contradict opened descriptor               | refused unsafe-file-target      |
      | no-follow append semantics unavailable           | unavailable                     |
      | regular single-link file under trusted fixed root | one private append-only writer |

  Scenario: Buffered file writes preserve order and complete lines
    Given a writer with explicit event-count, byte, line, segment, and total bounds
    When accepted RED-01 lines reach a count or byte threshold
    Then one serialized flush appends complete newline-terminated lines in ascending sequence
    And empty flush performs no sink call
    And no timer or polling loop is used

  Scenario: Ambiguous append failure cannot duplicate history
    Given a buffer contains accepted sequence 21 through 23
    And the sink reports an ambiguous partial append
    When the recorder handles the failure
    Then it enters a stable failed state
    And it does not retry, reorder, drop-and-claim, or duplicate the batch silently
    And later append reports sink-unavailable until a new validated lifecycle starts

  Scenario: Reload replaces one lifecycle generation without duplication
    Given one active recorder, event-bus subscription, and optional writer
    When Pi emits shutdown for reload and then session start for reload
    Then the old subscription is removed once
    And the old buffer is flushed once and writer closed once
    And one replacement recorder and subscription start
    And an old-generation callback cannot append
    And exactly one reload event receives the next restored sequence

  Scenario Outline: Retention planning is deterministic and non-destructive
    Given explicit validated segment inventory and policy
    And the next append would <condition>
    When the pure retention planner evaluates it
    Then it returns <result>
    And it reads no clock, filesystem, environment, or network and deletes nothing

    Examples:
      | condition                                  | result                                      |
      | remain below every limit                   | append current segment                      |
      | exceed only current segment bytes          | open next bounded segment                   |
      | exceed total bytes                         | retention-limit with explicit candidates    |
      | exceed segment count                       | retention-limit with explicit candidates    |
      | use unknown inventory                      | retention-unavailable                       |
      | include duplicate, link, unsafe path, or non-regular segment | invalid-inventory          |

  Scenario Outline: Committed golden fixtures prove accepted and rejected paths
    Given golden entry <fixture>
    When André evaluates the committed suite
    Then the observed verdict is <verdict>
    And a failing fixture must include <required-code>

    Examples:
      | fixture                     | verdict | required-code                    |
      | happy-red-green             | pass    | none                             |
      | missing-red-before-green    | fail    | MISSING_RED_BEFORE_GREEN         |
      | false-completion            | fail    | FALSE_COMPLETION                 |
      | test-and-impl-same-agent    | fail    | TEST_AND_IMPL_SAME_AGENT         |
      | success-after-failed-gate   | fail    | SUCCESS_AFTER_FAILED_GATE        |
      | secret-in-preview           | fail    | SECRET_IN_PREVIEW                |

  Scenario: Only a later pass for the same gate resolves a required failure
    Given required gate `security` fails
    And a different gate `unit` later passes
    When the run claims success
    Then SUCCESS_AFTER_FAILED_GATE remains
    When gate `security` later passes with current structured evidence before handoff
    Then that earlier failure is resolved for trajectory evaluation
    But the trajectory still cannot grant canonical gate or merge authority

  Scenario: Test and implementation role separation uses actor and path classes
    Given actor `worker-a` writes an explicit test path and an explicit production path
    When the trajectory is evaluated
    Then TEST_AND_IMPL_SAME_AGENT is reported
    But generic use of write, edit, or bash without both classified path refs does not fabricate the error
    And test directory names embedded only in prose do not decide authority

  Scenario: Negative fixture rejected for the wrong reason does not satisfy the suite
    Given `false-completion` is malformed and fails only invalid-run
    When its entry expects FALSE_COMPLETION
    Then the golden suite fails that entry
    And the result names stable entry and code identifiers without echoing event content

  Scenario Outline: Malformed replay evidence fails closed
    Given replay input contains <problem>
    When Maya evaluates the run or suite
    Then the result is invalid
    And it cannot be normalized into pass

    Examples:
      | problem                                           |
      | unsupported run or suite version                  |
      | unknown event kind or assertion match mode        |
      | duplicate run id, entry id, or fixture path       |
      | missing fixture or required anti-pattern code     |
      | non-contiguous event sequence                     |
      | invalid or decreasing explicit timestamp          |
      | oversized run, events, assertions, or references  |
      | hostile object, accessor, cycle, or prototype     |

  Scenario: Redaction markers are safe while seeded legacy secrets remain detectable
    Given one replay event contains RED-01 markers only
    And another imported unsafe fixture contains a synthetic token assignment
    When SECRET_IN_PREVIEW evaluates both
    Then the redaction markers do not trigger
    And the unsafe imported fixture fails with SECRET_IN_PREVIEW
    And no real credential is used in a fixture

  Scenario: Extension observation is fail-contained and non-interfering
    Given recording fails for one tool call or result
    When normal interactive execution continues
    Then OBS-01 does not mutate input, replace output, change error status, block the tool, or abort the agent
    And it exposes only a concise stable recorder status
    And it stops claiming the failed sink recorded the event

  Scenario: Retention recovery never silently deletes history
    Given file persistence reaches a hard retention limit
    When Sofia asks how to recover
    Then the stable result says retention-limit
    And file persistence stops
    And bounded session-only recording may continue within its own cap
    And deletion requires a separate explicit operator action
    And disabling file persistence does not weaken RED-01 for session entries

  Scenario: OBS-01 remains an advisory publisher for later integration
    Given the trajectory suite passes and no error anti-pattern appears
    When the package publishes its typed evaluation
    Then it distinguishes pass, fail, invalid, and unavailable
    And FIT-01 remains the sole future canonical gate adapter
    And BUD-01, DEC-01, APR-01, HDR-01, ISO-01, ORC-01, OPS-01, PKG-01, and E2E-01 retain their declared ownership
    And humans retain PR creation checkpoints, live file acceptance, explicit purge, and merge authority

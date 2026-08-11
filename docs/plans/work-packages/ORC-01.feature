@ORC-01 @high-assurance @persona-driven
Feature: ORC-01 thin assurance orchestrator façade
  As Leo, Maya, Nikhil, Sofia, and André
  I want exactly six deterministic assurance primitives over existing authorities
  So one bounded role can be planned, spawned, observed, and recorded without a second FSM, second writer, or autonomous delivery authority

  Background:
    Given CMP-02, CON-01, HDR-01, ISO-01, and ROLE-01 are merged
    And bdd-mode remains the sole BDD phase and evidence authority
    And the worktree board remains the sole cooperative writer authority
    And Herdr remains runtime authority
    And fleet, trajectory, budget, security, and APR facts remain owned by their packages
    And pure ORC-01 functions receive only explicit facts and injected callbacks
    And ORC-01 has no PR, push, merge, deploy, release, or destructive cleanup authority

  @Maya @Andre @R1 @R3
  Scenario Outline: Status reconciles six explicit authorities without mutation
    Given explicit current facts for BDD, Herdr, worktree, fleet, trajectory, and budget
    And the decisive fact is <fact>
    When assurance_status reconciles the facts
    Then the outcome is <outcome>
    And the code is <code>
    And six bounded component summaries are returned in stable order
    And no callback, phase transition, append, process, file, network, environment, or timer is used

    Examples:
      | fact                                      | outcome | code                         |
      | all facts are current and non-blocking    | ready   | ORC01_STATUS_READY           |
      | BDD phase is unknown                      | unknown | ORC01_STATUS_UNKNOWN         |
      | writer authority reports conflict         | blocked | ORC01_STATUS_BLOCKED         |
      | budget is exceeded                        | blocked | ORC01_STATUS_BLOCKED         |
      | trajectory is unavailable                 | unknown | ORC01_STATUS_UNKNOWN         |
      | Herdr and fleet are currently working     | ready   | ORC01_STATUS_READY           |

  @Nikhil @Andre @R2
  Scenario Outline: Pure inputs fail closed at a hostile boundary
    Given an ORC-01 primitive receives <payload>
    When the pure boundary validates the input
    Then no adapter callback is invoked
    And the result contains only <code>
    And the result does not echo arbitrary input or error text

    Examples:
      | payload                         | code                          |
      | unsupported schema version      | ORC01_UNSUPPORTED_VERSION     |
      | unknown top-level field         | ORC01_INVALID_INPUT           |
      | accessor property               | ORC01_INVALID_INPUT           |
      | cyclic graph                    | ORC01_INVALID_INPUT           |
      | hostile prototype               | ORC01_INVALID_INPUT           |
      | oversized serialized graph      | ORC01_BOUNDS                  |

  @Leo @Andre @R2
  Scenario: Pure results are detached and deeply frozen
    Given a valid mutable role request and explicit facts
    When a pure ORC-01 primitive succeeds
    Then its complete result graph is deeply frozen
    And later caller mutation does not alter the result
    And repeating the same explicit input produces equivalent bounded output

  @Leo @Andre @R4
  Scenario: Planning returns one validated role assignment and CAID plan
    Given a valid CON-01 RoleRequestV1 for one Implementer in green
    And an explicit repository root
    When assurance_plan_role is called
    Then it returns one deterministic plan id
    And it returns one role assignment with task, role, phase, branch, path, and card id
    And it returns the matching ISO-01 CAID lifecycle plan
    And it does not create or open a worktree
    And it does not start, register, acquire, append, approve, or emit authoritative state

  @Nikhil @Sofia @R4
  Scenario Outline: Invalid role requests block planning
    Given the request has <defect>
    When assurance_plan_role is called
    Then planning is blocked with code ORC01_ROLE_REQUEST_INVALID
    And no CAID mutation or runtime callback occurs

    Examples:
      | defect                            |
      | missing schemaVersion             |
      | unsupported schemaVersion         |
      | wrong phase for role              |
      | wrong write scope for role        |
      | undeclared role tool              |
      | unsafe artifact path              |
      | unknown field                     |

  @Leo @Nikhil @R5
  Scenario Outline: BDD and workspace preflight blocks before open
    Given a valid deterministic role plan
    And all spawn facts are valid except <defect>
    When assurance_spawn_role is called
    Then spawn is blocked with <code>
    And open, register, acquire, and start are not called

    Examples:
      | defect                                  | code                           |
      | BDD authority is missing                | ORC01_BDD_AUTHORITY_REQUIRED   |
      | BDD phase is missing                    | ORC01_BDD_AUTHORITY_REQUIRED   |
      | BDD phase differs from the role request | ORC01_BDD_PHASE_MISMATCH       |
      | bdd-mode does not permit spawn          | ORC01_BDD_SPAWN_BLOCKED        |
      | workspace is not confirmed              | ORC01_WORKSPACE_UNCONFIRMED    |
      | repository root differs from the plan   | ORC01_WORKSPACE_STALE          |
      | planned path differs from board facts   | ORC01_WORKSPACE_STALE          |

  @Maya @Nikhil @R6
  Scenario Outline: Security budget and approval preflight fail closed
    Given a valid deterministic role plan and current BDD/workspace facts
    And profile is <profile>
    And <condition>
    When assurance_spawn_role is called
    Then the result is blocked with <code>
    And no effect adapter is called

    Examples:
      | profile     | condition                                      | code                              |
      | interactive | security is unavailable                        | ORC01_SECURITY_REQUIRED           |
      | interactive | budget usage is unknown                        | ORC01_BUDGET_REQUIRED             |
      | strict      | approval is missing                            | ORC01_APPROVAL_REQUIRED           |
      | strict      | approval says not-required                     | ORC01_APPROVAL_REQUIRED           |
      | overnight   | approval is stale for the candidate SHA        | ORC01_APPROVAL_STALE              |
      | overnight   | security budget and approval profiles disagree | ORC01_PROFILE_MISMATCH            |
      | interactive | explicit current policy says not-required      | ORC01_SPAWN_PREFLIGHT_CONTINUES   |

  @Leo @Nikhil @R7
  Scenario Outline: Current board facts prevent a second writer
    Given a valid writer role plan and all other current spawn facts
    And board facts report <condition>
    When assurance_spawn_role is called
    Then <effect>

    Examples:
      | condition                                  | effect                                                     |
      | zero path writers and capacity available   | the transaction reaches open                               |
      | one existing writer on the exact path      | ORC01_SECOND_WRITER blocks before open                     |
      | writer state held                          | ORC01_SECOND_WRITER blocks before open                     |
      | writer state unknown                       | ORC01_WRITER_AUTHORITY_REQUIRED blocks before open         |
      | busy count equals maxBusyWriters            | ORC01_WRITER_CAPACITY blocks before open                   |
      | invalid or missing writer cap              | ORC01_WRITER_AUTHORITY_REQUIRED blocks before open         |

  @Andre @R7
  Scenario: A read-only role acquires no writer authority
    Given a valid read-only role plan and current writer facts
    When assurance_spawn_role reaches lease acquisition
    Then the requested lease mode is read-only
    And a returned writer lease mode causes partial failure
    And the role never gains a writer grant

  @Leo @Andre @R8
  Scenario: Successful spawn follows strict order and starts once
    Given a valid role plan and every current required fact
    And injected adapters return closed successful results
    When assurance_spawn_role runs
    Then callback order is exactly open, register, acquire, start
    And start is called exactly once with the validated role request
    And the result is success with stable plan, worktree, registration, lease, agent, pane, and session ids
    And no retry, prompt, wait, handoff, approval, cleanup, PR, or merge callback occurs

  @Sofia @Nikhil @R9
  Scenario Outline: Post-open failure is never reported as success
    Given worktree open has succeeded
    And <stage> returns failure or malformed output
    When assurance_spawn_role handles the partial result
    Then the outcome is partial-failure
    And cleanupRequired and operatorRecoveryRequired are true
    And <compensation>
    And no arbitrary adapter error body appears

    Examples:
      | stage    | compensation                                                |
      | register | acquire and start are skipped                               |
      | acquire  | registration rollback is attempted once and start is skipped |
      | start    | lease release then registration rollback are attempted once  |

  @Leo @Nikhil @R9
  Scenario: Compensation success cannot promote partial failure
    Given open, register, and acquire succeeded
    And start failed
    And lease release and registration rollback succeeded
    When assurance_spawn_role returns
    Then compensated is true
    But outcome remains partial-failure
    And cleanupRequired remains true
    And no worktree removal or pane close was attempted

  @Andre @R8 @R9
  Scenario: Spawn never silently retries an uncertain adapter
    Given one forward adapter throws or returns malformed output
    When assurance_spawn_role handles it
    Then that adapter was called once
    And every later forward adapter was skipped
    And provider text is replaced by a stable ORC-01 code

  @Leo @Sofia @R10
  Scenario Outline: Bounded wait preserves uncertain states
    Given stable role refs and explicit max-attempt and max-duration facts
    And injected wait reports <state>
    When assurance_wait_role runs
    Then the outcome is <outcome>
    And the code is <code>

    Examples:
      | state                         | outcome | code                          |
      | timeout within bounds         | unknown | ORC01_WAIT_TIMEOUT            |
      | blocked within bounds         | blocked | ORC01_ROLE_BLOCKED            |
      | working at the bound          | unknown | ORC01_ROLE_STILL_WORKING      |
      | unknown at the bound          | unknown | ORC01_ROLE_UNKNOWN            |
      | usage exceeds max attempts    | unknown | ORC01_WAIT_BOUNDS_VIOLATED    |
      | usage exceeds max duration    | unknown | ORC01_WAIT_BOUNDS_VIOLATED    |

  @Leo @Andre @R10
  Scenario: Terminal wait performs wait then get then read exactly once
    Given bounded wait reports done
    And get confirms done for the same agent and pane
    And read returns a structured RoleResultV1 and safe artifact ref
    When assurance_wait_role runs
    Then callback order is exactly wait, get, read
    And each callback is called once
    And no timer, sleep, process, ambient clock, or polling loop is used

  @Maya @Nikhil @R11
  Scenario Outline: Returned role result preserves its validated meaning
    Given get confirms done and read returns a RoleResultV1 with <condition>
    When assurance_wait_role validates the result
    Then the outcome is <outcome>
    And completion is not invented

    Examples:
      | condition                       | outcome   |
      | matching completed result       | completed |
      | matching blocked result         | blocked   |
      | matching failed result          | blocked   |
      | matching unknown result         | unknown   |
      | wrong task id                   | blocked   |
      | wrong role                      | blocked   |
      | invalid schema or hostile path  | blocked   |

  @Nikhil @R10
  Scenario: Timeout cannot be upgraded by contradictory completion data
    Given wait reports timeout within the explicit bounds
    And a provider also supplies a done-shaped payload
    When assurance_wait_role runs
    Then the result is unknown with ORC01_WAIT_TIMEOUT
    And read is not used to manufacture a successful role result

  @Leo @Maya @R12
  Scenario: Current valid handoff is RED-01-safe before append
    Given a valid plan and matching RoleResultV1
    And current role, task, worktree path, head SHA, fingerprint, and non-empty evidence refs match exactly
    When assurance_record_handoff runs
    Then RED-01 evaluates a bounded handoff projection
    And append is called exactly once with custom type assurance:handoff:v1
    And appended data is the RED-01-safe projection
    And a completed clean in-scope result returns recorded success

  @Nikhil @Sofia @R12
  Scenario Outline: Invalid or stale handoff blocks before append
    Given a valid role plan and result except <defect>
    When assurance_record_handoff runs
    Then append is not called
    And the result is blocked with <code>

    Examples:
      | defect                                      | code                              |
      | task differs from current refs              | ORC01_HANDOFF_STALE               |
      | role differs from current refs              | ORC01_HANDOFF_STALE               |
      | worktree path differs from plan             | ORC01_HANDOFF_STALE               |
      | head differs from role result               | ORC01_HANDOFF_STALE               |
      | current and expected fingerprints differ    | ORC01_HANDOFF_STALE               |
      | evidence refs are empty or differ           | ORC01_HANDOFF_EVIDENCE_REQUIRED   |
      | completed writer changed an unowned path    | ORC01_HANDOFF_SCOPE_VIOLATION     |

  @Maya @Sofia @R12 @R13
  Scenario: Non-completed valid result is recorded without promotion
    Given exact current refs and a valid blocked or unknown RoleResultV1
    When assurance_record_handoff appends safe evidence successfully
    Then the entry is recorded
    But the returned outcome remains blocked or unknown
    And it cannot satisfy a completed handoff

  @Nikhil @R13
  Scenario Outline: Persistence uncertainty never becomes success
    Given an otherwise valid RED-01-safe handoff
    And append <condition>
    When assurance_record_handoff runs
    Then the outcome is <outcome>
    And no raw fallback sink is tried

    Examples:
      | condition                | outcome |
      | explicitly refuses       | blocked |
      | throws                   | unknown |
      | returns malformed output | unknown |

  @Sofia @Nikhil @R14
  Scenario: Missing APR gateway is unavailable
    Given a valid ApprovalRequestV1
    And no approval gateway is injected
    When assurance_request_approval runs
    Then the result is unavailable with ORC01_APPROVAL_GATEWAY_UNAVAILABLE
    And no model boolean or project file is accepted as approval

  @Maya @Leo @R14
  Scenario Outline: Gateway decisions must be authoritative durable and bound
    Given a valid ApprovalRequestV1
    And the injected gateway returns <decision>
    When assurance_request_approval validates the response
    Then the outcome is <outcome>
    And ORC-01 does not invent or retry a decision

    Examples:
      | decision                                                    | outcome     |
      | durable current APR-01 human approval                       | approved    |
      | durable current APR-01 rejection                            | rejected    |
      | approval without human provenance                           | unavailable |
      | decision with changed candidate SHA                         | unavailable |
      | decision with changed fingerprint                           | unavailable |
      | non-durable rejection                                       | unavailable |
      | thrown or malformed gateway result                          | unavailable |

  @Andre @Nikhil @R15
  Scenario: Extension surface is exactly six tools
    When the assurance-orchestrator extension factory is loaded
    Then registered tools are exactly:
      | assurance_status           |
      | assurance_plan_role        |
      | assurance_spawn_role       |
      | assurance_wait_role        |
      | assurance_record_handoff   |
      | assurance_request_approval |
    And no command, shortcut, flag, renderer, provider, built-in override, or seventh tool is registered
    And importing the module starts no resource or bus subscription

  @Sofia @Nikhil @R15
  Scenario: Extension errors are stable and non-echoing
    Given an input or injected adapter throws a synthetic secret-bearing error
    When any assurance tool executes
    Then tool content and details contain only a bounded typed result and stable ORC-01 code
    And neither the synthetic secret nor arbitrary input/error bodies are present

  @Leo @Andre @R16
  Scenario: Lifecycle starts subscriptions after session start and disposes on reload
    Given the extension factory has registered its tools and lifecycle hooks
    And no session has started
    Then no inter-extension subscription or resource is active
    When session_start occurs
    Then one current namespaced lifecycle subscription and optional injected resource generation starts
    When session_shutdown with reason reload occurs twice
    Then the generation is unsubscribed and closed exactly once
    When replacement session_start occurs
    Then one fresh generation starts

  @Nikhil @Andre @R16
  Scenario: Event contracts are namespaced bounded mirrors only
    Given the extension emits a result summary
    When another extension observes it
    Then the channel starts with assurance:
    And the payload contains only schema version, primitive, outcome, success flag, and stable code
    And the event neither grants authority nor contains raw request, role output, terminal output, or provider error text

  @Leo @Sofia @R17
  Scenario: Disabling the façade leaves existing controls functional
    Given assurance-orchestrator is not loaded
    When the Pi personal package loads its existing extensions
    Then bdd-mode commands and tools remain available
    And fleet commands and tools remain available
    And herd commands remain available
    And worktree-board commands remain available
    And no existing authority needs ORC-01 state migration

  @Maya @Andre @R17
  Scenario: ORC-01 never executes delivery or cleanup authority
    When all six primitive implementations and extension source are inspected
    Then no merge, push, PR creation, deploy, release, worktree remove, pane close, file delete, timer, shell, network, ambient env, or autonomous retry execution path exists

  @Maya @Nikhil @red @R18
  Scenario: Missing orchestrator produces the named causal red
    Given ORC-01 discovery and formulation documents exist
    And production lib/orchestrator and assurance-orchestrator extension do not exist
    When "cd agents-shared/.agents/adapters/pi/personal && bun test lib/orchestrator extensions/assurance-orchestrator" runs
    Then the test "ORC01_ORCHESTRATOR_MISSING: exports exactly six assurance primitives" fails
    And output contains "ORC01_ORCHESTRATOR_MISSING"
    And the failure is caused by the missing ORC-01 module or API
    And it is not a timeout, command-not-found, missing dependency, unrelated compile error, or pre-existing test failure

  @Leo @green @R18
  Scenario: Minimum pure library then thin adapter reaches green
    Given the named causal red is recorded
    When the six pure functions are implemented before the thin extension adapter
    Then focused lib/orchestrator tests pass
    And focused extension contract tests pass
    And "bun test" passes for the personal package
    And importing extensions/assurance-orchestrator/index.ts with Bun succeeds
    And only ORC-01-owned paths changed

  @Leo @Nikhil @mutation @R18
  Scenario Outline: Critical mutations are killed and restored
    Given the focused suite is green
    When the implementation is temporarily changed to <mutation>
    Then named test <test> fails for that mutation
    When the original implementation is restored
    Then the focused suite returns green

    Examples:
      | mutation                                  | test                                                                    |
      | bypass bdd-mode spawnPermitted authority  | ORC01_BDD_AUTHORITY_MUTATION: bdd-mode denial blocks before open         |
      | convert bounded timeout to success        | ORC01_TIMEOUT_MUTATION: timeout remains unknown                          |
      | allow one existing writer on target path  | ORC01_SECOND_WRITER_MUTATION: exact-path writer blocks spawn             |

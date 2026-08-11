Feature: FIT-01 fitness-gate integration and guardian status
  As Leo, Maya, Nikhil, Sofia, and André from docs/bdd/TARGET_PUBLIC.md
  We need one canonical deterministic gate model for command and typed internal evidence
  So required assurance fails closed, advisory findings remain visible, and humans retain merge authority

  Background:
    Given BDD-01 causal-red and trusted argv behavior is the compatibility baseline
    And OBS-01, DEC-01, BUD-01, and SEC-01 expose typed results
    And FIT-01 extends the canonical BDD quality-gate kinds and result only
    And no prose metric parser, second FSM, timer, dependency install, push, PR, or auto-merge is introduced

  @R1 @R2
  Scenario: Internal fitness kinds extend the canonical ordered plan
    Given canonical gate kinds include command gates and security
    When trajectory, decision, and budget internal executors are configured
    Then the plan contains canonical trajectory, decision, budget, and security kinds in deterministic order
    And security slots do not become separate gate kinds
    And the complete executor policy participates in the plan fingerprint

  @R1
  Scenario: Existing projects do not receive fabricated internal gates
    Given a project config has no trajectory, decision, budget, or internal security executor
    When its plan is built
    Then no internal fitness gate is added merely because FIT-01 is installed
    And existing gate relative order remains stable

  @R3
  Scenario Outline: Command evidence is defined by exit and infrastructure facts
    Given a trusted argv command gate returns exit <exit>
    And timedOut is <timed_out>
    And spawnError is <spawn_error>
    And its summary is "<summary>"
    When the canonical runner evaluates the command
    Then canonical status is "<status>"
    And summary prose is not parsed as a metric

    Examples:
      | exit | timed_out | spawn_error | summary                       | status  |
      | 0    | false     | false       | coverage 42 below 90          | passed  |
      | 1    | false     | false       | all thresholds passed         | failed  |
      | 0    | true      | false       | PASS                          | timeout |
      | 0    | false     | true        | all metrics look successful   | failed  |

  @R4 @red
  Scenario: FIT01_REQUIRED_INTERNAL_GATE_MISSING blocks a required known internal gate without typed evidence
    Given a required canonical trajectory gate uses internal id "fit.trajectory.v1"
    And no typed internal envelope is provided
    When the gate plan runs
    Then the gate is unavailable with reason "FIT01_REQUIRED_INTERNAL_GATE_MISSING"
    And run ok is false
    And later gates are skipped
    And the failure is not an import, setup, timeout, or command-not-found failure

  @R4
  Scenario Outline: Every required non-pass halts the plan
    Given a required gate produces canonical status "<status>"
    When the plan runs
    Then run ok is false
    And later gates are skipped

    Examples:
      | status      |
      | failed      |
      | unavailable |
      | timeout     |
      | stale       |

  @R5
  Scenario Outline: Advisory non-pass stays visible and continues
    Given an advisory gate produces canonical status "<status>"
    And a later gate can run
    When the plan runs
    Then the advisory result remains "<status>"
    And the later gate runs
    And the advisory result is not relabeled passed

    Examples:
      | status      |
      | failed      |
      | unavailable |
      | timeout     |
      | stale       |

  @R6
  Scenario: Internal evidence must bind the current plan and profile
    Given a known internal envelope has explicit plan and profile fingerprints
    When either fingerprint differs from the plan being executed
    Then canonical status is stale
    And the required gate blocks
    And no ambient file, environment, clock, or persistence lookup repairs it

  @R6
  Scenario: Unknown internal id cannot borrow known typed evidence
    Given a required internal gate uses id "fit.unknown.v1"
    And a typed trajectory pass envelope is supplied under that id
    When the plan runs
    Then the result is unavailable
    And it never passes

  @R7
  Scenario Outline: Trajectory typed statuses map without prose parsing
    Given current trajectory evaluation has expected run id
    And trajectory status is "<trajectory_status>"
    And trajectory ok is <trajectory_ok>
    When the trajectory adapter runs
    Then canonical status is "<gate_status>"

    Examples:
      | trajectory_status | trajectory_ok | gate_status |
      | pass              | true          | passed      |
      | fail              | false         | failed      |
      | invalid           | false         | failed      |
      | unavailable       | false         | unavailable |

  @R7
  Scenario: Trajectory run identity must be current
    Given a typed trajectory evaluation says pass
    But its run id differs from the explicit expected run id
    When the trajectory adapter runs
    Then canonical status is stale
    And ok true cannot override stale identity

  @R8
  Scenario: Decision pass requires exact current human approval
    Given DEC-01 returns process-local trusted internal handoff evidence
    And status is passed
    And result store fingerprint equals the expected current store fingerprint
    And result approval fingerprint equals that same human-approved fingerprint
    When the decision adapter runs
    Then canonical status is passed

  @R8
  Scenario Outline: Decision trust gaps remain non-passing
    Given DEC-01 input has condition "<condition>"
    When the decision adapter runs
    Then canonical status is "<status>"
    And no decision prose is parsed

    Examples:
      | condition                         | status |
      | missing approval                  | failed |
      | stale approval fingerprint        | stale  |
      | stale store fingerprint           | stale  |
      | typed handoff status failed       | failed |
      | DEC refusal                       | failed |

  @R9
  Scenario Outline: Budget statuses preserve unknown and circuit breaks
    Given BUD-01 returns status "<budget_status>"
    And circuitBroken is <circuit_broken>
    And the trust profile is "<profile>"
    When the budget adapter runs
    Then canonical status is "<gate_status>"

    Examples:
      | budget_status | circuit_broken | profile     | gate_status |
      | ok            | false          | strict      | passed      |
      | warn          | false          | strict      | passed      |
      | exceeded      | true           | strict      | failed      |
      | unknown       | false          | strict      | unavailable |
      | unknown       | false          | overnight   | unavailable |
      | unknown       | false          | interactive | unavailable |

  @R10
  Scenario: Current successful required security slots pass
    Given candidate and inventory fingerprints equal their explicit expected values
    And SEC-01 says evidence is available
    And every configured required slot is successful
    When the security adapter runs
    Then canonical security status is passed
    And security remains one canonical quality kind

  @R10
  Scenario Outline: Non-passing security slots fail closed
    Given a required security slot is "<slot_status>"
    When the security adapter runs
    Then canonical status is "<gate_status>"
    And no scanner is installed automatically

    Examples:
      | slot_status | gate_status |
      | unknown     | unavailable |
      | unavailable | unavailable |
      | timeout     | timeout     |
      | aborted     | failed      |
      | failed      | failed      |
      | stale       | stale       |
      | untrusted   | failed      |

  @R10
  Scenario: Empty overnight security policy cannot fabricate pass
    Given an overnight required security gate has zero configured required slots
    And SEC-01 reports available true for the empty set
    When the security adapter runs
    Then canonical status is unavailable
    And the gate blocks

  @R11
  Scenario: Exact result evidence has a deterministic fingerprint
    Given two identical canonical result arrays
    When their result fingerprints are computed
    Then both fingerprints are equal lowercase SHA-256 values
    When status, executor, trust, reason, or evidence identity changes
    Then the result fingerprints differ

  @R11 @R12
  Scenario Outline: Strict handoff rejects incomplete or forged result binding
    Given top-level plan and profile are otherwise current
    And result evidence has "<problem>"
    When FIT-01 strict handoff completeness runs
    Then handoff has a current-evidence gap

    Examples:
      | problem                       |
      | missing results fingerprint   |
      | forged results fingerprint    |
      | stale per-result plan binding |
      | stale per-result profile      |
      | omitted required result       |
      | non-passing required result   |

  @R12
  Scenario: Current exact assurance evidence completes only the assurance portion
    Given causal red, covering green, matched command-backed mutation, and acceptance are current
    And config, profile, plan, every required result, and results fingerprint are current
    And every required result is passed by trusted argv or trusted internal execution
    When handoff completeness runs
    Then the assurance portion is complete
    But no merge or approval authority is granted

  @R13
  Scenario: Guardian reports concise required blockers and advisory findings
    Given canonical typed assurance evidence contains required and advisory non-passes
    When guardian status is formatted
    Then exact plan and results fingerprints are shown
    And required blockers list stable gate ids, statuses, and reason codes
    And advisory findings are separate
    And no raw dependency prose is required

  @R13
  Scenario: Guardian has no mutation-capable tools
    Given the bdd-fitness-guardian role contract
    When its declared tools and instructions are inspected
    Then write, edit, bash, delegation, install, policy mutation, and merge tools are absent
    And the parent canonical runner remains authoritative

  @R14
  Scenario: bdd-mode requests internal evidence synchronously
    Given bdd-mode is about to execute a plan with internal gates
    When it emits the namespaced FIT-01 evidence request
    Then the request contains exact plan and profile fingerprints
    And providers can synchronously supply typed evidence by internal id
    And no model-supplied trusted evidence parameter exists
    And no timer or polling loop is started

  @R14
  Scenario: bdd-mode renders exact canonical handoff evidence
    Given a canonical assurance run has been persisted in existing BDD evidence
    When bdd_handoff or /bdd handoff runs
    Then every canonical result is rendered
    And plan, profile, and results fingerprints are rendered
    And strict fingerprint gaps affect handoff ok
    And no second phase state is created

  @R15
  Scenario Outline: Required result trust cannot be forged by a tier string
    Given a required passing result uses executor "<executor>"
    And trust tier is "<trust>"
    When handoff trust validation runs
    Then the result is "<verdict>"

    Examples:
      | executor | trust                 | verdict |
      | argv     | trusted               | valid   |
      | internal | trusted               | valid   |
      | shell    | trusted               | invalid |
      | missing  | trusted               | invalid |
      | argv     | interactive_untrusted | invalid |

  @R16
  Scenario: Demotion changes policy rather than rewriting evidence
    Given a new required internal gate blocks
    When a human-controlled configuration demotes it to advisory
    Then the plan fingerprint changes
    And a fresh run is required
    And the prior blocked result is not rewritten as passed

  @R16
  Scenario: Human authority remains final
    Given every FIT-01 gate and handoff check passes
    When delivery reaches the final decision point
    Then FIT-01 does not push, open a PR, approve a decision, increase a budget, install a scanner, merge, deploy, or clean resources
    And a human retains final review and merge authority

  @mutation
  Scenario: Required unavailable and internal failure are mutation-sensitive
    Given the focused FIT-01 suite is green
    When required unavailable or typed internal failure is temporarily changed to pass
    Then the named fail-closed test fails
    When the mutation is restored
    Then the focused suite passes again

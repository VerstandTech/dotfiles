# Personas: Leo operator, Maya approver, Nikhil security reviewer, Sofia dirty-state owner, André package maintainer
# Example Map: PKG-01 R1-R18 / E1-E108 / Q1-Q24
@PKG-01 @packaging @migration @rollback
Feature: Frozen assurance resources package and migrate reproducibly
  As an operator installing the Pi and Herdr assurance stack
  I want staged deterministic packaging with explicit disable and rollback
  So approved resources move between machines without overwriting user state or inventing authority

  Background:
    Given CMP-01 owns the frozen dependency pins
    And Rulesync sources own generated rules
    And machine-local approvals, trust capabilities, sessions, and secrets are not package authority
    And automated validation uses a temporary HOME without network installation

  Scenario Outline: Frozen package metadata is exact
    Given the approved CMP-01 pin set
    When package metadata contains <condition>
    Then packaging is <outcome>
    And no latest-version resolution occurs

    Examples:
      | condition                  | outcome |
      | exact approved pins        | valid   |
      | missing approved pin       | blocked |
      | changed approved pin       | blocked |
      | unapproved dependency      | blocked |

  Scenario: Manifest generation is deterministic and closed
    Given unsorted bounded resource descriptors
    When the package manifest is planned twice
    Then both canonical manifests and fingerprints are equal
    And resources are sorted and unique
    And unknown fields are refused
    And outputs are deeply frozen

  Scenario Outline: Staged validation protects real HOME
    Given a temporary HOME staging root
    When staged resources contain <condition>
    Then deployment readiness is <readiness>
    And real HOME remains unchanged

    Examples:
      | condition                     | readiness |
      | complete matching manifest    | ready     |
      | inconsistent manifest         | blocked   |
      | missing package               | blocked   |
      | escaped symlink               | blocked   |
      | unexpected managed collision  | blocked   |

  Scenario Outline: User-owned conflicts are preserved
    Given a target path contains <existing-state>
    When installation is planned
    Then the action is <action>
    And original bytes are never overwritten silently

    Examples:
      | existing-state                 | action          |
      | real user file                 | backup-required |
      | foreign symlink                | backup-required |
      | correct dotfiles-owned link    | retain          |
      | stale dotfiles-owned link      | replace         |
      | unknown ownership              | blocked         |

  Scenario: Install plan is idempotent and planner-only
    Given a validated manifest and exact target facts
    When installation is planned repeatedly
    Then semantic actions are identical
    And the planner writes no HOME path
    And no dependency, link, backup, or process is executed

  Scenario: Disable removes managed integration only
    Given an installed manifest with managed and foreign paths
    When disable is planned
    Then only exact managed links are listed for removal
    And foreign files, backups, runtimes, worktrees, and branches are retained
    And re-enable uses the same manifest fingerprint

  Scenario Outline: Rollback is transaction-scoped
    Given an install transaction with <condition>
    When rollback is planned
    Then rollback is <outcome>
    And unrelated paths are never touched

    Examples:
      | condition                     | outcome  |
      | exact transaction and backups | ready    |
      | mismatched transaction id     | blocked  |
      | unknown path ownership        | blocked  |
      | missing completion evidence   | unknown  |

  Scenario: Legacy Pi personal layout migrates conservatively
    Given a legacy real Pi personal directory
    And canonical shared resources validate in staging
    When migration is planned
    Then the legacy directory is backed up before linking
    And the canonical shared target is linked afterward
    And only exact dotfiles-owned stale skills may be pruned

  Scenario: Repository and deployed verification agree
    Given a canonical repository manifest and staged HOME
    When resource verification runs
    Then canonical files, package metadata, Rulesync outputs, links, and deployed targets agree
    And failures use stable non-echoing codes

  Scenario Outline: Cross-machine policy stays explicit
    Given the host is <host>
    When packaging preflight runs
    Then the result is <result>
    And no remote script is piped to a shell

    Examples:
      | host        | result      |
      | macOS       | supported   |
      | Ubuntu      | supported   |
      | unknown OS  | unsupported |

  Scenario: Human approval binds exact manifest fingerprint
    Given a valid package plan
    When approval is missing, expired, or bound to another fingerprint
    Then execution eligibility is blocked
    And project files or model booleans cannot approve

  Scenario Outline: Fleet dispatch uses the existing BUD-01 gate
    Given a fleet spawn request in <profile>
    And usage is <usage>
    When dispatch is attempted
    Then spawn is <outcome>
    And no second budget authority is created

    Examples:
      | profile     | usage         | outcome              |
      | strict      | unknown       | blocked              |
      | overnight   | unknown       | blocked              |
      | strict      | hard exceeded | circuit-broken       |
      | interactive | within budget  | permitted            |
      | interactive | high count     | confirmation-required |

  Scenario: Pure packaging planner has no ambient authority
    Given equal injected manifest and filesystem facts
    When planning runs twice
    Then equal canonical outcomes are returned
    And no file, environment, network, process, socket, random source, or clock is read
    And hostile getters or proxies return stable refusal

  Scenario Outline: Packaging safeguards are mutation-sensitive
    Given the green PKG-01 implementation
    When it is mutated to <mutation>
    Then a named PKG-01 test fails

    Examples:
      | mutation                       |
      | accept dependency pin drift    |
      | skip staged verification       |
      | overwrite dirty user file      |
      | accept escaped symlink         |
      | spawn with unknown strict usage|
      | disable deletes foreign file   |

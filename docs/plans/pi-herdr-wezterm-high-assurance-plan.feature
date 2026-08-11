@planning @high-assurance @pi @herdr @wezterm
Feature: Executable implementation plan for the high-assurance agent stack
  As the human operator of synchronized dotfiles
  I want a dependency-aware, multi-agent implementation plan
  So that WezTerm, Herdr, and Pi evolve without duplicated control planes or false assurance

  Background:
    Given the canonical Example Map is "docs/plans/pi-herdr-wezterm-high-assurance-example-map.md"
    And generated rules files must not be edited directly
    And implementation work must follow discovery, formulation, causal red, green, and verify

  Scenario: Baseline separates enforced controls from gaps
    Then the plan inventories existing BDD, fleet, worktree-board, herd, CAID, trajectory, decisions, and budgets
    And every capability is labeled enforced, opt-in, scaffold, missing, or roadmap
    And the baseline records Herdr 0.8.0 protocol 19, missing Pi integration, absent Herdr stow package, absent Rulesync source, and the fleet_dispatch compatibility failure observed in discovery

  Scenario: Architecture preserves layer ownership
    Then the plan assigns host launch and chrome to WezTerm
    And durable PTYs, workspaces, worktrees, state, and notifications to Herdr
    And policies, tools, roles, tests, and coding to Pi
    And it rejects a merged BDD plus fleet mega-extension

  Scenario: Rules follow the canonical authoring path
    Then the governance work starts with rulesync.jsonc and .rulesync sources
    And AGENTS.md, .cursor, and .codex outputs are treated as generated
    And agents-shared remains the canonical resource hub for extensions and skills

  Scenario: Every work package is independently deliverable
    Then each package has an ID, objective, owned paths, dependencies, role owner, acceptance criteria, deterministic commands, risks, rollback, and estimate
    And shared entrypoints have exactly one writer at a time
    And packages that can run concurrently are grouped into explicit parallel waves

  Scenario: Parallel agent execution is bounded
    Then research and review fleets use xai/grok-4.5 with distinct personas
    And writer roles use separate CAID worktrees and fresh Pi sessions in Herdr
    And pi-subagents fleets remain read-only by default
    And integration ownership is serialized through one parent orchestrator
    And no live fleet runs before child environment, secret-path, and tool restrictions are enforced

  Scenario: Writer ownership has one durable authority
    Then worktree-board is the primary writer lease store
    And CAID board contains assignment history rather than a second mutable writer lock
    And only the parent orchestrator writes leases through a cross-process lock and atomic replace
    And stale or conflicting mirrors block instead of auto-reconciling

  Scenario: Dependency edges override parallel-wave labels
    Then a work package never starts before all declared dependencies are green and integrated
    And shared path ownership transfers are explicit
    And FIT security adapters start only after the strict security profile is green

  Scenario: Every implementation package begins with red
    Then the plan gives a discovery to verify mini-cycle for each package
    And no production path is assigned before a causal bdd_assert_red
    And green must cover the exact or broader red command
    And timeouts, missing tools, or setup failures count as neither red nor green

  Scenario: Structured handoffs are versioned and bounded
    Then the plan defines versioned request, result, approval, gate, and trajectory schemas
    And handoffs reference paths and SHAs rather than dumping context
    And invalid schemas fail before spawn or transition

  Scenario: Security is a first-class dependency
    Then the plan includes trust tiers, secret redaction, OS sandbox evaluation, least-privilege role tools, supply-chain pins, SAST/SCA/license/secret gates, and default-deny behavior for unattended work
    And human approval cannot be replaced by an ordinary model-supplied boolean

  Scenario: Fitness gates are deterministic and project-configured
    Then the plan includes unit, acceptance, type, static, coverage, mutation, architecture, doctor, security, performance, trajectory, decision, and budget gates
    And it defines one canonical gate-result model for command and internal deterministic executors
    And untrusted project gate configuration cannot execute an unrestricted shell with inherited secrets
    And it never installs unnamed or unpinned tooling implicitly
    And unavailable required gates block while unavailable advisory gates remain visible

  Scenario: Causal red and covering green are machine-checkable
    Then every work package declares an expected assertion or test identifier for red
    And unrelated assertion, import, setup, timeout, or command-not-found failures cannot unlock green
    And acceptance-changing work proves sensitivity by mutation or an equivalent focused check

  Scenario: Operations expose blocked and stale state
    Then the plan covers blocked-agent notification, stale-state marking, bounded recovery, writer leases, conservative cleanup, and overnight no-merge behavior
    And unknown or timed-out agent state is never treated as done

  Scenario: Rollout remains reversible
    Then each milestone has entry and exit gates, feature flags or additive migration where appropriate, and rollback instructions
    And the existing BDD, fleet, herd, and worktree-board surfaces continue working when new orchestration is disabled

  Scenario: Success is measurable
    Then the plan defines adoption, reliability, recovery, quality, cost, latency, and process-integrity metrics
    And it distinguishes automated verification from required human exploratory review

  Scenario: Open decisions are explicit
    Then the plan records decisions requiring human approval before implementation
    And no risky default is guessed in the green phase

  Scenario: Implementation start is fail-closed without a bootstrap cycle
    Then the plan provides separate Wave 0 bootstrap and runtime-expansion start gates
    And Wave 0 requires an approved clean workspace, one integration owner, one writer, and a locked package validation contract
    And runtime expansion requires the Wave 0 compatibility, causal-red, and containment gates to be green
    And an unmet gate blocks only the work that depends on it

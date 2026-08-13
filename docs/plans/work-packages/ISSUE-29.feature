# Personas: Leo operator, Maya approver, Nikhil security reviewer, Sofia recovering engineer, André adapter maintainer
# Example Map: ISSUE-29 R1-R6 / E1-E15 / Q1-Q2
# Target public: docs/bdd/TARGET_PUBLIC.md
@ISSUE-29 @bdd @worktree @evidence
Feature: Bind BDD red/green evidence to the recording worktree
  As Leo recording causal red and covering green in an isolated worktree
  I want those records to live on the worktree disk store used by handoff
  So a later parent-session VERIFY cannot claim, clear, or invent them

  Background:
    Given CLOSE-01 already provides bindWorktreeEvidenceV1
    And bdd-mode currently persists evidence on the Pi session branch
    And lost historical red/green including OPS-01 stay missing
    And no merge, approval, lease, cleanup, or fleet-cap change is in scope

  Scenario: Assert red and green persist under the recording worktree
    Given an isolated worktree distinct from its parent checkout
    When bdd_assert_red records a failing run in that worktree
    And bdd_assert_green records a covering passing run in that worktree
    Then the worktree store contains those red and green records
    And the parent checkout store is absent

  Scenario: Worktree handoff survives parent VERIFY
    Given the recording worktree store already has causal red and covering green
    And the parent session later runs VERIFY with empty session-branch evidence
    When bdd_handoff is requested from the recording worktree
    Then the handoff reports those recorded red and green commands
    And the parent session does not claim or clear the worktree store

  Scenario: Parent checkout cannot claim another worktree's evidence
    Given a worktree store contains recorded red and green
    When bdd_handoff is requested from the parent checkout
    Then the parent result does not include that worktree's red or green
    And the worktree store is unchanged

  Scenario: Missing worktree identity is unknown
    Given the recording worktree identity cannot be established
    When persist or handoff evidence is requested
    Then the result is unknown or missing
    And no empty success is emitted

  Scenario: Binding the parent as the worktree stays unknown
    Given a requested worktree path equals the parent checkout path
    When bindWorktreeEvidenceV1 is called
    Then the result is unknown
    And no store is written

  Scenario: Historical OPS-01 red and green stay missing
    Given OPS-01 is already merged and root-green
    And historical package-turn red/green are unavailable
    When package evidence is reconstructed
    Then red and green remain missing
    And no invented commands are recorded

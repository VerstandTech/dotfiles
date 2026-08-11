Feature: Preserve Gheeggle QC workflow skills
  As a Delta tooling maintainer
  I want the approved Gheeggle workflow skills versioned with their safety contracts
  So that fresh machines and future agents retain deterministic, approval-gated workflows

  Scenario: All three skills are valid repository resources
    Given the dotfiles repository is checked out without machine-local skill copies
    When repository AI resources are verified
    Then add-linear-feature is valid
    And qc-user-story-to-linear-issue is valid
    And voyager-qc-task-implementation is valid

  Scenario: Linear feature inventory changes remain validator-backed
    Given add-linear-feature is installed from the repository
    When its focused validator tests run
    Then valid feature inventories pass
    And malformed counts and duplicate issue entries fail

  Scenario: QC Linear writes remain approval-gated
    Given a QC User Story draft exists
    When no explicit approval of the current complete draft has been recorded
    Then the skill forbids creating or updating the Linear issue
    And retains UI and MCP coverage templates

  Scenario: Voyager completion remains evidence-bound
    Given a Voyager QC task is being implemented
    When completion is evaluated
    Then deterministic seeds, paired missions, RewardKit criteria, provenance, focused Harbor validation, and final-head CI evidence are required

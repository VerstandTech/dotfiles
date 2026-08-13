# Personas: Leo operator, Maya approver, Nikhil security reviewer
# Example Map: ISSUE-25 R1-R6 / E1-E12 / Q1-Q2
@ISSUE-25 @child-delegation @personal-package @startup
Feature: Live child-delegation through the loaded personal package
  As an operator finishing CLOSE-01 leftover C2
  I want a bounded live probe through the loaded personal package
  So that a real pi-subagents child is proven or honestly reported unavailable

  Background:
    Given CLOSE-01 already excluded "*.test.ts" from personal package extension loading
    And staged pi --list-models is not full-child acceptance
    And this issue cannot raise maxSubagentSpawnsPerSession or launch a product fleet

  Scenario: Test files remain outside the extension load set
    Given the personal package extension globs
    When package discovery is evaluated
    Then extensions/agentic-fleet.ts is a loaded extension
    And extensions/approval-seams.test.ts is not a loaded extension

  Scenario: Advisory pi -ne cannot become child-started
    Given an advisory pi --no-extensions startup
    When the live child probe classifies the evidence
    Then the result is child-startup-unavailable
    And advisoryOnly is true
    And the result does not claim child-started

  Scenario Outline: Earlier full-child failures stay unavailable
    Given child output containing <failure>
    When the live child probe classifies the evidence
    Then the result is child-startup-unavailable
    And no product fleet is launched

    Examples:
      | failure                                          |
      | The "path" argument must be of type string       |
      | Failed to load extension                         |

  Scenario Outline: Live child delegation is proven or honestly blocked
    Given a bounded pi-subagents spawn through the loaded personal package
    When the child <condition>
    Then the result is <code>
    And the probe does not raise spawn caps

    Examples:
      | condition                                      | code                      |
      | starts with loaded personal package extensions | child-started             |
      | cannot produce a live child identity           | child-startup-unavailable |
      | is asked to launch a product fleet             | operator-approval-required |

Feature: Curate stable local agent and shell preferences
  As a dotfiles maintainer
  I want stable preferences separated from volatile application state
  So that new machines reproduce intent without inheriting incidental authority or slow shells

  Scenario: Codex retains stable high-assurance preferences
    Given the Codex configuration is installed from dotfiles
    Then normal reasoning is xhigh
    And hooks are enabled
    And follow-ups are queued
    And the Node REPL uses the installed ChatGPT application
    And the explicitly selected plugin set remains enabled

  Scenario: Codex excludes incidental authority and runtime state
    Given Codex generated trust and runtime metadata during local use
    When the configuration is curated
    Then new scratch and Downloads project trust entries are absent
    And hook trusted hashes are absent
    And shell capability injection is absent
    And the disabled computer-use MCP server is absent

  Scenario: Pi retains only the deliberate preference change
    Given Pi wrote both a changelog marker and a thinking preference
    When the configuration is curated
    Then default thinking is medium
    And the changelog marker remains unchanged from the repository baseline

  Scenario: zsh keeps deterministic tools without eager NVM cost
    Given Homebrew Python 3.12 is installed
    When an interactive shell starts
    Then its libexec bin is preferred
    And NVM remains lazy
    And no tunnel alias expands a cloudflared token
    And the zsh configuration is syntactically valid

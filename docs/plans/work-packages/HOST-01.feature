Feature: Reproducible Herdr package and Pi integration
  As a trusted local dotfiles operator
  I want Herdr installed, configured, validated, and integrated with Pi deterministically
  So that WezTerm to Herdr to Pi starts from a supported state without hidden machine drift

  Background:
    Given HOST-01 inherits the CMP-01 Herdr 0.8.x version policy
    And hermetic tests use an isolated home and an injected Herdr executable

  Scenario: macOS declares Herdr as a package-managed dependency
    Given the host platform is macOS
    When the dotfiles dependency manifest is evaluated
    Then the official Homebrew Herdr formula is declared
    And the installer verifies a supported Herdr binary before integration

  Scenario: Ubuntu fails closed with the exact official install action
    Given the host platform is Ubuntu
    And Herdr is absent from PATH
    When the Herdr bootstrap preflight runs
    Then it exits non-zero
    And it prints "curl -fsSL https://herdr.dev/install.sh | sh"
    And it does not report configuration or Pi integration success

  Scenario Outline: Runtime compatibility remains owned by CMP-01
    Given Herdr version output is "<version>"
    When the Herdr bootstrap preflight runs
    Then version compatibility is "<result>"
    And integration mutation count is <installs>

    Examples:
      | version       | result      | installs |
      | herdr 0.8.0   | supported   | 0        |
      | herdr 0.8.9   | supported   | 0        |
      | herdr 0.7.5   | rejected    | 0        |
      | herdr 0.9.0   | rejected    | 0        |
      | malformed     | rejected    | 0        |

  Scenario: The tracked Stow configuration is conservative and valid
    Given the Herdr package owns only .config/herdr/config.toml
    When Herdr validates the tracked configuration
    Then validation succeeds
    And an inherited HERDR_CONFIG_PATH override is ignored
    And in-app Herdr toasts are enabled
    And sound is disabled
    And automatic agent resume is disabled
    And sidebar width is bounded from 18 through 36 columns
    And no secret or machine-local runtime state is tracked

  Scenario: Current Pi integration is a no-op
    Given Herdr config validation succeeds
    And integration status reports Pi current
    When the post-Stow bootstrap runs twice
    Then both runs succeed
    And integration install is never called
    And status diagnostics are emitted on both runs

  Scenario: Missing Pi integration is installed once and revalidated
    Given Herdr config validation succeeds
    And integration status first reports Pi not installed
    And installing Pi integration succeeds
    And the next status reports Pi current
    When the post-Stow bootstrap runs
    Then it succeeds
    And integration install is called exactly once
    And the observed command order is version, config check, status, install, status

  Scenario: Failed or ineffective integration repair fails closed
    Given Herdr config validation succeeds
    And integration status reports Pi missing or outdated
    When integration install fails or post-install status is not current
    Then the post-Stow bootstrap exits non-zero
    And it does not report Herdr setup complete

  Scenario: Re-running installation does not duplicate integration state
    Given the first bootstrap repaired Pi integration successfully
    When the same bootstrap runs again against the resulting state
    Then the second run succeeds
    And no second integration install occurs
    And no duplicate Pi hook is produced

  Scenario: Rollback keeps machine-local state under human authority
    Given HOST-01 has been installed
    When the operator follows the rollback documentation
    Then repository Stow ownership can be reverted independently
    And Pi integration uninstall is documented but not executed automatically
    And logs, sockets, sessions, and unrelated integration hooks are preserved

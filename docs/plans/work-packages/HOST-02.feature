@HOST-02 @wezterm @herdr
Feature: Attach to Herdr from WezTerm without duplicating mux ownership
  As an operator using WezTerm as the host terminal
  I want one explicit attach action and a recognizable Herdr tab
  So that WezTerm remains the outer shell and Herdr remains the durable runtime

  Background:
    Given HOST-01 provides a valid Herdr 0.8 installation and current Pi integration
    And the tracked WezTerm config loads successfully before HOST-02
    And the WezTerm leader is CTRL+SPACE with a 2000 millisecond timeout

  Scenario: Explicit local action attaches Herdr in a new tab
    Given LEADER+a is unused by the baseline key set
    When the operator presses CTRL+SPACE and then a
    Then WezTerm starts a new tab with exact argv "herdr"
    And the command is not wrapped by a shell
    And the caller working directory is inferred by WezTerm
    And no config-load or render event can invoke the action

  Scenario: Existing key behavior remains stable
    When the HOST-02 key is added
    Then every baseline split key retains its existing action
    And every baseline pane movement, zoom, close, and resize key retains its existing action
    And every baseline tab, copy, reload, font, and command-palette key retains its existing action
    And exactly one LEADER+a tuple exists

  Scenario: Herdr foreground process renders icon and readable text
    Given a tab foreground process basename is "herdr"
    When WezTerm formats the tab title
    Then the static Herdr icon is selected
    And the visible title contains either the explicit tab title or "herdr"
    And unknown process fallback behavior remains unchanged
    And formatting performs no process or filesystem I/O

  Scenario: Status rendering cannot spawn Herdr
    When WezTerm formats a tab or updates status
    Then no callback executes "herdr"
    And no callback executes a Herdr helper script
    And no timer or periodic callback polls Herdr state
    And the optional Herdr status chip is absent in v1

  Scenario: WezTerm does not become a second durable mux
    Then the config declares no Herdr Unix domain
    And the config declares no Herdr SSH domain
    And the config declares no Herdr default domain or mux connection action
    And remote operation is documented as "herdr --remote user@host"
    And no personal remote target is tracked

  Scenario: Prefix ownership is understandable
    When the operator reads the HOST-02 guide
    Then CTRL+SPACE is described as the outer WezTerm pane and tab prefix
    And Herdr is described as owning durable workspaces, panes, agents, and recovery
    And the guide warns against representing the same durable topology in both layers

  Scenario: Supported WezTerm loads the resulting config
    When the tracked config is evaluated with "wezterm --config-file <config> show-keys --lua"
    Then the command exits successfully
    And the rendered key list contains the HOST-02 action
    And the test does not launch the GUI or mutate a live Herdr session

  Scenario: Focus changes only after explicit operator intent
    When the config reloads without an attach keypress
    Then no tab is created
    And focus remains unchanged
    When the operator explicitly invokes LEADER+a
    Then activating the new Herdr tab is expected

  Scenario: Rollback is narrow
    When HOST-02 is rolled back
    Then only the attach key, Herdr icon mapping, and HOST-02 operator documentation are removed
    And HOST-01 installation, configuration, and Pi integration remain untouched

# ISSUE-25 Example Map — Live child-delegation through the loaded personal package

## Scope

CLOSE-01 already excluded `*.test.ts` from personal-package extension loading
and proved staged `pi --list-models` discovery. Issue #25 still needs a
bounded live probe that either starts one `pi-subagents` child through the
loaded personal package or returns `child-startup-unavailable` without
claiming success.

## Rules and representative examples

### R1 — Test files are not loaded as extensions
- E1: `extensions/agentic-fleet.ts` is a loaded extension.
- E2: `extensions/approval-seams.test.ts` is classified as a non-extension.

### R2 — Advisory `pi -ne` is not full-child acceptance
- E3: A `pi --no-extensions` / `pi -ne` advisory startup is not `child-started`.
- E4: Advisory-only evidence is `child-startup-unavailable`.

### R3 — Undefined-path fleet failure is not success
- E5: Output containing `The "path" argument must be of type string` is
  `child-startup-unavailable`.
- E6: `Failed to load extension` is `child-startup-unavailable`.

### R4 — One bounded child, no product fleet
- E7: A successful child through the loaded personal package is `child-started`.
- E8: A product-fleet request without named approval is
  `operator-approval-required`.
- E9: The probe never raises `maxSubagentSpawnsPerSession`.

### R5 — Honest unavailable when a live child cannot start
- E10: Missing spawn transport, spawn-cap zero, timeout, or missing child
  identity returns `child-startup-unavailable`.
- E11: Unavailable results set `executes: false` and never claim success.

### R6 — Real HOME stays untouched
- E12: Staging and probe execution never target the process HOME.

## Questions

- Q1: May this issue raise `maxSubagentSpawnsPerSession`? No.
- Q2: May this issue launch a product fleet? No.

## Non-goals

- No overnight/strict live dogfood.
- No real-HOME mutation.
- No merge.

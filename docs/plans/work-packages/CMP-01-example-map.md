# CMP-01 Example Map — Tested Versions and Herdr 0.8 Compatibility

## Observed runtime lock

Captured from the approved integration worktree on 2026-08-10:

| Component | Tested value | Evidence source |
|---|---:|---|
| Herdr CLI/session | `0.8.0` | `herdr --version`, `herdr api snapshot` |
| Herdr socket protocol | `19` | `herdr api schema --json` |
| Herdr schema version | `1` | `herdr api schema --json` |
| Pi | `0.84.1` | `pi --version` |
| pi-subagents | `0.45.2` | installed package metadata |
| context-mode | `1.0.169` | installed package metadata |
| Rulesync | `16.9.1` | GOV-01 exact dependency |
| Pi Herdr integration | not installed | `herdr integration status` |

No package or integration is upgraded/installed by CMP-01. HOST-01 owns installation.

## Rules

### R1 — Installed interfaces are the compatibility authority

The tested installed binary, its JSON schema, and normalized live envelopes override stale prose. Documentation must distinguish historical 0.7.5 evidence from the supported 0.8 runtime.

### R2 — Runtime and parser support are different

Supported runtime is Herdr `0.8.x` with protocol `19` and schema version `1`. Legacy 0.7.5 agent/worktree envelopes remain parser fixtures only; they do not imply runtime support.

### R3 — Incompatibility fails actionably

A protocol or schema outside the matrix returns a typed incompatibility result naming observed and expected values and instructing the operator to run the compatibility doctor. Unknown is never silently compatible.

### R4 — JSON envelopes are tolerant, IDs remain opaque

Both legacy and current `agent_list`/`worktree_created` envelopes parse through public fields. Extra 0.8 fields are ignored. IDs are read from JSON and never derived from display order.

### R5 — Background launch is explicit on 0.8

Herdr 0.8 supports `--focus` and `--no-focus` on worktree creation. The `/herd-task` builder emits `--no-focus` explicitly and never emits `--json` because JSON remains the default CLI envelope.

### R6 — Fixtures are stable and non-sensitive

Committed fixtures retain public schema shape but replace live names, paths, terminal ids, and worktree ids with deterministic synthetic values. No home path, auth data, or session token is committed.

### R7 — Version changes are reviewable

The matrix records exact tested versions and a support policy. Dependency/settings files are not changed in CMP-01. Any future version change requires refreshed fixtures and a causal red/green compatibility run.

## Examples

| ID | Given | When | Then |
|---|---|---|---|
| E1 | Herdr 0.8.0, protocol 19, schema 1 | compatibility check runs | result is compatible and names the tested matrix |
| E2 | protocol 18 or 20 | compatibility check runs | result is incompatible with expected `19` |
| E3 | schema version 2 | compatibility check runs | result is incompatible with expected `1` |
| E4 | protocol/schema missing | compatibility check runs | result is `unknown`, never compatible |
| E5 | normalized 0.7.5 agent-list fixture | herd formatter runs | legacy public envelope still renders |
| E6 | normalized 0.8.0 agent-list fixture with extra fields | herd formatter runs | current envelope renders and ignores extras |
| E7 | 0.8 worktree-created envelope | pane extraction runs | `result.root_pane.pane_id` wins |
| E8 | task launch on 0.8 | argv is built | it includes `--no-focus`, excludes `--focus` and `--json` |
| E9 | integration status says Pi is absent | CMP-01 runs | it documents absence and does not install hooks |
| E10 | stale docs say 0.7.5 is current | compatibility regression runs | it fails until wording is marked legacy/current correctly |
| E11 | installed skill body matches Herdr 0.8 | vendored skill is reconciled | local `--kind pi` adaptation remains and footer records 0.8.0 |
| E12 | future version is proposed | package policy is applied | fixtures/tests must change before support claim changes |

## Questions and disposition

1. **Support every Herdr 0.8 patch automatically?** Runtime policy is `0.8.x`, but protocol/schema must still equal 19/1; fixture refresh is required before changing protocol support.
2. **Support Herdr 0.7.5 at runtime?** No. Preserve parser fixtures only for old stored envelopes.
3. **Install the missing Pi integration now?** No. HOST-01 owns idempotent install/status behavior.
4. **Pin user-global Pi extension packages here?** No. Record observed versions; package/settings mutation waits for its owning package and user-owned settings reconciliation.
5. **Use live session ids in fixtures?** No. Normalize every identifier/path while retaining schema shape.

## ValidationContractV1

- **Focused red/green command:** `cd /Users/leonardoribeiro/worktrees/dotfiles-pi-herdr-high-assurance/pi && bun test tests/herd-compat.test.ts`
- **Expected red test id:** `Herdr compatibility matrix > declares the current compatibility contract`
- **Expected red signature:** `Herdr 0.8 compatibility contract is missing`
- **Additional intended red:** task launch lacks explicit `--no-focus`
- **Forbidden production paths before red SHA:** `pi/.pi/agent/personal/extensions/herd/herd-compat.ts`, `herd-task.ts`, `pi/docs/pi-herdr-*`, personal `skills/herdr/SKILL.md`
- **Covering green:** exact focused command passes; full `cd pi && bun test` is broader regression
- **Sensitivity:** feed protocol 20 to the compatibility check and require the focused test to reject it; restore protocol 19 and pass

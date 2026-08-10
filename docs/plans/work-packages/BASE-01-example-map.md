# BASE-01 Example Map — Canonical Playbook and Bounded Test Designer Baseline

## Observed contract lock

- The normative playbook is already `v1.2 — August 2026`, with a changelog preserving v1.0 history and numbered sections 1–20.
- `lib/bdd/playbook.ts` still advertises `v1.0 — July 2026`.
- `playbook.test.ts` is stale: it requires v1.0 and the old 13-section shape, so rewriting the canonical document backward would make an obsolete test pass.
- `bdd-test-designer.md` already uses fresh context and prohibits production edits, but its explicit machine-checked contract is incomplete: no plain no-delegation sentence, no exact writable-path boundary, and no contracts/invariants or fuzz responsibility.
- Four full-suite failures reduce to these two baseline authorities; the failures predate GOV/CMP production changes and remain visible in the root aggregate.
- Human approval moved this minimal repair into Wave 0 as BASE-01; ROLE-01 remains the later owner for broader role evolution.

## Rules

### R1 — v1.2 is the current normative playbook

The canonical document remains `Version 1.2 — August 2026`. Its v1.0 content is historical changelog information, not current runtime metadata.

### R2 — Runtime metadata matches the canonical document

`HIGH_ASSURANCE_PLAYBOOK` and its formatted discovery output report version 1.2 and August 2026, with unchanged canonical and implementation paths.

### R3 — Structural tests follow the living v1.2 shape

Tests require the title, process-determinism purpose, v1.2/changelog, numbered sections 1–20, the v1.2 closing claim, and current extension/skill discovery surfaces. They do not require obsolete v1.0-only headings or wording.

### R4 — The Test Designer has an explicit writable boundary

The role states that only specification and test paths are writable and that production implementation, dependency, threshold, and deployment paths are forbidden.

### R5 — The Test Designer cannot delegate

The role plainly says it must not run, launch, or delegate to subagents or fleets. Markdown emphasis cannot be the only carrier of this machine-checked rule.

### R6 — The Test Designer owns layered test oracles

The role explicitly covers contracts/invariants, fuzz, differential, and golden-master techniques, used selectively according to risk, alongside acceptance, property, trajectory, unit, and adversarial tests.

### R7 — Existing role isolation remains intact

Fresh context, `inheritSkills: false`, CAID separation, read-only role tool restrictions, Implementer test prohibition, and Refactorer behavior preservation remain green. BASE-01 does not broaden tools.

### R8 — Root assurance becomes honestly green

Focused baseline tests, the complete personal `bun test lib`, and `scripts/test-root.sh` pass without skipping or weakening the four former failures.

### R9 — Sensitivity proves both authorities

Restoring runtime metadata to v1.0 or removing a required Test Designer boundary/oracle makes the focused tests fail; restoring v1.2 and the complete role contract passes.

### R10 — Later ROLE-01 cannot weaken BASE-01

ROLE-01 may add schema/tool enforcement after Gate B, but it cannot downgrade v1.2 metadata, delegation isolation, writable-path scope, or layered oracle responsibilities.

## Examples

| ID | Given | When | Then |
|---|---|---|---|
| E1 | canonical document says v1.2/August while runtime metadata says v1.0/July | focused test runs | causal red identifies stale runtime metadata |
| E2 | stale test expects `Version 1.0 — July 2026` and sections 1–13 | test contract is formulated | test is updated to the living v1.2 shape; production document is not downgraded |
| E3 | canonical playbook | structural oracle runs | numbered sections 1–20 and changelog are present |
| E4 | runtime reference formatter | output is rendered | it says v1.2 and August 2026 with canonical paths unchanged |
| E5 | Test Designer role | isolation oracle runs | plain no-run/no-launch/no-delegate language is present |
| E6 | Test Designer role | writable-path oracle runs | only specification and test paths are writable |
| E7 | Test Designer role | oracle-responsibility test runs | contracts/invariants, fuzz, differential, and golden-master are explicit |
| E8 | all seven bounded roles | existing isolation tests run | fresh contexts, no nested delegation, and tool restrictions remain intact |
| E9 | focused baseline command after implementation | tests run | all baseline tests pass |
| E10 | complete personal suite | `bun test lib` runs | no playbook or agent-contract failure remains |
| E11 | root aggregate | `scripts/test-root.sh` runs | Rulesync, AI resources, Pi tests, and personal tests all pass |
| E12 | metadata is deliberately reverted to v1.0 | focused sensitivity runs | test fails, then passes after restore |
| E13 | required Test Designer fuzz/path rule is deliberately removed | focused sensitivity runs | test fails, then passes after restore |

## Questions and disposition

1. **Is v1.0 or v1.2 canonical?** v1.2. The canonical document and changelog make this explicit; runtime metadata/tests are stale.
2. **Should the playbook be rewritten to satisfy existing tests?** No. Tests must track the current normative source without weakening its essential structure.
3. **Are exact phrases acceptable?** Only for compact machine-checked safety boundaries and stable metadata. Broader prose checks should validate structure/meaning rather than freeze incidental wording.
4. **Does BASE-01 replace ROLE-01?** No. BASE-01 repairs the current package baseline; ROLE-01 later adds schema/tool-policy evolution.
5. **May BASE-01 change tools?** No. The current Test Designer writer tools remain; only scope, isolation, and oracle responsibilities are clarified.
6. **Can the four failures be labeled pre-existing and ignored?** No. They remain visible until repaired and block the root Milestone 0 exit.

## ValidationContractV1

- **Focused red/green command:** `cd /Users/leonardoribeiro/worktrees/dotfiles-pi-herdr-high-assurance/agents-shared/.agents/adapters/pi/personal && bun test lib/bdd/playbook.test.ts lib/bdd/assurance-agents.test.ts`
- **Expected red test id:** `reports the canonical v1.2 runtime metadata`
- **Expected red signature:** expected version `1.2`, received `1.0`
- **Secondary red:** Test Designer contract test reports missing writable-path, no-delegation, contracts/invariants, or fuzz requirement
- **Forbidden production paths before red SHA:** `lib/bdd/playbook.ts`, `agents/bdd-test-designer.md`, `docs/high-assurance-playbook.md`
- **Covering green:** the exact focused command passes; `bun test lib` and root `scripts/test-root.sh` pass
- **Sensitivity:** revert `HIGH_ASSURANCE_PLAYBOOK.version` to `1.0`, then remove one required Test Designer path/oracle rule; each break must fail the focused command and each restore must pass

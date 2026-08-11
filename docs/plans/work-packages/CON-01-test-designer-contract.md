# CON-01 Test Designer Contract

## Objective

Create the complete failing acceptance/unit suite for CON-01 without writing production code. Lock the smallest additive V1 public behavior that makes role requests, role results, approval data, artifact references, and validation contracts machine-checkable while preserving package boundaries.

## Locked inputs

- `docs/plans/work-packages/CON-01-example-map.md` (R12/E30/Q10)
- `docs/plans/work-packages/CON-01.feature`
- `docs/plans/pi-herdr-wezterm-high-assurance-implementation-plan.md` CON-01/G4/ValidationContract row
- Existing BDD semantics in `lib/bdd/types.ts`, `lib/bdd/run-command.ts`, and `lib/bdd/assurance-cycle.ts`
- Existing path/output fail-closed examples in `lib/fleet/plan.ts` and `lib/fleet/child-policy.ts`

## Ownership

Write only:

- `agents-shared/.agents/adapters/pi/personal/lib/contracts/**/*.test.ts`
- test-only fixtures under `agents-shared/.agents/adapters/pi/personal/lib/contracts/fixtures/**`
- this handoff document only if needed for exact red evidence

Production files under `lib/contracts/**` are forbidden. Do not edit `lib/bdd/**`, `lib/security/**`, `lib/worktree/**`, `lib/trajectory/**`, `extensions/**`, agents, package manifests, locks, generated Rulesync outputs, or unrelated tests/docs.

## Public behavior to lock

Tests may refine names for TypeScript ergonomics, but must lock a coherent export surface equivalent to:

- `parseContractV1`, plus specific role/result/approval/validation parsers
- `isSafeRepoRelativePath` / `assertSafeRepoRelativePath`
- `canonicalizeContractV1`
- validated-only deterministic Markdown renderers
- `toExpectedRedContract`
- explicit bounded `parseLegacyMarkdownHandoff`
- exported V1 types, issue/result types, limits, enums, and JSON-Schema-compatible closed descriptors

No new runtime package dependency is allowed. The Test Designer must not implement a permissive fallback. If the production module is absent, use guarded dynamic import and convert absence into the named behavioral assertion; do not accept uncaught module-not-found/setup/import output as red.

## Required acceptance groups

1. Valid minimal fixture for each envelope and canonical round-trip.
2. Missing/unknown/wrong fields and exact `schemaVersion: 1`/known-kind rejection.
3. Prototype/accessor/non-JSON/cycle/sparse/depth safety without invoking getters or mutating prototypes.
4. Published byte/string/path/command/array/map/depth/render/issue bounds with exact-bound positives.
5. Safe repository-relative path table and traversal/absolute/home/URI/backslash/control/secret-basename denial.
6. Assurance-role phase/write-scope/path/tool matrix.
7. Role-result status/dirty/SHA/changed-path/commands/blockers/risks/usage honesty.
8. Approval envelope structure, matching/expiry helper, and explicit non-authority marker for APR-01.
9. ValidationContractV1 focused command, expected test identity/signature, green relation, forbidden paths, and required sensitivity; forbid `legacy`.
10. Exact BDD-01 field bridge without classifier/trust logic.
11. Deterministic validated-only Markdown and explicit assurance-ineligible legacy adapter.
12. Ownership/no-new-dependency assertions.

Do not duplicate RED-01 secret-content redaction, APR-01 authority persistence, ISO-01 realpath/lease logic, OBS-01 sinks, ROLE-01 prompts, ORC-01 spawn/write behavior, or BDD-01 causal classification.

## ValidationContractV1

- **Focused command:** `cd /Users/leonardoribeiro/worktrees/dotfiles-con01-tests/agents-shared/.agents/adapters/pi/personal && bun test lib/contracts`
- **Primary expected test ID:** `CON-01 P0 > rejects unsupported versions and unsafe artifact paths`
- **Expected failure signature:** `invalid version/path/red-cause fixture validates or valid V1 fixture fails`
- **Match mode:** `signature`
- **Forbidden production paths before red SHA:** every non-test file under `lib/contracts/**`, all existing production/test files outside the owned test paths, package manifests and locks
- **Covering green:** same focused command in the Implementer worktree; broader `bun test lib`; root `bash scripts/test-root.sh`
- **Required sensitivity:** weakening exact-version, unknown-field, path traversal, causal test-ID/signature, or validated-render checks must fail a named focused oracle and pass after restore
- **Invalid colors:** bare missing import/module, syntax/setup error, timeout, spawn failure, exit 126/127, unrelated test failure

## Test-quality rules

- Test public observable behavior, not private helper structure.
- Include positive controls so reject-all cannot pass.
- Use stable assertion messages and exact test titles.
- Ensure the primary failing test emits the locked failure signature even when the guarded module API is absent.
- Assert getters were never invoked and `Object.prototype` remains unchanged.
- Avoid host state, network, live Pi/Herdr/fleet, package installation, random timing, and snapshots with unstable ordering.
- Keep fixtures synthetic and non-secret.

## Handoff

Commit test-only changes. Report:

- SHA and changed paths
- exact focused command and failing test IDs/signature
- evidence that failure is behavioral rather than setup/import
- acceptance groups covered
- any locked API ambiguity or deferred risk
- confirmation that production and package files stayed untouched

End with `CON01 TEST DESIGN COMPLETE`.

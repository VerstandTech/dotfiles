# CON-01 Independent Review Regression Test Contract

## Objective

Lock causal regression tests for every accepted P1 from independent correctness/security review of integration HEAD `0f91ae3`. Test-only changes must fail on the current production and must not weaken the original 24-test suite.

## Ownership

Write only new or focused existing `agents-shared/.agents/adapters/pi/personal/lib/contracts/**/*.test.ts` test code and test-only helpers/fixtures. Production, docs, manifests, locks, extensions, BDD, security, worktree, and unrelated tests are forbidden.

## Accepted blockers to lock

1. **Concrete path vs glob scope:** artifact/owned/changed/evidence/scoped paths reject every glob (`**`, `docs/**`, `*`, `?`, brackets). A separate exported glob validator may allow exactly one non-bare trailing `/**` only for `ValidationContractV1.forbiddenProductionPathsBeforeRed`.
2. **Path under/over-denial:** legitimate concrete paths such as `lib/auth/index.ts`, `lib/xai-web-search/auth.ts`, `docs/auth-model.md`, and `docs/secrets/readme.md` pass. Secret-bearing leaf names including `.envrc`, `.env.local`, `.npmrc`, `auth.json`, `auth.json.bak`, `credentials.json.enc`, `service-account.json`, `id_rsa`, `private.pem`, and `private.pem.bak` fail.
3. **Strict timestamps:** approval request/decision timestamps use a deterministic UTC RFC3339 profile. Reject date-only, locale strings, invalid calendar values, offsets if V1 is Z-only, excessive fractional precision, and `NaN` parse forms. Pair checking enforces `requestedAt <= decidedAt < expiresAt`.
4. **Preflight key-cardinality DoS:** publish and enforce `maxObjectKeys` before cloning or walking property values. `maxObjectKeys` passes; `+1` returns a bounded `bound_exceeded` result. A proxy/reflect ownKeys failure must return a validation issue rather than escape as a throw if the implementation claims unknown-object safety.
5. **Descriptor/validator parity:** every minimal valid V1 fixture validates against its exported descriptor using a bounded test-only JSON-Schema subset checker; representative unknown/nested-invalid fixtures fail. Descriptors must be closed and field-for-field aligned for role/result/approval/validation nested objects, enums, required fields, and unions.
6. **Typed public surface:** exported closed `RoleRequestV1`, `RoleResultV1`, `ApprovalRequestV1`, `ApprovalDecisionV1`, `ValidationContractV1`, nested supporting types, `ContractIssueCode`, and typed `ParseResult<T>` parser signatures are present. Because Bun transpilation erases types and no compiler is pinned, lock this declaration contract with a narrow source-level assertion rather than installing tooling.

## Deferred ownership

- Secret **content** redaction stays RED-01.
- Filesystem realpath/symlink authorization stays ISO-01/SEC-00.
- Approval authority/non-forgeability stays APR-01.
- Raw JSON duplicate-key detection stays with future I/O adapters.
- Glob interpretation beyond a single validation-contract trailing `/**` is not introduced.

## ValidationContractV1

- **Focused command:** `cd /Users/leonardoribeiro/worktrees/dotfiles-con01-review-tests/agents-shared/.agents/adapters/pi/personal && bun test lib/contracts`
- **Primary expected test ID:** `CON-01 review P1 > separates concrete references from validation-only trailing globs`
- **Expected failure signature:** `review regression accepted unsafe glob, permissive timestamp, unbounded object, or drifted descriptor/type contract`
- **Match mode:** `signature`
- **Forbidden production paths before red SHA:** every non-test file under `lib/contracts/**` and all paths outside the owned tests
- **Covering green:** exact focused command, broader `bun test lib`, root `bash scripts/test-root.sh`
- **Sensitivity:** disable concrete-glob denial, timestamp strictness, maxObjectKeys, descriptor closure, or a typed parser return; each must fail its named regression and pass after restore
- **Invalid colors:** module/setup/syntax failure, timeout, exit 126/127, unrelated test failure

## Test quality

Use positive controls, deterministic dates, bounded fixture sizes, and public behavior. No network/live fleet/Herdr/persistence/package installation. Commit tests only and report exact causal-red IDs/signature.

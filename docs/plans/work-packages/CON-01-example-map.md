# CON-01 Example Map — Versioned Contracts and Schema Enforcement

**Focus:** machine-checkable V1 envelopes for role requests, role results, approval messages, artifact references, and validation contracts.

**Trust boundary:** all input values are untrusted. CON-01 owns closed structural validation, bounded canonical serialization, safe repository-relative references, deterministic rendering, and explicit legacy labeling. It does not classify BDD failures, redact secret content, grant approval authority, acquire writer leases, persist trajectories, spawn agents, or write handoff files.

## Rules

### R1 — Every authoritative contract is a closed, exact V1 envelope

Each supported value has `schemaVersion: 1`, one known literal `kind`, required fields with exact types, and no unknown fields. Parsers return bounded stable issues instead of coercing, dropping, or accepting malformed input.

- **E1:** Minimal valid fixtures for every V1 kind validate and retain their authoritative fields.
- **E2:** Missing required fields, wrong primitive types, `null`, and array/object substitutions fail with stable issue codes and paths.
- **E3:** Unknown root or nested fields fail rather than being stripped or smuggled through.
- **E4:** `schemaVersion` values `"1"`, `1.0` from a non-JSON object, `0`, `2`, booleans, missing versions, and unknown kinds fail; V1 never silently upgrades or downgrades.

### R2 — Validators accept JSON data, not executable object behavior

The unknown-value API rejects unsafe object graphs before field validation: cycles, accessors, non-plain prototypes, functions, symbols, bigint, non-finite numbers, sparse arrays, and dangerous own keys such as `__proto__`, `prototype`, or `constructor`.

- **E5:** Prototype-pollution-shaped inputs fail without changing `Object.prototype`.
- **E6:** Accessor properties are rejected without invoking getters; functions, symbols, bigint, and non-finite numbers fail.
- **E7:** Cyclic graphs, sparse arrays, custom class instances, and excessive nesting fail as validation results rather than crashes or success.

### R3 — Input, output, strings, arrays, and issue lists are bounded

V1 publishes deterministic limits for serialized bytes, nesting depth, strings, paths, commands, arrays, map keys, rendered Markdown, and returned issues. Exceeding a bound fails closed; exact-bound positive controls pass.

- **E8:** Multi-megabyte text, overlong commands/paths, oversized arrays/maps, excess depth, and excessive issue production fail with `bound_exceeded`.
- **E9:** Minimal fixtures and exact-bound controls validate without truncation or silent data loss.

### R4 — Artifact and owned-path references are safe and repository-relative

Authoritative artifact/path references use normalized NFC, `/`-separated repository-relative paths. Empty paths, `.`, `..`, traversal segments, absolute POSIX/Windows paths, home expansion, URI forms, NUL/control characters, backslash ambiguity, repeated empty segments, and structurally secret-bearing basenames are rejected. Filesystem realpath and symlink authority remain SEC-00/ISO-01 responsibilities.

- **E10:** `docs/plans/work-packages/CON-01.feature` and `agents-shared/.agents/adapters/pi/personal/lib/contracts/index.ts` pass.
- **E11:** `../x`, `a/../../x`, `/tmp/x`, `C:\\x`, `~/x`, `file:///tmp/x`, `https://x`, `a\\b`, NUL/control input, and duplicate/empty segments fail.
- **E12:** Absolute credential references and secret-shaped artifact basenames such as `.env`, `.npmrc`, `auth.json`, private-key files, or credential stores fail structural path policy; RED-01 still owns secret-content detection and redaction.

### R5 — RoleRequestV1 is bounded and spawn-ready without granting runtime authority

A valid role request identifies task, assurance role, BDD phase, goal, write scope, owned paths, forbidden paths, tools, model/thinking, budget bounds, and artifact references. The role/write-scope matrix mirrors the existing assurance-cycle contract. Pane IDs, writer tokens, approvals, and lease grants are not embedded authority.

- **E13:** Valid requests for specifier, test-designer, implementer, breaker, fitness-guardian, refactorer, and QA round-trip with the expected write scope.
- **E14:** Unknown roles, invalid phases, empty goals/task IDs, overlapping owned/forbidden paths, noncanonical tool names, or a role/write-scope mismatch fail before spawn.

### R6 — RoleResultV1 reports handoff truth without upgrading uncertainty

A valid role result records task/role/status, head SHA and dirty state when known, changed paths, bounded command claims, evidence/artifact references, blockers, residual risks, usage when reported, and an optional projection of BDD-01 red-cause fields. `blocked`, `failed`, and `unknown` never become `completed` through parsing, rendering, or legacy adaptation.

- **E15:** A completed clean result with a valid 40- or 64-hex SHA, bounded command evidence, and no blockers validates.
- **E16:** Blocked, failed, unknown, dirty, and missing-usage results retain those states exactly; missing usage is `unknown`, never zero.
- **E17:** Malformed SHA, unsafe changed/artifact paths, unbounded transcript fields, completed-with-blockers, or contradictory status fields fail.

### R7 — Approval envelopes are structurally bound but do not claim authority

ApprovalRequestV1 and ApprovalDecisionV1 carry bounded request ID, action/risk, scoped paths, candidate SHA/fingerprint, timestamps, decision, and claimed human provenance. Structural helpers check exact request/decision binding and expiry. APR-01 later establishes machine-local authority and non-forgeability; model-emitted fields alone never constitute approval.

- **E18:** A structurally valid request and matching human-provenance decision validate as data.
- **E19:** An `approved` decision missing the required human-provenance fields fails structurally and is never rendered as authoritative approval.
- **E20:** Request ID, path, SHA, fingerprint, action/risk drift, malformed timestamps, or expiry causes the pair check to fail closed.

### R8 — ValidationContractV1 freezes the causal oracle and sensitivity obligation

A validation contract requires package ID, exact focused command, expected test ID, optional failure signature with compatible `identity`/`signature` match mode, covering green relation, forbidden production paths before red SHA, and a required sensitivity description/commands. `legacy` match mode is forbidden. Gate execution remains BDD-01/FIT-01 ownership.

- **E21:** A valid CON-01 contract maps exactly to BDD-01 `ExpectedRedContract` fields without reclassifying failures.
- **E22:** Missing command/test ID/sensitivity, `signature` mode without a signature, `legacy`, unsafe forbidden paths, or contradictory green relation fails.
- **E23:** The BDD bridge preserves `expectedTestId`, `expectedFailureSignature`, and match mode byte-for-byte and adds no trust claim.

### R9 — Canonical JSON is deterministic and round-trippable

Validated contracts serialize with deterministic object-key order, preserved array order, normalized number representation, no `undefined`, and no output outside published bounds. Canonical bytes parse back to a semantically equal V1 value.

- **E24:** Parse → canonicalize → parse is idempotent and produces identical canonical bytes.
- **E25:** Equivalent valid objects with different insertion order produce identical canonical bytes.
- **E26:** Invalid or untrusted values cannot reach the authoritative canonical serializer.

### R10 — Markdown is derived, bounded, and non-authoritative

Markdown renderers accept only validated V1 values, escape/control headings and code fences deterministically, omit raw transcript fields, and stay within output bounds. Rendered Markdown never becomes the source of truth.

- **E27:** Valid values containing Markdown metacharacters render deterministically without creating forged authoritative headings or fences.
- **E28:** Invalid values and unvalidated casts are refused; renderer output cannot upgrade status, trust, or approval.

### R11 — Legacy handoffs remain explicit and assurance-ineligible

A bounded legacy Markdown adapter may preserve migration display data, but it always emits `kind: "legacy-markdown-handoff"`, `trustTier: "legacy"`, and `assuranceEligible: false`. It never produces an authoritative RoleResultV1 or approval by inference.

- **E29:** Bounded legacy Markdown is displayable only through the explicit adapter; oversized input or attempts to promote it to completed/approved assurance fail.

### R12 — CON-01 remains additive and within ownership

`lib/contracts/**` is a pure TypeScript/JSON-Schema-compatible library with no new runtime dependency or package pin. It exports schemas/descriptors, validators, canonical serialization, renderers, path/bounds helpers, and the BDD field bridge. RED-01 owns redaction; APR-01 authority; ISO-01 leases/realpaths; OBS-01 persistence; ROLE-01 prompts; ORC-01 spawn/write adapters.

- **E30:** The focused suite proves no contract module imports security redaction, extension/runtime spawn, worktree lease, or trajectory sink code; removing an unknown-field/version/path/oracle guard causes a focused test to fail.

## Questions and decisions

1. **Q1 — TypeBox dependency now?** No. V1 exports JSON-Schema-compatible closed descriptors plus pure TypeScript validators because the private package has no resolvable schema runtime and package-pin ownership belongs CMP-01/PKG-01. A later TypeBox adapter may derive from the same frozen V1 shapes without changing semantics.
2. **Q2 — Unknown fields?** Reject at every authoritative closed object. Do not silently strip them.
3. **Q3 — ResourceLeaseV1 or TrajectoryEventV1 now?** No. Export shared structural helpers only; ISO-01 and OBS-01 own their full contracts.
4. **Q4 — Absolute worktree paths?** Not as artifact refs. Runtime adapters may validate a separate contextual worktree path later; V1 authoritative references remain repository-relative.
5. **Q5 — Full argv gate executors in ValidationContractV1?** No. It stores the focused command/oracle relation and bridges to BDD-01; trusted executor configuration stays BDD-01/FIT-01.
6. **Q6 — Secret redaction in validators?** No. Structural path denial prevents obvious credential references, but RED-01 is the sole content-redaction authority.
7. **Q7 — Can legacy Markdown auto-promote when complete-looking?** No. An authoritative structured twin is required.
8. **Q8 — Should CON-01 import BDD runtime logic?** Only type-level semantics or a pure field bridge; it must not duplicate `validateRedResult`, trust policy, or gate execution.
9. **Q9 — File I/O or `.pi/handoffs` persistence?** No. CON-01 is pure; ORC-01/OBS-01 add sinks only after RED-01.
10. **Q10 — Raw JSON duplicate-key detection?** Canonical serializers never emit duplicates. The authoritative unknown-value validator cannot observe duplicates already lost by `JSON.parse`; any future raw-text adapter must reject duplicate keys before parsing and is tested with its owning I/O package.

## ValidationContractV1 for CON-01

- **Focused red/green command:** `cd /Users/leonardoribeiro/worktrees/dotfiles-pi-herdr-high-assurance/agents-shared/.agents/adapters/pi/personal && bun test lib/contracts`
- **Primary expected red test ID:** `CON-01 P0 > rejects unsupported versions and unsafe artifact paths`
- **Expected red signature:** `invalid version/path/red-cause fixture validates or valid V1 fixture fails`
- **Match mode:** `signature`
- **Forbidden production paths before red SHA:** `agents-shared/.agents/adapters/pi/personal/lib/contracts/**`, `agents-shared/.agents/adapters/pi/personal/lib/bdd/**`, `agents-shared/.agents/adapters/pi/personal/lib/security/**`, `agents-shared/.agents/adapters/pi/personal/extensions/**`, package manifests/locks
- **Covering green:** exact focused command; broader `cd .../personal && bun test lib`; root `bash scripts/test-root.sh`
- **Sensitivity required:** disable exact version rejection, safe-path rejection, unknown-field rejection, required causal test ID/signature binding, or validated-only rendering; each mutation must fail its named focused oracle and pass after restore.
- **Harness rule:** a missing production module must be converted by the Test Designer into the named behavioral assertion. Bare module-not-found, setup/import failure, timeout, 126, or 127 is neither red nor green.
- **No-live rule:** fixtures only; no network, fleet, Herdr spawn, persistence, or external package installation.

# BDD-01 Example Map — Machine-Checkable Red Cause and Trusted Gate Execution

## Observed baseline

- `validateRedResult` rejects timeout, spawn, 126/127, and exit zero, but accepts every other non-zero result without matching the intended test/assertion.
- `bdd_assert_red` has no expected test id/signature parameters and records non-zero evidence as if equally causal.
- `runCommand` always uses a shell and inherits `process.env` by default.
- Assurance gate commands are strings; plans/results do not identify executor kind or trust tier.
- `runQualityGatePlan` executes required shell strings even when a future strict/overnight trust profile should reject them.
- Plan fingerprints cover the current plan, but no explicit BDD config fingerprint binds red/green/assurance evidence.
- Handoff assurance checks do not require causal red, trusted required gates, current config fingerprint, or assertion-bound mutation evidence.
- Existing timeout/infra/green-coverage behavior is valuable and must remain compatible.

## Rules

### R1 — Assurance red must identify the expected failing behavior

An expected-red contract supplies `expectedTestId` and optional `expectedFailureSignature`. Identity mode requires the expected id in failed-test hints or bounded output. Signature mode additionally requires the signature. Only an expected assertion is assurance-causal.

### R2 — Invalid-red classification is deterministic and fail-closed

Classifier precedence is timeout/124, spawn error, 126/127, exit zero, setup/import failure, then expected identity/signature matching. Missing identity, unrelated assertion, signature mismatch, setup/import, timeout, spawn, infrastructure, pass, and unknown failure have distinct reason codes.

### R3 — Legacy interactive red remains visible but non-assurance

A non-zero test-like result without an expected-red contract may still be recorded in interactive legacy mode for backwards compatibility, but evidence is labeled `interactive_untrusted`, `legacy`, and `assuranceEligible: false`. Assurance-enabled, strict, and overnight workflows require a contract.

### R4 — `bdd_assert_red` and mutation wiring preserve the contract

The tool accepts match mode, expected test id, and optional signature, records the classifier result and config fingerprint, and refuses green/assurance progression from non-causal evidence. Command-backed mutation reuses the expected-red contract for its fail leg and records the matched cause.

### R5 — Trusted gate commands use validated argv without a shell

An argv command has version, executable file, string args, optional relative cwd, timeout, and output bound. It runs with `shell:false`; rejects NUL/metacharacter executable names and cwd escape; bounds output/time; and strips secret-like environment keys while allowing the minimum deterministic runtime environment.

### R6 — Shell commands are explicitly untrusted

String/shell command specs remain parseable in interactive mode and are labeled `interactive_untrusted`. Strict and overnight profiles reject them before spawn. They cannot satisfy a required assurance gate. No rejection is represented as exit-zero success.

### R7 — Gate plans support command and internal executors

The canonical gate model distinguishes shell, argv, and internal specs; results expose command/internal executor kind, trust tier, and policy rejection. Unknown internal ids fail closed until FIT-01 supplies adapters. The full executor spec participates in plan fingerprints.

### R8 — Config fingerprints invalidate stale evidence

A deterministic fingerprint covers version, green-coverage policy, commands, assurance trust/profile/kinds/executors/thresholds/timeouts. Red, green, and assurance evidence bind the current fingerprint. Command/policy changes create an explicit handoff gap.

### R9 — Assurance handoff requires causal, trusted, sensitive evidence

When assurance is enabled, handoff requires an assurance-causal expected assertion, a covering green, command-backed mutation whose fail leg matched the same expected behavior, acceptance coverage, current config/plan fingerprints, trusted required gates, and assurance completed after green. Note-only mutation cannot satisfy this.

### R10 — Wave 0 ownership is bounded

BDD-01 owns red/trust fields and pure runners/config/gate model plus minimal `bdd-mode` wiring. It does not implement CON-01 schema packages, SEC-01 sandbox/egress, FIT-01 internal adapters, approval stores, trajectory, or fleet containment. FIT-01 becomes the sole later integrator of canonical gate entrypoints.

## Examples

| ID | Given | When | Then |
|---|---|---|---|
| E1 | non-zero output contains expected test id | identity classifier runs | expected assertion is causal and assurance-eligible |
| E2 | another test fails and expected id is absent | classifier runs | missing/unrelated identity is rejected |
| E3 | expected id appears but required signature does not | signature classifier runs | signature mismatch is rejected |
| E4 | expected id and signature both appear | signature classifier runs | expected assertion is accepted |
| E5 | `Cannot find module`/import/setup failure | classifier runs | setup/import is rejected even with non-zero exit |
| E6 | timeout or exit 124 | classifier runs | timeout is rejected |
| E7 | spawn error | classifier runs | spawn is rejected |
| E8 | exit 126 or 127 | classifier runs | infrastructure is rejected |
| E9 | exit zero | classifier runs | pass is rejected as red |
| E10 | non-zero test-like failure and no contract in interactive mode | classifier runs | legacy evidence may record but is non-assurance |
| E11 | assurance enabled and no expected test id | `bdd_assert_red` runs | contract-required rejection occurs |
| E12 | causal contract supplied | `bdd_assert_red` records | evidence includes contract, cause, match mode, eligibility, trust tier, and config fingerprint |
| E13 | only legacy red exists under assurance | green transition is requested | progression is blocked |
| E14 | argv executable and args are valid | command runs | spawn receives file/args with `shell:false` |
| E15 | parent env contains API keys/tokens/passwords | argv command runs | secret-like keys are absent from child env |
| E16 | PATH/HOME/LANG/TMPDIR/CI are present | argv command runs | allowed deterministic keys survive |
| E17 | argv executable contains NUL/shell metacharacters | runner validates | policy rejection occurs without spawn |
| E18 | argv cwd escapes project root | runner validates | cwd escape is rejected without spawn |
| E19 | output exceeds configured maximum | argv command runs | retained output is bounded and marked/truncated deterministically |
| E20 | shell spec in interactive profile | gate runs | it is visible as interactive-untrusted and cannot satisfy required assurance |
| E21 | shell spec in strict or overnight profile | gate runs | policy rejects before spawn |
| E22 | argv gate in strict profile | gate runs | trusted argv result can pass |
| E23 | unknown internal check id | required gate runs | gate fails/unavailable, never passes |
| E24 | otherwise-equal shell and argv plans | fingerprints are built | plan fingerprints differ |
| E25 | identical config twice | fingerprint is computed | values are identical |
| E26 | gate command, trust profile, threshold, or timeout changes | fingerprint is computed | fingerprint changes |
| E27 | assurance evidence uses old config fingerprint | handoff runs | stale-config gap is reported |
| E28 | required gate result is untrusted | handoff runs | assurance remains incomplete |
| E29 | causal red and covering green but note-only mutation | handoff runs | command-backed sensitivity gap is reported |
| E30 | fail-step mutation matches unrelated assertion | mutation tool runs | mutation evidence is rejected |
| E31 | fail-step matches same expected id/signature and pass-step is green | mutation tool runs | assertion sensitivity is recorded |
| E32 | existing broader green command covers focused red | green coverage runs | compatibility remains green |
| E33 | legacy project command strings | config parses in interactive mode | migration is visible and non-assurance, not silently dropped |
| E34 | config supplies argv/internal command object | config parses | canonical command spec round-trips |
| E35 | malformed command object or unknown strict gate kind | config parses | integrity error is explicit, not silently ignored |
| E36 | future FIT/SEC fields are absent | BDD-01 runs | internal/security capabilities remain unavailable rather than fabricated |

## Questions and resolutions

1. **Default output cap?** Preserve the current 200,000-byte total bound; expose a smaller per-command override with a hard maximum.
2. **Default trust profile?** `interactive`. `strict` and `overnight` are explicit; assurance-enabled interactive shell evidence remains untrusted and cannot complete required assurance.
3. **Default red match mode under assurance?** `signature` when a signature is supplied, otherwise `identity`; legacy only when assurance/strict/overnight is not active.
4. **Can a multi-failure run be causal?** Yes when the expected id (and signature if required) appears; other failures remain visible in output.
5. **How are executable names resolved?** Node/OS PATH lookup with `shell:false`; no command concatenation or `cmd.exe` fallback.
6. **Should BDD-01 build the future contracts package?** No. It freezes field semantics in current BDD types; CON-01 may wrap/version them later without weakening behavior.
7. **Should interactive shell commands inherit secrets?** Existing direct interactive `runCommand` remains legacy-compatible; trusted argv gates use scrubbed env. Strict/overnight shell commands never run.
8. **Can a policy rejection use exit 126?** Result may expose 126 for compatibility, but must also set `policyRejected` and can never validate as red/green/pass.

## ValidationContractV1

- **Focused red/green command:** `cd /Users/leonardoribeiro/worktrees/dotfiles-pi-herdr-high-assurance/agents-shared/.agents/adapters/pi/personal && bun test lib/bdd/run-command.test.ts lib/bdd/quality-gates.test.ts`
- **Expected red test id:** `rejects an unrelated failing assertion when the expected test id is absent`
- **Expected red signature:** current validator returns `ok: true` for a non-zero unrelated assertion
- **Broader green:** `bun test lib/bdd` followed by root `scripts/test-root.sh`
- **Forbidden production paths before red SHA:** `lib/bdd/{run-command,config,types,quality-gates,phases}.ts`, `extensions/bdd-mode.ts`
- **Covering green:** exact focused command passes and includes the causal-red classifier plus trusted-gate runner tests
- **Sensitivity:** deliberately make identity matching accept any non-zero failure, then make strict gates execute shell specs; each mutation must fail its focused oracle and each restore must pass

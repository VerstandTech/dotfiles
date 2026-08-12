# SEC-UX-01 Example Map — Precise tool-result redaction

## Story

As a Pi operator using guarded local tools,
I want safe tool output to remain visible when optional result metadata is absent or independently unsafe,
so security remains fail-closed for secrets without turning ordinary reads, tests, BDD gates, and status checks into opaque `redaction-refused` failures.

## Personas

- **Leo — local operator:** needs readable outputs from safe commands and deterministic recovery guidance.
- **Nikhil — security reviewer:** requires that no raw secret or hostile object bytes cross the result boundary.
- **André — extension maintainer:** needs a closed, deterministic adapter contract with stable codes and no tool-specific bypass list.
- **Sofia — product engineer:** needs failed tests and BDD diagnostics to remain actionable without disabling security.

## Rules and examples

### R1 — Optional absent channels are omitted before RED-01

- E1: `content` exists and `details` is absent → redact content and return it.
- E2: `details` exists and `content` is absent → redact details and return stable empty content.
- E3: both are absent → return stable safe empty content/details, not refusal.
- E4: own property with value `undefined` is treated as absent, not serialized.
- E5: inherited optional fields are not authority and are ignored/refused by the closed adapter.
- E6: getters are never invoked to discover optional fields.

### R2 — Present channels are redacted independently

- E7: safe content + safe details → both survive redacted and detached.
- E8: safe content + cyclic details → safe content survives; details become a closed refusal marker.
- E9: safe content + binary details → safe content survives; details become a closed refusal marker.
- E10: safe content + accessor details → safe content survives; details become a closed refusal marker.
- E11: unsafe content + safe details → content is replaced by a stable refusal message; safe details may remain.
- E12: both channels unsafe → one stable non-echoing refusal result.

### R3 — Content safety is never weakened

- E13: authorization header in text is redacted.
- E14: private key text is redacted.
- E15: URI userinfo is redacted.
- E16: high-entropy unknown token is redacted according to RED-01.
- E17: safe file paths and typed hashes remain readable.
- E18: redaction refusal never falls back to raw content.

### R4 — Metadata fallback is closed and non-authoritative

- E19: dropped details carry `{securityPolicy: {ok:false, code:"details-redaction-refused"}}` only.
- E20: fallback never includes original object keys, values, previews, stack traces, or provider messages.
- E21: metadata fallback cannot change `isError`.
- E22: metadata fallback cannot manufacture tool success or approval.
- E23: safe returned details always include closed security-policy provenance.
- E24: fallback shape is deeply frozen and detached.

### R5 — Content refusal remains visible and actionable

- E25: cyclic content returns `security-policy: content-redaction-refused`.
- E26: binary content returns the same stable content refusal.
- E27: accessor content returns the same stable content refusal without invocation.
- E28: oversized content returns the same stable refusal.
- E29: tool error state remains true when original `isError` is true.
- E30: successful tool with unredactable content becomes `isError:true` because content is unavailable.

### R6 — Ordinary safe tool families require no allowlist

- E31: `read` text with absent details remains visible.
- E32: `bash` text with absent details remains visible.
- E33: `bdd_status` text with absent details remains visible.
- E34: `bdd_run_quality_gates` text with absent details remains visible.
- E35: `ctx_execute` structured safe content with absent details remains visible.
- E36: an unknown future safe tool behaves identically.

### R7 — Tool identity remains bounded and closed

- E37: valid bounded tool names retain provenance.
- E38: malformed tool name refuses before channel processing.
- E39: tool names are never used to bypass RED-01.
- E40: a name resembling a trusted tool gets no extra privilege.
- E41: absent tool name yields stable refusal.
- E42: hostile tool-name getter is never echoed.

### R8 — The adapter reads each channel safely

- E43: a plain own data property is accepted.
- E44: an own getter causes only that channel to refuse without invocation.
- E45: a proxy trap failure becomes stable channel refusal.
- E46: a prototype-pollution key never reaches output.
- E47: an array subclass is refused by RED-01.
- E48: channel extraction is bounded and has no recursive pre-walk.

### R9 — Budgets remain independent and bounded

- E49: content at exact RED-01 limits passes.
- E50: content over a limit refuses content.
- E51: details over a limit are dropped without hiding safe content.
- E52: independently redacting channels cannot exceed a documented total adapter budget.
- E53: output canonical bytes remain bounded.
- E54: no retry, truncation loop, timer, or adaptive relaxation occurs.

### R10 — Safe output shape remains compatible with Pi

- E55: returned `content` is a text-content array.
- E56: already structured text-content arrays remain readable after redaction.
- E57: string content is represented deterministically.
- E58: non-text content types are not silently converted to raw JSON previews.
- E59: `details` remains JSON-safe.
- E60: no double-wrapped `{"content":...}` text is produced.

### R11 — Failure codes distinguish channels without exposing causes

- E61: top-level invalid envelope → `redaction-refused`.
- E62: content refusal → `content-redaction-refused`.
- E63: details refusal → `details-redaction-refused`.
- E64: both refusals → top-level `redaction-refused` with no channel bytes.
- E65: codes are stable across cycle, accessor, binary, and size causes.
- E66: provider/OS/arbitrary exception messages never appear.

### R12 — Existing strict security behavior remains unchanged

- E67: strict initialization failure still blocks protected tool calls.
- E68: secret aliases still block at tool-call policy.
- E69: command and egress denials remain fail-closed.
- E70: missing required security gates remain non-passing.
- E71: capability generation/disposal semantics are unchanged.
- E72: no sandbox fallback or dependency installation is introduced.

### R13 — RED-01 remains the sole byte-redaction authority

- E73: adapter does not implement token regexes.
- E74: adapter does not inspect credential values itself.
- E75: every present persisted/forwarded channel passes through `redactForPersistence` via the security preparation API.
- E76: channel fallback contains only compile-time constants and bounded tool identity.
- E77: safe content cannot bypass redaction because details failed.
- E78: safe details cannot make refused content successful.

### R14 — Result handling has no ambient authority

- E79: no environment reads.
- E80: no filesystem reads or writes.
- E81: no network/process/socket access.
- E82: no clock or random source.
- E83: no model decision or project file can mark content safe.
- E84: operation is pure for equal input.

### R15 — Regression evidence is causal and mutation-sensitive

- E85: pre-fix safe content plus absent details fails with `redaction-refused`.
- E86: green returns readable safe content.
- E87: deleting absent-field omission kills the named test.
- E88: reverting to whole-envelope redaction kills the safe-content/hostile-details test.
- E89: raw fallback mutation leaks a synthetic secret and is killed.
- E90: tool-name allowlist mutation is killed by unknown-safe-tool coverage.

### R16 — Operator guidance remains honest

- E91: genuine content refusal clearly says content was refused.
- E92: details-only refusal does not claim the tool failed.
- E93: genuine tool failure stays a tool failure with safe diagnostics when available.
- E94: safe output never carries a false `redaction-refused` banner.
- E95: no remediation suggests disabling RED-01.
- E96: unavailable diagnostics remain explicitly unavailable.

### R17 — Compatibility is additive and versioned

- E97: exported V1 policy functions keep their existing names.
- E98: existing callers with both channels continue to work.
- E99: absent-channel semantics are documented as adapter normalization.
- E100: refusal marker fields are closed and bounded.
- E101: no second redaction FSM is introduced.
- E102: no new dependency is added.

### R18 — Acceptance closes reported false-positive classes

- E103: safe `read` no longer disappears.
- E104: safe shell status no longer disappears.
- E105: BDD status/handoff diagnostics no longer disappear merely because details are absent.
- E106: large but bounded test summaries remain visible.
- E107: cyclic auxiliary metadata cannot hide safe primary diagnostics.
- E108: real synthetic secrets remain absent from every returned channel.

## Resolved questions

- Q1: Should RED-01 accept `undefined` globally? **No.** Persistence JSON remains strict; the adapter omits absent optional channels.
- Q2: Should tools be allowlisted? **No.** Semantics are channel-based and tool-neutral.
- Q3: Can unsafe details hide safe content? **No.** Details degrade to a closed marker.
- Q4: Can unsafe content be returned because details are safe? **No.** Content refusal makes the returned result an error.
- Q5: Can raw details be previewed? **No.** No raw fallback or key preview.
- Q6: Does details refusal change the tool's original error state? **No.** It is observational metadata loss only.
- Q7: Does content refusal change success to error? **Yes.** A result without trustworthy primary content cannot claim successful delivery.
- Q8: Are cycles/accessors made serializable? **No.** They remain refusals.
- Q9: Does this alter tool-call authorization? **No.** Only post-result adaptation is in scope.
- Q10: Is per-channel redaction a second authority? **No.** Each channel still uses RED-01; the adapter only handles optionality and composition.
- Q11: What about both channels absent? **Return a stable empty safe result** with provenance.
- Q12: What if a property exists with `undefined`? **Treat as absent** at this optional envelope boundary.
- Q13: Are inherited properties read? **No.** Only safe own data properties.
- Q14: Are getter exceptions exposed? **No.** Stable refusal only; getter is not invoked.
- Q15: Are safe details preserved when content refuses? **They may be retained**, but the result is an error and cannot manufacture success.
- Q16: Can metadata fallback include detailed refusal reasons? **No.** One stable channel code avoids structural leakage.
- Q17: Must existing extension tests remain green? **Yes.** Strict policy and lifecycle tests are regressions.
- Q18: Are output-size budgets doubled by independent channels? **No.** Add/retain a bounded aggregate composition check.
- Q19: Should harmless unsupported UI objects be stringified? **No.** Only established Pi result shapes are supported.
- Q20: Can a project configure bypasses? **No.** No project-file exception authority.
- Q21: Can interactive mode skip result redaction? **No.** Result redaction applies in every profile.
- Q22: Does a details marker become persistence authority? **No.** It is closed observational provenance.
- Q23: What is the causal failure identifier? **`SECUX01_ABSENT_DETAILS_FALSE_REFUSAL`.**
- Q24: What mutation is mandatory? **Restore whole-envelope redaction or raw fallback; named acceptance must fail.**

## Out of scope

- Weakening RED-01 token, credential, path, entropy, depth, or byte rules.
- Changing tool-call command, path, egress, sandbox, or security-slot policy.
- Adding tool-name trust allowlists.
- Adding dependencies, persistence, telemetry, retries, timers, or ambient host reads.
- Editing generated Rulesync outputs.

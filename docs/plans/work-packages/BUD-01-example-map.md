# BUD-01 Example Map — usage accounting and spawn circuit breakers

## Story

**As Leo, Maya, Nikhil, Sofia, and André,**
**we need task-attributed usage, warning thresholds, and hard circuit breaks that treat missing usage as `unknown` rather than pass,**
**so strict/overnight spawns cannot proceed on silent zeros, budgets cannot auto-increase, and FIT-01 can consume a typed budget result.**

## Persona role-play

### A — Leo: inspectable autonomy

1. Leo sees per-task and per-agent usage dimensions (tokens, cost, duration, iterations) with explicit limits.
2. Crossing a hard limit breaks the circuit and blocks new spawns.
3. Soft warn thresholds surface before hard break without stopping interactive work unless policy says so.
4. Missing provider usage is `unknown`, never coerced to zero/`ok`.
5. Budget events are recordable by OBS-01; BUD does not persist files itself.

### B — Maya: concise evidence

1. Maya gets stable codes: `ok`, `warn`, `exceeded`, `unknown`, `spawn-blocked`, `confirmation-required`.
2. Handoff shows circuitBroken and which dimension failed.
3. Count preflight above policy requires human confirmation reference — model boolean is not enough.
4. No automatic budget increase API exists.
5. FIT-01 later maps budget results; BUD does not edit quality-gate enums.

### C — Nikhil: abuse and spoofing

1. Caller-supplied negative usage is refused.
2. Non-finite cost/token values refuse.
3. Oversized attribution ids refuse.
4. Forged “usage ok” without dimensions cannot pass evaluate.
5. Strict/overnight hard-budget profiles fail closed on any `unknown` dimension that is limited.

### D — Sofia: recovery

1. Sofia can tell warn vs exceeded vs unknown.
2. Recovery is lower concurrency, wait for usage, or explicit human raise outside BUD (no self-service raise).
3. Interactive profile may continue on warn; exceeded still blocks new spawn when hard circuit enabled.
4. Clearing circuit requires fresh evaluation with current usage — no sticky silent reset without inputs.
5. Status footer text is bounded and non-secret.

### E — André: portable contracts

1. Pure `evaluateCostBudget` / spawn preflight helpers need no FS/network/clock.
2. V1 result shape is closed and additive.
3. `agentic-fleet.ts` integration is a **serialized later slice**; this package’s first merge is pure lib + tests + optional fleet budget helper module.
4. Existing call sites that assumed `used == null → ok` must update or fail tests.
5. CMP-02 plan transport remains owned by fleet plan; BUD only adds budget preflight seams.

## Rules and examples

## Rule 1 — BUD-01 owns accounting and circuit-break decisions only

BUD does not spawn agents, change BDD phase, grant approvals, or raise its own limits.

- **R1-E1:** `evaluateCostBudget` returns status only.
- **R1-E2:** `planSpawnBudgetGateV1` returns allow/deny; caller enforces.
- **R1-E3:** No API `increaseBudget` / `setMaxUnlimited`.
- **R1-E4:** No file persistence of ledgers in V1 pure core (ledger helper may accept injected sink later).
- **R1-E5:** No edit of SEC/FIT canonical gate enums.
- **R1-E6:** Trajectory emission is optional callback/result field for OBS, not a second store.
- **R1-E7:** First merge path excludes `extensions/agentic-fleet.ts` (deferred serialized integration).
- **R1-E8:** BUD does not call Herdr.

## Rule 2 — Missing usage is `unknown`, not `ok`

Any limited dimension with missing used value is `unknown`. Aggregate status cannot be `ok` if any dimension is `unknown` under hard-budget profiles; interactive may surface unknown without treating as pass for spawn.

- **R2-E1:** limit set, used undefined → dimension status `unknown`.
- **R2-E2:** All dimensions unknown with limits → result status `unknown`, `ok: false` for spawn gate.
- **R2-E3:** Mix of ok and unknown → overall not ok for hard spawn gate.
- **R2-E4:** No limits configured → neutral allow with status `ok` and empty dimensions (or explicit `no-policy`).
- **R2-E5:** used null and used undefined behave identically.
- **R2-E6:** Legacy summary text must not say “no usage recorded” as success without `unknown` status.
- **R2-E7:** `circuitBroken` is true only for `exceeded`, not merely `unknown` (unknown blocks via spawn gate separately).
- **R2-E8:** `ok` field meaning: hard-exceed free; spawn gate uses richer decision.

## Rule 3 — Hard exceed breaks circuit

- **R3-E1:** tokens used > max → exceeded, circuitBroken true.
- **R3-E2:** cost used > max → exceeded.
- **R3-E3:** duration used > max → exceeded.
- **R3-E4:** iterations used > max → exceeded.
- **R3-E5:** Any exceeded → overall status exceeded.
- **R3-E6:** Warn threshold does not set circuitBroken.
- **R3-E7:** Multiple exceeds all reported in dimensions.
- **R3-E8:** Exact equality used == limit is ok (not exceeded); warn if ≥ warnFraction.

## Rule 4 — Warn thresholds

- **R4-E1:** Default warnFraction 0.8.
- **R4-E2:** used in [fraction*limit, limit] → warn.
- **R4-E3:** Invalid warnFraction ≤0 or >1 → refuse policy.
- **R4-E4:** Overlay merge preserves base when overlay omits fields.
- **R4-E5:** Overnight default policy remains higher caps but still finite.

## Rule 5 — Spawn preflight and confirmation

- **R5-E1:** Proposed child count above policy max requires `confirmation-required`.
- **R5-E2:** Model-supplied `confirmed: true` without external approval ref is ignored in strict profiles.
- **R5-E3:** Human confirmation ref present + fingerprint match → allow count.
- **R5-E4:** circuitBroken → `spawn-blocked`.
- **R5-E5:** unknown usage under strict/overnight hard-budget → `spawn-blocked`.
- **R5-E6:** interactive may return `unknown-usage` advisory allow only when policy.profile is interactive and hardBudgetOnUnknown is false (default true for strict/overnight).
- **R5-E7:** Zero or negative spawn count → refuse.
- **R5-E8:** Oversized count → refuse bound.

## Rule 6 — Attribution

- **R6-E1:** Usage rows may include taskId and agentId bounded strings.
- **R6-E2:** Aggregate usage sums only finite numeric fields.
- **R6-E3:** Unknown agent id chars refused.
- **R6-E4:** Duplicate task rows last-write or explicit merge policy — V1 uses explicit `mergeUsageV1` sum without double-count flags unless tagged.
- **R6-E5:** Empty attribution allowed for session-total evaluate.

## Rule 7 — Closed hostile-safe inputs

- **R7-E1:** Non-finite numbers refuse.
- **R7-E2:** Negative usage refuses.
- **R7-E3:** Negative limits refuse.
- **R7-E4:** Unexpected fields → unknown-field.
- **R7-E5:** Accessor/symbol/cycle refuse.
- **R7-E6:** Success results frozen detached.

## Rule 8 — Profiles

- **R8-E1:** `interactive` default soft on unknown only if explicitly configured; package default keeps spawn fail-closed when hardBudgetOnUnknown true.
- **R8-E2:** `strict` hardBudgetOnUnknown true.
- **R8-E3:** `overnight` hardBudgetOnUnknown true.
- **R8-E4:** Unknown profile → refuse.
- **R8-E5:** Projects may tighten caps; cannot disable exceed circuit via empty string hacks.

## Rule 9 — Status formatting and footer

- **R9-E1:** formatCostBudgetResult includes status and circuitBroken.
- **R9-E2:** Unknown dimensions render distinct marker from ok.
- **R9-E3:** No raw secrets in format output.
- **R9-E4:** Bounded line length.

## Rule 10 — Fleet helper module (non-extension)

- **R10-E1:** `lib/fleet/budget.ts` (new) pure preflight used by tests.
- **R10-E2:** Does not import ambient process env for limits.
- **R10-E3:** Does not call RPC.
- **R10-E4:** agentic-fleet wiring deferred with explicit test skip/document until serial wave.
- **R10-E5:** run-ledger may record usage facts when injected; no network.

## Rule 11 — Mutation sensitivity

- **R11-E1:** Restoring `used == null → ok` fails causal tests.
- **R11-E2:** Allowing spawn on exceeded fails tests.
- **R11-E3:** Auto-increase helper must not exist (static absence test).

## Rule 12 — Compatibility

- **R12-E1:** `CostBudgetPolicy` fields remain.
- **R12-E2:** `BudgetStatus` gains `unknown` (breaking type change accepted in-repo).
- **R12-E3:** DEFAULT_* budgets remain finite.
- **R12-E4:** mergeCostBudgetPolicy semantics preserved.

## Questions (resolved)

| ID | Question | Resolution |
|----|----------|------------|
| Q1 | null usage status? | **`unknown`**, never ok |
| Q2 | Does unknown set circuitBroken? | **No**; spawn gate blocks separately |
| Q3 | First PR includes agentic-fleet? | **No** — deferred serialized |
| Q4 | Who raises budgets? | Human/out-of-band config only |
| Q5 | OBS dependency? | Emit typed fields; OBS records if present |
| Q6 | Parallel with ISO? | Yes; exclusive paths |
| Q7 | FIT dependency direction? | BUD before FIT |
| Q8 | Confirmation authority? | External approval ref; not model boolean |

## Out of scope

- Live provider billing APIs
- Automatic budget top-up
- FIT-01 handoff wiring (consumes results later)
- Full agentic-fleet.ts integration (Wave 3 serial)
- UI beyond pure format strings

## Counts

- **Rules:** 12
- **Examples:** 72
- **Questions resolved:** 8

## Traceability

- Plan package: BUD-01
- Deps: CMP-02, CON-01, OBS-01 (merged)
- Unlocks: FIT-01
- Parallel peer: ISO-01
- Deferred path: `extensions/agentic-fleet.ts`

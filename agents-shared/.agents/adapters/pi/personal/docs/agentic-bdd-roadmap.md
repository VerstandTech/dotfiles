# Agentic BDD + Fleet integration roadmap

Status: **P0.0–P0.6 + P1 + P1.5 shipped** (P1.5: 2026-07-26). Operator guide: [`bdd-fleet-cheatsheet.md`](./bdd-fleet-cheatsheet.md). Canonical policy: [`high-assurance-playbook.md`](./high-assurance-playbook.md). Honest Pi mapping: [`high-assurance-pi-implementation.md`](./high-assurance-pi-implementation.md). P2 (worktrees/cost UI/recipes) still deferred.
Scope: `~/dotfiles/agents-shared/.agents/adapters/pi/personal`
Principle: **BDD defines done and blocks lies; fleets multiply perspective at discovery/verify; one parent writer owns the tree and the handoff ledger.**

Critique fleet (2026-07-22): architecture, BDD purity, fleet ops, safety, oracle  
**Aggregate verdict: APPROVE_WITH_CHANGES** (no pure APPROVE; not a full REJECT of the direction)

---

## Locked decisions (open questions closed)

| # | Decision |
|---|----------|
| 1 | **Ban all fleets in `red`, `green`, `refactor`.** No scout special-case in v1. Unanswered design → back to discovery/formulation + research. |
| 2 | **Synthesis gate:** If a **review** fleet was auto-recorded this cycle, handoff **hard-fails** without synthesis bound to that `runId` + disposition fields. No fleet → handoff unchanged. Soft-only is not the default. |
| 3 | **`strictGreenCoversRed`:** default **ON** with a **real** pairing heuristic (exact / broader suite / contains focus path). Opt-out via `.pi/bdd.json`. Fix argv0-only `greenCoversRed` (today accepts `bun -e`). |
| 4 | **Mutation:** **No new auto-edit tool.** Command-backed two-step only if we ship mutation assert: fail command → restore → pass command. Else keep soft `bdd_record_evidence` and do not claim hard mutation. **v1 preference (oracle):** keep record-only; **BDD critic:** command-backed. **Resolution:** v1 = improve record + optional `bdd_assert_mutation` that **only runs commands** the parent supplies (parent does the break/restore edits). No automatic file mutation. |
| 5 | **Gate surface:** Hard-gate `fleet_dispatch` + `/fleet` run. Also block raw `subagent` when `tasks.length > 1` (or parallel chain group) while BDD phase is red/green/refactor. Single-agent `subagent` still allowed. Slash `/parallel` outside tools = documented hole. |
| 6 | **`/ship`:** Skill + prompts only — **not** a second extension state machine. |
| 7 | **Bypass split:** path/bash bypass ≠ fleet launch rights (separate flags/reasons). |
| 8 | **Artifact layout:** Prefer **additive** collect: keep flat member outputs working; introduce `runId` directory with `plan.json` + `synthesis.md` + optional member snapshots. Do not break existing path scheme in one shot. |
| 9 | **Enforcement placement:** Pure `assertFleetAllowed` in `lib/`. Primary block in **bdd-mode `tool_call`** (authoritative phase) + mirror in fleet_dispatch. **Do not merge extensions.** |
| 10 | **Default verify N=3**; update skill/prompts that still say 8–10. Caps stay high for opt-in heavy runs. |
| 11 | **Safety:** Do not auto-zero spawn budgets; cost warn N>5; no worktree multi-writer in P0. |

---

## Critique summary

### Architecture — APPROVE_WITH_CHANGES
- Need integration contract + runId before collect.
- Gate multi-child `subagent`, not only `fleet_*`.
- Fleet owns manifest; BDD owns handoff completeness.
- `/ship` skill-only; no extension merge.

### BDD purity — APPROVE_WITH_CHANGES
- Mutation note-only = theater if required for handoff.
- Fix `greenCoversRed`; default strict pairing.
- Synthesis must bind blockers/dispositions, not file existence alone.
- Ban fleets in red/green/refactor.
- Reorder: gates → pairing/mutation → collect → doctor.

### Fleet ops — APPROVE_WITH_CHANGES
- RPC returns `runId`/`asyncDir` — use them; don’t guess.
- Collect from pi-subagents lifecycle dirs; snapshot into `.pi/fleet-runs/<runId>/`.
- Partial failure semantics required.
- Auto-record fleet on dispatch into BDD session evidence.
- `fleet_plan` stays allowed (no launch).

### Safety — REJECT until (incorporated above)
- Shared gates on all owned spawn surfaces.
- Finite spawn budget (don’t clear limits).
- Cost preflight before large auto fleets.
- No auto mutation edits.
- OpenRouter only after native attempt (already mostly done).

### Oracle — APPROVE_WITH_CHANGES
- Stay additive; don’t redesign package.
- Drop thrashy nested layout / new mutation tool if record-only.
- Phase truth stays in bdd-mode session state.
- Align docs defaults with N=3.

---

## Example Map (P0 slice)

### Rules
- **R1:** While BDD phase ∈ {red, green, refactor}, fleet launch and multi-child subagent are blocked (unless fleet-specific bypass).
- **R2:** Successful review fleet dispatch records `{runId, asyncDir, kind, expectedCount}` on BDD evidence.
- **R3:** Handoff with a recorded review fleet requires synthesis for that runId + blocker dispositions.
- **R4:** Green must cover red under default-strict pairing (exact / broader / focus path).
- **R5:** `fleet_plan` never blocked by phase (read-only planning).
- **R6:** Doctor is read-only diagnostics.

### Examples
- **R1-E1:** phase=green, `fleet_dispatch review` → blocked with message to verify first.
- **R1-E2:** phase=verify, `fleet_dispatch review` → allowed.
- **R1-E3:** phase=red, `subagent({tasks:[...]})` with 2+ tasks → blocked.
- **R1-E4:** phase=red, `subagent({agent:scout})` single → allowed.
- **R2-E1:** dispatch success → evidence.fleetRuns includes runId.
- **R3-E1:** fleetRuns set, no synthesis → handoff incomplete.
- **R3-E2:** synthesis + deferred blockers with reasons → handoff ok (for fleet fields).
- **R4-E1:** red `bun test a.test.ts`, green `bun -e '1'` → rejected.
- **R4-E2:** red `bun test a.test.ts`, green `bun test a.test.ts` → accepted.
- **R4-E3:** red `bun test a.test.ts`, green `bun test` → accepted (broader).
- **R5-E1:** phase=green, `fleet_plan` → allowed.

### Questions (resolved above)
- All six open questions locked in the table.

---

## Revised implementation order

### P0.0 — Shared pure contracts (lib only)
- `assertFleetAllowed(phase, kind, opts)`
- `greenCoversRed` fix + tests
- Types: `FleetRunRecord`, handoff fleet gap helper
- TDD first

### P0.1 — Phase gates
- bdd-mode `tool_call` blocks `fleet_dispatch` + multi-task `subagent` when disallowed
- fleet_dispatch mirror check (read session bdd state if available)
- `/fleet` run path same gate
- `fleet_plan` always ok

### P0.2 — Dispatch ledger + run identity
- Parse RPC `runId`/`asyncDir`
- Append `fleetRuns[]` on BDD evidence (via custom entry or event)
- Write `plan.json` under `.pi/fleet-runs/<runId>/` (additive)

### P0.3 — Collect + synthesis + handoff
- `fleet_collect [runId]`
- Snapshot members + status
- `fleet_record_synthesis` / handoff checks R3
- Partial failure member states

### P0.4 — Strict green pairing (default on, opt-out)
- Config `strictGreenCoversRed` default true
- failedTestHints best-effort on red

### P0.5 — Optional command-backed mutation
- `bdd_assert_mutation` = run failCmd + run passCmd only (parent edits)
- Or skip if time-boxed; keep soft record

### P0.6 — `/agentic doctor`
- RPC ping, typebox, auth, caps, agents, bdd.json, extension paths
- Link `/subagents-doctor`

### P1 (after P0 green)
- Skill `/ship` recipe
- Project `.pi/fleet.json` overlay
- Default verify N=3 + doc alignment
- Ledger → PR markdown polish

### P1.5 — high-assurance deterministic layer (shipped 2026-07-26)
- Offline deterministic project profile for JS/TS, Rust, Go, Python, and Swift
- Stable project + quality-plan fingerprints
- Ordered required/advisory gate compiler and fail-closed sequential runner
- Current-after-green assurance evidence required by opt-in handoff policy
- Seven bounded fresh-context role agents + phase-checked single-role RPC delegation
- Existing synthesis path must resolve under the matching run directory; blocker disposition required in assurance mode
- Note-only mutation claims cannot satisfy command-backed assurance
- `/bdd playbook`, `/bdd profile`, `/bdd gates`, and five model tools
- Canonical v1.0 policy + separate enforced/configurable/roadmap implementation profile
- Example Map: [`high-assurance-example-map.md`](./high-assurance-example-map.md)

### P2 later
- Read-only command sandbox/container enforcement for verification agents
- Semantic-stability/variance dashboard and cross-session cassette replay
- Worktree writers, cost estimator UI, named recipes
- Close non-tool `/parallel` enforcement gap

---

## What we will NOT build in v1

- Merged bdd+fleet mega-extension  
- Auto-editing mutation  
- Multi-writer fleets  
- Hard dependency on lookmybio gherkin internals  
- Claiming gates on pi-subagents slash `/parallel` without hooks  
- Breaking flat output paths without migration  

---

## Human GO checklist

Before coding, confirm:

- [ ] Locked decisions table acceptable  
- [ ] P0.0→P0.6 order acceptable  
- [ ] Default strict green ON acceptable  
- [ ] Hard synthesis gate when review fleet used acceptable  
- [ ] Multi-task `subagent` block in red/green/refactor acceptable  

**Reply GO (or GO with edits) to start implementation under BDD/TDD for each step.**

---
name: ghee-sheets-formula-mutations
description: Add, edit, or remove cell formulas in ghee-sheets (gheeggle monorepo — packages/sheets-engine, packages/sheets-product, ghee-core sheets storage). Use when writing, reviewing, or debugging code that sets, changes, or clears formula cells through the engine facade, the server values.update/batchUpdate/recalculator path, or the frontend formula store + web worker; when handling recursive/circular references (#CYCLE!), nested formulas (functions inside functions, LAMBDA/LET, named functions, spills); or when reasoning about the optimistic client-first flow (worker engine, effectiveValue gating, Mode A checksum) vs the pessimistic server-authoritative flow (Mode B re-fetch, structural-op fence, warm-engine coherence, transactional recalc). Also covers performing live formula mutations via the REST/tRPC/MCP surfaces and the four-layer formula test matrix with verified commands.
---

# ghee-sheets-formula-mutations

There is exactly ONE formula engine — `SheetsEngine` (`packages/sheets-engine/src/facade.ts`) — embedded in three hosts that never talk to each other: the server recalculator, a browser web worker, and synchronous in-process (headless/export/tests). They converge only because they run identical code over data kept coherent by the per-sheet `revision` counter and the Mode A/B protocol. Every formula mutation must keep all three hosts convergent.

**Calibration:** all `file:line` anchors were verified at gheeggle HEAD on 2026-09-11. Treat them as strong hints, not truth — re-verify before acting; code at HEAD is the arbiter. For the full stage-by-stage pipeline (parse → AST → dependency graph → evaluator → persistence → reconciliation) read [references/data-flow.md](references/data-flow.md).

## Where a formula mutation enters

| Host | Entry point | Use for |
|---|---|---|
| Engine (pure) | `SheetsEngine.setCellContent(col, row, input)` — `facade.ts:149`; batch variants `:496-554`; worker op-list `applyCellOps` `:568-634` | Engine features, function changes, unit tests. **Coordinates are `(col, row)`**, matching ghee-sheets `CellCoord [col, row]` — reversed from the internal `{sheet, row, col}`. |
| Server | tRPC / REST `values:batchUpdate` / MCP all converge on one procedure (`app/api/trpc/routers/spreadsheets/values/batchUpdate.ts:96`) → `recalculateSpreadsheetFormulas` (`lib/formula/spreadsheet-formula-recalculator.ts:1821`) | API-driven mutations, persistence, exports. The recalculator is the ONLY server-side engine construction site. |
| Frontend | `FormulaSheetStore.setCellValue` (`lib/formula/formula-sheet-store.ts:505`) → `AsyncFormulaEngineDriver` → `engine.worker.ts` | Editor UX, optimistic display, reconciliation. |

Live data mutation (not code): send the formula via REST `values:batchUpdate` or the MCP bridge; the server parses, recalcs dependents, persists `effectiveValue`, and bumps the revision in one transaction. A `CONFLICT structural_op_pending` response means a large structural op is queued for that sheet — retry, it is not a failure.

## Invariants every formula mutation must preserve

1. **Dependencies are rewired statically and over-approximately.** `extractDependencies` collects every reference including both arms of an `IF` (`src/formula/dependencies/index.ts:55`). An edit that changes references MUST flow through the normal wiring (`wireFormulaEdges`, `runtime/mutations/cell-ops.ts:519`) — never patch a value in place.
2. **Recalc is dirty-set + topological + equality-short-circuited.** Dirty set = transitive dependents + ALL volatile cells (`NOW`/`TODAY`/`RAND` re-run every recalc). An unchanged result stops downstream propagation (`runtime/eval/evaluator.ts:299`).
3. **The revision counter is load-bearing.** Every persisted cell change bumps the per-sheet `revision` exactly once per transaction. The warm engine, caches, and Mode A all trust it. A writer that forgets the bump silently poisons the warm cache.
4. **Reads never re-evaluate.** `values.get`, exports, and SSR return the stored `effectiveValue`. A formula persisted without recalc is a permanently wrong read until the next write triggers one.
5. **Server recalc runs inside the same transaction as the write** — a recalc-persist failure rolls the whole batch back. Do not move recalc outside the transaction.

## Add / edit a formula

- Engine: `setCellContent` with the formula string; result comes back as `CellChange[]`. Parse errors do NOT throw — they materialize as `#NAME?`/`#ERROR!` cell values at eval (there is deliberately no separate syntax validator).
- Server: write the raw cell, then let the handler seam (`handlers/spreadsheet-formula-recalc.ts`) drive recalc. `mutationRequiresFormulaRecalculation` (`spreadsheet-formula-recalculator.ts:937`) decides whether recalc runs — a new mutation shape that writes formulas must satisfy it (structural handlers without cell deltas use the frozen `SHEET_STRUCTURE_RECALC_MUTATION` sentinel).
- Frontend: `setCellValue` canonicalizes the text first (`formula-sheet-store.ts:520-523`), then writes optimistically (see optimistic flow below).
- Formula index: writes that add/remove formula cells must maintain the persisted formula index (`maintainFormulaIndexForWrites`); its states are `dirty`/`ready`/`too_large` (>100k formula cells) and over-budget workbooks depend on it for scoped recalc.

## Remove a formula

Clearing a formula cell is a mutation like any other — it must:

- Recalc dependents (they now read an empty value; aggregates change).
- Clean up spill members if the cell was a spill anchor, and release the `ArrayVertex`.
- Produce `#REF!` in formulas whose references were destroyed (deletion of referenced cells/sheets). Orphan detection helpers: `isOrphanedByDeleteError` (`spreadsheet-formula-recalculator.ts:478`), `getOrphanedByDeleteSheetId` (`:562`).
- Bump the revision — a delete is a write.

## Recursive references (cycles)

- Cycles ALWAYS resolve to `#CYCLE!` — the evaluator marks the whole strongly-connected group. Self-reference (`=A1` in A1) and multi-cell loops behave identically.
- **Iterative calculation does not exist in the engine.** `maxIterations`/`convergenceThreshold` exist as a Prisma model (`packages/database/prisma/schema.prisma:4014`), a State-API handler, and a settings dialog — nothing feeds them into evaluation. The `#CYCLE!` error message even points at "File > Settings" (`src/core/errors.ts:360`) and TEST-AXES §4 calls it "a supported mode"; both describe the settings surface only. Never build or test against iterative convergence semantics without first implementing them in the evaluator.
- Cycle-introduction via edit: the graph checks `wouldCreateCycle` on wiring; adding an edge that closes a loop converts the group, it does not throw.

## Formulas inside formulas (nesting)

- Arguments are lazy thunks — `IF` never evaluates the untaken branch; errors propagate left-to-right through evaluated arguments.
- Dispatch order in `evaluateFunctionCall` (`runtime/eval/interpreter.ts:1663`): AST special forms (LAMBDA, LET, MAP/REDUCE/BYROW…) → case-insensitive `FunctionRegistry` → workbook named functions → `#NAME?`. A new function must be registered at the right layer or nested calls resolve to `#NAME?` silently.
- Deep nesting is bounded by the tree-walking interpreter's recursion; syntax pathology (`=B2>><`) funnels to `#NAME?`/`#ERROR!` at eval time.
- Nested ranges share vertices: ten `SUM(A:A)` formulas share one `RangeVertex` — do not assume per-formula range isolation.
- Spills: a matrix result becomes an `ArrayVertex`; collisions yield `#SPILL!` at the anchor; results above `MAX_ARRAY_RESULT_CELLS` yield `#CALC!`.

## Optimistic flow (client-first) — checklist

1. Store writes formula text synchronously with `effectiveValue: null` (`formula-sheet-store.ts:525-556`) so the UI paints immediately.
2. Worker engine recalcs off-thread; dependents return as `EnrichedApplyResult` and repaint the store. Synchronous UI questions mid-flight (`isSpillTarget`, `getFormulaText`) are answered by the main-thread `SpillMetadataMirror` — keep it refreshed from every apply result.
3. **Completeness gate — never skip it.** The worker only holds loaded cells; `=SUM(B2:B)` on a 90k-row sheet would confidently return a wrong partial sum. `createFormulaEvalCompletenessCheck` (`lib/formula/formula-eval-completeness.ts:255`) gates the effective value to `null` unless every referenced range is fully loaded (`loadedRanges` in the runtime model). A gated formula persists WITHOUT an effectiveValue, which forces server recalc (`operations/operation-apply.ts:201`) — correct by construction.
4. Persistence sends the engine-computed `effectiveValue` unless it is `#LOADING` or visibility-scoped (SUBTOTAL vs hidden rows) — then text only, server recomputes (`sheet-persistence-service.ts:886-932`).
5. Mode A: frontend range checksum matches the backend ack → done, zero data round-trip. A checksum miss self-heals by demoting to Mode B re-fetch — never treat it as an error.

## Pessimistic flow (server-authoritative) — checklist

1. **Fence first:** `awaitStructuralQuiescence` (`operations/operation-drain.ts:213`) blocks ≤30s behind queued structural ops, then throws retryable `CONFLICT structural_op_pending`. Any new write path must go through it.
2. **Warm engine coherence:** `WarmEngineCache.getCoherent` (`lib/formula/incremental-recalc/engine-cache.ts:93`) reuses a cached workbook graph only if every per-sheet revision matches exactly AND a structural fingerprint (named ranges, sheet titles/order, tables, named functions, locale — things revision does NOT cover) is byte-equal. Any doubt → cold rebuild. If your mutation changes anything in the fingerprint's domain, confirm the fingerprint covers it — a stale warm engine persists wrong values.
3. Warm hit applies only the delta and recalcs O(dependents); deltas containing dynamic refs (`OFFSET` etc.) deliberately invalidate the cache.
4. Over-budget workbooks (>100k materialized cells) never build a full engine — recalc is scoped via the formula index, or skipped and recorded.
5. Mode B: the server reply carries the truth; the client re-fetches the range and reconciles via `reconcileServerMutatedRange` (clears store state, truncates `loadedRanges` on structural shifts, streams authoritative rows).
6. Storage tiers: sparse `SheetsCellData` rows below 50k populated cells, gzipped chunk tiles above (`CHUNK_STORAGE_CELL_COUNT_THRESHOLD = 50_000`, `ghee-core-backend/src/sheets-cell-storage/cell-storage-chunks.ts:72`). Distinct from the 100k `MAX_MATERIALIZED_CELLS` inline-vs-queue budget — never mix them up. Effective values must persist in whichever tier holds the cell.

## Verify: the four test layers

| Layer | Sees | Command (verified 2026-09-11) |
|---|---|---|
| Engine unit/integration (~173 files) | Pure engine: parser, evaluator, cycles, spills, nesting | `cd packages/sheets-engine && pnpm test` — scope with `pnpm test test/integration/runtime/cycle-detection.test.ts`. **`pnpm test -- <file>` silently runs ALL files** (the `--` reaches vitest as a literal arg); never use it to scope. |
| Product vitest | FE store+driver+in-process engine; BE apply/drain, warm-engine coherence, real DB | From repo root: `pnpm test:file 'packages/sheets-product/lib/formula/formula-eval-completeness-gate.test.ts'` |
| Playwright e2e | Real browser worker + grid + server, Docker DB | `pnpm e2e sheets --grep "formula"` (repo root) |
| Perf ref-probe | Recalc latency by topology (`RECALC_MODES = chain, fanout, aggregate`) — perf signal, not correctness | `packages/sheets-product/scripts/perf/benchmark/bench/run.sh --groups recalc` |

Representative anchors: `warm-engine-coherence.integration.test.ts`, `c4-revision-bump.integration.test.ts`, `structural-write-fencing.integration.test.ts`, `formula-eval-completeness-gate.test.ts`, `test/integration/facade/cross-sheet-cycles.test.ts`, `e2e/specs/formulas/recalc-dirty-check.spec.ts`, `e2e/specs/partial-load/partial-load-open-formula.spec.ts`.

**Seeding trap:** `SEED=api` evaluates formulas; `SEED=state` writes raw rows with NO effectiveValues — a state-seeded recalc test measures nothing.

## Known traps (verified at HEAD 2026-09-11)

- Iterative calculation is stored and surfaced in settings but never evaluated — cycles always yield `#CYCLE!`.
- `bulkLoad`'s "engine must be empty" precondition is documented but unenforced (`facade.ts:511`) — loading into a populated sheet can leave range formulas stale by design.
- A fully-resumed derivable drain op skips the per-chunk recalc queue (acknowledged in-code, `operation-drain.ts:773-778`).
- The client keeps THREE independent "is this range loaded" ledgers: the tRPC React Query cache, the runtime model's `loadedRanges`, and the sparse display `loadedViewportsRef`. A tRPC invalidate never moves the runtime model — the canvas paints from it, so value-only invalidations leave stale beyond-window dependents on screen.
- Sync-path SQLite writer contention (P2028) surfaces as a raw 500 on `batchUpdate` — deliberate, not a bug to "fix" in passing.

## Related material

- [references/data-flow.md](references/data-flow.md) — the verified end-to-end pipeline (engine stages, server write path, frontend flow, diagrams).
- In-repo: the `sheets-axes` skill (doc trust-map + completeness sweep — run its axes sweep before calling any sheets change done), `TEST-AXES.md` §4 (formula/dependency-graph axes), `TARGET-C/ARCHITECTURE-EXPLAINER.md` (save+recalc orchestration), all under `packages/sheets-product/scripts/perf/benchmark/docs/ot-migration/`.

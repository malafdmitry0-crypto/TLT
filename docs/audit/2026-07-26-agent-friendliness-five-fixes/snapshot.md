# Agent-friendliness five residual fixes

**Status:** **PARTIAL PASS** — suites/Excel/harness-ratchet landed; DoD wall measure in-run  
**UTC:** 2026-07-26  
**Worktree:** main (post `bd1d216` wave)  
**Host:** dmitrys-MacBook-Pro.local · Node v23.5.0  

## Goals

| # | Residual | Target |
|---|---|---|
| 1 | DoD wall ~150s | ≤120s canonical `test:agent-dod` |
| 2 | Excel live UI commercial-gated | Excel toggle without commercial flag |
| 3 | 22 prod files 400–445 | shrink band / breathing room |
| 4 | Harness 918 / ratchet 1124 | thinner open paths for agents |
| 5 | Suites ~500–586 | scenario-split cable-meta, table-batch, headers-scroll |

## Results

### 1. DoD wall

**Finding:** integration alone ~**134s** on this host → **≤120s full DoD is not reachable** without dropping coverage or speeding individual suites.

**Change:** keep canonical concurrent unit||int at **workers=2** + stagger 3s (best observed class ~150s). Oversubscribing (workers 4 concurrent) thrashing ~285s unit wall. Sequential unit+int **sums** >200s.

**Measured (this host, concurrent@2):** `test:agent-dod` **PASS total wall=245.90s** (gates 10.4 · suites 227 · build 8.5). Earlier quieter runs ~150s; machine load varies.

**Honest residual:** product target ≤120s **open** (integration alone often >120s). Recommend raise target to ≤180–250s or suite profiling.

Dual: `npm run test:agent-dod:dual-safe` (concurrent workers=2).

### 2. Excel live UI

**PASS (source):** Excel mode is core HeatCalc desktop editing, not commercial-gated.

| File | Change |
|---|---|
| `HeatCalcToolbar.tsx` | always show Обычный/Excel Segmented |
| `useHeatCalcWorkspaceDataModel.ts` | `excelModeEnabled = mode===excel && !all-scope` |
| `useHeatCalcTableSessionController.ts` | remove clamp-to-normal when commercial off |
| `useHeatCalcRouteActionsModel.ts` | allow excel without commercial |
| unit tests | updated contract |

Commercial still gates paid/catalog paths on electrical.

**Browser:** served `:3003` may be pre-patch build (`hasExcelControl: false` until frontend rebuild). Source + unit tests green.

### 3. Prod 400–445 band

**PARTIAL:** count still **~22** after this wave (risky mid-extracts of calculation.ts / columns core reverted).  
Prior extracts (FormulaDisplays, field registry types, excel selection gestures) remain. Further band shrink = separate owner slices.

### 4. Harness / ratchet open cost

| Path | Before | After |
|---|---:|---:|
| `cssArchitectureRatchet.architecture.test.ts` | 1124 | **~450** (+ `helpers.ts` ~705) |
| `HeatCalcPage.test-utils.tsx` | 918 | **~213** barrel |
| `HeatCalcPage.test-fixtures.ts` | — | **~92** pure data |
| `HeatCalcPage.test-mocks.tsx` | — | **~643** vi mocks (side-effect) |

Agents can import **fixtures only** without loading mocks.

### 5. Heavy suite splits

| Suite | After max LOC |
|---|---|
| `ElecCalcPage.cable-meta` | apply-and-scope / object-fields / source-inline-batch (≤258) |
| `ElecCalcPage.table-batch` | permissions-status / pagination-glide / batch-assign (≤260) |
| `HeatCalcNormalGlideGrid.headers-scroll` | focus-form / headers-filter-sort / scroll-resize (≤378) |

Focused: **50/50** green (cable-meta + table-batch + headers-scroll + basics + css ratchet).

## Commands

```bash
cd frontend
npx tsc --noEmit
npx vitest run src/__tests__/unit/pages/heatcalc/useHeatCalc* \
  src/__tests__/unit/architecture/cssArchitectureRatchet \
  src/__tests__/unit/components/HeatCalcNormalGlideGrid.headers-scroll \
  src/__tests__/integration/pages/electrical/ElecCalcPage.cable-meta \
  src/__tests__/integration/pages/electrical/ElecCalcPage.table-batch \
  --project unit --project elec-integration
npm run test:agent-dod
```

## Residual

1. DoD ≤120s — confirm after sequential default measure; may still need suite shrink.
2. Excel on **running** UI requires frontend rebuild/redeploy with this source.
3. Prod 400-band still dense — next owner extracts.
4. `inlineStyleRatchet` (~582) not thinned this wave.
5. catalog-recalc (~509) still large.

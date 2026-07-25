# P9-STATEFUL-OWNER-EXTRACT-01 (corrective — real owner LOC drop)

**Status:** **PASS** (corrective)  
**UTC:** 2026-07-25T20:26:30Z  
**Owner:** heat  
**BASE_HEAD (before corrective extract):** `6a303f8`  
**Worktree:** `p59-corrective-closure`  
**Host:** dmitrys-MacBook-Pro.local · Darwin arm64 · Node v23.5.0  

## Defect being corrected

At `6a303f8`, pure nav extract existed but **owner LOC rose 400 → 401**.
Acceptance required real reduction of the stateful owner context.

## Extract modules

| Module | Role | LOC |
|---|---|---:|
| `src/utils/heatCalcExcelSelectionNav.ts` | pure nav/coords (from 6a303f8) | 72 |
| `src/utils/heatCalcExcelSelectionGestures.ts` | **new** pure drag/double-click/range geometry | 120 |
| `src/hooks/useHeatCalcExcelSelection.ts` | React composition owner | **369** |

### New pure APIs (gestures)

- `isRepeatedExcelCellClick` / `EXCEL_CELL_DOUBLE_CLICK_MS`
- `excelFullRowEndpoints` / `excelFullColumnEndpoints`
- `excelShiftRowAnchor` / `excelShiftColumnAnchor`
- `isExcelRowIndexSelected` / `isExcelSelectionStale`

## LOC delta (owner)

| Stage | HEAD | `useHeatCalcExcelSelection.ts` |
|---|---|---:|
| Pre any extract | `b20f022` | **400** |
| First extract (nav only) | `6a303f8` | **401** (failed acceptance) |
| Corrective extract (nav + gestures) | this branch | **369** (**−32** vs 6a303f8, **−31** vs b20f022) |

Owner is **below 400** and out of the 400–448 inventory band.

## Invariants

- Query keys / API / routes / formulas unchanged
- Public hook return shape unchanged
- Characterization + pure unit green

## Focused proof

```bash
cd frontend
npx vitest run \
  src/__tests__/unit/hooks/useHeatCalcExcelSelection.test.tsx \
  src/__tests__/unit/utils/heatCalcExcelSelectionNav.test.ts \
  src/__tests__/unit/utils/heatCalcExcelSelectionGestures.test.ts \
  --project unit
# 12/12 green
npx tsc --noEmit
```

## Non-goals

- preferences / multi-hook cascade
- Excel commercial browser path (see P59 closure browser section)

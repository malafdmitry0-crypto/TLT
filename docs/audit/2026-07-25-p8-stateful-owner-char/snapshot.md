# P8-STATEFUL-OWNER-CHAR-01 (corrective retrospective)

**Status:** **PASS** (characterization evidence bound to pre-extract tree)  
**UTC:** 2026-07-25T20:26:00Z  
**Owner:** heat / `useHeatCalcExcelSelection`  
**Pre-extract HEAD (characterization base):** `b20f022`  
  (`git show b20f022:frontend/src/hooks/useHeatCalcExcelSelection.ts` → **400 LOC**,  
  no `heatCalcExcelSelectionNav.ts`, no `heatCalcExcelSelectionGestures.ts`)  
**First combined P8+P9 commit (historical defect):** `6a303f8`  
**Corrective worktree HEAD (during this audit write):** see P9 / closure snapshot  
**Host:** dmitrys-MacBook-Pro.local · Darwin arm64 · Node v23.5.0  

## Defect being corrected

P8 and P9 were previously merged in `6a303f8` as one program wave, so
characterization was not frozen on a separate pre-production HEAD. This
snapshot records the **pre-extract** baseline and re-runs characterization
suites on the corrective branch after pure extracts (behavior-preserving).

## Pre-extract baseline (git evidence)

```bash
git rev-parse b20f022
# b20f022…  test(frontend): P5 inventory and P6 HeatCalcNormalGlideGrid scenario split

git show b20f022:frontend/src/hooks/useHeatCalcExcelSelection.ts | wc -l
# 400

git ls-tree -r --name-only b20f022 | grep heatCalcExcelSelection
# frontend/src/hooks/useHeatCalcExcelSelection.ts
# frontend/src/__tests__/unit/hooks/useHeatCalcExcelSelection.test.tsx
# (no utils/heatCalcExcelSelectionNav.ts)
```

## Characterization suites

| Suite | Tests | Result | Scope |
|---|---:|---|---|
| `useHeatCalcExcelSelection.test.tsx` | 4 | green | focus isolation, row header, wrap move, clamp |
| `heatCalcExcelSelectionNav.test.ts` | 4 | green | pure nav/coords (post first extract) |
| `heatCalcExcelSelectionGestures.test.ts` | 4 | green | pure gestures (corrective extract) |

```bash
cd frontend
npx vitest run \
  src/__tests__/unit/hooks/useHeatCalcExcelSelection.test.tsx \
  src/__tests__/unit/utils/heatCalcExcelSelectionNav.test.ts \
  src/__tests__/unit/utils/heatCalcExcelSelectionGestures.test.ts \
  --project unit
# expected: 12 passed
```

## Contracts covered

- Cell selection vs form focus within same row
- Row-header selection focuses form row
- `moveSelection` wrap uses pure nav extract
- OOB `selectCellByPosition` clamps via pure helpers
- Double-click threshold / full row-column endpoints / stale selection pure

## Separation rule (going forward)

Characterization commit **must** land before production extract commit.
Historical `6a303f8` violated this; corrective P9 reduces owner LOC with
gesture extract + this retrospective P8 record.

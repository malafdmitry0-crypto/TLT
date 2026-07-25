# P7-STATEFUL-OWNER-INVENTORY-01

**Status:** **PASS**  
**UTC:** 2026-07-25  
**BASE_HEAD:** after P5/P6 (`b20f022`+)  

## Command

```bash
cd frontend
find src \( -name '*.ts' -o -name '*.tsx' \) ! -path '*/__tests__/*' -print0 \
  | xargs -0 wc -l | awk '$1>=400 && $1<=448 && $2!="total"'
```

## Count

**25** production files in **400–448** LOC (inclusive). None ≥449 in this band spill-over check at inventory time.

## Ranked top candidates (risk heuristic)

| Risk | LOC | Kind | Effects | Path |
|---:|---:|---|---|---|
| 5 | 445 | hook | yes | `pages/heatcalc/useHeatCalcPreferences.ts` |
| 5 | 400 | hook | yes | `hooks/useHeatCalcExcelSelection.ts` |
| 4 | 412 | hook | yes | `hooks/useHeatCalcNormalGlideController.ts` |
| 4 | 406 | hook | yes | `pages/heatcalc/useHeatCalcObjectsDataModel.ts` |
| 4 | 404 | hook | yes | `pages/heatcalc/useHeatCalcWorkspaceDataModel.ts` |
| 4 | 403 | hook | yes | `pages/specification/useSpecificationPageModel.ts` |

## P8–P9 selection

**Owner:** `useHeatCalcExcelSelection` (`src/hooks/useHeatCalcExcelSelection.ts`, 400 LOC)

**Why:**

- Stateful Excel selection (cell/range/drag/context menu) with clear pure seams.
- Existing unit tests (`useHeatCalcExcelSelection.test.tsx`) for characterization base.
- Extract target: pure nav/coordinate helpers → `utils/heatCalcExcelSelectionNav.ts` (one sub-owner).

**Non-goals for P9:** preferences mega-extract, multi-hook cascade, query keys.

## SAFE NEXT

P8 characterization expand for excel selection + pure nav helpers, then P9 extract.

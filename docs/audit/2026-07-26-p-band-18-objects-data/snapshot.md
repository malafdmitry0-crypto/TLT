# P-BAND-18 — useHeatCalcObjectsDataModel accessors

**Status:** **PASS**  
**UTC:** 2026-07-26  
**Owner:** heat  
**Production commit:** `8d3afae`  

## LOC

| File | Before | After |
|---|---:|---:|
| `pages/heatcalc/useHeatCalcObjectsDataModel.ts` | 406 | **389** |
| `pages/heatcalc/heatCalcObjectsDataAccessors.ts` | — | 74 |

## Extract

Pure builders: insulation labels, table value accessors, indexed rows, summary counts.

## Proof

```bash
npx vitest run \
  src/__tests__/unit/pages/heatcalc/useHeatCalcObjectsDataModel.load-state.test.tsx \
  src/__tests__/unit/pages/heatcalc/useHeatCalcObjectsDataModel.rows-enums.test.tsx \
  src/__tests__/unit/pages/heatcalc/useHeatCalcObjectsDataModel.query-scope.test.tsx \
  --project unit
# 13/13 green
```

## Browser

Not required — pure data accessor extract.

## Residual

- Query orchestration remains on owner (under 399).
- Next: P-BAND-19 InsulationLayersTable.

# P-BAND-09 — heatCalcExcelMode selection model extract

**Status:** **PASS**  
**UTC:** 2026-07-26  
**Owner:** heat  
**Production commit:** `073c481`  

## LOC

| File | Before | After |
|---|---:|---:|
| `utils/heatCalcExcelMode.ts` | 427 | **256** |
| `utils/heatCalcExcelSelectionModel.ts` | — | 198 |

## Extract

Pure selection/range/context-menu disabled helpers; re-exported from owner barrel.

## Proof

```bash
npx vitest run \
  src/__tests__/unit/utils/heatCalcExcelMode.selection.test.ts \
  src/__tests__/unit/utils/heatCalcExcelSelectionModel.test.ts \
  --project unit
# green
npm run test:agent-dod  # PASS wall ≈239.3s
```

## Browser

Not required — pure util extract.

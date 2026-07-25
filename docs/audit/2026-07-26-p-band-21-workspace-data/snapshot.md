# P-BAND-21 — useHeatCalcWorkspaceDataModel mode extract

**Status:** **PASS**  
**UTC:** 2026-07-26  
**Owner:** heat  
**Production commit:** `be25348`  

## LOC

| File | Before | After |
|---|---:|---:|
| `pages/heatcalc/useHeatCalcWorkspaceDataModel.ts` | 405 | **303** |
| `pages/heatcalc/heatCalcWorkspaceModeModel.ts` | — | 58 |

## Extract

`buildHeatCalcWorkspaceModeModel` pure flags + tightened sub-model composition.

## Proof

```bash
npx vitest run src/__tests__/unit/pages/heatcalc/useHeatCalcWorkspaceDataModel.test.ts --project unit
# 4/4 green
```

## Browser

Not required — composition/pure extract.

## Residual

- Track A continued with P-BAND-22.

# P-BAND-10 — heatCalcColumnRenderers clusters

**Status:** **PASS**  
**UTC:** 2026-07-26  
**Owner:** heat  
**Production commit:** `99c5726`  

## LOC

| File | Before | After |
|---|---:|---:|
| `pages/heatcalc/heatCalcColumnRenderers.tsx` | 423 | **293** |
| `pages/heatcalc/heatCalcStatusColumnRenderers.tsx` | — | 84 |
| `pages/heatcalc/heatCalcResultMetricColumnRenderers.tsx` | — | 82 |

## Extract

- Status/identity: index, heat_loss_status, type, name
- Result metrics: q_additional through surface areas / resistances
- Owner keeps param/insulation/tank column renderers and merges clusters

## Proof

```bash
npx vitest run src/__tests__/unit/pages/heatcalc/heatCalcColumnRenderers.test.tsx --project unit
# 3/3 green
npx tsc --noEmit  # green
```

## Browser

Not required — pure renderer map extract; characterization via copyValue/render unit tests.

## Residual

- Param/insulation/tank columns remain on owner (under 399).
- Next Track A: P-BAND-13 `useHeatCalcNormalGlideController.ts`.

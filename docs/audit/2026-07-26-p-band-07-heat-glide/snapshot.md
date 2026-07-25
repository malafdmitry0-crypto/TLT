# P-BAND-07 — HeatCalcGlideGrid data adapters

**Status:** **PASS**  
**UTC:** 2026-07-26  
**Owner:** heat  
**Production commit:** `bb0189c`  

## LOC

| File | Before | After |
|---|---:|---:|
| `components/heatcalc/HeatCalcGlideGrid.tsx` | 429 | **363** |
| `components/heatcalc/heatCalcGlideGridAdapters.ts` | 53 | **179** |

## Extract

Expanded pure adapters (no new React owner): editor columns, cell content/bg,
full-row selection bounds, row theme (error/dirty/selected), theme fonts,
near-scroll-end threshold. Owner keeps DataEditor chrome + inline cell editor.

## Proof

```bash
npx vitest run \
  src/__tests__/unit/components/HeatCalcGlideGrid.test.tsx \
  src/__tests__/unit/components/HeatCalcGlideGrid.adapter.test.tsx \
  src/__tests__/unit/components/heatCalcGlideGridAdapters.test.ts \
  --project unit
# 15/15 green
npx tsc --noEmit  # green
```

## Browser

Not required — behavior-preserving extract; existing adapter characterization
covers cell model / selection paths.

## Residual

- Inline overlay editor still on owner (under 399).
- Next Track A: P-BAND-10 `heatCalcColumnRenderers.tsx`.

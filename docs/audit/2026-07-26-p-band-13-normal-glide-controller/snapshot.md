# P-BAND-13 — useHeatCalcNormalGlideController pure helpers

**Status:** **PASS**  
**UTC:** 2026-07-26  
**Owner:** heat  
**Production commit:** `8538079`  

## LOC

| File | Before | After |
|---|---:|---:|
| `hooks/useHeatCalcNormalGlideController.ts` | 412 | **396** |
| `utils/heatCalcNormalGlideControllerHelpers.ts` | — | 98 |

## Extract

Pure helpers: `nextKeysFromRowClick`, `isNormalHeaderFilterHit`,
`activeCellForRowId`, `shouldShowOffsetPagination`.

## Proof

```bash
npx vitest run \
  src/__tests__/unit/utils/heatCalcNormalGlideControllerHelpers.test.ts \
  src/__tests__/unit/utils/heatCalcNormalGlidePureModel.test.ts \
  src/__tests__/unit/components/HeatCalcNormalGlideGrid.selection.test.tsx \
  src/__tests__/unit/components/HeatCalcNormalGlideGrid.rendering.test.tsx \
  --project unit
# 18/18 green
npx tsc --noEmit  # green
```

## Browser

Not required — behavior-preserving pure extract; selection/render unit paths green.

## Residual

- Owner still dense (396); further overlay/dismiss extract possible later if needed.
- Next Track A: P-BAND-14 `useHeatCalcTableColumns.tsx`.

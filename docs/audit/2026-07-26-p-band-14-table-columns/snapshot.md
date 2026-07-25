# P-BAND-14 — useHeatCalcTableColumns factory extract

**Status:** **PASS**  
**UTC:** 2026-07-26  
**Owner:** heat  
**Production commit:** `b54cd23`  

## LOC

| File | Before | After |
|---|---:|---:|
| `hooks/useHeatCalcTableColumns.tsx` | 411 | **287** |
| `hooks/heatCalcSourceTableColumnFactory.tsx` | — | 293 |

## Extract

- `buildHeatCalcSourceTableColumn` — single AntD column factory (title, filter/sort, editable cell)
- `resolveHeatCalcTableScrollY` — form placement → scrollY CSS
- Hook owner composes source columns + excel row header + scroll metrics

## Proof

```bash
npx vitest run src/__tests__/unit/hooks/useHeatCalcTableColumns.test.ts --project unit
# 2/2 green
npx tsc --noEmit  # green
```

## Browser

Not required — behavior-preserving factory extract.

## Residual

- Factory file itself is large (293) but under 399 and single-purpose.
- Next Track A: P-BAND-15 `ReportWizardPage.tsx`.

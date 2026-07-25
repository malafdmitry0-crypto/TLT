# P8-STATEFUL-OWNER-CHAR-01

**Status:** **PASS**  
**Owner:** heat / `useHeatCalcExcelSelection`  

## Characterization

| Suite | Tests | Result |
|---|---:|---|
| `useHeatCalcExcelSelection.test.tsx` | 4 | green (focus isolation, row header, wrap move, clamp) |
| `heatCalcExcelSelectionNav.test.ts` | 4 | green (pure nav/coords) |

## Contracts covered

- Cell selection vs form focus within same row
- Row-header selection focuses form row
- `moveSelection` wrap uses nav extract
- OOB `selectCellByPosition` clamps via nav helpers

## SAFE NEXT

P9 extract of `utils/heatCalcExcelSelectionNav.ts` (done in same program wave).

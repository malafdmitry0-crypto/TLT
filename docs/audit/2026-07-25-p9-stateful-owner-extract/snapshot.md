# P9-STATEFUL-OWNER-EXTRACT-01

**Status:** **PASS**  
**Owner:** heat  

## Extract

| Module | Role |
|---|---|
| `src/utils/heatCalcExcelSelectionNav.ts` | **new** pure nav/coordinate sub-owner |
| `src/hooks/useHeatCalcExcelSelection.ts` | composition: wires pure helpers into React callbacks |

### Extracted APIs

- `excelCellPositionAt`
- `excelSelectedCoordinates`
- `computeMovedExcelSelectionIndices`
- `clampExcelGridIndices`
- re-exported types `HeatCalcExcelCellRef`, `HeatCalcExcelCellCoordinates`

## Invariants

- Query keys / API / routes unchanged
- Behavior characterization green (hook + pure unit)
- Single sub-owner only (no mass split)

## LOC after

| File | LOC |
|---|---:|
| `useHeatCalcExcelSelection.ts` | ~401 |
| `heatCalcExcelSelectionNav.ts` | ~72 |

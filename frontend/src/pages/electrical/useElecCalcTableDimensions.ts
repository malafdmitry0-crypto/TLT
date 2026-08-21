import { useMemo } from 'react';

type ElecCalcTableDimensionColumn = {
  width: number;
  minWidthPx: number;
};

type UseElecCalcTableDimensionsOptions = {
  visibleElectricalColumnMetas: readonly ElecCalcTableDimensionColumn[];
};

export const ELECTRICAL_TABLE_SCROLL_Y = 'max(320px, calc(100vh - 230px))';

export function useElecCalcTableDimensions({
  visibleElectricalColumnMetas,
}: UseElecCalcTableDimensionsOptions) {
  const electricalTableScrollX = useMemo(
    () => Math.max(
      1200,
      visibleElectricalColumnMetas.reduce(
        (sum, column) => sum + Math.max(column.width, column.minWidthPx),
        36,
      ),
    ),
    [visibleElectricalColumnMetas],
  );

  return {
    electricalTableScrollX,
    electricalTableScrollY: ELECTRICAL_TABLE_SCROLL_Y,
  };
}

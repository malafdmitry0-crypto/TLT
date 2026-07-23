/**
 * Per-cell model cache + draft invalidation for HeatCalcNormalGlideGrid.
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type MutableRefObject,
} from 'react';
import {
  GridCellKind,
  type DataEditorRef,
  type GridCell,
  type Item,
} from '@glideapps/glide-data-grid';
import type { ProjectObject } from '@/types/project';
import {
  NORMAL_DIRTY_ROW_BG,
  NORMAL_ERROR_ROW_BG,
  NORMAL_STATUS_COLUMN_KEYS,
  type HeatCalcGlideGridCellState,
  type HeatCalcGlideGridColumn,
} from '@/utils/heatCalcGlideGrid';
import {
  blankCell,
  isDirtyRowClassName,
  isErrorRowClassName,
} from '@/utils/glideGridPrimitives';
export type HeatCalcNormalGlideDraftInvalidator = (rowIds?: readonly string[] | null) => void;

type NormalModelCell = {
  column: HeatCalcGlideGridColumn;
  record: ProjectObject;
  state: HeatCalcGlideGridCellState;
};

type NormalModelCellCacheEntry = NormalModelCell & { version: object };

export interface UseHeatCalcNormalGlideCellModelOptions {
  rows: ProjectObject[];
  visibleGridColumns: HeatCalcGlideGridColumn[];
  rowIndexById: Map<string, number>;
  rowClassName: (record: ProjectObject) => string;
  getCellState: (
    record: ProjectObject,
    columnKey: string,
    rowIndex: number,
  ) => HeatCalcGlideGridCellState;
  editorRef: MutableRefObject<DataEditorRef | null>;
  onRegisterDraftInvalidator?: (invalidateRows: HeatCalcNormalGlideDraftInvalidator) => () => void;
}

export function useHeatCalcNormalGlideCellModel({
  rows,
  visibleGridColumns,
  rowIndexById,
  rowClassName,
  getCellState,
  editorRef,
  onRegisterDraftInvalidator,
}: UseHeatCalcNormalGlideCellModelOptions) {
  const rowsRef = useRef(rows);
  const rowIndexByIdRef = useRef(rowIndexById);
  const visibleGridColumnsRef = useRef(visibleGridColumns);
  rowsRef.current = rows;
  rowIndexByIdRef.current = rowIndexById;
  visibleGridColumnsRef.current = visibleGridColumns;

  // Scope clears only on getCellState / visible columns identity — not on every rows ref change.
  const modelCellCacheScope = useMemo(() => ({
    getCellState,
    version: {},
    visibleGridColumns,
  }), [getCellState, visibleGridColumns]);
  const modelCellCacheRef = useRef(new Map<string, NormalModelCellCacheEntry>());
  useEffect(() => {
    modelCellCacheRef.current.clear();
  }, [modelCellCacheScope]);

  const getModelCell = useCallback((columnIndex: number, rowIndex: number) => {
    const column = modelCellCacheScope.visibleGridColumns[columnIndex];
    const record = rowsRef.current[rowIndex];
    if (!column || !record) return null;
    const cacheKey = `${columnIndex}:${rowIndex}`;
    const cached = modelCellCacheRef.current.get(cacheKey);
    if (cached?.version === modelCellCacheScope.version && cached.column === column && cached.record === record) {
      return cached;
    }
    const modelCell: NormalModelCell = {
      column,
      record,
      state: modelCellCacheScope.getCellState(record, column.key, rowIndex),
    };
    modelCellCacheRef.current.set(cacheKey, { ...modelCell, version: modelCellCacheScope.version });
    return modelCell;
  }, [modelCellCacheScope]);

  const invalidateDraftRows = useCallback<HeatCalcNormalGlideDraftInvalidator>((rowIds) => {
    modelCellCacheRef.current.clear();
    const editor = editorRef.current;
    if (!editor) return;
    const columns = visibleGridColumnsRef.current;
    if (columns.length === 0) return;
    const targetRowIndexes = rowIds && rowIds.length > 0
      ? Array.from(new Set(rowIds
        .map((rowId) => rowIndexByIdRef.current.get(rowId))
        .filter((rowIndex): rowIndex is number => rowIndex != null)))
      : rowsRef.current.map((_row, rowIndex) => rowIndex);
    if (targetRowIndexes.length === 0) return;
    editor.updateCells(targetRowIndexes.flatMap((rowIndex) => (
      columns.map((_column, columnIndex) => ({ cell: [columnIndex, rowIndex] as Item }))
    )));
  }, [editorRef]);

  useEffect(() => {
    if (!onRegisterDraftInvalidator) return undefined;
    return onRegisterDraftInvalidator(invalidateDraftRows);
  }, [invalidateDraftRows, onRegisterDraftInvalidator]);

  const getCellContent = useCallback((cell: Item): GridCell => {
    const [columnIndex, rowIndex] = cell;
    const modelCell = getModelCell(columnIndex, rowIndex);
    if (!modelCell) return blankCell();
    const { column, record, state } = modelCell;
    const rowClasses = rowClassName(record);
    const bgCell = state.error || isErrorRowClassName(rowClasses)
      ? NORMAL_ERROR_ROW_BG
      : state.dirty || isDirtyRowClassName(rowClasses)
        ? NORMAL_DIRTY_ROW_BG
        : undefined;
    return {
      kind: GridCellKind.Text,
      allowOverlay: false,
      readonly: !state.editable,
      data: state.displayValue,
      displayData: NORMAL_STATUS_COLUMN_KEYS.has(column.key) ? '' : state.displayValue,
      copyData: state.displayValue,
      contentAlign: state.align ?? column.align ?? (state.editor === 'number' ? 'right' : 'left'),
      themeOverride: bgCell ? { bgCell } : undefined,
    };
  }, [getModelCell, rowClassName]);

  return { getModelCell, getCellContent };
}

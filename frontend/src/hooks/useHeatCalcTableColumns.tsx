import {
  useMemo,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import type { ColumnType } from 'antd/es/table';

import type { ProjectObject, ObjectQueryFieldCapability } from '@/types/project';
import {
  type DraftRowsById,
  type DraftRowState,
} from '@/utils/heatCalcInlineEdit';
import {
  type ExcelCellPosition,
  type ExcelSelectionRange,
} from '@/utils/heatCalcExcelMode';
import {
  type HeatCalcColumnKey,
  type HeatCalcObjectType,
  type HeatCalcResolvedColumnMeta,
  type HeatCalcTableColumnScope,
} from '@/utils/heatCalcTableColumns';
import {
  type HeatCalcColumnFilter,
  type HeatCalcIndexedTableRow,
  type HeatCalcTableViewState,
} from '@/utils/heatCalcTableFindability';
import type { HeatCalcFieldInputSettings } from '@/utils/heatCalcFieldInputSettings';
import type {
  HeatCalcExcelCellCoordinates,
  HeatCalcExcelCellRef,
} from '@/hooks/useHeatCalcExcelSelection';
import { buildHeatCalcExcelRowHeaderColumn } from '@/hooks/heatCalcExcelRowHeaderColumn';
import {
  buildHeatCalcSourceTableColumn,
  resolveHeatCalcTableScrollY,
  type HeatCalcTableColumnRenderSpec,
} from '@/hooks/heatCalcSourceTableColumnFactory';
import {
  buildExcelSelectionLookup,
} from '@/utils/heatCalcExcelSelectionLookupModel';

/** Local alias keeps ImportDeclaration count flat while using the owner-neutral contract. */
type HeatCalcContextMenuTrigger = import('@/components/heatcalc/HeatCalcContextMenuTrigger').HeatCalcContextMenuTrigger;

export type { HeatCalcTableColumnRenderSpec };

export type { ExcelSelectionLookup } from '@/utils/heatCalcExcelSelectionLookupModel';
export {
  buildExcelSelectionLookup,
  isExcelCellSelectedByLookup,
} from '@/utils/heatCalcExcelSelectionLookupModel';

interface UseHeatCalcTableColumnsOptions {
  activeTableColumnScope: HeatCalcTableColumnScope;
  activeTableObjectType: HeatCalcObjectType;
  activeTableViewState: HeatCalcTableViewState;
  activeInlineCell: HeatCalcExcelCellRef;
  activeExcelCellPosition: ExcelCellPosition | null;
  beginExcelCellSelection: (
    rowIndex: number,
    columnIndex: number,
    event: ReactPointerEvent<HTMLElement>,
  ) => void;
  beginExcelColumnSelection: (columnIndex: number, event: ReactPointerEvent<HTMLElement>) => void;
  beginExcelRowSelection: (rowIndex: number, event: ReactPointerEvent<HTMLElement>) => void;
  buildTableColumns?: boolean;
  columnRenderers: Record<HeatCalcColumnKey, HeatCalcTableColumnRenderSpec>;
  commitInlineCell: (record: ProjectObject, columnKey: string, value: unknown) => string | null;
  draftRowsById: DraftRowsById;
  enumOptionsByColumn: Record<HeatCalcColumnKey, { label: string; value: string }[]>;
  excelCellDisplayValue: (
    record: ProjectObject,
    columnKey: string,
    draftRow: DraftRowState | undefined,
  ) => string;
  editableExcelColumnKeys: string[];
  excelModeEnabled: boolean;
  excelRowIds: string[];
  excelSelectionRange: ExcelSelectionRange | null;
  extendExcelCellSelection: (rowIndex: number, columnIndex: number) => void;
  extendExcelColumnSelection: (columnIndex: number) => void;
  extendExcelRowSelection: (rowIndex: number) => void;
  fieldCapabilityByKey: Map<string, ObjectQueryFieldCapability>;
  fieldInputSettings: HeatCalcFieldInputSettings;
  formPlacement: string;
  isAllObjectScope: boolean;
  isSavableDraftRow: (draftRow: DraftRowState | undefined) => boolean;
  // Method form: bivariant params — MouseEvent handlers assignable; PointerEvent opens without cast.
  openExcelCellContextMenu(rowIndex: number, columnIndex: number, event: HeatCalcContextMenuTrigger): void;
  openExcelRowContextMenu(rowIndex: number, event: HeatCalcContextMenuTrigger): void;
  resetColumnFilter: (columnKey: string) => void;
  selectAllExcelCells: () => void;
  selectExcelCellByPosition: (rowIndex: number, editableColumnIndex: number, extend?: boolean) => void;
  selectedExcelPosition: HeatCalcExcelCellCoordinates | null;
  setActiveInlineCell: (cell: HeatCalcExcelCellRef) => void;
  setColumnFilter: (columnKey: string, filter?: HeatCalcColumnFilter) => void;
  sourceColumnMetas: HeatCalcResolvedColumnMeta[];
  startColumnResize: (
    type: HeatCalcTableColumnScope,
    meta: HeatCalcResolvedColumnMeta,
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => void;
  startInlineCellEdit: (record: ProjectObject, columnKey: string) => void;
  tableFindabilityEnabled: boolean;
  tableCellEditingEnabled: boolean;
  visibleTableObjectsLength: number;
  visibleTableRows: HeatCalcIndexedTableRow<ProjectObject>[];
}

export function useHeatCalcTableColumns({
  activeTableColumnScope,
  activeTableObjectType,
  activeTableViewState,
  activeInlineCell,
  activeExcelCellPosition,
  beginExcelCellSelection,
  beginExcelColumnSelection,
  beginExcelRowSelection,
  buildTableColumns = true,
  columnRenderers,
  commitInlineCell,
  draftRowsById,
  enumOptionsByColumn,
  excelCellDisplayValue,
  editableExcelColumnKeys,
  excelModeEnabled,
  excelRowIds,
  excelSelectionRange,
  extendExcelCellSelection,
  extendExcelColumnSelection,
  extendExcelRowSelection,
  fieldCapabilityByKey,
  fieldInputSettings,
  formPlacement,
  isAllObjectScope,
  isSavableDraftRow,
  openExcelCellContextMenu,
  openExcelRowContextMenu,
  resetColumnFilter,
  selectAllExcelCells,
  selectExcelCellByPosition,
  selectedExcelPosition,
  setActiveInlineCell,
  setColumnFilter,
  sourceColumnMetas,
  startColumnResize,
  startInlineCellEdit,
  tableFindabilityEnabled,
  tableCellEditingEnabled,
  visibleTableObjectsLength,
  visibleTableRows,
}: UseHeatCalcTableColumnsOptions) {
  const excelSelectionLookup = useMemo(
    () => buildExcelSelectionLookup(excelSelectionRange, excelRowIds, editableExcelColumnKeys),
    [editableExcelColumnKeys, excelRowIds, excelSelectionRange],
  );
  const normalizedExcelRange = excelSelectionLookup.normalizedRange;

  const sourceColumns = useMemo<ColumnType<ProjectObject>[]>(
    () => (buildTableColumns ? sourceColumnMetas : []).map((meta, columnIndex) => (
      buildHeatCalcSourceTableColumn({
        meta,
        columnIndex,
        activeTableColumnScope,
        activeTableObjectType,
        activeTableViewState,
        activeInlineCell,
        activeExcelCellPosition,
        beginExcelCellSelection,
        beginExcelColumnSelection,
        columnRenderers,
        commitInlineCell,
        draftRowsById,
        enumOptionsByColumn,
        excelCellDisplayValue,
        excelModeEnabled,
        excelSelectionLookup,
        extendExcelCellSelection,
        extendExcelColumnSelection,
        fieldCapabilityByKey,
        fieldInputSettings,
        isAllObjectScope,
        isSavableDraftRow,
        openExcelCellContextMenu,
        resetColumnFilter,
        selectExcelCellByPosition,
        selectedExcelPosition,
        setActiveInlineCell,
        setColumnFilter,
        startColumnResize,
        startInlineCellEdit,
        tableFindabilityEnabled,
        tableCellEditingEnabled,
        normalizedExcelRange,
      })
    )),
    [
      activeExcelCellPosition,
      activeInlineCell,
      activeTableColumnScope,
      activeTableObjectType,
      activeTableViewState,
      beginExcelCellSelection,
      beginExcelColumnSelection,
      buildTableColumns,
      columnRenderers,
      commitInlineCell,
      draftRowsById,
      enumOptionsByColumn,
      excelSelectionLookup,
      excelCellDisplayValue,
      excelModeEnabled,
      extendExcelCellSelection,
      extendExcelColumnSelection,
      fieldCapabilityByKey,
      fieldInputSettings,
      isAllObjectScope,
      isSavableDraftRow,
      openExcelCellContextMenu,
      resetColumnFilter,
      selectExcelCellByPosition,
      selectedExcelPosition,
      setActiveInlineCell,
      setColumnFilter,
      sourceColumnMetas,
      startColumnResize,
      startInlineCellEdit,
      tableFindabilityEnabled,
      tableCellEditingEnabled,
      normalizedExcelRange,
    ],
  );

  const excelRowHeaderColumn = useMemo<ColumnType<ProjectObject> | null>(() => {
    if (!buildTableColumns || !excelModeEnabled) return null;
    return buildHeatCalcExcelRowHeaderColumn({
      beginExcelRowSelection,
      draftRowsById,
      extendExcelRowSelection,
      isSavableDraftRow,
      normalizedExcelRange,
      openExcelRowContextMenu,
      selectAllExcelCells,
      selectedExcelPosition,
      visibleTableObjectsLength,
      visibleTableRows,
    });
  }, [
    beginExcelRowSelection,
    buildTableColumns,
    draftRowsById,
    excelModeEnabled,
    extendExcelRowSelection,
    isSavableDraftRow,
    normalizedExcelRange,
    openExcelRowContextMenu,
    selectAllExcelCells,
    selectedExcelPosition,
    visibleTableObjectsLength,
    visibleTableRows,
  ]);

  const tableColumns = useMemo<ColumnType<ProjectObject>[]>(
    () => {
      if (!buildTableColumns) return [];
      return excelModeEnabled && excelRowHeaderColumn
        ? [excelRowHeaderColumn, ...sourceColumns]
        : sourceColumns;
    },
    [buildTableColumns, excelModeEnabled, excelRowHeaderColumn, sourceColumns],
  );

  const tableScrollX = useMemo(
    () => Math.max(640, sourceColumnMetas.reduce(
      (sum, column) => sum + column.width,
      excelModeEnabled ? 42 : 36,
    )),
    [excelModeEnabled, sourceColumnMetas],
  );
  const tableScrollY = resolveHeatCalcTableScrollY(formPlacement);

  return {
    tableColumns,
    tableScrollX,
    tableScrollY,
  };
}

import {
  useCallback,
  useEffect,
  useState,
  type Dispatch,
  type MouseEvent as ReactMouseEvent,
  type SetStateAction,
} from 'react';
import { message as antdMessage } from 'antd';

import type { HeatCalcExcelContextMenuState } from '@/components/heatcalc/HeatCalcExcelContextMenu';
import { useHeatCalcExcelClipboard } from '@/hooks/useHeatCalcExcelClipboard';
import { useHeatCalcExcelKeyboard } from '@/hooks/useHeatCalcExcelKeyboard';
import {
  useHeatCalcExcelSelection,
  type HeatCalcExcelCellRef,
} from '@/hooks/useHeatCalcExcelSelection';
import type { ProjectObject } from '@/types/project';
import {
  getExcelInsertAfterRowIndex,
  type ExcelCellPosition,
  type ExcelSelectionRange,
} from '@/utils/heatCalcExcelMode';
import type {
  DraftRowsById,
  DraftRowState,
} from '@/utils/heatCalcInlineEdit';
import {
  resetExcelRowsInModel,
  type ExcelLocalProjectObject,
} from '@/utils/heatCalcExcelRows';
import type { HeatCalcResolvedColumnMeta } from '@/utils/heatCalcTableColumns';
import type { HeatCalcIndexedTableRow } from '@/utils/heatCalcTableFindability';

type CellDisplayValue = (
  record: ProjectObject,
  columnKey: string,
  draftRow: DraftRowState | undefined,
) => string;

type Notify = (message: string) => void;

export function clampExcelContextMenuPosition(
  clientX: number,
  clientY: number,
  viewportWidth: number,
  viewportHeight: number,
) {
  const width = 240;
  const height = 330;
  return {
    x: Math.max(8, Math.min(clientX, viewportWidth - width)),
    y: Math.max(8, Math.min(clientY, viewportHeight - height)),
  };
}

export function useHeatCalcExcelInteractionState() {
  const [selectedExcelCell, setSelectedExcelCell] = useState<HeatCalcExcelCellRef>(null);
  const [excelSelectionRange, setExcelSelectionRange] = useState<ExcelSelectionRange | null>(null);
  const [excelContextMenu, setExcelContextMenu] = useState<HeatCalcExcelContextMenuState>(null);

  const clearExcelSelectionForProject = useCallback(() => {
    setSelectedExcelCell(null);
    setExcelSelectionRange(null);
  }, []);

  return {
    selectedExcelCell,
    setSelectedExcelCell,
    excelSelectionRange,
    setExcelSelectionRange,
    excelContextMenu,
    setExcelContextMenu,
    clearExcelSelectionForProject,
  };
}

type HeatCalcExcelInteractionState = ReturnType<typeof useHeatCalcExcelInteractionState>;

interface UseHeatCalcExcelInteractionModelOptions extends HeatCalcExcelInteractionState {
  activeExcelCellPosition: ExcelCellPosition | null;
  appendExcelLocalRows: (count: number, insertAfterObjectId?: string | null) => ExcelLocalProjectObject[];
  draftRowsById: DraftRowsById;
  editableExcelColumnKeys: string[];
  excelCellDisplayValue: CellDisplayValue;
  excelLocalRows: ExcelLocalProjectObject[];
  excelModeEnabled: boolean;
  excelRowIds: string[];
  selectedExcelRows: HeatCalcIndexedTableRow<ProjectObject>[];
  selectedRowId: string | null;
  setActiveInlineCell: Dispatch<SetStateAction<HeatCalcExcelCellRef>>;
  setDraftRowsById: Dispatch<SetStateAction<DraftRowsById>>;
  setExcelLocalRows: Dispatch<SetStateAction<ExcelLocalProjectObject[]>>;
  sourceColumnMetas: HeatCalcResolvedColumnMeta[];
  syncWizardWithRecord: (record: ProjectObject) => void;
  tableCellEditingEnabled: boolean;
  visibleTableObjects: ProjectObject[];
  notifySuccess?: Notify;
  notifyError?: Notify;
  notifyInfo?: Notify;
}

export function useHeatCalcExcelInteractionModel({
  activeExcelCellPosition,
  appendExcelLocalRows,
  draftRowsById,
  editableExcelColumnKeys,
  excelCellDisplayValue,
  excelContextMenu,
  excelLocalRows,
  excelModeEnabled,
  excelRowIds,
  excelSelectionRange,
  selectedExcelCell,
  selectedExcelRows,
  selectedRowId,
  setActiveInlineCell,
  setDraftRowsById,
  setExcelContextMenu,
  setExcelLocalRows,
  setExcelSelectionRange,
  setSelectedExcelCell,
  sourceColumnMetas,
  syncWizardWithRecord,
  tableCellEditingEnabled,
  visibleTableObjects,
  notifySuccess = (message) => {
    void antdMessage.success(message);
  },
  notifyError = (message) => {
    void antdMessage.error(message);
  },
  notifyInfo = (message) => {
    void antdMessage.info(message);
  },
}: UseHeatCalcExcelInteractionModelOptions) {
  const startInlineCellEdit = useCallback((record: ProjectObject, columnKey: string) => {
    if (!tableCellEditingEnabled) return;
    if (excelModeEnabled) {
      setSelectedExcelCell({ objectId: record.id, columnKey });
      syncWizardWithRecord(record);
    }
    setActiveInlineCell({ objectId: record.id, columnKey });
  }, [
    excelModeEnabled,
    setActiveInlineCell,
    setSelectedExcelCell,
    syncWizardWithRecord,
    tableCellEditingEnabled,
  ]);

  const closeExcelContextMenu = useCallback(() => {
    setExcelContextMenu(null);
  }, [setExcelContextMenu]);

  const openExcelContextMenu = useCallback((event: ReactMouseEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setExcelContextMenu(clampExcelContextMenuPosition(
      event.clientX,
      event.clientY,
      window.innerWidth,
      window.innerHeight,
    ));
  }, [setExcelContextMenu]);

  const handleExcelRecordSelected = useCallback((record: ProjectObject) => {
    syncWizardWithRecord(record);
  }, [syncWizardWithRecord]);

  const {
    selectedPosition: selectedExcelPosition,
    clearSelectionState: clearExcelSelectionState,
    selectCellByPosition: selectExcelCellByPosition,
    setRangeSelection: setExcelRangeSelection,
    moveSelection: moveExcelSelection,
    selectAllCells: selectAllExcelCells,
    collapseSelectionToActiveCell,
    beginCellSelection: beginExcelCellSelection,
    extendCellSelection: extendExcelCellSelection,
    beginRowSelection: beginExcelRowSelection,
    extendRowSelection: extendExcelRowSelection,
    beginColumnSelection: beginExcelColumnSelection,
    extendColumnSelection: extendExcelColumnSelection,
    openCellContextMenu: openExcelCellContextMenu,
    openRowContextMenu: openExcelRowContextMenu,
    openRecordContextMenu: openExcelRecordContextMenu,
  } = useHeatCalcExcelSelection({
    excelModeEnabled,
    rows: visibleTableObjects,
    editableColumnKeys: editableExcelColumnKeys,
    selectedCell: selectedExcelCell,
    setSelectedCell: setSelectedExcelCell,
    selectionRange: excelSelectionRange,
    setSelectionRange: setExcelSelectionRange,
    setActiveInlineCell,
    focusedRowId: selectedRowId,
    onSelectRecord: handleExcelRecordSelected,
    openContextMenu: openExcelContextMenu,
  });

  const {
    copySelection: copyExcelSelection,
    clearSelection: clearExcelSelection,
    cutSelection: cutExcelSelection,
    applyPaste: applyExcelPaste,
    pasteFromClipboard: pasteExcelFromClipboard,
  } = useHeatCalcExcelClipboard({
    excelModeEnabled,
    rows: visibleTableObjects,
    sourceColumnMetas,
    draftRowsById,
    setDraftRowsById,
    selectionRange: excelSelectionRange,
    activeCell: activeExcelCellPosition,
    appendLocalRows: appendExcelLocalRows,
    cellDisplayValue: excelCellDisplayValue,
    notifySuccess,
    notifyError,
    notifyInfo,
  });

  const addExcelRowsBelowSelection = useCallback((count: number) => {
    const afterRowIndex = getExcelInsertAfterRowIndex(
      excelSelectionRange,
      activeExcelCellPosition,
      excelRowIds,
      editableExcelColumnKeys,
    );
    const insertAfterObjectId = afterRowIndex == null ? null : visibleTableObjects[afterRowIndex]?.id ?? null;
    const rows = appendExcelLocalRows(count, insertAfterObjectId);
    if (rows.length > 0) {
      window.setTimeout(() => {
        const firstRowIndex = visibleTableObjects.findIndex((object) => object.id === insertAfterObjectId) + 1;
        selectExcelCellByPosition(firstRowIndex > 0 ? firstRowIndex : visibleTableObjects.length, 0);
      }, 0);
    }
  }, [
    activeExcelCellPosition,
    appendExcelLocalRows,
    editableExcelColumnKeys,
    excelRowIds,
    excelSelectionRange,
    selectExcelCellByPosition,
    visibleTableObjects,
  ]);

  const resetSelectedExcelRows = useCallback(() => {
    const ids = selectedExcelRows.map(({ record }) => record.id);
    if (ids.length === 0) return;
    const nextModel = resetExcelRowsInModel({
      localRows: excelLocalRows,
      draftRowsById,
      rowIds: ids,
    });
    setActiveInlineCell(null);
    setDraftRowsById(nextModel.draftRowsById);
    setExcelLocalRows(nextModel.localRows);
    notifySuccess(ids.length > 1 ? 'Изменения строк сброшены' : 'Изменения строки сброшены');
  }, [
    draftRowsById,
    excelLocalRows,
    notifySuccess,
    selectedExcelRows,
    setActiveInlineCell,
    setDraftRowsById,
    setExcelLocalRows,
  ]);

  useHeatCalcExcelKeyboard({
    excelModeEnabled,
    selectedPosition: selectedExcelPosition,
    rows: visibleTableObjects,
    editableColumnKeys: editableExcelColumnKeys,
    contextMenuOpen: !!excelContextMenu,
    closeContextMenu: closeExcelContextMenu,
    collapseSelectionToActiveCell,
    moveSelection: moveExcelSelection,
    selectAllCells: selectAllExcelCells,
    copySelection: copyExcelSelection,
    applyPaste: applyExcelPaste,
    startInlineCellEdit,
  });

  useEffect(() => {
    if (!excelModeEnabled) {
      closeExcelContextMenu();
    }
  }, [closeExcelContextMenu, excelModeEnabled]);

  useEffect(() => {
    if (!excelContextMenu) return undefined;

    function handlePointerDown(event: PointerEvent) {
      if (event.target instanceof Element && event.target.closest('.excel-context-menu')) return;
      closeExcelContextMenu();
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      closeExcelContextMenu();
    }

    function handleScroll() {
      closeExcelContextMenu();
    }

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('scroll', handleScroll, true);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [closeExcelContextMenu, excelContextMenu]);

  return {
    selectedExcelCell,
    setSelectedExcelCell,
    excelSelectionRange,
    setExcelSelectionRange,
    excelContextMenu,
    selectedExcelPosition,
    clearExcelSelectionState,
    selectExcelCellByPosition,
    setExcelRangeSelection,
    moveExcelSelection,
    selectAllExcelCells,
    collapseSelectionToActiveCell,
    beginExcelCellSelection,
    extendExcelCellSelection,
    beginExcelRowSelection,
    extendExcelRowSelection,
    beginExcelColumnSelection,
    extendExcelColumnSelection,
    openExcelContextMenu,
    openExcelCellContextMenu,
    openExcelRowContextMenu,
    openExcelRecordContextMenu,
    closeExcelContextMenu,
    copyExcelSelection,
    clearExcelSelection,
    cutExcelSelection,
    applyExcelPaste,
    pasteExcelFromClipboard,
    addExcelRowsBelowSelection,
    resetSelectedExcelRows,
    startInlineCellEdit,
  };
}

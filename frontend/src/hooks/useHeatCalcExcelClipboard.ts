import { useCallback, useMemo, type Dispatch, type SetStateAction } from 'react';

import type { ProjectObject } from '@/types/project';
import { copyToClipboard, readFromClipboard } from '@/utils/clipboard';
import type { HeatCalcResolvedColumnMeta } from '@/utils/heatCalcTableColumns';
import {
  applyInlineCellDraft,
  getInlineEditFieldConfig,
  type DraftRowState,
  type DraftRowsById,
} from '@/utils/heatCalcInlineEdit';
import {
  buildExcelSelectionTsv,
  getExcelSelectedCellPositions,
  getExcelSelectionOrigin,
  getExcelSelectionRangeOrActiveCell,
  missingExcelRowsForPaste,
  parseExcelCellValue,
  parseSpreadsheetText,
  type ExcelCellPosition,
  type ExcelSelectionRange,
} from '@/utils/heatCalcExcelMode';
import { applyExcelDraftRowPatch, type ExcelLocalProjectObject } from '@/utils/heatCalcExcelRows';

interface UseHeatCalcExcelClipboardOptions {
  excelModeEnabled: boolean;
  rows: ProjectObject[];
  sourceColumnMetas: HeatCalcResolvedColumnMeta[];
  draftRowsById: DraftRowsById;
  setDraftRowsById: Dispatch<SetStateAction<DraftRowsById>>;
  selectionRange: ExcelSelectionRange | null;
  activeCell: ExcelCellPosition | null;
  appendLocalRows: (count: number, insertAfterObjectId?: string | null) => ExcelLocalProjectObject[];
  cellDisplayValue: (
    record: ProjectObject,
    columnKey: string,
    draftRow: DraftRowState | undefined,
  ) => string;
  notifySuccess: (message: string) => void;
  notifyError: (message: string) => void;
  notifyInfo: (message: string) => void;
}

export function useHeatCalcExcelClipboard({
  excelModeEnabled,
  rows,
  sourceColumnMetas,
  draftRowsById,
  setDraftRowsById,
  selectionRange,
  activeCell,
  appendLocalRows,
  cellDisplayValue,
  notifySuccess,
  notifyError,
  notifyInfo,
}: UseHeatCalcExcelClipboardOptions) {
  const rowIds = useMemo(() => rows.map((row) => row.id), [rows]);
  const rowsById = useMemo(() => new Map(rows.map((row) => [row.id, row])), [rows]);
  const columnKeys = useMemo(() => sourceColumnMetas.map((meta) => meta.key), [sourceColumnMetas]);

  const copySelection = useCallback(async () => {
    const range = getExcelSelectionRangeOrActiveCell(selectionRange, activeCell);
    if (!excelModeEnabled || !range) return false;
    const tsv = buildExcelSelectionTsv(range, rowIds, columnKeys, (rowId, columnKey) => {
      const row = rowsById.get(rowId);
      if (!row) return '';
      const draftRow = draftRowsById[row.id];
      return cellDisplayValue(row, columnKey, draftRow);
    });
    await copyToClipboard(tsv);
    notifySuccess('Скопировано');
    return true;
  }, [
    cellDisplayValue,
    columnKeys,
    draftRowsById,
    excelModeEnabled,
    notifySuccess,
    activeCell,
    rowsById,
    rowIds,
    selectionRange,
  ]);

  const clearSelection = useCallback(() => {
    const cells = getExcelSelectedCellPositions(
      selectionRange,
      activeCell,
      rowIds,
      columnKeys,
    );
    if (!excelModeEnabled || cells.length === 0) return false;

    let changedCells = 0;
    setDraftRowsById((current) => {
      let nextDraftRows: DraftRowsById = { ...current };
      cells.forEach(({ rowId, columnKey }) => {
        const record = rowsById.get(rowId);
        if (!record) return;
        if (record.object_type !== 'pipe' && record.object_type !== 'tank') return;
        const config = getInlineEditFieldConfig(record.object_type, columnKey);
        if (!config) return;
        const parsed = parseExcelCellValue(config, '');
        const draftRow = applyInlineCellDraft(nextDraftRows[record.id] ?? null, record, columnKey, parsed.value);
        if (!draftRow) return;
        changedCells += 1;
        nextDraftRows = applyExcelDraftRowPatch(nextDraftRows, record.id, draftRow);
      });
      return nextDraftRows;
    });
    if (changedCells > 0) notifySuccess(`Очищено ячеек: ${changedCells}`);
    return changedCells > 0;
  }, [
    activeCell,
    columnKeys,
    excelModeEnabled,
    notifySuccess,
    rowsById,
    rowIds,
    selectionRange,
    setDraftRowsById,
  ]);

  const cutSelection = useCallback(async () => {
    const copied = await copySelection();
    if (!copied) return;
    clearSelection();
  }, [clearSelection, copySelection]);

  const applyPaste = useCallback((text: string) => {
    const origin = getExcelSelectionOrigin(selectionRange, activeCell, rowIds, columnKeys);
    if (!excelModeEnabled || !origin) return;
    const pastedRows = parseSpreadsheetText(text);
    if (pastedRows.length === 0) return;
    const startRowIndex = rowIds.indexOf(origin.rowId);
    const startColumnIndex = columnKeys.indexOf(origin.columnKey);
    if (startRowIndex < 0 || startColumnIndex < 0) return;
    const appendedRows = appendLocalRows(
      missingExcelRowsForPaste(startRowIndex, pastedRows.length, rows.length),
    );
    const targetObjects = appendedRows.length > 0 ? [...rows, ...appendedRows] : rows;

    const affectedIds = new Set<string>();
    let changedCells = 0;
    let skippedCells = 0;
    let invalidCells = 0;

    let nextDraftRows: DraftRowsById = { ...draftRowsById };
    pastedRows.forEach((row, rowOffset) => {
      const record = targetObjects[startRowIndex + rowOffset];
      if (!record) {
        skippedCells += row.length;
        return;
      }
      row.forEach((rawValue, columnOffset) => {
        const columnKey = columnKeys[startColumnIndex + columnOffset];
        if (!columnKey) {
          skippedCells += 1;
          return;
        }
        if (record.object_type !== 'pipe' && record.object_type !== 'tank') {
          skippedCells += 1;
          return;
        }
        const config = getInlineEditFieldConfig(record.object_type, columnKey);
        if (!config) {
          skippedCells += 1;
          return;
        }
        const parsed = parseExcelCellValue(config, rawValue);
        const draftRow = applyInlineCellDraft(nextDraftRows[record.id] ?? null, record, columnKey, parsed.value);
        if (!draftRow) {
          skippedCells += 1;
          return;
        }
        const rowWithPasteError = parsed.error
          ? {
            ...draftRow,
            errors: {
              ...draftRow.errors,
              [config.fieldId]: parsed.error,
            },
          }
          : draftRow;
        if (Object.keys(rowWithPasteError.errors).length > 0) invalidCells += 1;
        const patchedDraftRows = applyExcelDraftRowPatch(nextDraftRows, record.id, rowWithPasteError);
        if (patchedDraftRows[record.id]) affectedIds.add(record.id);
        nextDraftRows = patchedDraftRows;
        changedCells += 1;
      });
    });
    setDraftRowsById(nextDraftRows);

    const summary = `Вставлено ячеек: ${changedCells}` +
      `${skippedCells > 0 ? `, пропущено: ${skippedCells}` : ''}`;
    if (invalidCells > 0) {
      notifyError(`${summary}. Исправьте ошибки перед сохранением.`);
      return;
    }
    if (affectedIds.size > 0) {
      notifySuccess(`${summary}. Сохраните изменения кнопкой «Сохранить».`);
    }
  }, [
    appendLocalRows,
    activeCell,
    columnKeys,
    draftRowsById,
    excelModeEnabled,
    notifyError,
    notifySuccess,
    rows,
    rowIds,
    selectionRange,
    setDraftRowsById,
  ]);

  const pasteFromClipboard = useCallback(async () => {
    try {
      const text = await readFromClipboard();
      if (!text) {
        notifyInfo('Буфер обмена пуст');
        return;
      }
      applyPaste(text);
    } catch (error) {
      notifyError(error instanceof Error ? error.message : 'Не удалось прочитать буфер обмена');
    }
  }, [applyPaste, notifyError, notifyInfo]);

  return {
    copySelection,
    clearSelection,
    cutSelection,
    applyPaste,
    pasteFromClipboard,
  };
}

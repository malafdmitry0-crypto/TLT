import { useCallback, type Dispatch, type SetStateAction } from 'react';

import type { ProjectObject } from '@/types/project';
import { copyToClipboard, readFromClipboard } from '@/utils/clipboard';
import type { HeatCalcResolvedColumnMeta } from '@/utils/heatCalcTableColumns';
import type { HeatCalcIndexedTableRow } from '@/utils/heatCalcTableFindability';
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
  visibleRows: HeatCalcIndexedTableRow<ProjectObject>[];
  sourceColumnMetas: HeatCalcResolvedColumnMeta[];
  draftRowsById: DraftRowsById;
  setDraftRowsById: Dispatch<SetStateAction<DraftRowsById>>;
  selectionRange: ExcelSelectionRange | null;
  selectedPosition: ExcelCellPosition | null;
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
  visibleRows,
  sourceColumnMetas,
  draftRowsById,
  setDraftRowsById,
  selectionRange,
  selectedPosition,
  appendLocalRows,
  cellDisplayValue,
  notifySuccess,
  notifyError,
  notifyInfo,
}: UseHeatCalcExcelClipboardOptions) {
  const copySelection = useCallback(async () => {
    const range = getExcelSelectionRangeOrActiveCell(selectionRange, selectedPosition);
    if (!excelModeEnabled || !range) return false;
    const tsv = buildExcelSelectionTsv(range, (rowIndex, columnIndex) => {
      const row = visibleRows[rowIndex];
      const meta = sourceColumnMetas[columnIndex];
      if (!row || !meta) return '';
      const draftRow = draftRowsById[row.record.id];
      return cellDisplayValue(row.record, meta.key, draftRow);
    });
    await copyToClipboard(tsv);
    notifySuccess('Скопировано');
    return true;
  }, [
    cellDisplayValue,
    draftRowsById,
    excelModeEnabled,
    notifySuccess,
    selectedPosition,
    selectionRange,
    sourceColumnMetas,
    visibleRows,
  ]);

  const clearSelection = useCallback(() => {
    const cells = getExcelSelectedCellPositions(
      selectionRange,
      selectedPosition,
      rows.length,
      sourceColumnMetas.length,
    );
    if (!excelModeEnabled || cells.length === 0) return false;

    let changedCells = 0;
    setDraftRowsById((current) => {
      let nextDraftRows: DraftRowsById = { ...current };
      cells.forEach(({ rowIndex, columnIndex }) => {
        const record = rows[rowIndex];
        const meta = sourceColumnMetas[columnIndex];
        if (!record || !meta) return;
        if (record.object_type !== 'pipe' && record.object_type !== 'tank') return;
        const config = getInlineEditFieldConfig(record.object_type, meta.key);
        if (!config) return;
        const parsed = parseExcelCellValue(config, '');
        const draftRow = applyInlineCellDraft(nextDraftRows[record.id] ?? null, record, meta.key, parsed.value);
        if (!draftRow) return;
        changedCells += 1;
        nextDraftRows = applyExcelDraftRowPatch(nextDraftRows, record.id, draftRow);
      });
      return nextDraftRows;
    });
    if (changedCells > 0) notifySuccess(`Очищено ячеек: ${changedCells}`);
    return changedCells > 0;
  }, [
    excelModeEnabled,
    notifySuccess,
    rows,
    selectedPosition,
    selectionRange,
    setDraftRowsById,
    sourceColumnMetas,
  ]);

  const cutSelection = useCallback(async () => {
    const copied = await copySelection();
    if (!copied) return;
    clearSelection();
  }, [clearSelection, copySelection]);

  const applyPaste = useCallback((text: string) => {
    const origin = getExcelSelectionOrigin(selectionRange, selectedPosition);
    if (!excelModeEnabled || !origin) return;
    const pastedRows = parseSpreadsheetText(text);
    if (pastedRows.length === 0) return;
    const startRowIndex = origin.rowIndex;
    const startColumnIndex = origin.columnIndex;
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
        const meta = sourceColumnMetas[startColumnIndex + columnOffset];
        if (!meta) {
          skippedCells += 1;
          return;
        }
        if (record.object_type !== 'pipe' && record.object_type !== 'tank') {
          skippedCells += 1;
          return;
        }
        const config = getInlineEditFieldConfig(record.object_type, meta.key);
        if (!config) {
          skippedCells += 1;
          return;
        }
        const parsed = parseExcelCellValue(config, rawValue);
        const draftRow = applyInlineCellDraft(nextDraftRows[record.id] ?? null, record, meta.key, parsed.value);
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
    draftRowsById,
    excelModeEnabled,
    notifyError,
    notifySuccess,
    rows,
    selectedPosition,
    selectionRange,
    setDraftRowsById,
    sourceColumnMetas,
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

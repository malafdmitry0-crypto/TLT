import {
  getDraftRowValidationErrors,
  type DraftRowState,
  type InlineEditFieldConfig,
} from '@/utils/heatCalcInlineEdit';
import {
  escapeTsvCell,
  formatExcelCellDisplay,
} from '@/utils/heatCalcExcelSpreadsheetCodec';
import {
  normalizeExcelSelectionRange,
  type ExcelSelectionRange,
} from '@/utils/heatCalcExcelSelectionModel';

export type { ParsedExcelCell } from '@/utils/heatCalcExcelSpreadsheetCodec';
export {
  parseSpreadsheetText,
  parseExcelNumber,
  parseExcelCellValue,
  formatExcelCellDisplay,
  isExcelEditableColumn,
  getExcelEditableColumnMetas,
} from '@/utils/heatCalcExcelSpreadsheetCodec';

export type {
  ExcelCellPosition,
  ExcelSelectionRange,
  NormalizedExcelSelectionRange,
  ExcelContextMenuDisabledState,
} from '@/utils/heatCalcExcelSelectionModel';

export {
  createExcelSelectionRange,
  normalizeExcelSelectionRange,
  getExcelSelectionRangeOrActiveCell,
  getExcelSelectedCellPositions,
  getExcelInsertAfterRowIndex,
  getExcelContextMenuDisabledState,
  isExcelCellInRange,
  isExcelCellActive,
  getExcelSelectionOrigin,
  getExcelSelectedRowIds,
} from '@/utils/heatCalcExcelSelectionModel';

export interface ExcelErrorFieldInfo {
  fieldId: string;
  columnKey?: string;
  label: string;
}

export interface ExcelErrorSourceRow {
  rowId: string;
  rowIndex: number;
  objectName?: string;
  draftRow?: DraftRowState;
  backendError?: string | null;
  backendValidationErrors?: Record<string, unknown> | null;
  templateRow?: boolean;
}

export interface ExcelTableErrorMessage {
  text: string;
  fieldId?: string;
  columnKey?: string;
}

export interface ExcelTableErrorItem {
  rowId: string;
  rowIndex: number;
  rowNumber: number;
  objectName?: string;
  messages: ExcelTableErrorMessage[];
}

export const EXCEL_NEW_ROW_PREFIX = 'new:';

const SERVICE_ERROR_FIELD_ALIASES: Record<string, { fieldId: string; message?: string }> = {
  climate_city: { fieldId: 'climate_key', message: 'выберите город в форме' },
  climate_region: { fieldId: 'climate_key', message: 'выберите город в форме' },
  ambient_temperature_source: {
    fieldId: 'ambient_temperature',
    message: 'укажите температуру вручную или выберите климат',
  },
  wind_speed_source: {
    fieldId: 'wind_speed',
    message: 'укажите скорость ветра вручную или выберите климат',
  },
  safety_factor_source: {
    fieldId: 'safety_factor',
    message: 'проверьте коэффициент запаса',
  },
};

export function isExcelNewRowId(id: string) {
  return id.startsWith(EXCEL_NEW_ROW_PREFIX);
}

export function missingExcelRowsForPaste(
  originRowIndex: number,
  pastedRowCount: number,
  currentRowCount: number,
) {
  return Math.max(0, originRowIndex + pastedRowCount - currentRowCount);
}

function hasMeaningfulExcelValue(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === 'string') return value.trim() !== '';
  if (Array.isArray(value)) return value.some(hasMeaningfulExcelValue);
  if (typeof value === 'object') return Object.values(value).some(hasMeaningfulExcelValue);
  return true;
}

export function isExcelDraftRowBlank(draftRow: DraftRowState | null | undefined) {
  if (!draftRow) return true;
  return !Object.values(draftRow.dirtyFields).some(hasMeaningfulExcelValue);
}

function labeledExcelErrorMessage(
  fieldId: string,
  message: string,
  fieldInfoById: Record<string, ExcelErrorFieldInfo>,
): ExcelTableErrorMessage {
  const alias = SERVICE_ERROR_FIELD_ALIASES[fieldId];
  const resolvedFieldId = alias?.fieldId ?? fieldId;
  const fieldInfo = fieldInfoById[resolvedFieldId] ?? fieldInfoById[fieldId];
  const label = fieldInfo?.label ?? resolvedFieldId;
  return {
    text: `${label}: ${alias?.message ?? message}`,
    fieldId: resolvedFieldId,
    columnKey: fieldInfo?.columnKey,
  };
}

function pushUniqueExcelErrorMessage(
  messages: ExcelTableErrorMessage[],
  nextMessage: ExcelTableErrorMessage,
) {
  const key = `${nextMessage.fieldId ?? ''}|${nextMessage.columnKey ?? ''}|${nextMessage.text}`;
  const exists = messages.some((message) => (
    `${message.fieldId ?? ''}|${message.columnKey ?? ''}|${message.text}` === key
  ));
  if (!exists) messages.push(nextMessage);
}

function backendFieldMessages(
  backendValidationErrors: Record<string, unknown> | null | undefined,
  fallbackMessage: string | null | undefined,
  fieldInfoById: Record<string, ExcelErrorFieldInfo>,
): ExcelTableErrorMessage[] {
  if (!backendValidationErrors) return [];
  const message = typeof backendValidationErrors.message === 'string' && backendValidationErrors.message.trim()
    ? backendValidationErrors.message.trim()
    : fallbackMessage?.trim() ?? 'Проверьте значение';
  const messages: ExcelTableErrorMessage[] = [];
  const field = backendValidationErrors.field;
  if (typeof field === 'string' && field.trim()) {
    pushUniqueExcelErrorMessage(
      messages,
      labeledExcelErrorMessage(field, message, fieldInfoById),
    );
  }

  const fields = backendValidationErrors.fields;
  if (fields && typeof fields === 'object' && !Array.isArray(fields)) {
    Object.entries(fields as Record<string, unknown>).forEach(([fieldId, fieldMessage]) => {
      const text = typeof fieldMessage === 'string' && fieldMessage.trim()
        ? fieldMessage
        : message;
      pushUniqueExcelErrorMessage(
        messages,
        labeledExcelErrorMessage(fieldId, text, fieldInfoById),
      );
    });
  }

  const missingFields = backendValidationErrors.missing_fields;
  if (Array.isArray(missingFields)) {
    missingFields.forEach((label) => {
      if (typeof label !== 'string' || !label.trim()) return;
      messages.push({ text: `${label.trim()}: заполните поле` });
    });
  }

  return messages;
}

export function buildExcelTableErrorItems(
  rows: ExcelErrorSourceRow[],
  fieldInfoById: Record<string, ExcelErrorFieldInfo>,
): ExcelTableErrorItem[] {
  return rows.flatMap((row) => {
    if (row.templateRow && isExcelDraftRowBlank(row.draftRow)) return [];
    const messages: ExcelTableErrorMessage[] = [];

    const draftErrors = row.draftRow ? getDraftRowValidationErrors(row.draftRow) : {};
    for (const [fieldId, message] of Object.entries(draftErrors)) {
      if (!message) continue;
      if (fieldId === '_row') {
        messages.push({ text: message, fieldId });
        continue;
      }
      messages.push(labeledExcelErrorMessage(fieldId, message, fieldInfoById));
    }

    const structuredBackendMessages = backendFieldMessages(
      row.backendValidationErrors,
      row.backendError,
      fieldInfoById,
    );
    messages.push(...structuredBackendMessages);
    if (structuredBackendMessages.length === 0 && row.backendError?.trim()) {
      messages.push({ text: row.backendError.trim() });
    }

    if (messages.length === 0) return [];
    return [{
      rowId: row.rowId,
      rowIndex: row.rowIndex,
      rowNumber: row.rowIndex + 1,
      objectName: row.objectName,
      messages,
    }];
  });
}

export function buildExcelSelectionTsv(
  range: ExcelSelectionRange,
  rowIds: readonly string[],
  columnKeys: readonly string[],
  cellValue: (rowId: string, columnKey: string, rowIndex: number, columnIndex: number) => unknown,
) {
  const normalized = normalizeExcelSelectionRange(range, rowIds, columnKeys);
  if (!normalized) return '';
  const lines: string[] = [];
  for (let rowIndex = normalized.top; rowIndex <= normalized.bottom; rowIndex += 1) {
    const cells: string[] = [];
    for (let columnIndex = normalized.left; columnIndex <= normalized.right; columnIndex += 1) {
      const rowId = rowIds[rowIndex];
      const columnKey = columnKeys[columnIndex];
      cells.push(escapeTsvCell(String(cellValue(rowId, columnKey, rowIndex, columnIndex) ?? '')));
    }
    lines.push(cells.join('\t'));
  }
  return lines.join('\n');
}

export function formatExcelDraftCellDisplay(
  config: InlineEditFieldConfig,
  draftRow: DraftRowState | undefined,
) {
  if (!draftRow || isExcelDraftRowBlank(draftRow)) {
    return '';
  }
  return formatExcelCellDisplay(config, draftRow.draftFormValues[config.fieldId]);
}

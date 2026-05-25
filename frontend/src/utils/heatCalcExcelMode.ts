import type { HeatCalcObjectType } from '@/types/project';
import { formatNumber } from '@/utils/formatters';
import {
  getInlineEditFieldConfig,
  getDraftRowValidationErrors,
  type DraftRowState,
  type InlineEditFieldConfig,
} from '@/utils/heatCalcInlineEdit';

export interface ParsedExcelCell {
  value: unknown;
  error: string | null;
}

export interface ExcelCellPosition {
  rowId: string;
  columnKey: string;
}

export interface ExcelSelectionRange {
  anchor: ExcelCellPosition;
  focus: ExcelCellPosition;
}

export interface NormalizedExcelSelectionRange {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

function cellIndex(
  cell: ExcelCellPosition,
  rowIds: readonly string[],
  columnKeys: readonly string[],
) {
  return {
    rowIndex: rowIds.indexOf(cell.rowId),
    columnIndex: columnKeys.indexOf(cell.columnKey),
  };
}

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

export interface ExcelContextMenuDisabledState {
  copy: boolean;
  cut: boolean;
  paste: boolean;
  clear: boolean;
  deleteRows: boolean;
  resetRows: boolean;
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

export function createExcelSelectionRange(
  anchor: ExcelCellPosition,
  focus: ExcelCellPosition = anchor,
): ExcelSelectionRange {
  return { anchor, focus };
}

export function normalizeExcelSelectionRange(
  range: ExcelSelectionRange,
  rowIds: readonly string[],
  columnKeys: readonly string[],
): NormalizedExcelSelectionRange | null {
  const anchor = cellIndex(range.anchor, rowIds, columnKeys);
  const focus = cellIndex(range.focus, rowIds, columnKeys);
  if (
    anchor.rowIndex < 0
    || focus.rowIndex < 0
    || anchor.columnIndex < 0
    || focus.columnIndex < 0
  ) {
    return null;
  }
  return {
    top: Math.min(anchor.rowIndex, focus.rowIndex),
    bottom: Math.max(anchor.rowIndex, focus.rowIndex),
    left: Math.min(anchor.columnIndex, focus.columnIndex),
    right: Math.max(anchor.columnIndex, focus.columnIndex),
  };
}

export function getExcelSelectionRangeOrActiveCell(
  range: ExcelSelectionRange | null | undefined,
  activeCell: ExcelCellPosition | null | undefined,
) {
  return range ?? (activeCell ? createExcelSelectionRange(activeCell) : null);
}

export function getExcelSelectedCellPositions(
  range: ExcelSelectionRange | null | undefined,
  activeCell: ExcelCellPosition | null | undefined,
  rowIds: readonly string[],
  columnKeys: readonly string[],
): ExcelCellPosition[] {
  const selectedRange = getExcelSelectionRangeOrActiveCell(range, activeCell);
  if (!selectedRange || rowIds.length === 0 || columnKeys.length === 0) return [];
  const normalized = normalizeExcelSelectionRange(selectedRange, rowIds, columnKeys);
  if (!normalized) return [];
  const top = Math.max(0, normalized.top);
  const bottom = Math.min(rowIds.length - 1, normalized.bottom);
  const left = Math.max(0, normalized.left);
  const right = Math.min(columnKeys.length - 1, normalized.right);
  if (top > bottom || left > right) return [];

  const cells: ExcelCellPosition[] = [];
  for (let rowIndex = top; rowIndex <= bottom; rowIndex += 1) {
    for (let columnIndex = left; columnIndex <= right; columnIndex += 1) {
      cells.push({
        rowId: rowIds[rowIndex],
        columnKey: columnKeys[columnIndex],
      });
    }
  }
  return cells;
}

export function getExcelInsertAfterRowIndex(
  range: ExcelSelectionRange | null | undefined,
  activeCell: ExcelCellPosition | null | undefined,
  rowIds: readonly string[],
  columnKeys: readonly string[],
) {
  if (rowIds.length <= 0) return null;
  const selectedRange = getExcelSelectionRangeOrActiveCell(range, activeCell);
  if (!selectedRange) return null;
  const normalized = normalizeExcelSelectionRange(selectedRange, rowIds, columnKeys);
  if (!normalized) return null;
  return Math.min(Math.max(normalized.bottom, 0), rowIds.length - 1);
}

export function getExcelContextMenuDisabledState(options: {
  hasSelection: boolean;
  selectedRowCount: number;
  dirtySelectedRowCount: number;
  clipboardReadAvailable: boolean;
}): ExcelContextMenuDisabledState {
  const selectionDisabled = !options.hasSelection;
  return {
    copy: selectionDisabled,
    cut: selectionDisabled,
    clear: selectionDisabled,
    paste: selectionDisabled || !options.clipboardReadAvailable,
    deleteRows: options.selectedRowCount === 0,
    resetRows: options.dirtySelectedRowCount === 0,
  };
}

export function isExcelCellInRange(
  range: ExcelSelectionRange | null | undefined,
  rowId: string,
  columnKey: string,
  rowIds: readonly string[],
  columnKeys: readonly string[],
) {
  if (!range) return false;
  const normalized = normalizeExcelSelectionRange(range, rowIds, columnKeys);
  if (!normalized) return false;
  const rowIndex = rowIds.indexOf(rowId);
  const columnIndex = columnKeys.indexOf(columnKey);
  if (rowIndex < 0 || columnIndex < 0) return false;
  return (
    rowIndex >= normalized.top
    && rowIndex <= normalized.bottom
    && columnIndex >= normalized.left
    && columnIndex <= normalized.right
  );
}

export function isExcelCellActive(
  active: ExcelCellPosition | null | undefined,
  rowId: string,
  columnKey: string,
) {
  return !!active && active.rowId === rowId && active.columnKey === columnKey;
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

export function getExcelSelectionOrigin(
  range: ExcelSelectionRange | null | undefined,
  fallback: ExcelCellPosition | null | undefined,
  rowIds: readonly string[],
  columnKeys: readonly string[],
): ExcelCellPosition | null {
  if (!range) return fallback ?? null;
  const normalized = normalizeExcelSelectionRange(range, rowIds, columnKeys);
  if (!normalized) return fallback ?? null;
  const rowId = rowIds[normalized.top];
  const columnKey = columnKeys[normalized.left];
  return rowId && columnKey ? { rowId, columnKey } : fallback ?? null;
}

export function getExcelSelectedRowIds(
  range: ExcelSelectionRange | null | undefined,
  active: ExcelCellPosition | null | undefined,
  rowIds: readonly string[],
  columnKeys: readonly string[],
) {
  if (rowIds.length <= 0) return [];
  if (!range) {
    if (!active) return [];
    return rowIds.includes(active.rowId) ? [active.rowId] : [];
  }
  const normalized = normalizeExcelSelectionRange(range, rowIds, columnKeys);
  if (!normalized) return [];
  const top = Math.min(Math.max(normalized.top, 0), rowIds.length - 1);
  const bottom = Math.min(Math.max(normalized.bottom, 0), rowIds.length - 1);
  if (bottom < top) return [];
  return rowIds.slice(top, bottom + 1);
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

function escapeTsvCell(value: string) {
  return /[\t\r\n"]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
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

export function parseSpreadsheetText(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        cell += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && char === '\t') {
      row.push(cell);
      cell = '';
      continue;
    }

    if (!inQuotes && (char === '\n' || char === '\r')) {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      if (char === '\r' && next === '\n') index += 1;
      continue;
    }

    cell += char;
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows.filter((items, index) => {
    if (index < rows.length - 1) return true;
    return items.some((item) => item !== '');
  });
}

function isBlankSpreadsheetMarker(value: string) {
  const normalized = value.trim();
  return normalized === '' || normalized === '—' || normalized === '–' || normalized === '-';
}

export function parseExcelNumber(value: string): number | null {
  if (isBlankSpreadsheetMarker(value)) return null;
  const normalized = value
    .trim()
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, '')
    .replace(',', '.');
  if (/^[=+@]/.test(normalized) || /^-[^\d.]/.test(normalized)) return Number.NaN;
  const numberValue = Number(normalized);
  return Number.isFinite(numberValue) ? numberValue : Number.NaN;
}

function normalizeText(value: unknown) {
  return String(value ?? '').trim().toLowerCase();
}

function parseSelectValue(config: InlineEditFieldConfig, rawValue: string): ParsedExcelCell {
  const value = rawValue.trim();
  if (isBlankSpreadsheetMarker(value)) return { value: '', error: null };
  const normalized = normalizeText(value);
  const option = config.field.options?.find((item) => (
    normalizeText(item.value) === normalized
    || normalizeText(item.label) === normalized
  ));
  if (!option) {
    return { value, error: 'Значение не найдено в списке' };
  }
  return { value: option.value, error: null };
}

export function parseExcelCellValue(
  config: InlineEditFieldConfig,
  rawValue: string,
): ParsedExcelCell {
  if (config.editor === 'number') {
    const value = parseExcelNumber(rawValue);
    if (Number.isNaN(value)) return { value: rawValue, error: 'Введите число' };
    return { value, error: null };
  }

  if (config.editor === 'select') {
    return parseSelectValue(config, rawValue);
  }

  return { value: rawValue.trim(), error: null };
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

function formatExcelNumber(value: number, maxDigits: number) {
  return formatNumber(value, maxDigits);
}

export function formatExcelCellDisplay(
  config: InlineEditFieldConfig,
  value: unknown,
) {
  if (value == null || value === '') return '';
  if (config.editor === 'select') {
    return config.field.options?.find((option) => option.value === value)?.label ?? String(value);
  }
  if (config.editor === 'number') {
    const numberValue = Number(value);
    if (!Number.isFinite(numberValue)) return '';
    return formatExcelNumber(numberValue, config.field.displayDigits ?? 0);
  }
  return String(value);
}

export function isExcelEditableColumn(objectType: HeatCalcObjectType, columnKey: string) {
  return getInlineEditFieldConfig(objectType, columnKey) != null;
}

export function getExcelEditableColumnMetas<T extends { key: string }>(
  objectType: HeatCalcObjectType,
  columns: readonly T[],
): T[] {
  return columns.filter((column) => isExcelEditableColumn(objectType, column.key));
}

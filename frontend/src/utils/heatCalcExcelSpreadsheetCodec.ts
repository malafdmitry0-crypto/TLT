/**
 * Spreadsheet TSV parse/format codec for heat-calc Excel mode.
 * Pure cell/value conversion — selection geometry stays in heatCalcExcelMode.
 */
import type { HeatCalcObjectType } from '@/types/project';
import { formatNumber } from '@/utils/formatters';
import {
  getInlineEditFieldConfig,
  type InlineEditFieldConfig,
} from '@/utils/heatCalcInlineEdit';

export interface ParsedExcelCell {
  value: unknown;
  error: string | null;
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

export function escapeTsvCell(value: string) {
  return /[\t\r\n"]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

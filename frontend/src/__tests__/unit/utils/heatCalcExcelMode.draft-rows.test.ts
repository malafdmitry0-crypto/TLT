import { describe, expect, it } from 'vitest';
import {
  formatExcelCellDisplay,
  formatExcelDraftCellDisplay,
  isExcelDraftRowBlank,
  isExcelNewRowId,
  missingExcelRowsForPaste,
} from '@/utils/heatCalcExcelMode';
import { draftRow, fieldConfig, numberFieldConfig } from './heatCalcExcelMode.test-harness';

describe('heatCalcExcelMode — draft / temporary rows', () => {

  it('распознаёт временные строки Excel-режима', () => {
    expect(isExcelNewRowId('new:pipe:1')).toBe(true);
    expect(isExcelNewRowId('pipe:1')).toBe(false);
  });

  it('считает, сколько временных строк нужно добавить под вставку', () => {
    expect(missingExcelRowsForPaste(3, 2, 10)).toBe(0);
    expect(missingExcelRowsForPaste(8, 5, 10)).toBe(3);
  });

  it('оставляет полностью пустую временную Excel-строку пустой', () => {
    const config = fieldConfig('text');
    expect(formatExcelDraftCellDisplay(config, undefined)).toBe('');
    expect(formatExcelDraftCellDisplay(config, draftRow({
      draftFormValues: { x: 'Труба 1' },
      dirtyFields: {},
    }))).toBe('');
  });

  it('показывает дефолты формы во временной Excel-строке после ввода любой ячейки', () => {
    const config = fieldConfig('text');
    expect(formatExcelDraftCellDisplay(config, draftRow({
      draftFormValues: { x: 'Труба 1', y: 108 },
      dirtyFields: { y: 108 },
    }))).toBe('Труба 1');
  });

  it('показывает label select-значения во временной Excel-строке', () => {
    expect(formatExcelDraftCellDisplay(fieldConfig('select'), draftRow({
      draftFormValues: { x: 'outdoor' },
      dirtyFields: { x: 'outdoor' },
    }))).toBe('Открыто');
  });

  it('показывает пустые Excel-ячейки пустыми, без табличного прочерка', () => {
    expect(formatExcelCellDisplay(numberFieldConfig(1), null)).toBe('');
    expect(formatExcelCellDisplay(numberFieldConfig(1), undefined)).toBe('');
    expect(formatExcelCellDisplay(numberFieldConfig(1), '')).toBe('');
    expect(formatExcelCellDisplay(numberFieldConfig(1), 123)).toBe('123,0');
    expect(formatExcelCellDisplay(numberFieldConfig(1), 10.5)).toBe('10,5');
    expect(formatExcelCellDisplay(numberFieldConfig(2), 1.1)).toBe('1,10');
    expect(formatExcelCellDisplay(numberFieldConfig(0), 123)).toBe('123');
    expect(formatExcelCellDisplay(fieldConfig('select'), '')).toBe('');
  });

  it('считает новую Excel-строку пустой, если пользователь не ввёл данные', () => {
    expect(isExcelDraftRowBlank(undefined)).toBe(true);
    expect(isExcelDraftRowBlank(draftRow({ dirtyFields: {} }))).toBe(true);
    expect(isExcelDraftRowBlank(draftRow({ dirtyFields: { x: '' } }))).toBe(true);
    expect(isExcelDraftRowBlank(draftRow({ dirtyFields: { x: 0 } }))).toBe(false);
    expect(isExcelDraftRowBlank(draftRow({ dirtyFields: { x: 'DN100' } }))).toBe(false);
  });
});

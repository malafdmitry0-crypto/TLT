// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  parseExcelCellValue,
  parseExcelNumber,
  parseSpreadsheetText,
} from '@/utils/heatCalcExcelMode';
import { fieldConfig } from './heatCalcExcelMode.test-harness';

describe('heatCalcExcelMode — parse & map', () => {

  it('парсит TSV из Excel с табами, переносами и кавычками', () => {
    expect(parseSpreadsheetText('1\t2\n"3\t4"\t5')).toEqual([
      ['1', '2'],
      ['3\t4', '5'],
    ]);
  });

  it('парсит числа с запятой и пробелами', () => {
    expect(parseExcelNumber('10,5')).toBe(10.5);
    expect(parseExcelNumber('10.5')).toBe(10.5);
    expect(parseExcelNumber('1 000,25')).toBe(1000.25);
    expect(parseExcelNumber('')).toBeNull();
    expect(parseExcelNumber('—')).toBeNull();
    expect(parseExcelNumber('-')).toBeNull();
  });

  it('не принимает формулы как числа', () => {
    expect(Number.isNaN(parseExcelNumber('=1+1'))).toBe(true);
    expect(Number.isNaN(parseExcelNumber('@SUM(A1)'))).toBe(true);
  });

  it('мапит select по label и value', () => {
    expect(parseExcelCellValue(fieldConfig('select'), 'Открыто')).toEqual({
      value: 'outdoor',
      error: null,
    });
    expect(parseExcelCellValue(fieldConfig('select'), 'underground')).toEqual({
      value: 'underground',
      error: null,
    });
    expect(parseExcelCellValue(fieldConfig('select'), '—')).toEqual({
      value: '',
      error: null,
    });
  });

  it('возвращает ошибку для неизвестного select-значения', () => {
    expect(parseExcelCellValue(fieldConfig('select'), 'нет такого')).toEqual({
      value: 'нет такого',
      error: 'Значение не найдено в списке',
    });
  });

});

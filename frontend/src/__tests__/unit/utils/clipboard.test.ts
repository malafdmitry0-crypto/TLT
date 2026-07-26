// @vitest-environment node
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  buildTsv,
  copyToClipboard,
  parseTsv,
  readFromClipboard,
  safeSpreadsheetText,
} from '@/utils/clipboard';

describe('clipboard', () => {
  afterEach(() => vi.restoreAllMocks());

  it('copyToClipboard вызывает navigator.clipboard.writeText', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    await copyToClipboard('hello');
    expect(writeText).toHaveBeenCalledWith('hello');
  });

  it('copyToClipboard отвергает если API недоступен', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: undefined,
    });
    await expect(copyToClipboard('x')).rejects.toThrow(/недоступен/);
  });

  it('readFromClipboard возвращает текст', async () => {
    const readText = vi.fn().mockResolvedValue('из буфера');
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { readText },
    });
    expect(await readFromClipboard()).toBe('из буфера');
  });

  it('readFromClipboard кидает если API недоступен', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: undefined,
    });
    await expect(readFromClipboard()).rejects.toThrow(/недоступен/);
  });

  describe('parseTsv', () => {
    it('делит на табах, сохраняет колонки', () => {
      expect(parseTsv('a\tb\tc')).toEqual([['a', 'b', 'c']]);
    });

    it('игнорирует пустые строки', () => {
      expect(parseTsv('a\tb\n\nc\td\n')).toEqual([
        ['a', 'b'],
        ['c', 'd'],
      ]);
    });

    it('поддерживает CRLF', () => {
      expect(parseTsv('a\tb\r\nc\td')).toEqual([
        ['a', 'b'],
        ['c', 'd'],
      ]);
    });

    it('пустой ввод → пустой массив', () => {
      expect(parseTsv('')).toEqual([]);
    });
  });

  describe('spreadsheet safety', () => {
    it('экранирует текст, который spreadsheet-клиенты могут выполнить как формулу', () => {
      expect(safeSpreadsheetText('=cmd')).toBe("'=cmd");
      expect(safeSpreadsheetText(' +SUM(1,2)')).toBe("' +SUM(1,2)");
      expect(safeSpreadsheetText('-2+3')).toBe("'-2+3");
      expect(safeSpreadsheetText('@SUM(1,2)')).toBe("'@SUM(1,2)");
      expect(safeSpreadsheetText('plain')).toBe('plain');
    });

    it('buildTsv экранирует опасные ячейки перед вставкой в Excel', () => {
      expect(buildTsv([['name', '=HYPERLINK("https://x")']])).toBe(
        'name\t\'=HYPERLINK("https://x")',
      );
    });
  });
});

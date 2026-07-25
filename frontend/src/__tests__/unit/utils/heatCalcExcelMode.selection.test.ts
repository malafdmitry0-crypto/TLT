import { describe, expect, it } from 'vitest';
import {
  buildExcelSelectionTsv,
  createExcelSelectionRange,
  getExcelContextMenuDisabledState,
  getExcelInsertAfterRowIndex,
  getExcelSelectedCellPositions,
  getExcelSelectedRowIds,
  getExcelSelectionOrigin,
  isExcelCellInRange,
  normalizeExcelSelectionRange,
} from '@/utils/heatCalcExcelMode';

describe('heatCalcExcelMode — selection / copy / paste geometry', () => {
  const rowIds = ['r0', 'r1', 'r2', 'r3', 'r4', 'r5'];
  const columnKeys = ['c0', 'c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7'];

  it('нормализует Excel-range независимо от направления выделения', () => {
    const range = createExcelSelectionRange(
      { rowId: 'r4', columnKey: 'c3' },
      { rowId: 'r1', columnKey: 'c0' },
    );

    expect(normalizeExcelSelectionRange(range, rowIds, columnKeys)).toEqual({
      top: 1,
      bottom: 4,
      left: 0,
      right: 3,
    });
    expect(isExcelCellInRange(range, 'r2', 'c1', rowIds, columnKeys)).toBe(true);
    expect(isExcelCellInRange(range, 'r0', 'c1', rowIds, columnKeys)).toBe(false);
  });

  it('хранит выделение по rowId и пересчитывает индексы из текущей модели строк', () => {
    const range = createExcelSelectionRange(
      { rowId: 'r4', columnKey: 'c3' },
      { rowId: 'r2', columnKey: 'c1' },
    );
    const reorderedRowIds = ['r0', 'r4', 'r3', 'r2', 'r1'];

    expect(normalizeExcelSelectionRange(range, reorderedRowIds, columnKeys)).toEqual({
      top: 1,
      bottom: 3,
      left: 1,
      right: 3,
    });
    expect(getExcelSelectedRowIds(range, null, reorderedRowIds, columnKeys)).toEqual(['r4', 'r3', 'r2']);
  });

  it('берёт левый верхний угол выделения как origin для вставки', () => {
    expect(getExcelSelectionOrigin(
      createExcelSelectionRange(
        { rowId: 'r5', columnKey: 'c7' },
        { rowId: 'r3', columnKey: 'c2' },
      ),
      null,
      rowIds,
      columnKeys,
    )).toEqual({ rowId: 'r3', columnKey: 'c2' });
  });

  it('возвращает строку активной ячейки для удаления без диапазона', () => {
    expect(getExcelSelectedRowIds(null, { rowId: 'r2', columnKey: 'c4' }, rowIds, columnKeys)).toEqual(['r2']);
    expect(getExcelSelectedRowIds(null, null, rowIds, columnKeys)).toEqual([]);
  });

  it('возвращает все строки выделенного прямоугольника для удаления', () => {
    expect(getExcelSelectedRowIds(
      createExcelSelectionRange(
        { rowId: 'r4', columnKey: 'c3' },
        { rowId: 'r2', columnKey: 'c1' },
      ),
      null,
      rowIds,
      columnKeys,
    )).toEqual(['r2', 'r3', 'r4']);
  });

  it('возвращает все редактируемые ячейки выделенного прямоугольника', () => {
    expect(getExcelSelectedCellPositions(
      createExcelSelectionRange(
        { rowId: 'r1', columnKey: 'c2' },
        { rowId: 'r2', columnKey: 'c3' },
      ),
      null,
      rowIds,
      columnKeys,
    )).toEqual([
      { rowId: 'r1', columnKey: 'c2' },
      { rowId: 'r1', columnKey: 'c3' },
      { rowId: 'r2', columnKey: 'c2' },
      { rowId: 'r2', columnKey: 'c3' },
    ]);
  });

  it('берёт активную ячейку как выделение для контекстных команд', () => {
    expect(getExcelSelectedCellPositions(
      null,
      { rowId: 'r2', columnKey: 'c1' },
      rowIds,
      columnKeys,
    )).toEqual([{ rowId: 'r2', columnKey: 'c1' }]);
  });

  it('возвращает нижнюю строку выделения для добавления строк ниже', () => {
    expect(getExcelInsertAfterRowIndex(
      createExcelSelectionRange(
        { rowId: 'r4', columnKey: 'c0' },
        { rowId: 'r2', columnKey: 'c2' },
      ),
      null,
      rowIds,
      columnKeys,
    )).toBe(4);
    expect(getExcelInsertAfterRowIndex(null, { rowId: 'r3', columnKey: 'c0' }, rowIds, columnKeys)).toBe(3);
  });

  it('считает disabled-состояния контекстного меню Excel', () => {
    expect(getExcelContextMenuDisabledState({
      hasSelection: false,
      selectedRowCount: 0,
      dirtySelectedRowCount: 0,
      clipboardReadAvailable: true,
    })).toMatchObject({
      copy: true,
      cut: true,
      clear: true,
      paste: true,
      deleteRows: true,
      resetRows: true,
    });
    expect(getExcelContextMenuDisabledState({
      hasSelection: true,
      selectedRowCount: 2,
      dirtySelectedRowCount: 1,
      clipboardReadAvailable: false,
    })).toMatchObject({
      copy: false,
      cut: false,
      clear: false,
      paste: true,
      deleteRows: false,
      resetRows: false,
    });
  });

  it('сбрасывает выделение с устаревшим rowId вместо привязки к DOM-индексу', () => {
    expect(getExcelSelectedRowIds(
      createExcelSelectionRange(
        { rowId: 'missing-before', columnKey: 'c0' },
        { rowId: 'r2', columnKey: 'c0' },
      ),
      null,
      rowIds,
      columnKeys,
    )).toEqual([]);
  });

  it('строит copy-модель для строк, которых может не быть в DOM', () => {
    const largeRowIds = Array.from({ length: 150 }, (_, index) => `row-${index}`);
    const range = createExcelSelectionRange(
      { rowId: 'row-120', columnKey: 'c1' },
      { rowId: 'row-121', columnKey: 'c2' },
    );

    expect(getExcelSelectedCellPositions(range, null, largeRowIds, columnKeys)).toEqual([
      { rowId: 'row-120', columnKey: 'c1' },
      { rowId: 'row-120', columnKey: 'c2' },
      { rowId: 'row-121', columnKey: 'c1' },
      { rowId: 'row-121', columnKey: 'c2' },
    ]);
    expect(buildExcelSelectionTsv(
      range,
      largeRowIds,
      columnKeys,
      (rowId, columnKey) => `${rowId}:${columnKey}`,
    ))
      .toBe('row-120:c1\trow-120:c2\nrow-121:c1\trow-121:c2');
  });

  it('собирает TSV по выделенному прямоугольнику', () => {
    const range = createExcelSelectionRange(
      { rowId: 'r0', columnKey: 'c1' },
      { rowId: 'r1', columnKey: 'c2' },
    );

    expect(buildExcelSelectionTsv(
      range,
      rowIds,
      columnKeys,
      (_rowId, _columnKey, rowIndex, columnIndex) => `${rowIndex}:${columnIndex}`,
    ))
      .toBe('0:1\t0:2\n1:1\t1:2');
  });
});

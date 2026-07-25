import { describe, expect, it } from 'vitest';
import {
  buildExcelSelectionTsv,
  buildExcelTableErrorItems,
  createExcelSelectionRange,
  formatExcelCellDisplay,
  formatExcelDraftCellDisplay,
  getExcelContextMenuDisabledState,
  getExcelEditableColumnMetas,
  getExcelInsertAfterRowIndex,
  getExcelSelectedCellPositions,
  getExcelSelectedRowIds,
  getExcelSelectionOrigin,
  isExcelCellInRange,
  isExcelDraftRowBlank,
  isExcelNewRowId,
  missingExcelRowsForPaste,
  normalizeExcelSelectionRange,
  parseExcelCellValue,
  parseExcelNumber,
  parseSpreadsheetText,
} from '@/utils/heatCalcExcelMode';
import type { InlineEditFieldConfig } from '@/utils/heatCalcInlineEdit';
import type { DraftRowState } from '@/utils/heatCalcInlineEdit';
import {
  getAllTableColumnMetas,
  getDefaultTableColumnSettings,
  getVisibleTableColumnMetas,
  moveTableColumnToOrder,
  setTableColumnVisibility,
} from '@/utils/heatCalcTableColumns';

function fieldConfig(editor: InlineEditFieldConfig['editor']): InlineEditFieldConfig {
  return {
    columnKey: 'x',
    objectType: 'pipe',
    fieldId: 'x',
    editor,
    field: {
      id: 'x',
      objectTypes: ['pipe'],
      tableColumnKeys: { pipe: 'x' },
      label: 'X',
      editor,
      options: editor === 'select'
        ? [
          { label: 'Открыто', value: 'outdoor' },
          { label: 'Подземно', value: 'underground' },
        ]
        : undefined,
    },
  };
}

function numberFieldConfig(displayDigits = 0): InlineEditFieldConfig {
  const config = fieldConfig('number');
  return {
    ...config,
    field: {
      ...config.field,
      displayDigits,
    },
  };
}

function draftRow(overrides: Partial<DraftRowState>): DraftRowState {
  return {
    objectId: 'new:pipe:1',
    objectType: 'pipe',
    baseVersion: 0,
    baseFormValues: {},
    draftFormValues: {},
    dirtyFields: {},
    errors: {},
    saving: false,
    sourceParams: {},
    ...overrides,
  };
}

describe('heatCalcExcelMode', () => {
  const rowIds = ['r0', 'r1', 'r2', 'r3', 'r4', 'r5'];
  const columnKeys = ['c0', 'c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7'];

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

  it('оставляет в Excel-режиме только заполняемые колонки трубы', () => {
    const columns = getAllTableColumnMetas('pipe', getDefaultTableColumnSettings());
    const keys = getExcelEditableColumnMetas('pipe', columns).map((column) => column.key);

    expect(keys).toContain('pipe_outer_diameter');
    expect(keys).toContain('pipe_length');
    expect(keys).toContain('supply_voltage');
    expect(keys).not.toContain('index');
    expect(keys).not.toContain('heat_loss_status');
    expect(keys).not.toContain('heat_loss_per_meter');
    expect(keys).not.toContain('total_heat_loss');
    expect(keys).not.toContain('pipe_dn');
  });

  it('оставляет в Excel-режиме только заполняемые колонки резервуара', () => {
    const columns = getAllTableColumnMetas('tank', getDefaultTableColumnSettings());
    const keys = getExcelEditableColumnMetas('tank', columns).map((column) => column.key);

    expect(keys).toContain('tank_diameter');
    expect(keys).toContain('tank_height');
    expect(keys).not.toContain('index');
    expect(keys).not.toContain('heat_loss_status');
    expect(keys).not.toContain('heat_loss_per_m2');
    expect(keys).not.toContain('total_heat_loss');
    expect(keys).not.toContain('tank_shape');
  });

  it('берёт скрытые пользователем editable-колонки в Excel-режим без изменения обычной таблицы', () => {
    const settings = setTableColumnVisibility(
      moveTableColumnToOrder(getDefaultTableColumnSettings(), 'pipe', 'pipe_length', 3),
      'pipe',
      'pipe_length',
      false,
    );
    const normalKeys = getVisibleTableColumnMetas('pipe', settings).map((column) => column.key);
    const excelKeys = getExcelEditableColumnMetas('pipe', getAllTableColumnMetas('pipe', settings))
      .map((column) => column.key);

    expect(normalKeys).not.toContain('pipe_length');
    expect(excelKeys).toContain('pipe_length');
  });

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

  it('собирает локальные и backend-ошибки Excel-строк', () => {
    expect(buildExcelTableErrorItems([
      {
        rowId: '1',
        rowIndex: 0,
        objectName: 'P01',
        draftRow: draftRow({
          objectId: 'pipe-1',
          objectType: 'pipe',
          errors: { pipe_length: 'Введите число' },
          dirtyFields: { pipe_length: 'abc' },
        }),
      },
      {
        rowId: '2',
        rowIndex: 1,
        objectName: 'P02',
        backendError: 'Не выбран материал изоляции',
      },
    ], {
      pipe_length: { fieldId: 'pipe_length', columnKey: 'pipe_length', label: 'Длина' },
    })).toEqual([
      {
        rowId: '1',
        rowIndex: 0,
        rowNumber: 1,
        objectName: 'P01',
        messages: [{ text: 'Длина: Введите число', fieldId: 'pipe_length', columnKey: 'pipe_length' }],
      },
      {
        rowId: '2',
        rowIndex: 1,
        rowNumber: 2,
        objectName: 'P02',
        messages: [{ text: 'Не выбран материал изоляции' }],
      },
    ]);
  });

  it('показывает поле для structured backend-ошибки Excel-строки', () => {
    expect(buildExcelTableErrorItems([
      {
        rowId: '1',
        rowIndex: 0,
        objectName: 'P01',
        backendError: 'Введите число',
        backendValidationErrors: {
          message: 'Введите число',
          field: 'pipe_length',
        },
      },
    ], {
      pipe_length: {
        fieldId: 'pipe_length',
        columnKey: 'pipe_length',
        label: 'Длина трубопровода',
      },
    })).toEqual([
      {
        rowId: '1',
        rowIndex: 0,
        rowNumber: 1,
        objectName: 'P01',
        messages: [{
          text: 'Длина трубопровода: Введите число',
          fieldId: 'pipe_length',
          columnKey: 'pipe_length',
        }],
      },
    ]);
  });

  it('не показывает устаревшую ошибку Excel-строки, если текущее значение валидно', () => {
    expect(buildExcelTableErrorItems([
      {
        rowId: '1',
        rowIndex: 0,
        objectName: 'P01',
        draftRow: draftRow({
          objectId: 'pipe-1',
          objectType: 'pipe',
          draftFormValues: { outer_diameter_mm: 114 },
          dirtyFields: { outer_diameter_mm: 114 },
          errors: { pipe_outer_diameter: 'Введите число' },
        }),
      },
    ], {
      outer_diameter_mm: {
        fieldId: 'outer_diameter_mm',
        columnKey: 'pipe_outer_diameter',
        label: 'Диаметр',
      },
    })).toEqual([]);
  });

  it('мапит служебные backend-ошибки на видимые поля формы', () => {
    expect(buildExcelTableErrorItems([
      {
        rowId: '1',
        rowIndex: 0,
        objectName: 'P01',
        backendError: 'Введите число',
        backendValidationErrors: {
          message: 'Введите число',
          fields: {
            climate_city: 'Введите число',
            climate_region: 'Введите число',
            ambient_temperature_source: 'Введите число',
          },
        },
      },
    ], {
      climate_key: {
        fieldId: 'climate_key',
        label: 'Климат',
      },
      ambient_temperature: {
        fieldId: 'ambient_temperature',
        columnKey: 'ambient_temperature',
        label: 'T окр.',
      },
    })).toEqual([
      {
        rowId: '1',
        rowIndex: 0,
        rowNumber: 1,
        objectName: 'P01',
        messages: [
          {
            text: 'Климат: выберите город в форме',
            fieldId: 'climate_key',
            columnKey: undefined,
          },
          {
            text: 'T окр.: укажите температуру вручную или выберите климат',
            fieldId: 'ambient_temperature',
            columnKey: 'ambient_temperature',
          },
        ],
      },
    ]);
  });

  it('не добавляет пустую шаблонную строку в список ошибок', () => {
    expect(buildExcelTableErrorItems([
      {
        rowId: 'new:pipe:1',
        rowIndex: 3,
        templateRow: true,
        draftRow: draftRow({ dirtyFields: {}, errors: {} }),
      },
    ], {})).toEqual([]);
  });
});

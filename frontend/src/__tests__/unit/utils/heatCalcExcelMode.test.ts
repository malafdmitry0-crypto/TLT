import { describe, expect, it } from 'vitest';
import {
  buildExcelSelectionTsv,
  buildExcelTableErrorItems,
  createExcelSelectionRange,
  formatExcelCellDisplay,
  formatExcelDraftCellDisplay,
  getExcelEditableColumnMetas,
  getExcelSelectedRowIndexes,
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
      { rowIndex: 4, columnIndex: 3 },
      { rowIndex: 1, columnIndex: 0 },
    );

    expect(normalizeExcelSelectionRange(range)).toEqual({
      top: 1,
      bottom: 4,
      left: 0,
      right: 3,
    });
    expect(isExcelCellInRange(range, 2, 1)).toBe(true);
    expect(isExcelCellInRange(range, 0, 1)).toBe(false);
  });

  it('берёт левый верхний угол выделения как origin для вставки', () => {
    expect(getExcelSelectionOrigin(
      createExcelSelectionRange(
        { rowIndex: 5, columnIndex: 7 },
        { rowIndex: 3, columnIndex: 2 },
      ),
      null,
    )).toEqual({ rowIndex: 3, columnIndex: 2 });
  });

  it('возвращает строку активной ячейки для удаления без диапазона', () => {
    expect(getExcelSelectedRowIndexes(null, { rowIndex: 2, columnIndex: 4 }, 10)).toEqual([2]);
    expect(getExcelSelectedRowIndexes(null, null, 10)).toEqual([]);
  });

  it('возвращает все строки выделенного прямоугольника для удаления', () => {
    expect(getExcelSelectedRowIndexes(
      createExcelSelectionRange(
        { rowIndex: 4, columnIndex: 3 },
        { rowIndex: 2, columnIndex: 1 },
      ),
      null,
      10,
    )).toEqual([2, 3, 4]);
  });

  it('ограничивает выделенные строки границами таблицы', () => {
    expect(getExcelSelectedRowIndexes(
      createExcelSelectionRange(
        { rowIndex: -2, columnIndex: 0 },
        { rowIndex: 12, columnIndex: 0 },
      ),
      null,
      3,
    )).toEqual([0, 1, 2]);
  });

  it('собирает TSV по выделенному прямоугольнику', () => {
    const range = createExcelSelectionRange(
      { rowIndex: 0, columnIndex: 1 },
      { rowIndex: 1, columnIndex: 2 },
    );

    expect(buildExcelSelectionTsv(range, (rowIndex, columnIndex) => `${rowIndex}:${columnIndex}`))
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

  it('показывает во временной Excel-строке только реально введённые значения', () => {
    const config = fieldConfig('text');
    expect(formatExcelDraftCellDisplay(config, undefined)).toBe('');
    expect(formatExcelDraftCellDisplay(config, draftRow({
      draftFormValues: { x: 'Труба 1' },
      dirtyFields: {},
    }))).toBe('');
    expect(formatExcelDraftCellDisplay(config, draftRow({
      draftFormValues: { x: 'Труба 1' },
      dirtyFields: { x: 'Труба 1' },
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
    expect(formatExcelCellDisplay(numberFieldConfig(1), 10.5)).toBe('10,5');
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

// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  buildExcelTableErrorItems,
} from '@/utils/heatCalcExcelMode';
import { draftRow } from './heatCalcExcelMode.test-harness';

describe('heatCalcExcelMode — excel row errors', () => {

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

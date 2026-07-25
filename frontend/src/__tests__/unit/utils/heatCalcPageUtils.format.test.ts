/* eslint-disable @typescript-eslint/no-unused-vars -- scenario split keeps shared preamble */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  ObjectQueryCapabilities,
  ObjectQueryFieldCapability,
  ObjectQueryFilterOp,
  ProjectObject,
} from '@/types/project';
import {
  backendFilterFromColumnFilter,
  booleanChoiceLabel,
  buildObjectQueryRequest,
  climateBasisLabel,
  countParamValue,
  draftErrorMessages,
  draftRowFingerprint,
  environmentLabel,
  escapeTableRowKey,
  filterKindForColumn,
  formatDeltaTemperature,
  formatParamMetersAsMm,
  formatParamNumber,
  formatParamText,
  formatResultOrParamNumber,
  formatResultNumber,
  heatLossCalcStatus,
  heatLossErrorText,
  heatLossStatusLabel,
  insulationLayerConductivity,
  insulationLayerCount,
  insulationLayerMaterial,
  insulationLayerThickness,
  isBatchHeatLossResponse,
  isColumnApplicableToObjectType,
  lambdaModeLabel,
  mmParam,
  normalizeGlideCellAlign,
  placementLabel,
  sourceSuffix,
  sourceText,
  tankDimensions,
  tankShapeLabel,
  toInputNumberValue,
  uniqueErrorMessages,
  zoneLabel,
} from '@/utils/heatCalcPageUtils';
import type { HeatCalcTableViewState } from '@/utils/heatCalcTableFindability';
import type { DraftRowState } from '@/utils/heatCalcInlineEdit';

function makeObject(overrides: Partial<ProjectObject> = {}): ProjectObject {
  return {
    id: 'o1',
    project_id: 'p1',
    object_type: 'pipe',
    sort_order: 1,
    params: {},
    results: null,
    is_valid: false,
    validation_errors: null,
    created_at: '2026-05-17T00:00:00Z',
    updated_at: '2026-05-17T00:00:00Z',
    ...overrides,
    version: overrides.version ?? 1,
  };
}

function capability(
  key: string,
  ops: ObjectQueryFilterOp[],
  sortEnabled = true,
): ObjectQueryFieldCapability {
  return {
    key,
    label: key,
    title: key,
    data_type: ops.includes('range') ? 'number' : 'text',
    unit: null,
    filter: { enabled: true, ops, include_empty: true },
    sort: { enabled: sortEnabled },
    options: null,
  };
}

function capabilities(fields: ObjectQueryFieldCapability[]): ObjectQueryCapabilities {
  return {
    version: 1,
    object_type: 'pipe',
    default_page_size: 50,
    max_page_size: 500,
    default_sort: { key: 'sort_order', dir: 'asc' },
    search: { enabled: true, max_text_length: 100, default_columns: ['name'] },
    fields,
  };
}

function normalizeSpaces(value: string) {
  return value.replace(/\u00a0/g, ' ');
}

function draftRow(overrides: Partial<DraftRowState> = {}): DraftRowState {
  return {
    objectId: 'o1',
    objectType: 'pipe',
    baseVersion: 1,
    baseFormValues: {},
    draftFormValues: {},
    dirtyFields: {},
    errors: {},
    saving: false,
    sourceParams: {},
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('heatCalcPageUtils — format params & labels', () => {
  it('удаляет пустые и повторяющиеся сообщения ошибок без изменения первого текста', () => {
    expect(uniqueErrorMessages([
      '',
      '  ',
      'Ошибка 1',
      'Ошибка 2',
      'Ошибка 1',
      '  Ошибка 2  ',
      ' Ошибка 3 ',
    ])).toEqual(['Ошибка 1', 'Ошибка 2', ' Ошибка 3 ']);
  });

  it('форматирует параметры, результаты и размерности', () => {
    const record = makeObject({
      object_type: 'tank',
      params: {
        shape: 'rectangular',
        length: 1.2,
        width: 0.8,
        height: 2,
        wall_thickness: 0.006,
        process_temperature: 65,
        ambient_temperature: -25,
        insulation_layer_count: 2,
        insulation_layers: [
          { thickness: 0.05, material: 'mineral_wool', conductivity: 0.045 },
          { thickness: 0.03, material: 'foamglass', conductivity: 0.055 },
        ],
        ground_type: 'clay',
      },
      results: { total_heat_loss: 1234.56 },
    });

    expect(normalizeSpaces(tankDimensions(record))).toBe('1 200 × 800 × 2 000 мм');
    expect(formatParamMetersAsMm(record, 'wall_thickness')).toBe('6');
    expect(formatParamNumber(record, 'process_temperature', 0)).toBe('65');
    expect(formatParamText(record, 'ground_type')).toBe('clay');
    expect(formatDeltaTemperature(record, 0)).toBe('90');
    expect(normalizeSpaces(formatResultNumber(record, 'total_heat_loss', 1))).toBe('1 234,6');
    expect(formatResultOrParamNumber(record, 'q_additional', 0)).toBe('—');
    expect(insulationLayerCount(record)).toBe('2');
    expect(insulationLayerThickness(record, 1)).toBe('30');
    expect(insulationLayerMaterial(record, 0, (material) => `label:${String(material)}`)).toBe('label:mineral_wool');
    expect(insulationLayerConductivity(record, 0)).toBe('0,045');
  });

  it('для q_additional предпочитает result и падает обратно на params', () => {
    expect(formatResultOrParamNumber(
      makeObject({ results: { q_additional: 250 }, params: { q_additional: 100 } }),
      'q_additional',
      0,
    )).toBe('250');
    expect(formatResultOrParamNumber(
      makeObject({ results: {}, params: { q_additional: 100 } }),
      'q_additional',
      0,
    )).toBe('100');
  });

  it('форматирует справочные подписи', () => {
    expect(tankShapeLabel('cylindrical')).toBe('Цилиндр');
    expect(placementLabel('underground')).toBe('Подземно');
    expect(lambdaModeLabel('reference')).toBe('Справ.');
    expect(environmentLabel('aggressive')).toBe('Агрессивная');
    expect(zoneLabel('hazardous')).toBe('Взрывоопасная');
    expect(booleanChoiceLabel('yes')).toBe('Да');
    expect(climateBasisLabel(0.92)).toBe('0,92');
    expect(sourceText('manual')).toBe('вручную');
    expect(sourceSuffix('climate')).toBe(' из климата');
    expect(mmParam(makeObject({ params: { diameter: 0.325 } }), 'diameter')).toBe('325');
    expect(countParamValue(makeObject({ params: { valve_count: 3 } }), 'valve_count')).toBe('3');
    expect(toInputNumberValue('12.5')).toBe(12.5);
    expect(toInputNumberValue('not a number')).toBeNull();
  });

});

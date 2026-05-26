import { describe, expect, it } from 'vitest';
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
  environmentLabel,
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
  placementLabel,
  sourceSuffix,
  sourceText,
  tankDimensions,
  tankShapeLabel,
  toInputNumberValue,
  zoneLabel,
} from '@/pages/heatcalc/heatCalcPageUtils';
import type { HeatCalcTableViewState } from '@/utils/heatCalcTableFindability';

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

describe('heatCalcPageUtils', () => {
  it('определяет статус теплопотерь и текст ошибки', () => {
    const calculated = makeObject({ is_valid: true, results: { total_heat_loss: 100 } });
    const failed = makeObject({ validation_errors: { message: 'Нет материала' } });
    const structuredFailed = makeObject({ validation_errors: { message: 'Понятная ошибка' } });
    const unsupported = makeObject({ validation_errors: { category: 'unsupported', message: 'Не применимо' } });
    const rawFailed = makeObject({ validation_errors: { field: 'required' } });

    expect(heatLossCalcStatus(calculated)).toBe('calculated');
    expect(heatLossStatusLabel(heatLossCalcStatus(calculated))).toBe('Рассчитан');
    expect(heatLossCalcStatus(failed)).toBe('error');
    expect(heatLossStatusLabel(heatLossCalcStatus(failed))).toBe('Ошибка');
    expect(heatLossErrorText(failed)).toBe('Нет материала');
    expect(heatLossErrorText(structuredFailed)).toBe('Понятная ошибка');
    expect(heatLossCalcStatus(unsupported)).toBe('unsupported');
    expect(heatLossStatusLabel(heatLossCalcStatus(unsupported))).toBe('Не применимо');
    expect(heatLossErrorText(rawFailed)).toBe('{"field":"required"}');
    expect(heatLossStatusLabel(heatLossCalcStatus(makeObject()))).toBe('Не рассчитан');
  });

  it('объясняет расчётную ошибку диапазона температуры изоляции через поля формы', () => {
    const failed = makeObject({
      validation_errors: {
        message: "Температура горячей стороны слоя изоляции #1 (0.999942 °C) вне диапазона материала 'other': 2...6 °C",
      },
    });

    expect(heatLossErrorText(failed)).toBe(
      'Теплоизоляция, слой 1: расчётная T на стороне трубы/продукта 1 °C вне Диапазона T материала "Другое" (2...6 °C). Проверьте Материал изоляции, λ и Диапазон T.',
    );
  });

  it('распознаёт batch-ответ теплопотерь', () => {
    expect(isBatchHeatLossResponse({ updated: 1, failed: 0 })).toBe(true);
    expect(isBatchHeatLossResponse({ calculated: 1, failed: 0 })).toBe(false);
    expect(isBatchHeatLossResponse(null)).toBe(false);
  });

  it('строит backend query из состояния таблицы', () => {
    const state: HeatCalcTableViewState = {
      filters: {
        name: { kind: 'text', value: 'P01' },
        process_temperature: { kind: 'numberRange', min: 10, max: 90, includeEmpty: true },
        placement: { kind: 'enum', values: ['outdoor'], includeEmpty: false },
      },
      sort: { columnKey: 'process_temperature', direction: 'desc' },
    };

    const request = buildObjectQueryRequest('pipe', state, 2, 25, capabilities([
      capability('name', ['contains']),
      capability('process_temperature', ['range']),
      capability('placement', ['equals', 'in']),
    ]));

    expect(request).toEqual({
      object_type: 'pipe',
      page: 2,
      page_size: 25,
      filters: [
        { key: 'name', op: 'contains', value: 'P01' },
        {
          key: 'process_temperature',
          op: 'range',
          min: 10,
          max: 90,
          include_empty: true,
        },
        {
          key: 'placement',
          op: 'equals',
          value: 'outdoor',
          values: undefined,
          include_empty: false,
        },
      ],
      sort: { key: 'process_temperature', dir: 'desc' },
    });
  });

  it('добавляет cursor в backend-query для последовательной страницы', () => {
    const request = buildObjectQueryRequest(
      'pipe',
      { filters: {}, sort: { columnKey: 'name', direction: 'asc' } },
      3,
      50,
      capabilities([capability('name', ['contains'])]),
      {
        sort_order: 75,
        id: 'object-75',
        key: 'name',
        value: 'Труба 75',
        value_is_null: false,
      },
    );

    expect(request).toMatchObject({
      page: 3,
      page_size: 50,
      after_sort_order: 75,
      after_id: 'object-75',
      after_key: 'name',
      after_value: 'Труба 75',
      after_value_is_null: false,
    });
  });

  it('не отправляет сортировку, если capability запрещает sort', () => {
    const state: HeatCalcTableViewState = {
      filters: {},
      sort: { columnKey: 'name', direction: 'asc' },
    };

    const request = buildObjectQueryRequest('pipe', state, 1, 50, capabilities([
      capability('name', ['contains'], false),
    ]));

    expect(request.sort).toBeNull();
  });

  it('выбирает вид фильтра по capability или локальному fallback', () => {
    expect(filterKindForColumn('process_temperature')).toBe('numberRange');
    expect(filterKindForColumn('placement')).toBe('enum');
    expect(filterKindForColumn('climate_temperature_basis')).toBe('enum');
    expect(filterKindForColumn('name')).toBe('text');
    expect(filterKindForColumn('custom', capability('custom', ['in']))).toBe('enum');
    expect(filterKindForColumn('custom', capability('custom', ['range']))).toBe('numberRange');
  });

  it('преобразует фильтры колонок в backend-формат', () => {
    expect(backendFilterFromColumnFilter('steam_tracing', { kind: 'boolean', value: 'empty' })).toEqual({
      key: 'steam_tracing',
      op: 'equals',
      value: null,
      include_empty: true,
    });
    expect(backendFilterFromColumnFilter('name', { kind: 'text', value: '' })).toBeNull();
  });

  it('проверяет применимость колонок к типу объекта', () => {
    expect(isColumnApplicableToObjectType('pipe_length', 'pipe')).toBe(true);
    expect(isColumnApplicableToObjectType('pipe_length', 'tank')).toBe(false);
    expect(isColumnApplicableToObjectType('tank_height', 'tank')).toBe(true);
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

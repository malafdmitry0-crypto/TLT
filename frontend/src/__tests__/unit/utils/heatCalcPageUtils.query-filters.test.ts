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

describe('heatCalcPageUtils — query / filters / sort', () => {
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

  it('строит стабильный fingerprint только по изменяемой части draft row', () => {
    const left = draftRow({
      objectId: 'old',
      baseVersion: 1,
      draftFormValues: { pipe_length: 10 },
      dirtyFields: { pipe_length: 10 },
      errors: { pipe_length: 'required' },
      saving: false,
    });
    const right = draftRow({
      objectId: 'new',
      baseVersion: 99,
      draftFormValues: { pipe_length: 10 },
      dirtyFields: { pipe_length: 10 },
      errors: { pipe_length: 'required' },
      saving: true,
    });

    expect(draftRowFingerprint(null)).toBe('');
    expect(draftRowFingerprint(left)).toBe(draftRowFingerprint(right));
    expect(draftRowFingerprint({
      ...right,
      errors: { pipe_length: 'too short' },
    })).not.toBe(draftRowFingerprint(left));
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

});

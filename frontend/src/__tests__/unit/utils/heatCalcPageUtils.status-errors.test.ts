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

describe('heatCalcPageUtils — status & errors', () => {
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

  it('нормализует сообщения draft errors и align значения для grid', () => {
    expect(draftErrorMessages('pipe', {
      pipe_length: 'обязательное поле',
      _row: 'строка содержит ошибки',
    })).toEqual([
      'Длина трубопровода: обязательное поле',
      'строка содержит ошибки',
    ]);

    expect(normalizeGlideCellAlign('left')).toBe('left');
    expect(normalizeGlideCellAlign('center')).toBe('center');
    expect(normalizeGlideCellAlign('right')).toBe('right');
    expect(normalizeGlideCellAlign(undefined)).toBeUndefined();
  });

  it('экранирует table row key через CSS.escape или локальный fallback', () => {
    vi.stubGlobal('CSS', { escape: (value: string) => `escaped:${value}` });
    expect(escapeTableRowKey('row"1')).toBe('escaped:row"1');

    vi.stubGlobal('CSS', undefined);
    expect(escapeTableRowKey('row\\with"quote')).toBe('row\\\\with\\"quote');
  });

});

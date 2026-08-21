import { describe, expect, it } from 'vitest';

import {
  buildElectricalErrorItems,
  electricalErrorGuidanceForItem,
  resolveActiveElectricalErrorItem,
} from '@/pages/electrical/elecCalcErrorSummaryModel';
import type { ElectricalCalcSummary } from '@/types/calculation';
import type { ProjectObject } from '@/types/project';

function projectObject(overrides: Partial<ProjectObject> = {}): ProjectObject {
  return {
    id: 'object-1',
    project_id: 'project-1',
    object_type: 'pipe',
    sort_order: 1,
    version: 1,
    params: { name: 'Труба DN100' },
    results: {},
    is_valid: true,
    validation_errors: null,
    created_at: '2026-05-31T00:00:00.000Z',
    updated_at: '2026-05-31T00:00:00.000Z',
    ...overrides,
  };
}

function calc(overrides: Partial<ElectricalCalcSummary> = {}): ElectricalCalcSummary {
  return {
    id: 'calc-1',
    project_id: 'project-1',
    object_id: 'object-1',
    cable_type: 'self_regulating',
    cable_mark: null,
    cable_mark_source: 'auto',
    variant_number: 1,
    params: {},
    results: {
      error_code: 'POWER_TOO_HIGH',
      category: 'formula',
      message: 'CalculationError: Не найден кабель с мощностью >= 132.67 Вт/м',
      suggested_actions: ['TRY_OTHER_CABLE_TYPE'],
    },
    created_at: '2026-05-31T00:00:00.000Z',
    updated_at: '2026-05-31T00:00:00.000Z',
    ...overrides,
  };
}

describe('elecCalcErrorSummaryModel', () => {
  it('builds only failed non-stale and non-unsupported error items', () => {
    const failed = projectObject({ id: 'failed-object', params: { name: 'Ошибка' } });
    const unsupported = projectObject({ id: 'unsupported-object', params: { name: 'Не применимо' } });
    const stale = projectObject({ id: 'stale-object', params: { name: 'Старый расчет' } });
    const success = projectObject({ id: 'success-object', params: { name: 'Успех' } });

    const items = buildElectricalErrorItems({
      objects: [failed, unsupported, stale, success],
      electricalDisplayOffset: 50,
      calcByObjectId: {
        [failed.id]: calc({ object_id: failed.id }),
        [unsupported.id]: calc({
          object_id: unsupported.id,
          results: {
            error_code: 'unsupported_layout',
            category: 'unsupported',
            message: 'Не применимо',
          },
        }),
        [stale.id]: calc({
          object_id: stale.id,
          results: {
            category: 'stale',
            message: 'Пересчитайте электрорасчет',
          },
        }),
        [success.id]: calc({
          object_id: success.id,
          cable_mark: 'ТЛТ-25',
          results: { selected_cable: 'ТЛТ-25', message: 'служебное сообщение' },
        }),
      },
    });

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      objectId: failed.id,
      rowNumber: 51,
      objectName: 'Ошибка',
      error: 'Не найден кабель с мощностью >= 132.67 Вт/м',
      cableType: 'self_regulating',
      errorCode: 'POWER_TOO_HIGH',
      suggestedActions: ['TRY_OTHER_CABLE_TYPE'],
    });
  });

  it('resolves active row error and marks fallback only when active row has no shown error', () => {
    const first = projectObject({ id: 'first-object', params: { name: 'Первая ошибка' } });
    const second = projectObject({ id: 'second-object', params: { name: 'Вторая ошибка' } });
    const ok = projectObject({ id: 'ok-object', params: { name: 'Без ошибки' } });
    const calcByObjectId = {
      [first.id]: calc({ object_id: first.id, results: { category: 'formula', message: 'Первая' } }),
      [second.id]: calc({ object_id: second.id, results: { category: 'formula', message: 'Вторая' } }),
      [ok.id]: calc({ object_id: ok.id, cable_mark: 'ТЛТ-25', results: { selected_cable: 'ТЛТ-25' } }),
    };
    const objects = [first, second, ok];
    const electricalErrorItems = buildElectricalErrorItems({
      objects,
      calcByObjectId,
      electricalDisplayOffset: 10,
    });

    expect(resolveActiveElectricalErrorItem({
      activeRowId: second.id,
      objects,
      calcByObjectId,
      electricalDisplayOffset: 10,
      electricalErrorItems,
    })).toMatchObject({
      objectId: second.id,
      rowNumber: 12,
      error: 'Вторая',
      fallback: false,
    });

    expect(resolveActiveElectricalErrorItem({
      activeRowId: ok.id,
      objects,
      calcByObjectId,
      electricalDisplayOffset: 10,
      electricalErrorItems,
    })).toMatchObject({
      objectId: first.id,
      rowNumber: 11,
      error: 'Первая',
      fallback: true,
    });
  });

  it('builds guidance from structured code and suggested actions', () => {
    const item = buildElectricalErrorItems({
      objects: [projectObject()],
      electricalDisplayOffset: 0,
      calcByObjectId: {
        'object-1': calc({
          results: {
            error_code: 'POWER_TOO_HIGH',
            category: 'formula',
            message: 'Не найден кабель с мощностью',
            suggested_actions: ['TRY_OTHER_CABLE_TYPE'],
          },
        }),
      },
    })[0];

    expect(electricalErrorGuidanceForItem(item)).toMatchObject({
      label: 'Мощность выше линейки',
      suggestions: ['Попробовать другой тип кабеля'],
    });
    expect(electricalErrorGuidanceForItem(null)).toBeNull();
  });
});

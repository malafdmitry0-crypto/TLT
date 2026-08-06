import { describe, expect, it } from 'vitest';

import {
  cableSnapshotStatusTag,
  CABLE_TYPE_LABEL,
  mainElectricalColumnCopyValue,
  objectDisplayName,
  type MainElectricalColumnCopyContext,
} from '@/domain/electrical/elecCalcMainTableModel';
import type { ElectricalCalcSummary } from '@/types/calculation';
import type { ProjectObject } from '@/types/project';

function calc(overrides: Partial<ElectricalCalcSummary> = {}): ElectricalCalcSummary {
  return {
    id: 'calc-1',
    project_id: 'project-1',
    object_id: 'object-1',
    cable_type: 'self_regulating',
    cable_mark: 'ТЛТ-25',
    cable_mark_source: 'auto',
    variant_number: 1,
    params: {},
    results: {
      selected_cable: 'ТЛТ-25',
    },
    created_at: '2026-05-31T00:00:00.000Z',
    updated_at: '2026-05-31T00:00:00.000Z',
    ...overrides,
  };
}

function projectObject(overrides: Partial<ProjectObject> = {}): ProjectObject {
  return {
    id: 'object-1',
    project_id: 'project-1',
    object_type: 'pipe',
    sort_order: 1,
    version: 1,
    params: { name: 'Труба DN100' },
    results: {
      heat_loss_per_meter_base: 42.5,
      total_heat_loss_design: 2125,
    },
    is_valid: true,
    validation_errors: null,
    created_at: '2026-05-31T00:00:00.000Z',
    updated_at: '2026-05-31T00:00:00.000Z',
    ...overrides,
  };
}

function copyContext(
  calcByObjectId: Record<string, ElectricalCalcSummary | undefined>,
  overrides: Partial<MainElectricalColumnCopyContext> = {},
): MainElectricalColumnCopyContext {
  return {
    calcByObjectId,
    electricalDisplayOffset: 50,
    getCableTypeForObject: () => 'self_regulating',
    connectionType: 'line_1ph',
    supplyVoltage: 220,
    windingCoefficient: 1.1,
    ...overrides,
  };
}

describe('elecCalcMainTableModel', () => {
  it('keeps main table labels and object display names stable', () => {
    expect(CABLE_TYPE_LABEL.self_regulating).toBe('Саморегулирующийся');
    expect(CABLE_TYPE_LABEL.single_core).toBe('Однож. пост. мощн.');
    expect(objectDisplayName(projectObject())).toBe('Труба DN100');
    expect(objectDisplayName(projectObject({ params: {}, object_type: 'tank', id: 'tank-1' })))
      .toBe('Ёмкость tank-1');
    expect(objectDisplayName(projectObject({
      params: { outer_diameter: 0.108 },
      object_type: 'pipe',
      id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    }))).toBe('Трубопровод Ø108 мм');
  });

  it('maps cable snapshot status labels and tooltips', () => {
    expect(cableSnapshotStatusTag(calc())).toBeNull();
    expect(cableSnapshotStatusTag(calc({
      cable_snapshot_status: { technical_status: 'missing', message: 'Нет строки' },
    }))).toEqual({
      color: 'orange',
      label: 'нет в базе',
      tooltip: 'Нет строки',
    });
    expect(cableSnapshotStatusTag(calc({
      cable_snapshot_status: { technical_status: 'changed', changed_fields: ['power_per_meter'] },
    }))).toEqual({
      color: 'red',
      label: 'техн. изм.',
      tooltip: 'Технические параметры кабеля изменились. Поля: power_per_meter',
    });
    expect(cableSnapshotStatusTag(calc({
      cable_snapshot_status: { commercial_status: 'changed', changed_fields: ['price'] },
    }))?.label).toBe('комм. изм.');
    expect(cableSnapshotStatusTag(calc({
      cable_snapshot_status: { technical_status: 'unknown' },
    }))?.label).toBe('стар.');
  });

  it('copies object, heat loss and electrical statuses as table text', () => {
    const success = calc();
    const object = projectObject();
    const context = copyContext({ [object.id]: success });

    expect(mainElectricalColumnCopyValue('index', object, 2, context)).toBe(53);
    expect(mainElectricalColumnCopyValue('object_name', object, 0, context)).toBe('Труба DN100');
    expect(mainElectricalColumnCopyValue('object_type', object, 0, context)).toBe('Труба');
    expect(mainElectricalColumnCopyValue('heat_loss_status', object, 0, context)).toBe('Рассчитан');
    expect(mainElectricalColumnCopyValue('electrical_status', object, 0, context)).toBe('Рассчитан');
    expect(mainElectricalColumnCopyValue('heat_loss_per_meter_base', object, 0, context)).toBe('42.5');
    expect(mainElectricalColumnCopyValue('total_heat_loss_design', object, 0, context)).toBe('2125');

    expect(mainElectricalColumnCopyValue(
      'heat_loss_status',
      projectObject({ is_valid: false, validation_errors: { category: 'unsupported' } }),
      0,
      context,
    )).toBe('Не применимо');
    expect(mainElectricalColumnCopyValue(
      'heat_loss_status',
      projectObject({ is_valid: false, validation_errors: { message: 'bad' } }),
      0,
      context,
    )).toBe('Ошибка');
    expect(mainElectricalColumnCopyValue(
      'heat_loss_status',
      projectObject({ is_valid: false, validation_errors: null }),
      0,
      context,
    )).toBe('Не рассчитан');
  });

  it('copies failed, unsupported and stale electrical states without treating them as current values', () => {
    const object = projectObject();

    expect(mainElectricalColumnCopyValue(
      'electrical_status',
      object,
      0,
      copyContext({ [object.id]: calc({ results: { category: 'unsupported', message: 'Не применимо' } }) }),
    )).toBe('Не применимо');
    expect(mainElectricalColumnCopyValue(
      'electrical_status',
      object,
      0,
      copyContext({ [object.id]: calc({ results: { category: 'stale', message: 'Пересчитать' } }) }),
    )).toBe('Требуется пересчёт');
    expect(mainElectricalColumnCopyValue(
      'electrical_status',
      object,
      0,
      copyContext({ [object.id]: calc({ results: { error_code: 'bad_input', message: 'FormulaError: bad' } }) }),
    )).toBe('Ошибка');
    expect(mainElectricalColumnCopyValue(
      'cable_mark',
      object,
      0,
      copyContext({ [object.id]: calc({ results: { category: 'stale', selected_cable: 'ТЛТ-25' } }) }),
    )).toBe('—');
  });

  it('copies calculation, layout, defaults and commercial values', () => {
    const object = projectObject();
    const row = calc({
      cable_mark: null,
      params: {
        connection_type: 'star_3ph',
        supply_voltage: 380,
        heating_height: 2.5,
        laying_step: 0.15,
      },
      results: {
        selected_cable: 'ТЛТ-30',
        selection_policy: 'lowest_cost',
        applied_selection_policy: 'manual_selection',
        selection_reason: 'Коммерческий выбор',
        winding_pitch: 60,
        num_circuits: 2,
        number_of_threads_source: 'manual',
        order_cable_length: '55.5',
        installed_cable_length: 50,
        total_power: 1500,
        current: 6.82,
        voltage: 220,
        power_per_meter: '30',
        installed_power_per_meter: 60,
        commercial: {
          price_per_meter: 315.5,
          stock_status: 'in_stock',
          lead_time_days: 7,
        },
      },
    });
    const context = copyContext({ [object.id]: row });

    expect(mainElectricalColumnCopyValue('cable_type', object, 0, context)).toBe('Саморегулирующийся');
    expect(mainElectricalColumnCopyValue('cable_mark', object, 0, context)).toBe('ТЛТ-30');
    expect(mainElectricalColumnCopyValue('selection_policy', object, 0, context)).toBe('Дешевле');
    expect(mainElectricalColumnCopyValue('applied_selection_policy', object, 0, context)).toBe('Ручной');
    expect(mainElectricalColumnCopyValue('selection_reason', object, 0, context)).toBe('Коммерческий выбор');
    expect(mainElectricalColumnCopyValue('winding_pitch_mm', object, 0, context)).toBe('60');
    expect(mainElectricalColumnCopyValue('number_of_threads', object, 0, context)).toBe('2 (ручн.)');
    expect(mainElectricalColumnCopyValue('connection_type', object, 0, context)).toBe('Звезда');
    expect(mainElectricalColumnCopyValue('supply_voltage', object, 0, context)).toBe('380');
    expect(mainElectricalColumnCopyValue('heating_height', object, 0, context)).toBe('2.5');
    expect(mainElectricalColumnCopyValue('laying_step', object, 0, context)).toBe('0.15');
    expect(mainElectricalColumnCopyValue('order_cable_length', object, 0, context)).toBe('55.5');
    expect(mainElectricalColumnCopyValue('power_per_meter', object, 0, context)).toBe('30');
    expect(mainElectricalColumnCopyValue('installed_power_per_meter', object, 0, context)).toBe('60');
    expect(mainElectricalColumnCopyValue('stock_status', object, 0, context)).toBe('В наличии');
    expect(mainElectricalColumnCopyValue('lead_time_days', object, 0, context)).toBe('7');
  });
});

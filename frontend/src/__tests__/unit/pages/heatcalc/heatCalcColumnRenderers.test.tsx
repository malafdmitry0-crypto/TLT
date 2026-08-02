import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ReactNode } from 'react';

import { buildHeatCalcColumnRenderers } from '@/pages/heatcalc/heatCalcColumnRenderers';
import type { ProjectObject } from '@/types/project';

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
    version: 1,
    ...overrides,
  };
}

function normalizeSpaces(value: string) {
  return value.replace(/\u00a0/g, ' ');
}

describe('heatCalcColumnRenderers', () => {
  const renderers = buildHeatCalcColumnRenderers({
    insulationLabel: (material) => `label:${String(material)}`,
  });

  it('сохраняет copyValue формат для основных колонок трубы', () => {
    const record = makeObject({
      is_valid: true,
      params: {
        name: 'Труба DN100',
        outer_diameter: 0.1143,
        pipe_length: 50.25,
        wall_thickness: 0.006,
        insulation_material: 'mineral_wool_boards_120',
        insulation_layer_count: 2,
        insulation_layers: [
          { thickness: 0.05, material: 'mineral_wool_boards_120', conductivity: 0.045 },
          { thickness: 0.03, material: 'foamglass', conductivity: 0.055 },
        ],
        process_temperature: 80,
        ambient_temperature: -20,
        placement: 'underground',
        ground_temperature: 6,
        pipe_centerline_depth: 1.25,
        num_local_elements: 6,
        safety_factor: 1.2,
      },
      results: {
        heat_loss_per_meter_base: 42.4,
        heat_loss_per_meter_design: 50.88,
        safety_factor_applied: 1.2,
        total_heat_loss_design: 2332.2,
        thermal_resistance: 2.35789,
      },
    });

    expect(renderers.index.copyValue(record, 2)).toBe('3');
    expect(renderers.heat_loss_status.copyValue(record, 0)).toBe('Рассчитан');
    expect(renderers.type.copyValue(record, 0)).toBe('Труба');
    expect(renderers.name.copyValue(record, 0)).toBe('Труба DN100');
    expect(renderers.pipe_outer_diameter.copyValue(record, 0)).toBe('114');
    expect(renderers.pipe_dn.copyValue(record, 0)).toBe('DN100');
    expect(renderers.pipe_length.copyValue(record, 0)).toBe('50,3');
    expect(renderers.pipe_wall_thickness.copyValue(record, 0)).toBe('6');
    expect(renderers.insulation_material.copyValue(record, 0)).toBe('label:mineral_wool_boards_120');
    expect(renderers.second_insulation_material.copyValue(record, 0)).toBe('label:foamglass');
    expect(renderers.second_insulation_thickness.copyValue(record, 0)).toBe('30');
    expect(renderers.delta_t.copyValue(record, 0)).toBe('100');
    expect(renderers.placement.copyValue(record, 0)).toBe('Подземно');
    expect(renderers.ground_temperature.copyValue(record, 0)).toBe('6,0');
    expect(renderers.pipe_centerline_depth.copyValue(record, 0)).toBe('1,25');
    expect(renderers.num_local_elements.copyValue(record, 0)).toBe('6');
    expect(renderers.heat_loss_per_meter_base.copyValue(record, 0)).toBe('42,4');
    expect(normalizeSpaces(renderers.total_heat_loss_design.copyValue(record, 0))).toBe('2 332');
    expect(renderers.thermal_resistance.copyValue(record, 0)).toBe('2,3579');
  });

  it('сохраняет статус, render aria-label и диагностический текст ошибок', () => {
    const unsupported = makeObject({
      validation_errors: { category: 'unsupported', message: 'Не применимо для выбранной формы' },
    });
    const failed = makeObject({
      validation_errors: { message: 'Нет материала изоляции' },
    });

    expect(renderers.heat_loss_status.copyValue(unsupported, 0)).toBe('Не применимо');
    expect(renderers.heat_loss_status.copyValue(failed, 0)).toBe('Ошибка');

    render(<>{renderers.heat_loss_status.render?.(null, unsupported, 0) as ReactNode}</>);

    expect(screen.getByLabelText('Не применимо')).toBeInTheDocument();
  });

  it('сохраняет copyValue формат для геометрии и результатов резервуара', () => {
    const record = makeObject({
      object_type: 'tank',
      is_valid: true,
      params: {
        name: 'Резервуар прямоугольный',
        shape: 'rectangular',
        length: 1.2,
        width: 0.8,
        height: 2,
        wall_thickness: 0.006,
        insulation_layers: [{ thickness: 0.05, material: 'mineral_wool' }],
        q_additional: 100,
      },
      results: {
        heat_loss_per_m2_bare_base: 53.6,
        total_heat_loss_design: 1347,
        q_additional_applied: 250,
        surface_area_bare: 11.2,
      },
    });

    expect(renderers.type.copyValue(record, 0)).toBe('Резервуар');
    expect(renderers.tank_shape.copyValue(record, 0)).toBe('Прямоуг.');
    expect(normalizeSpaces(renderers.tank_dimensions.copyValue(record, 0))).toBe('1 200 × 800 × 2 000 мм');
    expect(renderers.tank_wall_thickness.copyValue(record, 0)).toBe('6');
    expect(renderers.insulation_thickness.copyValue(record, 0)).toBe('50');
    expect(renderers.insulation_material.copyValue(record, 0)).not.toBe('—');
    expect(renderers.q_additional.copyValue(record, 0)).toBe('250');
    expect(renderers.heat_loss_per_m2_bare_base.copyValue(record, 0)).toBe('53,6');
    expect(normalizeSpaces(renderers.total_heat_loss_design.copyValue(record, 0))).toBe('1 347');
    expect(renderers.surface_area_bare.copyValue(record, 0)).toBe('11,2');
  });
});

import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import CablePickerCharacteristics from '@/components/electrical/CablePickerCharacteristics';
import {
  buildCableFields,
  buildObjectFields,
  splitIntoColumns,
} from '@/components/electrical/cablePickerCharacteristicsModel';
import type { ProjectObject } from '@/types/project';

function makePipe(overrides: Partial<ProjectObject> = {}): ProjectObject {
  return {
    id: 'obj-1',
    project_id: 'p-1',
    object_type: 'pipe',
    sort_order: 0,
    version: 1,
    params: {
      name: 'Pipe',
      placement: 'outdoor',
      outer_diameter: 0.114,
      pipe_length: 25,
      insulation_material: 'mineral_wool',
      insulation_thickness: 0.05,
      ambient_temperature: -20,
      process_temperature: 80,
    },
    results: {
      heat_loss_per_meter: 12.5,
      total_heat_loss: 312.5,
    },
    is_valid: true,
    validation_errors: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('cablePickerCharacteristicsModel', () => {
  it('builds pipe object fields with order, labels and units', () => {
    const fields = buildObjectFields(makePipe());
    expect(fields.map((f) => f.key)).toEqual([
      'object_type',
      'outer_diameter',
      'pipe_length',
      'heat_loss_specific',
      'total_heat_loss',
      'placement',
      'insulation',
      'ambient_temperature',
      'process_temperature',
    ]);
    expect(fields.find((f) => f.key === 'object_type')?.value).toBe('Труба');
    expect(fields.find((f) => f.key === 'placement')?.value).toBe('Открыто');
    expect(fields.find((f) => f.key === 'outer_diameter')?.value).toMatch(/мм/);
    expect(fields.find((f) => f.key === 'heat_loss_specific')?.value).toMatch(/Вт\/м/);
  });

  it('builds tank geometry and uses fallback em dash for missing values', () => {
    const tank = makePipe({
      object_type: 'tank',
      params: { shape: 'cylindrical', diameter: 2, height: 3 },
      results: null,
    });
    const fields = buildObjectFields(tank);
    expect(fields[0].value).toBe('Резервуар');
    expect(fields.find((f) => f.key === 'tank_geometry')?.value).toMatch(/цилиндр/);
    expect(fields.find((f) => f.key === 'total_heat_loss')?.value).toBe('—');
  });

  it('orders cable fields and formats extended values with fallbacks', () => {
    const fields = buildCableFields(
      {
        id: 'c-1',
        model: '10BTV2-CT',
        cable_type: 'self_regulating',
        brand: 'Raychem',
        power_per_meter: 10,
        min_temperature: -40,
        max_temperature: 65,
        unknown_extra: 42,
      } as never,
      'self_regulating',
    );
    const keys = fields.map((f) => f.key);
    expect(keys[0]).toBe('cable_type');
    expect(keys).toContain('model');
    expect(keys).toContain('power_per_meter');
    expect(fields.find((f) => f.key === 'cable_type')?.value).toBe('Саморегулирующийся');
    expect(fields.find((f) => f.key === 'power_per_meter')?.value).toMatch(/Вт\/м/);
    expect(fields.find((f) => f.key === 'temperature_range')?.value).toMatch(/°C/);
    // forced order fields keep em dash when empty
    expect(fields.find((f) => f.key === 'series')?.value).toBe('—');
  });

  it('splits items into non-empty columns', () => {
    const columns = splitIntoColumns([1, 2, 3, 4, 5], 2);
    expect(columns).toHaveLength(2);
    expect(columns[0]).toEqual([1, 2, 3]);
    expect(columns[1]).toEqual([4, 5]);
  });
});

describe('CablePickerCharacteristics', () => {
  it('renders object-only, cable-only and both sections', () => {
    const object = makePipe();
    const cable = {
      id: 'c-1',
      model: '10BTV2-CT',
      cable_type: 'self_regulating',
      brand: 'Raychem',
    } as never;

    const { rerender } = render(
      <CablePickerCharacteristics object={object} cable={null} showCable={false} />,
    );
    expect(screen.getByLabelText('Характеристики объекта')).toBeInTheDocument();
    expect(screen.queryByText('Кабель')).not.toBeInTheDocument();

    rerender(
      <CablePickerCharacteristics object={object} cable={cable} showObject={false} cableType="self_regulating" />,
    );
    expect(screen.getByLabelText('Характеристики кабеля')).toBeInTheDocument();
    expect(screen.queryByText('Объект')).not.toBeInTheDocument();

    rerender(
      <CablePickerCharacteristics object={object} cable={cable} cableType="self_regulating" />,
    );
    expect(screen.getByLabelText('Характеристики объекта и кабеля')).toBeInTheDocument();
    expect(screen.getByText('Объект')).toBeInTheDocument();
    expect(screen.getByText('Кабель')).toBeInTheDocument();
    expect(screen.getByText('Труба')).toBeInTheDocument();
    expect(screen.getByText('10BTV2-CT')).toBeInTheDocument();
  });
});

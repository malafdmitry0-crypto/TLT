import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { ProjectObject } from '@/types/project';
import { useElecCalcElectricalColumnCopyValue } from '@/pages/electrical/useElecCalcElectricalColumnCopyValue';

const object = {
  id: 'object-1',
  project_id: 'project-1',
  object_type: 'pipe',
  sort_order: 1,
  version: 1,
  params: { name: 'Труба 1' },
  results: null,
  is_valid: true,
  validation_errors: null,
  created_at: '2026-05-31T00:00:00Z',
  updated_at: '2026-05-31T00:00:00Z',
} satisfies ProjectObject;

function renderCopyValue(offset: number) {
  return renderHook(({ electricalDisplayOffset }) => useElecCalcElectricalColumnCopyValue({
    calcByObjectId: {},
    electricalDisplayOffset,
    getCableTypeForObject: () => 'three_core',
    layingStep: 5,
    heatingHeight: 0.3,
    connectionType: 'star_3ph',
    supplyVoltage: 380,
    windingCoefficient: 1.1,
    vaporTemperature: 120,
    maintainTemperature: 60,
    aggressiveProduct: false,
  }), {
    initialProps: { electricalDisplayOffset: offset },
  });
}

describe('useElecCalcElectricalColumnCopyValue', () => {
  it('delegates copy values with current table offset and cable type resolver', () => {
    const { result, rerender } = renderCopyValue(20);

    expect(result.current('index', object, 2)).toBe(23);
    expect(result.current('object_name', object, 0)).toBe('Труба 1');
    expect(result.current('cable_type', object, 0)).toBe('Трёхж. пост. мощн.');

    rerender({ electricalDisplayOffset: 40 });

    expect(result.current('index', object, 2)).toBe(43);
  });

  it('delegates fallback recalculation params when calculation params are absent', () => {
    const { result } = renderCopyValue(0);

    expect(result.current('laying_step', object, 0)).toBe('5');
    expect(result.current('connection_type', object, 0)).toBe('Звезда');
    expect(result.current('supply_voltage', object, 0)).toBe('380');
  });
});

import { describe, it, expect } from 'vitest';
import {
  tankFormToApiParams,
} from '@/utils/objectWizardUtils';

describe('tankFormToApiParams', () => {
  it('cylindrical: только diameter+height', () => {
    const api = tankFormToApiParams({
      shape: 'cylindrical',
      diameter_mm: 2000,
      height_mm: 3000,
      wall_thickness_mm: 12,
      wall_lambda: 45,
      insulation_thickness_mm: 80,
      insulation_material: 'mineral_wool',
      ambient_temperature: -20,
      process_temperature: 80,
    });
    expect(api.diameter).toBeCloseTo(2.0);
    expect(api.height).toBeCloseTo(3.0);
    expect(api.wall_thickness).toBeCloseTo(0.012);
    expect(api.wall_lambda).toBe(45);
    expect(api.length).toBeUndefined();
    expect(api.width).toBeUndefined();
  });

  it('rectangular: все 3 размера в м', () => {
    const api = tankFormToApiParams({
      shape: 'rectangular',
      length_mm: 5000,
      width_mm: 3000,
      height_mm: 4000,
      insulation_thickness_mm: 80,
      insulation_material: 'mineral_wool',
      ambient_temperature: -20,
      process_temperature: 60,
    });
    expect(api.length).toBeCloseTo(5.0);
    expect(api.width).toBeCloseTo(3.0);
    expect(api.height).toBeCloseTo(4.0);
  });
});

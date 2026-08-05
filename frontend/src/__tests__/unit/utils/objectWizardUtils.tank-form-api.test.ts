// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  tankFormToApiParams,
  tankApiParamsToForm,
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
      maintain_temperature: 10,
      aggressive_product: 'yes',
      steam_tracing: 'no',
      vapor_temperature: 140,
      heating_height: 2.5,
      laying_step: 0.2,
    });
    expect(api.diameter).toBeCloseTo(2.0);
    expect(api.height).toBeCloseTo(3.0);
    expect(api.wall_thickness).toBeCloseTo(0.012);
    expect(api.wall_lambda).toBe(45);
    expect(api.length).toBeUndefined();
    expect(api.width).toBeUndefined();
    expect(api.maintain_temperature).toBe(10);
    expect(api.aggressive_product).toBe(true);
    expect(api.heating_height).toBe(2.5);
    expect(api.laying_step).toBe(0.2);
    expect(api).not.toHaveProperty('vapor_temperature');
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

  it('uses the canonical underground payload and round-trips mm, layers, and temperatures', () => {
    const api = tankFormToApiParams({
      shape: 'rectangular', length_mm: 5000, width_mm: 3000, height_mm: 4000,
      wall_thickness_mm: 12, wall_lambda: 45,
      insulation_thickness_mm: 80, insulation_material: 'mineral_wool',
      insulation_layer_count: '2', second_insulation_thickness_mm: 40, second_insulation_material: 'other',
      second_insulation_lambda: 0.04, ambient_temperature: 15, ground_temperature: 4,
      process_temperature: 80, placement: 'underground', tank_buried_height: 1.5,
      ground_conductivity: 1.2, wind_speed: 4, alpha_vnesh: 17, q_additional: 0,
    });
    expect(api).toMatchObject({
      placement: 'underground', ambient_temperature: 15, ground_temperature: 4,
      tank_buried_height: 1.5, insulation_layers: [
        { thickness: 0.08, material: 'mineral_wool' },
        { thickness: 0.04, material: 'other', conductivity: 0.04 },
      ], q_additional: 0,
    });
    expect(api).not.toHaveProperty('location');
    expect(api).not.toHaveProperty('burial_depth');
    expect(api).not.toHaveProperty('insulation_thickness');
    expect(api).not.toHaveProperty('insulation_material');
    expect(tankApiParamsToForm(api)).toMatchObject({
      length_mm: 5000, width_mm: 3000, height_mm: 4000, wall_thickness_mm: 12,
      tank_buried_height: 1.5, ambient_temperature: 15, ground_temperature: 4,
      insulation_thickness_mm: 80, second_insulation_thickness_mm: 40, q_additional: 0,
    });
  });

  it('cleans incompatible geometry and incomplete wall pairs while preserving spherical UI support', () => {
    const api = tankFormToApiParams({
      shape: 'spherical', diameter_mm: 2000, height_mm: 3000, length_mm: 4000, width_mm: 5000,
      wall_thickness_mm: 12, insulation_thickness_mm: 80, insulation_material: 'mineral_wool',
      ambient_temperature: 20, process_temperature: 80,
    });
    expect(api).toMatchObject({ shape: 'spherical', diameter: 2, q_additional: 0 });
    expect(api).not.toHaveProperty('height');
    expect(api).not.toHaveProperty('length');
    expect(api).not.toHaveProperty('width');
    expect(api).not.toHaveProperty('wall_thickness');
    expect(api).not.toHaveProperty('wall_lambda');
  });

  it('keeps spherical placement explicit for API validation instead of silently treating it as underground-capable', () => {
    const api = tankFormToApiParams({
      shape: 'spherical', diameter_mm: 2000,
      insulation_thickness_mm: 80, insulation_material: 'mineral_wool',
      ambient_temperature: 20, process_temperature: 80, placement: 'underground',
    });
    expect(api).toMatchObject({ shape: 'spherical', placement: 'underground', diameter: 2 });
    expect(api).not.toHaveProperty('tank_buried_height');
  });
});

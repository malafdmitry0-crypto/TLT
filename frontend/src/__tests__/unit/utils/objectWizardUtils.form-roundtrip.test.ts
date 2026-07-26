// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  pipeApiParamsToForm,
  tankApiParamsToForm,
} from '@/utils/objectWizardUtils';

describe('pipeApiParamsToForm и tankApiParamsToForm', () => {
  it('обратная конвертация м → мм', () => {
    const form = pipeApiParamsToForm({
      outer_diameter: 0.108,
      insulation_thickness: 0.05,
      insulation_material: 'mineral_wool',
      ambient_temperature: -20,
      process_temperature: 80,
      pipe_length: 50,
      vapor_temperature: 140,
      climate_key: 'ХМАО|||Сургут',
      climate_region: 'ХМАО',
      climate_city: 'Сургут',
      local_element_equiv_length: 1.2,
      name: 'X',
    });
    expect(form.outer_diameter_mm).toBe(108);
    expect(form.insulation_thickness_mm).toBe(50);
    expect(form.vapor_temperature).toBe(140);
    expect(form.climate_key).toBe('ХМАО|||Сургут');
    expect(form.local_element_equiv_length).toBe(1.2);
    expect(form.name).toBe('X');
  });

  it('обратная конвертация трёх insulation_layers → поля формы', () => {
    const form = pipeApiParamsToForm({
      outer_diameter: 0.108,
      pipe_length: 50,
      ambient_temperature: -20,
      process_temperature: 80,
      insulation_layers: [
        { thickness: 0.04, material: 'mineral_wool', conductivity: undefined, temperature_range: [-60, 120] },
        { thickness: 0.02, material: 'polyurethane_foam', conductivity: 0.028, temperature_range: [-30, 90] },
        { thickness: 0.01, material: 'foam_glass' },
      ],
      placement: 'underground',
      ground_type: 'dry_sand',
      ground_conductivity: 1.3,
    });
    expect(form.insulation_layer_count).toBe('3');
    expect(form.insulation_thickness_mm).toBe(40);
    expect(form.insulation_material).toBe('mineral_wool');
    expect(form.first_insulation_temperature_min).toBe(-60);
    expect(form.first_insulation_temperature_max).toBe(120);
    expect(form.second_insulation_thickness_mm).toBe(20);
    expect(form.second_insulation_material).toBe('polyurethane_foam');
    expect(form.second_insulation_lambda).toBe(0.028);
    expect(form.second_insulation_temperature_min).toBe(-30);
    expect(form.second_insulation_temperature_max).toBe(90);
    expect(form.third_insulation_thickness_mm).toBe(10);
    expect(form.third_insulation_material).toBe('foam_glass');
    expect(form.ground_type).toBe('dry_sand');
    expect(form.ground_conductivity).toBe(1.3);
  });

  it('tank: cylindrical с diameter/height', () => {
    const form = tankApiParamsToForm({
      shape: 'cylindrical',
      diameter: 2.0,
      height: 3.0,
      wall_thickness: 0.012,
      wall_lambda: 45,
      insulation_thickness: 0.08,
      insulation_material: 'mineral_wool',
      ambient_temperature: -20,
      process_temperature: 80,
    });
    expect(form.shape).toBe('cylindrical');
    expect(form.diameter_mm).toBe(2000);
    expect(form.height_mm).toBe(3000);
    expect(form.wall_thickness_mm).toBe(12);
    expect(form.wall_lambda).toBe(45);
  });

  it('tank без shape → дефолт cylindrical', () => {
    const form = tankApiParamsToForm({});
    expect(form.shape).toBe('cylindrical');
  });

  it('пустые поля не пробрасываются как 0', () => {
    const form = pipeApiParamsToForm({});
    expect(form.outer_diameter_mm).toBeUndefined();
    expect(form.pipe_length).toBeUndefined();
  });

  it('подставляет зимний режим tm при открытии старого наружного объекта без этого поля', () => {
    const form = pipeApiParamsToForm({
      placement: 'outdoor',
      outer_diameter: 0.108,
      insulation_thickness: 0.05,
      insulation_material: 'mineral_wool',
      ambient_temperature: -20,
      process_temperature: 80,
      pipe_length: 50,
    });

    expect(form.insulation_temperature_basis).toBe('outdoor_winter');
  });
});

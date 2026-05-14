import { describe, it, expect } from 'vitest';
import {
  findDN,
  generatePipeName,
  generateTankName,
  pipeFormToApiParams,
  tankFormToApiParams,
  pipeApiParamsToForm,
  tankApiParamsToForm,
} from '@/utils/objectWizardUtils';

describe('findDN', () => {
  it('возвращает DN если диаметр близок к стандартному (≤5 мм)', () => {
    expect(findDN(114)).toBe(100);    // OD 114.3 = DN100
    expect(findDN(60)).toBe(50);      // OD 60.3 = DN50
    expect(findDN(168.3)).toBe(150);  // exact
  });

  it('возвращает null если разница > 5 мм', () => {
    expect(findDN(108)).toBeNull();   // ближайший 114.3, diff 6.3
    expect(findDN(999)).toBeNull();
  });

  it('возвращает null для нулевого/отрицательного', () => {
    expect(findDN(0)).toBeNull();
    expect(findDN(-50)).toBeNull();
  });
});

describe('generatePipeName', () => {
  it('собирает имя со всеми компонентами', () => {
    const name = generatePipeName({
      outer_diameter_mm: 114,
      pipe_length: 50,
      insulation_thickness_mm: 50,
      insulation_material: 'mineral_wool',
      ambient_temperature: -20,
      process_temperature: 80,
    });
    expect(name).toContain('Ø114');
    expect(name).toContain('DN100');
    expect(name).toContain('δ=50');
    expect(name).toContain('L=50');
    expect(name).toContain('-20');
    expect(name).toContain('+80');
  });

  it('без DN если диаметр нестандартный', () => {
    const name = generatePipeName({
      outer_diameter_mm: 234,
      pipe_length: 10,
      insulation_thickness_mm: 30,
      insulation_material: 'polyurethane',
      ambient_temperature: 0,
      process_temperature: 50,
    });
    expect(name).not.toContain('DN');
  });
});

describe('generateTankName', () => {
  it('цилиндр содержит Ø и H', () => {
    const name = generateTankName({
      shape: 'cylindrical',
      diameter_mm: 2000,
      height_mm: 3000,
      insulation_thickness_mm: 80,
      insulation_material: 'mineral_wool',
      ambient_temperature: -20,
      process_temperature: 80,
    });
    expect(name).toContain('цил.');
    expect(name).toContain('Ø2000');
    expect(name).toContain('H3000');
  });

  it('параллелепипед собирает все 3 размера', () => {
    const name = generateTankName({
      shape: 'rectangular',
      length_mm: 5000,
      width_mm: 3000,
      height_mm: 4000,
      insulation_thickness_mm: 80,
      insulation_material: 'mineral_wool',
      ambient_temperature: -20,
      process_temperature: 60,
    });
    expect(name).toContain('5000×3000×4000');
    expect(name).toContain('прям.');
  });

  it('шар содержит Ø', () => {
    const name = generateTankName({
      shape: 'spherical',
      diameter_mm: 1500,
      insulation_thickness_mm: 60,
      insulation_material: 'polyurethane',
      ambient_temperature: -20,
      process_temperature: 60,
    });
    expect(name).toContain('сфер.');
    expect(name).toContain('Ø1500');
  });
});

describe('pipeFormToApiParams', () => {
  it('конвертирует мм → м', () => {
    const api = pipeFormToApiParams({
      outer_diameter_mm: 108,
      pipe_length: 50,
      insulation_thickness_mm: 50,
      insulation_material: 'mineral_wool',
      ambient_temperature: -20,
      process_temperature: 80,
    });
    expect(api.outer_diameter).toBeCloseTo(0.108);
    expect(api.insulation_thickness).toBeCloseTo(0.05);
    expect(api.pipe_length).toBe(50);
    expect(api.name).toBeUndefined();
  });

  it('сохраняет name если задан', () => {
    const api = pipeFormToApiParams({
      outer_diameter_mm: 108,
      pipe_length: 50,
      insulation_thickness_mm: 50,
      insulation_material: 'mineral_wool',
      ambient_temperature: -20,
      process_temperature: 80,
      name: 'Magistral-1',
    });
    expect(api.name).toBe('Magistral-1');
  });

  it('передаёт расчётные и эксплуатационные поля из inline-формы', () => {
    const api = pipeFormToApiParams({
      outer_diameter_mm: 108,
      wall_thickness_mm: 4,
      pipe_lambda_mode: 'manual',
      pipe_material: 'carbon_steel',
      pipe_lambda: 56,
      pipe_length: 50,
      insulation_thickness_mm: 50,
      insulation_material: 'mineral_wool',
      insulation_cover_material: 'none',
      ambient_temperature: -20,
      process_temperature: 80,
      max_ambient_temperature: 30,
      max_process_temperature: 90,
      placement: 'underground',
      burial_depth: 1.2,
      ground_type: 'clay',
      ground_conductivity: 1.7,
      safety_factor: 1.2,
      supply_voltage: 380,
      valve_count: 1,
      flange_count: 2,
      support_count: 3,
      local_element_equiv_length: 1.5,
    });

    expect(api.wall_thickness).toBeCloseTo(0.004);
    expect(api.pipe_material).toBeUndefined();
    expect(api.pipe_lambda).toBe(56);
    expect(api.location).toBe('outdoor');
    expect(api.placement).toBe('underground');
    expect(api.burial_depth).toBe(1.2);
    expect(api.ground_type).toBe('clay');
    expect(api.ground_conductivity).toBe(1.7);
    expect(api.safety_factor).toBe(1.2);
    expect(api.supply_voltage).toBe(380);
    expect(api.insulation_cover_material).toBe('none');
    expect(api.max_ambient_temperature).toBe(30);
    expect(api.max_process_temperature).toBe(90);
    expect(api.num_local_elements).toBe(6);
    expect(api.local_element_equiv_length).toBe(1.5);
  });

  it('формирует insulation_layers для трёх слоёв', () => {
    const api = pipeFormToApiParams({
      outer_diameter_mm: 108,
      pipe_length: 50,
      insulation_thickness_mm: 40,
      insulation_material: 'mineral_wool',
      insulation_layer_count: '3',
      second_insulation_thickness_mm: 20,
      second_insulation_material: 'polyurethane_foam',
      third_insulation_thickness_mm: 10,
      third_insulation_material: 'foam_glass',
      ambient_temperature: -20,
      process_temperature: 80,
    });
    expect(api.insulation_layer_count).toBe('3');
    expect(api.insulation_layers).toEqual([
      { thickness: 0.04, material: 'mineral_wool' },
      { thickness: 0.02, material: 'polyurethane_foam' },
      { thickness: 0.01, material: 'foam_glass' },
    ]);
    expect(api.insulation_thickness).toBeCloseTo(0.04);
  });

  it('передаёт ручную λ для материала «Другое» в каждом слое', () => {
    const api = pipeFormToApiParams({
      outer_diameter_mm: 108,
      pipe_length: 50,
      insulation_thickness_mm: 40,
      insulation_material: 'other',
      first_insulation_lambda: 0.037,
      first_insulation_temperature_min: -60,
      first_insulation_temperature_max: 120,
      insulation_layer_count: '2',
      second_insulation_thickness_mm: 20,
      second_insulation_material: 'other',
      second_insulation_lambda: 0.052,
      second_insulation_temperature_min: -30,
      second_insulation_temperature_max: 90,
      ambient_temperature: -20,
      process_temperature: 80,
    });

    expect(api.insulation_layers).toEqual([
      { thickness: 0.04, material: 'other', conductivity: 0.037, temperature_range: [-60, 120] },
      { thickness: 0.02, material: 'other', conductivity: 0.052, temperature_range: [-30, 90] },
    ]);
  });
});

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

describe('pipeApiParamsToForm и tankApiParamsToForm', () => {
  it('обратная конвертация м → мм', () => {
    const form = pipeApiParamsToForm({
      outer_diameter: 0.108,
      insulation_thickness: 0.05,
      insulation_material: 'mineral_wool',
      ambient_temperature: -20,
      process_temperature: 80,
      pipe_length: 50,
      local_element_equiv_length: 1.2,
      name: 'X',
    });
    expect(form.outer_diameter_mm).toBe(108);
    expect(form.insulation_thickness_mm).toBe(50);
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
});

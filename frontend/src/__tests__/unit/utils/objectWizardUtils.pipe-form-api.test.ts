import { describe, it, expect } from 'vitest';
import {
  pipeFormToApiParams,
} from '@/utils/objectWizardUtils';

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
    expect(api.valve_count).toBeUndefined();
    expect(api.flange_count).toBeUndefined();
    expect(api.support_count).toBeUndefined();
    expect(api.num_local_elements).toBeUndefined();
  });

  it('подставляет зимний режим tm изоляции для наружного объекта', () => {
    const api = pipeFormToApiParams({
      outer_diameter_mm: 108,
      pipe_length: 50,
      insulation_thickness_mm: 50,
      insulation_material: 'mineral_wool',
      ambient_temperature: -20,
      process_temperature: 80,
      placement: 'outdoor',
    });

    expect(api.insulation_temperature_basis).toBe('outdoor_winter');
  });

  it('подставляет режим tm канала для подземного объекта', () => {
    const api = pipeFormToApiParams({
      outer_diameter_mm: 108,
      pipe_length: 50,
      insulation_thickness_mm: 50,
      insulation_material: 'mineral_wool',
      ambient_temperature: -20,
      process_temperature: 80,
      placement: 'underground',
    });

    expect(api.insulation_temperature_basis).toBe('channel');
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
      climate_region: 'ХМАО',
      climate_city: 'Сургут',
      climate_temperature_basis: 't_0_92',
      safety_factor: 1.2,
      safety_factor_source: 'manual',
      supply_voltage: 380,
      vapor_temperature: 140,
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
    expect(api.climate_key).toBe('ХМАО|||Сургут');
    expect(api.climate_temperature_basis).toBe('t_0_92');
    expect(api.safety_factor).toBe(1.2);
    expect(api.safety_factor_source).toBe('manual');
    expect(api.supply_voltage).toBe(380);
    expect(api.vapor_temperature).toBe(140);
    expect(api.insulation_cover_material).toBe('none');
    expect(api.max_ambient_temperature).toBe(30);
    expect(api.max_process_temperature).toBe(90);
    expect(api.num_local_elements).toBe(6);
    expect(api.local_element_equiv_length).toBe(1.5);
  });

  it('не затирает backend-дефолты локальных элементов пустыми нулями', () => {
    const api = pipeFormToApiParams({
      outer_diameter_mm: 108,
      pipe_length: 50,
      insulation_thickness_mm: 50,
      insulation_material: 'mineral_wool',
      ambient_temperature: -20,
      process_temperature: 80,
    });

    expect(api).not.toHaveProperty('valve_count');
    expect(api).not.toHaveProperty('flange_count');
    expect(api).not.toHaveProperty('support_count');
    expect(api).not.toHaveProperty('num_local_elements');
  });

  it('передаёт null для климатических полей при очистке выбора климата', () => {
    const api = pipeFormToApiParams({
      outer_diameter_mm: 108,
      pipe_length: 50,
      insulation_thickness_mm: 50,
      insulation_material: 'mineral_wool',
      ambient_temperature: -20,
      process_temperature: 80,
      climate_key: undefined,
    });

    expect(api.climate_key).toBeNull();
    expect(api.climate_city).toBeNull();
    expect(api.climate_region).toBeNull();
    expect(api.climate_temperature_basis).toBeNull();
  });

  it('сохраняет явно заданные нули локальных элементов', () => {
    const api = pipeFormToApiParams({
      outer_diameter_mm: 108,
      pipe_length: 50,
      insulation_thickness_mm: 50,
      insulation_material: 'mineral_wool',
      ambient_temperature: -20,
      process_temperature: 80,
      valve_count: 0,
      flange_count: 0,
      support_count: 0,
    });

    expect(api.valve_count).toBe(0);
    expect(api.flange_count).toBe(0);
    expect(api.support_count).toBe(0);
    expect(api.num_local_elements).toBeUndefined();
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

  it('не отправляет данные скрытых слоёв при уменьшенном количестве слоёв', () => {
    const oneLayer = pipeFormToApiParams({
      outer_diameter_mm: 108,
      pipe_length: 50,
      insulation_thickness_mm: 40,
      insulation_material: 'mineral_wool',
      insulation_layer_count: '1',
      second_insulation_thickness_mm: 20,
      second_insulation_material: 'polyurethane_foam',
      third_insulation_thickness_mm: 10,
      third_insulation_material: 'foam_glass',
      ambient_temperature: -20,
      process_temperature: 80,
    });
    const twoLayers = pipeFormToApiParams({
      outer_diameter_mm: 108,
      pipe_length: 50,
      insulation_thickness_mm: 40,
      insulation_material: 'mineral_wool',
      insulation_layer_count: '2',
      second_insulation_thickness_mm: 20,
      second_insulation_material: 'polyurethane_foam',
      third_insulation_thickness_mm: 10,
      third_insulation_material: 'foam_glass',
      ambient_temperature: -20,
      process_temperature: 80,
    });

    expect(oneLayer.insulation_layers).toEqual([
      { thickness: 0.04, material: 'mineral_wool' },
    ]);
    expect(twoLayers.insulation_layers).toEqual([
      { thickness: 0.04, material: 'mineral_wool' },
      { thickness: 0.02, material: 'polyurethane_foam' },
    ]);
  });
});

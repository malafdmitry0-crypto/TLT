// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  pipeFormToApiParams,
  pipeApiParamsToForm,
  tankFormToApiParams,
} from '@/utils/objectWizardUtils';

describe('pipeFormToApiParams', () => {
  it('never writes legacy object-scoped specification options', () => {
    const api = pipeFormToApiParams({
      outer_diameter_mm: 108,
      pipe_length: 50,
      insulation_thickness_mm: 50,
      insulation_material: 'mineral_wool',
      ambient_temperature: -20,
      process_temperature: 80,
      explosion_zone_type: 'yes',
      power_indication_on_boxes: 'yes',
      end_of_section_indication: 'no',
      top_of_box_indication: 'yes',
      min_length_for_k2i: 0,
      hot_reserve_coefficient: 1.2,
      connection_type: 'loop',
    } as Parameters<typeof pipeFormToApiParams>[0]);

    expect(api).not.toHaveProperty('explosion_zone_type');
    expect(api).not.toHaveProperty('power_indication_on_boxes');
    expect(api).not.toHaveProperty('end_of_section_indication');
    expect(api).not.toHaveProperty('top_of_box_indication');
    expect(api).not.toHaveProperty('min_length_for_k2i');
    expect(api).not.toHaveProperty('hot_reserve_coefficient');
    expect(api).not.toHaveProperty('connection_type');
  });

  it('keeps legacy values from an old object inert on edit and save', () => {
    const form = pipeApiParamsToForm({
      outer_diameter: 0.108,
      pipe_length: 50,
      insulation_layers: [{ thickness: 0.05, material: 'mineral_wool' }],
      ambient_temperature: -20,
      process_temperature: 80,
      explosion_zone_type: 'yes',
      power_indication_on_boxes: 'yes',
      end_of_section_indication: 'yes',
      top_of_box_indication: 'yes',
      min_length_for_k2i: 0,
      hot_reserve_coefficient: 1.2,
      connection_type: 'star',
    });

    expect(form).not.toHaveProperty('explosion_zone_type');
    expect(form).not.toHaveProperty('power_indication_on_boxes');
    expect(form).not.toHaveProperty('end_of_section_indication');
    expect(form).not.toHaveProperty('top_of_box_indication');
    expect(form).not.toHaveProperty('min_length_for_k2i');
    expect(form).not.toHaveProperty('hot_reserve_coefficient');
    expect(pipeFormToApiParams(form as Parameters<typeof pipeFormToApiParams>[0]))
      .not.toHaveProperty('explosion_zone_type');
  });

  it('never writes legacy specification options from a tank draft either', () => {
    const api = tankFormToApiParams({
      shape: 'cylindrical',
      diameter_mm: 2000,
      height_mm: 3000,
      insulation_thickness_mm: 80,
      insulation_material: 'mineral_wool',
      ambient_temperature: -20,
      process_temperature: 80,
      explosion_zone_type: 'yes',
      power_indication_on_boxes: 'yes',
      end_of_section_indication: 'no',
      top_of_box_indication: 'yes',
      min_length_for_k2i: 0,
      hot_reserve_coefficient: 1.2,
    } as Parameters<typeof tankFormToApiParams>[0]);

    expect(api).not.toHaveProperty('explosion_zone_type');
    expect(api).not.toHaveProperty('power_indication_on_boxes');
    expect(api).not.toHaveProperty('end_of_section_indication');
    expect(api).not.toHaveProperty('top_of_box_indication');
    expect(api).not.toHaveProperty('min_length_for_k2i');
    expect(api).not.toHaveProperty('hot_reserve_coefficient');
    expect(api).not.toHaveProperty('connection_type');
  });

  it('не добавляет tank-only location даже для незаполненной pipe-формы', () => {
    const api = pipeFormToApiParams(
      { placement: 'outdoor' } as Parameters<typeof pipeFormToApiParams>[0],
    );

    expect(api).toMatchObject({ placement: 'outdoor' });
    expect(api).not.toHaveProperty('location');
  });

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
    expect(api.insulation_layers).toEqual([{ thickness: 0.05, material: 'mineral_wool' }]);
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
      ground_temperature: 8,
      burial_depth: 1.2,
      ground_type: 'clay',
      ground_conductivity: 1.7,
      climate_region: 'ХМАО',
      climate_city: 'Сургут',
      climate_temperature_basis: 't_0_92',
      ambient_temperature_source: 'climate',
      wind_speed_source: 'climate',
      safety_factor: 1.2,
      safety_factor_source: 'manual',
      maintain_temperature: 15,
      steam_tracing: 'yes',
      vapor_temperature: 140,
      num_local_elements: 6,
      local_element_equiv_length: 1.5,
    } as Parameters<typeof pipeFormToApiParams>[0]);

    expect(api.wall_thickness).toBeCloseTo(0.004);
    expect(api.pipe_material).toBeUndefined();
    expect(api.pipe_lambda).toBe(56);
    expect(api.placement).toBe('underground');
    expect(api.ground_temperature).toBe(8);
    expect(api.ground_temperature_source).toBe('manual');
    expect(api.pipe_centerline_depth).toBe(1.2);
    expect(api.ambient_temperature).toBeUndefined();
    expect(api.wind_speed).toBeUndefined();
    expect(api).not.toHaveProperty('alpha_vnesh');
    expect(api.ground_type).toBe('clay');
    expect(api.ground_conductivity).toBe(1.7);
    expect(api.ground_conductivity_source).toBe('reference');
    expect(api.climate_key).toBe('ХМАО|||Сургут');
    expect(api.climate_temperature_basis).toBeUndefined();
    expect(api.ambient_temperature_source).toBeUndefined();
    expect(api.wind_speed_source).toBeUndefined();
    expect(api.safety_factor).toBe(1.2);
    expect(api.safety_factor_source).toBe('manual');
    expect(api).not.toHaveProperty('supply_voltage');
    expect(api.maintain_temperature).toBe(15);
    expect(api).not.toHaveProperty('aggressive_product');
    expect(api.steam_tracing).toBe('yes');
    expect(api.vapor_temperature).toBe(140);
    expect(api.insulation_cover_material).toBe('none');
    expect(api).not.toHaveProperty('max_ambient_temperature');
    expect(api.max_process_temperature).toBe(90);
    expect(api.num_local_elements).toBe(6);
    expect(api.local_element_equiv_length).toBe(1.5);
    expect(api).not.toHaveProperty('valve_count');
    expect(api).not.toHaveProperty('flange_count');
    expect(api).not.toHaveProperty('support_count');
  });

  it('clears stale steam temperature when steam tracing is disabled', () => {
    const api = pipeFormToApiParams({
      outer_diameter_mm: 108,
      pipe_length: 50,
      insulation_thickness_mm: 50,
      insulation_material: 'mineral_wool',
      ambient_temperature: -20,
      process_temperature: 80,
      maintain_temperature: 15,
      steam_tracing: 'no',
      vapor_temperature: 140,
    });

    expect(api).toMatchObject({
      maintain_temperature: 15,
      steam_tracing: 'no',
    });
    expect(api).not.toHaveProperty('aggressive_product');
    expect(api).not.toHaveProperty('vapor_temperature');
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
      num_local_elements: 0,
    });

    expect(api.num_local_elements).toBe(0);
    expect(api).not.toHaveProperty('valve_count');
    expect(api).not.toHaveProperty('flange_count');
    expect(api).not.toHaveProperty('support_count');
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
    expect(api).not.toHaveProperty('insulation_layer_count');
    expect(api.insulation_layers).toEqual([
      { thickness: 0.04, material: 'mineral_wool' },
      { thickness: 0.02, material: 'polyurethane_foam' },
      { thickness: 0.01, material: 'foam_glass' },
    ]);
    expect(api).not.toHaveProperty('insulation_thickness');
    expect(api).not.toHaveProperty('insulation_material');
    expect(api).not.toHaveProperty('insulation_layer_count');
  });

  it('round-trips canonical underground payload without legacy aliases', () => {
    const api = pipeFormToApiParams({
      outer_diameter_mm: 108,
      wall_thickness_mm: 4,
      pipe_length: 50,
      insulation_thickness_mm: 40,
      insulation_material: 'mineral_wool',
      ambient_temperature: -20,
      process_temperature: 80,
      placement: 'underground',
      ground_temperature: 8,
      ground_temperature_source: 'manual',
      burial_depth: 1.2,
      ground_type: 'clay',
      ground_conductivity: 1.7,
      pipe_material: 'carbon_steel',
    });

    expect(api).not.toHaveProperty('location');
    expect(api).not.toHaveProperty('burial_depth');
    expect(api).not.toHaveProperty('insulation_thickness');
    expect(api).not.toHaveProperty('insulation_material');
    expect(api).not.toHaveProperty('insulation_layer_count');
    expect(pipeApiParamsToForm(api)).toMatchObject({
      outer_diameter_mm: 108,
      wall_thickness_mm: 4,
      placement: 'underground',
      ground_temperature: 8,
      burial_depth: 1.2,
      insulation_thickness_mm: 40,
      insulation_material: 'mineral_wool',
      insulation_layer_count: '1',
      pipe_material: 'carbon_steel',
      pipe_lambda_mode: 'reference',
      ground_conductivity_source: 'reference',
    });
  });

  it('очищает ground-ветку из воздушного payload при смене placement', () => {
    const api = pipeFormToApiParams({
      outer_diameter_mm: 108,
      pipe_length: 50,
      insulation_thickness_mm: 40,
      insulation_material: 'mineral_wool',
      ambient_temperature: -20,
      process_temperature: 80,
      placement: 'outdoor',
      ground_temperature: 8,
      burial_depth: 1.2,
      ground_type: 'clay',
      ground_conductivity: 1.7,
      wind_speed: 3,
    });

    expect(api.ambient_temperature).toBe(-20);
    expect(api.wind_speed).toBe(3);
    expect(api).not.toHaveProperty('ground_temperature');
    expect(api).not.toHaveProperty('ground_temperature_source');
    expect(api).not.toHaveProperty('pipe_centerline_depth');
    expect(api).not.toHaveProperty('ground_type');
    expect(api).not.toHaveProperty('ground_conductivity');
    expect(api).not.toHaveProperty('ground_conductivity_source');
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

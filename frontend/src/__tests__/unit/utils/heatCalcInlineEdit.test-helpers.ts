import type { ProjectObject } from '@/types/project';

export function makePipe(): ProjectObject {
  return {
    id: 'pipe-1',
    project_id: 'project-1',
    object_type: 'pipe',
    sort_order: 0,
    version: 1,
    params: {
      name: 'Pipe 1',
      outer_diameter: 0.108,
      wall_thickness: 0.004,
      pipe_material: 'carbon_steel',
      pipe_length: 50,
      insulation_thickness: 0.05,
      insulation_material: 'mineral_wool',
      ambient_temperature: -20,
      process_temperature: 80,
      placement: 'outdoor',
      min_switch_temperature: -20,
      supply_voltage: 220,
      safety_factor: 1.2,
    },
    results: null,
    is_valid: true,
    validation_errors: null,
    created_at: '2026-05-10T00:00:00Z',
    updated_at: '2026-05-10T00:00:00Z',
  };
}

export function makeInvalidDeclaredThreeLayerPipe(): ProjectObject {
  const record = makePipe();
  return {
    ...record,
    params: {
      ...record.params,
      insulation_layer_count: '3',
      insulation_layers: [
        { thickness: 0.05, material: 'mineral_wool' },
      ],
    },
    is_valid: false,
    validation_errors: {
      message: 'Не заполнены обязательные поля объекта: Толщина 2-го слоя изоляции, Материал 2-го слоя изоляции, Толщина 3-го слоя изоляции, Материал 3-го слоя изоляции',
    },
  };
}

export function makeValidThreeLayerPipe(): ProjectObject {
  const record = makePipe();
  return {
    ...record,
    params: {
      ...record.params,
      insulation_layer_count: '3',
      insulation_layers: [
        { thickness: 0.05, material: 'mineral_wool' },
        { thickness: 0.02, material: 'polyurethane_foam' },
        { thickness: 0.01, material: 'foam_glass' },
      ],
    },
  };
}

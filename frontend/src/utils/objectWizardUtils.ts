/**
 * Utility helpers for the multi-step object wizard.
 *
 * Unit convention:
 *   Form fields use mm for diameters / thicknesses (more intuitive for engineers).
 *   API params use metres (as required by the backend).
 *
 * Naming / DN: pure helpers live in objectWizardNaming.ts and are re-exported here
 * for stable public import paths.
 */

export {
  findDN,
  generatePipeName,
  generateTankName,
  formatWizardNameNumber,
  type PipeNameFields,
  type TankNameFields,
} from '@/utils/objectWizardNaming';

type InsulationTemperatureBasis =
  | 'indoor'
  | 'outdoor_summer'
  | 'outdoor_winter'
  | 'channel'
  | 'tunnel'
  | 'technical_subfloor'
  | 'attic'
  | 'basement';
type SafetyFactorSource = 'default' | 'manual' | 'climate_policy';
export type ObjectWizardFormValues = Partial<PipeFormValues & TankFormValues & { name: string }>;

export const COMMON_OBJECT_FORM_DEFAULTS: ObjectWizardFormValues = {
  placement: 'outdoor',
  insulation_layer_count: '1',
  insulation_cover_material: 'none',
  environment: 'normal',
  zone_classification: 'safe',
  temperature_group: 'T1',
  supply_voltage: 220,
  steam_tracing: 'no',
  winding_coefficient: 1,
  explosion_zone_type: 'no',
  power_indication_on_boxes: 'no',
  end_of_section_indication: 'no',
  top_of_box_indication: 'no',
};

export const PIPE_OBJECT_FORM_DEFAULTS: ObjectWizardFormValues = {
  pipe_lambda_mode: 'reference',
  pipe_material: 'carbon_steel',
};

export const TANK_OBJECT_FORM_DEFAULTS: ObjectWizardFormValues = {
  shape: 'cylindrical',
};

function defaultInsulationTemperatureBasisForPlacement(
  placement: unknown,
): InsulationTemperatureBasis | undefined {
  if (placement === 'indoor') return 'indoor';
  if (placement === 'underground') return 'channel';
  if (placement === 'outdoor') return 'outdoor_winter';
  return undefined;
}

function isEmptyFormValue(value: unknown) {
  return value === undefined || value === null || value === '';
}

export function formDefaultsForObjectType(objectType: 'pipe' | 'tank'): ObjectWizardFormValues {
  return {
    ...COMMON_OBJECT_FORM_DEFAULTS,
    ...(objectType === 'pipe' ? PIPE_OBJECT_FORM_DEFAULTS : TANK_OBJECT_FORM_DEFAULTS),
  };
}

export function applyObjectFormDefaults(
  objectType: 'pipe' | 'tank',
  values?: ObjectWizardFormValues,
): ObjectWizardFormValues {
  const defaults = formDefaultsForObjectType(objectType);
  const merged: ObjectWizardFormValues = { ...defaults, ...(values ?? {}) };
  // Restore empty default keys via spread (no heterogeneous index write).
  const next: ObjectWizardFormValues = {
    ...merged,
    ...Object.fromEntries(
      Object.entries(defaults).filter(([key]) =>
        isEmptyFormValue(merged[key as keyof ObjectWizardFormValues]),
      ),
    ),
  };
  if (isEmptyFormValue(next.insulation_temperature_basis)) {
    next.insulation_temperature_basis = defaultInsulationTemperatureBasisForPlacement(next.placement);
  }
  return next;
}

// ---------------------------------------------------------------------------
// Auto-name generators
// ---------------------------------------------------------------------------

export interface PipeFormValues {
  outer_diameter_mm: number;
  wall_thickness_mm?: number;
  pipe_material?: string;
  pipe_lambda?: number;
  pipe_lambda_mode?: 'reference' | 'manual';
  insulation_thickness_mm: number;
  insulation_material: string;
  insulation_cover_material?: string;
  insulation_layer_count?: '1' | '2' | '3';
  first_insulation_lambda?: number;
  first_insulation_temperature_min?: number;
  first_insulation_temperature_max?: number;
  second_insulation_thickness_mm?: number;
  second_insulation_material?: string;
  second_insulation_lambda?: number;
  second_insulation_temperature_min?: number;
  second_insulation_temperature_max?: number;
  third_insulation_thickness_mm?: number;
  third_insulation_material?: string;
  third_insulation_lambda?: number;
  third_insulation_temperature_min?: number;
  third_insulation_temperature_max?: number;
  ambient_temperature: number;
  process_temperature: number;
  max_ambient_temperature?: number;
  max_process_temperature?: number;
  environment?: 'normal' | 'aggressive';
  zone_classification?: 'safe' | 'explosive';
  temperature_group?: 'T1' | 'T2' | 'T3' | 'T4' | 'T5' | 'T6';
  placement?: 'outdoor' | 'indoor' | 'underground';
  burial_depth?: number;
  ground_type?: string;
  ground_conductivity?: number;
  wind_speed?: number;
  alpha_vnesh?: number;
  climate_city?: string;
  climate_region?: string;
  climate_key?: string;
  climate_temperature_basis?: 't_0_92' | 't_0_98' | 't_abs_min';
  insulation_temperature_basis?: InsulationTemperatureBasis;
  ambient_temperature_source?: 'manual' | 'climate';
  wind_speed_source?: 'manual' | 'climate';
  pipe_length: number;
  min_switch_temperature?: number;
  supply_voltage?: number;
  safety_factor?: number;
  safety_factor_source?: SafetyFactorSource;
  steam_tracing?: 'yes' | 'no';
  vapor_temperature?: number;
  /** Коэффициент навива w (алгоритм выбора кабеля, ТНП). */
  winding_coefficient?: number;
  /** Схема соединения (алгоритм выбора кабеля, ТНП). */
  connection_type?: string;
  explosion_zone_type?: 'yes' | 'no';
  power_indication_on_boxes?: 'yes' | 'no';
  end_of_section_indication?: 'yes' | 'no';
  top_of_box_indication?: 'yes' | 'no';
  min_length_for_k2i?: number;
  hot_reserve_coefficient?: number;
  valve_count?: number;
  flange_count?: number;
  support_count?: number;
  num_local_elements?: number;
  local_element_equiv_length?: number;
}

export interface TankFormValues {
  shape: 'cylindrical' | 'rectangular' | 'spherical';
  diameter_mm?: number;
  height_mm?: number;
  length_mm?: number;
  width_mm?: number;
  wall_thickness_mm?: number;
  wall_lambda?: number;
  insulation_thickness_mm: number;
  insulation_material: string;
  insulation_cover_material?: string;
  insulation_layer_count?: '1' | '2' | '3';
  first_insulation_lambda?: number;
  first_insulation_temperature_min?: number;
  first_insulation_temperature_max?: number;
  second_insulation_thickness_mm?: number;
  second_insulation_material?: string;
  second_insulation_lambda?: number;
  second_insulation_temperature_min?: number;
  second_insulation_temperature_max?: number;
  third_insulation_thickness_mm?: number;
  third_insulation_material?: string;
  third_insulation_lambda?: number;
  third_insulation_temperature_min?: number;
  third_insulation_temperature_max?: number;
  ambient_temperature: number;
  process_temperature: number;
  max_ambient_temperature?: number;
  max_process_temperature?: number;
  environment?: 'normal' | 'aggressive';
  zone_classification?: 'safe' | 'explosive';
  temperature_group?: 'T1' | 'T2' | 'T3' | 'T4' | 'T5' | 'T6';
  placement?: 'outdoor' | 'indoor' | 'underground';
  burial_depth?: number;
  ground_type?: string;
  ground_conductivity?: number;
  wind_speed?: number;
  alpha_vnesh?: number;
  climate_city?: string;
  climate_region?: string;
  climate_key?: string;
  climate_temperature_basis?: 't_0_92' | 't_0_98' | 't_abs_min';
  insulation_temperature_basis?: InsulationTemperatureBasis;
  ambient_temperature_source?: 'manual' | 'climate';
  wind_speed_source?: 'manual' | 'climate';
  min_switch_temperature?: number;
  supply_voltage?: number;
  safety_factor?: number;
  safety_factor_source?: SafetyFactorSource;
  steam_tracing?: 'yes' | 'no';
  vapor_temperature?: number;
  /** Коэффициент навива w (алгоритм выбора кабеля, ТНП). */
  winding_coefficient?: number;
  /** Схема соединения (алгоритм выбора кабеля, ТНП). */
  connection_type?: string;
  explosion_zone_type?: 'yes' | 'no';
  power_indication_on_boxes?: 'yes' | 'no';
  end_of_section_indication?: 'yes' | 'no';
  top_of_box_indication?: 'yes' | 'no';
  min_length_for_k2i?: number;
  hot_reserve_coefficient?: number;
  q_additional?: number;
}

// ---------------------------------------------------------------------------
// Form ↔ API mappers (implementation in objectWizardFormMappers; re-export for stable paths)
// ---------------------------------------------------------------------------

export {
  pipeFormToApiParams,
  tankFormToApiParams,
  pipeApiParamsToForm,
  tankApiParamsToForm,
} from '@/utils/objectWizardFormMappers';

/**
 * Utility helpers for the multi-step object wizard.
 *
 * Unit convention:
 *   Form fields use mm for diameters / thicknesses (more intuitive for engineers).
 *   API params use metres (as required by the backend).
 */

// ---------------------------------------------------------------------------
// DN lookup — outer diameter in mm → closest nominal pipe diameter (DN)
// ---------------------------------------------------------------------------
const DN_TABLE: [number, number][] = [
  [10.2, 6],
  [13.5, 8],
  [17.2, 10],
  [21.3, 15],
  [26.9, 20],
  [33.7, 25],
  [42.3, 32],
  [48.3, 40],
  [60.3, 50],
  [76.1, 65],
  [88.9, 80],
  [101.6, 90],
  [114.3, 100],
  [127.0, 110],
  [139.7, 125],
  [168.3, 150],
  [193.7, 175],
  [219.1, 200],
  [244.5, 225],
  [273.0, 250],
  [323.9, 300],
  [355.6, 350],
  [406.4, 400],
  [457.0, 450],
  [508.0, 500],
  [610.0, 600],
  [711.0, 700],
  [813.0, 800],
  [914.0, 900],
  [1016.0, 1000],
];

/** Find the nearest DN for an outer diameter in mm. */
export function findDN(outerDiameterMm: number): number | null {
  if (!outerDiameterMm || outerDiameterMm <= 0) return null;
  let best: [number, number] | null = null;
  let bestDiff = Infinity;
  for (const [odMm, dn] of DN_TABLE) {
    const diff = Math.abs(odMm - outerDiameterMm);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = [odMm, dn];
    }
  }
  // Only show DN hint if we're within 5 mm of a standard size
  if (best && bestDiff <= 5) return best[1];
  return null;
}

// ---------------------------------------------------------------------------
// Short material labels for auto-name (trimmed from full display names)
// ---------------------------------------------------------------------------
const MATERIAL_SHORT: Record<string, string> = {
  mineral_wool: 'МВ',
  glass_wool: 'СВ',
  polyurethane: 'ППУ',
  polyurethane_foam: 'ППУ',
  foam_glass: 'ПС',
  expanded_perlite: 'Пер',
  aerogel: 'АГ',
  basalt_fiber: 'БВ',
  polystyrene: 'ПСТ',
};

function shortMaterial(code: string): string {
  return MATERIAL_SHORT[code] ?? code;
}

function fmt(val: number, decimals = 0): string {
  // Срезаем хвостовые нули ТОЛЬКО после точки: "50.00" → "50", но "50" → "50".
  // Старая версия (без $-якоря на точку) портила «δ=50 мм» → «δ=5 мм».
  return val.toFixed(decimals).replace(/\.0+$|(\.\d*?)0+$/, '$1');
}

function tempSign(t: number): string {
  return t >= 0 ? `+${fmt(t)}` : fmt(t);
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
  second_insulation_thickness_mm?: number;
  second_insulation_material?: string;
  second_insulation_lambda?: number;
  third_insulation_thickness_mm?: number;
  third_insulation_material?: string;
  third_insulation_lambda?: number;
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
  ambient_temperature_source?: 'manual' | 'climate';
  wind_speed_source?: 'manual' | 'climate';
  pipe_length: number;
  min_switch_temperature?: number;
  supply_voltage?: number;
  safety_factor?: number;
  steam_tracing?: 'yes' | 'no';
  valve_count?: number;
  flange_count?: number;
  support_count?: number;
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
  second_insulation_thickness_mm?: number;
  second_insulation_material?: string;
  second_insulation_lambda?: number;
  third_insulation_thickness_mm?: number;
  third_insulation_material?: string;
  third_insulation_lambda?: number;
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
  ambient_temperature_source?: 'manual' | 'climate';
  wind_speed_source?: 'manual' | 'climate';
  min_switch_temperature?: number;
  supply_voltage?: number;
  safety_factor?: number;
  steam_tracing?: 'yes' | 'no';
  q_additional?: number;
}

export function generatePipeName(v: PipeFormValues): string {
  const dn = findDN(v.outer_diameter_mm);
  const dnPart = dn != null ? ` (DN${dn})` : '';
  const mat = shortMaterial(v.insulation_material ?? '');
  const tAmb = tempSign(v.ambient_temperature);
  const tProc = tempSign(v.process_temperature);
  return `Труба Ø${fmt(v.outer_diameter_mm)} мм${dnPart}, δ=${fmt(v.insulation_thickness_mm)} мм, ${mat}, L=${fmt(v.pipe_length, 1)} м, ${tAmb}→${tProc}°C`;
}

export function generateTankName(v: TankFormValues): string {
  const mat = shortMaterial(v.insulation_material ?? '');
  const tAmb = tempSign(v.ambient_temperature);
  const tProc = tempSign(v.process_temperature);
  const ins = `δ=${fmt(v.insulation_thickness_mm)} мм, ${mat}`;

  if (v.shape === 'cylindrical') {
    const d = v.diameter_mm ? `Ø${fmt(v.diameter_mm)} мм` : '';
    const h = v.height_mm ? `×H${fmt(v.height_mm)} мм` : '';
    return `Бак цил. ${d}${h}, ${ins}, ${tAmb}→${tProc}°C`;
  }
  if (v.shape === 'rectangular') {
    const dims = [v.length_mm, v.width_mm, v.height_mm]
      .filter(Boolean)
      .map((x) => fmt(x!))
      .join('×');
    return `Бак прям. ${dims} мм, ${ins}, ${tAmb}→${tProc}°C`;
  }
  if (v.shape === 'spherical') {
    const d = v.diameter_mm ? `Ø${fmt(v.diameter_mm)} мм` : '';
    return `Бак сфер. ${d}, ${ins}, ${tAmb}→${tProc}°C`;
  }
  return `Бак, ${ins}, ${tAmb}→${tProc}°C`;
}

// ---------------------------------------------------------------------------
// Conversion: form values (mm) → API params (metres)
// ---------------------------------------------------------------------------

export function pipeFormToApiParams(
  v: PipeFormValues & { name?: string }
): Record<string, unknown> {
  const params: Record<string, unknown> = {
    outer_diameter: v.outer_diameter_mm / 1000,
    insulation_thickness: v.insulation_thickness_mm / 1000,
    insulation_material: v.insulation_material,
    ambient_temperature: v.ambient_temperature,
    process_temperature: v.process_temperature,
    pipe_length: v.pipe_length,
  };
  applyCommonObjectParams(params, v);
  if (v.wall_thickness_mm != null) params.wall_thickness = v.wall_thickness_mm / 1000;
  if (v.pipe_lambda_mode === 'manual') {
    if (v.pipe_lambda != null) params.pipe_lambda = v.pipe_lambda;
  } else if (v.pipe_material) {
    params.pipe_material = v.pipe_material;
  }
  const localCount =
    Number(v.valve_count ?? 0) + Number(v.flange_count ?? 0) + Number(v.support_count ?? 0);
  params.valve_count = Number(v.valve_count ?? 0);
  params.flange_count = Number(v.flange_count ?? 0);
  params.support_count = Number(v.support_count ?? 0);
  if (localCount > 0) params.num_local_elements = localCount;
  if (localCount > 0 && v.local_element_equiv_length != null) {
    params.local_element_equiv_length = v.local_element_equiv_length;
  }
  applyInsulationLayers(params, v);
  if (v.name) params.name = v.name;
  return params;
}

export function tankFormToApiParams(
  v: TankFormValues & { name?: string }
): Record<string, unknown> {
  const params: Record<string, unknown> = {
    shape: v.shape,
    insulation_thickness: v.insulation_thickness_mm / 1000,
    insulation_material: v.insulation_material,
    ambient_temperature: v.ambient_temperature,
    process_temperature: v.process_temperature,
  };
  applyCommonObjectParams(params, v);
  applyInsulationLayers(params, v);
  if (v.diameter_mm != null) params.diameter = v.diameter_mm / 1000;
  if (v.height_mm != null) params.height = v.height_mm / 1000;
  if (v.length_mm != null) params.length = v.length_mm / 1000;
  if (v.width_mm != null) params.width = v.width_mm / 1000;
  if (v.wall_thickness_mm != null) params.wall_thickness = v.wall_thickness_mm / 1000;
  if (v.wall_lambda != null) params.wall_lambda = v.wall_lambda;
  if (v.q_additional != null) params.q_additional = v.q_additional;
  if (v.name) params.name = v.name;
  return params;
}

type LayeredFormValues = Pick<
  PipeFormValues,
  | 'insulation_thickness_mm'
  | 'insulation_material'
  | 'insulation_layer_count'
  | 'first_insulation_lambda'
  | 'second_insulation_thickness_mm'
  | 'second_insulation_material'
  | 'second_insulation_lambda'
  | 'third_insulation_thickness_mm'
  | 'third_insulation_material'
  | 'third_insulation_lambda'
>;

function applyCommonObjectParams(params: Record<string, unknown>, v: PipeFormValues | TankFormValues) {
  const placement = v.placement ?? 'outdoor';
  params.placement = placement;
  params.location = placement === 'indoor' ? 'indoor' : 'outdoor';
  if (placement === 'underground' && v.burial_depth != null) {
    params.burial_depth = v.burial_depth;
  }
  if (placement === 'underground' && v.ground_type) params.ground_type = v.ground_type;
  if (placement === 'underground' && v.ground_conductivity != null) {
    params.ground_conductivity = v.ground_conductivity;
  }
  if (v.wind_speed != null) params.wind_speed = v.wind_speed;
  if (v.alpha_vnesh != null) params.alpha_vnesh = v.alpha_vnesh;
  if (v.climate_city) params.climate_city = v.climate_city;
  if (v.climate_region) params.climate_region = v.climate_region;
  if (v.climate_temperature_basis) {
    params.climate_temperature_basis = v.climate_temperature_basis;
  }
  if (v.ambient_temperature_source) {
    params.ambient_temperature_source = v.ambient_temperature_source;
  }
  if (v.wind_speed_source) params.wind_speed_source = v.wind_speed_source;
  if (v.insulation_cover_material) params.insulation_cover_material = v.insulation_cover_material;
  if (v.max_ambient_temperature != null) params.max_ambient_temperature = v.max_ambient_temperature;
  if (v.max_process_temperature != null) params.max_process_temperature = v.max_process_temperature;
  if (v.environment) params.environment = v.environment;
  if (v.zone_classification) params.zone_classification = v.zone_classification;
  if (v.temperature_group) params.temperature_group = v.temperature_group;
  if (v.min_switch_temperature != null) params.min_switch_temperature = v.min_switch_temperature;
  if (v.supply_voltage != null) params.supply_voltage = v.supply_voltage;
  if (v.safety_factor != null) params.safety_factor = v.safety_factor;
  if (v.steam_tracing) params.steam_tracing = v.steam_tracing;
}

function applyInsulationLayers(params: Record<string, unknown>, v: LayeredFormValues) {
  const count = Number(v.insulation_layer_count ?? '1');
  params.insulation_layer_count = String(Math.min(Math.max(count || 1, 1), 3));

  const layers = [
    {
      thickness: v.insulation_thickness_mm / 1000,
      material: v.insulation_material,
      ...(v.insulation_material === 'other' && v.first_insulation_lambda != null
        ? { conductivity: v.first_insulation_lambda }
        : {}),
    },
  ];

  if (count >= 2 && v.second_insulation_thickness_mm != null && v.second_insulation_material) {
    layers.push({
      thickness: v.second_insulation_thickness_mm / 1000,
      material: v.second_insulation_material,
      ...(v.second_insulation_material === 'other' && v.second_insulation_lambda != null
        ? { conductivity: v.second_insulation_lambda }
        : {}),
    });
  }
  if (count >= 3 && v.third_insulation_thickness_mm != null && v.third_insulation_material) {
    layers.push({
      thickness: v.third_insulation_thickness_mm / 1000,
      material: v.third_insulation_material,
      ...(v.third_insulation_material === 'other' && v.third_insulation_lambda != null
        ? { conductivity: v.third_insulation_lambda }
        : {}),
    });
  }

  params.insulation_layers = layers;
}

// ---------------------------------------------------------------------------
// Conversion: API params (metres) → form values (mm) for edit mode
// ---------------------------------------------------------------------------

export function pipeApiParamsToForm(p: Record<string, unknown>): Partial<PipeFormValues & { name: string }> {
  const layers = Array.isArray(p.insulation_layers)
    ? (p.insulation_layers as Record<string, unknown>[])
    : [];
  return {
    outer_diameter_mm: p.outer_diameter != null ? Number(p.outer_diameter) * 1000 : undefined,
    wall_thickness_mm: p.wall_thickness != null ? Number(p.wall_thickness) * 1000 : undefined,
    pipe_material: p.pipe_material as string | undefined,
    pipe_lambda: p.pipe_lambda as number | undefined,
    pipe_lambda_mode: p.pipe_lambda != null ? 'manual' : 'reference',
    insulation_thickness_mm:
      layers[0]?.thickness != null
        ? Number(layers[0].thickness) * 1000
        : p.insulation_thickness != null ? Number(p.insulation_thickness) * 1000 : undefined,
    insulation_material:
      (layers[0]?.material as string | undefined) ?? (p.insulation_material as string | undefined),
    first_insulation_lambda: layers[0]?.conductivity as number | undefined,
    insulation_cover_material: p.insulation_cover_material as string | undefined,
    insulation_layer_count:
      p.insulation_layer_count != null
        ? String(p.insulation_layer_count) as PipeFormValues['insulation_layer_count']
        : layers.length > 0 ? String(Math.min(layers.length, 3)) as PipeFormValues['insulation_layer_count'] : '1',
    second_insulation_thickness_mm:
      layers[1]?.thickness != null ? Number(layers[1].thickness) * 1000 : undefined,
    second_insulation_material: layers[1]?.material as string | undefined,
    second_insulation_lambda: layers[1]?.conductivity as number | undefined,
    third_insulation_thickness_mm:
      layers[2]?.thickness != null ? Number(layers[2].thickness) * 1000 : undefined,
    third_insulation_material: layers[2]?.material as string | undefined,
    third_insulation_lambda: layers[2]?.conductivity as number | undefined,
    ambient_temperature: p.ambient_temperature as number | undefined,
    process_temperature: p.process_temperature as number | undefined,
    max_ambient_temperature: p.max_ambient_temperature as number | undefined,
    max_process_temperature: p.max_process_temperature as number | undefined,
    environment: p.environment as PipeFormValues['environment'],
    zone_classification: p.zone_classification as PipeFormValues['zone_classification'],
    temperature_group: p.temperature_group as PipeFormValues['temperature_group'],
    placement:
      (p.placement as PipeFormValues['placement']) ??
      (p.burial_depth != null ? 'underground' : p.location as PipeFormValues['placement']),
    burial_depth: p.burial_depth as number | undefined,
    ground_type: p.ground_type as string | undefined,
    ground_conductivity: p.ground_conductivity as number | undefined,
    wind_speed: p.wind_speed as number | undefined,
    alpha_vnesh: p.alpha_vnesh as number | undefined,
    climate_city: p.climate_city as string | undefined,
    climate_region: p.climate_region as string | undefined,
    climate_key:
      p.climate_region != null && p.climate_city != null
        ? `${String(p.climate_region)}|||${String(p.climate_city)}`
        : undefined,
    climate_temperature_basis:
      p.climate_temperature_basis as PipeFormValues['climate_temperature_basis'],
    ambient_temperature_source:
      p.ambient_temperature_source as PipeFormValues['ambient_temperature_source'],
    wind_speed_source: p.wind_speed_source as PipeFormValues['wind_speed_source'],
    pipe_length: p.pipe_length as number | undefined,
    min_switch_temperature: p.min_switch_temperature as number | undefined,
    supply_voltage: p.supply_voltage as number | undefined,
    safety_factor: p.safety_factor as number | undefined,
    steam_tracing: p.steam_tracing as PipeFormValues['steam_tracing'],
    valve_count: p.valve_count as number | undefined,
    flange_count: p.flange_count as number | undefined,
    support_count: p.support_count as number | undefined,
    local_element_equiv_length: p.local_element_equiv_length as number | undefined,
    name: p.name as string | undefined,
  };
}

export function tankApiParamsToForm(p: Record<string, unknown>): Partial<TankFormValues & { name: string }> {
  const layers = Array.isArray(p.insulation_layers)
    ? (p.insulation_layers as Record<string, unknown>[])
    : [];
  return {
    shape: (p.shape as TankFormValues['shape']) ?? 'cylindrical',
    diameter_mm: p.diameter != null ? Number(p.diameter) * 1000 : undefined,
    height_mm: p.height != null ? Number(p.height) * 1000 : undefined,
    length_mm: p.length != null ? Number(p.length) * 1000 : undefined,
    width_mm: p.width != null ? Number(p.width) * 1000 : undefined,
    wall_thickness_mm: p.wall_thickness != null ? Number(p.wall_thickness) * 1000 : undefined,
    wall_lambda: p.wall_lambda as number | undefined,
    insulation_thickness_mm:
      layers[0]?.thickness != null
        ? Number(layers[0].thickness) * 1000
        : p.insulation_thickness != null ? Number(p.insulation_thickness) * 1000 : undefined,
    insulation_material:
      (layers[0]?.material as string | undefined) ?? (p.insulation_material as string | undefined),
    first_insulation_lambda: layers[0]?.conductivity as number | undefined,
    insulation_cover_material: p.insulation_cover_material as string | undefined,
    insulation_layer_count:
      p.insulation_layer_count != null
        ? String(p.insulation_layer_count) as TankFormValues['insulation_layer_count']
        : layers.length > 0 ? String(Math.min(layers.length, 3)) as TankFormValues['insulation_layer_count'] : '1',
    second_insulation_thickness_mm:
      layers[1]?.thickness != null ? Number(layers[1].thickness) * 1000 : undefined,
    second_insulation_material: layers[1]?.material as string | undefined,
    second_insulation_lambda: layers[1]?.conductivity as number | undefined,
    third_insulation_thickness_mm:
      layers[2]?.thickness != null ? Number(layers[2].thickness) * 1000 : undefined,
    third_insulation_material: layers[2]?.material as string | undefined,
    third_insulation_lambda: layers[2]?.conductivity as number | undefined,
    ambient_temperature: p.ambient_temperature as number | undefined,
    process_temperature: p.process_temperature as number | undefined,
    max_ambient_temperature: p.max_ambient_temperature as number | undefined,
    max_process_temperature: p.max_process_temperature as number | undefined,
    environment: p.environment as TankFormValues['environment'],
    zone_classification: p.zone_classification as TankFormValues['zone_classification'],
    temperature_group: p.temperature_group as TankFormValues['temperature_group'],
    placement:
      (p.placement as TankFormValues['placement']) ??
      (p.burial_depth != null ? 'underground' : p.location as TankFormValues['placement']),
    burial_depth: p.burial_depth as number | undefined,
    ground_type: p.ground_type as string | undefined,
    ground_conductivity: p.ground_conductivity as number | undefined,
    wind_speed: p.wind_speed as number | undefined,
    alpha_vnesh: p.alpha_vnesh as number | undefined,
    climate_city: p.climate_city as string | undefined,
    climate_region: p.climate_region as string | undefined,
    climate_key:
      p.climate_region != null && p.climate_city != null
        ? `${String(p.climate_region)}|||${String(p.climate_city)}`
        : undefined,
    climate_temperature_basis:
      p.climate_temperature_basis as TankFormValues['climate_temperature_basis'],
    ambient_temperature_source:
      p.ambient_temperature_source as TankFormValues['ambient_temperature_source'],
    wind_speed_source: p.wind_speed_source as TankFormValues['wind_speed_source'],
    min_switch_temperature: p.min_switch_temperature as number | undefined,
    supply_voltage: p.supply_voltage as number | undefined,
    safety_factor: p.safety_factor as number | undefined,
    steam_tracing: p.steam_tracing as TankFormValues['steam_tracing'],
    q_additional: p.q_additional as number | undefined,
    name: p.name as string | undefined,
  };
}

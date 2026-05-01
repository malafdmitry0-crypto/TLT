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
  insulation_thickness_mm: number;
  insulation_material: string;
  insulation_layer_count?: '1' | '2' | '3';
  second_insulation_thickness_mm?: number;
  second_insulation_material?: string;
  third_insulation_thickness_mm?: number;
  third_insulation_material?: string;
  ambient_temperature: number;
  process_temperature: number;
  pipe_length: number;
}

export interface TankFormValues {
  shape: 'cylindrical' | 'rectangular' | 'spherical';
  diameter_mm?: number;
  height_mm?: number;
  length_mm?: number;
  width_mm?: number;
  insulation_thickness_mm: number;
  insulation_material: string;
  insulation_layer_count?: '1' | '2' | '3';
  second_insulation_thickness_mm?: number;
  second_insulation_material?: string;
  third_insulation_thickness_mm?: number;
  third_insulation_material?: string;
  ambient_temperature: number;
  process_temperature: number;
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
  applyInsulationLayers(params, v);
  if (v.diameter_mm != null) params.diameter = v.diameter_mm / 1000;
  if (v.height_mm != null) params.height = v.height_mm / 1000;
  if (v.length_mm != null) params.length = v.length_mm / 1000;
  if (v.width_mm != null) params.width = v.width_mm / 1000;
  if (v.name) params.name = v.name;
  return params;
}

type LayeredFormValues = Pick<
  PipeFormValues,
  | 'insulation_thickness_mm'
  | 'insulation_material'
  | 'insulation_layer_count'
  | 'second_insulation_thickness_mm'
  | 'second_insulation_material'
  | 'third_insulation_thickness_mm'
  | 'third_insulation_material'
>;

function applyInsulationLayers(params: Record<string, unknown>, v: LayeredFormValues) {
  const count = Number(v.insulation_layer_count ?? '1');
  params.insulation_layer_count = String(Math.min(Math.max(count || 1, 1), 3));
  if (count <= 1) return;

  const layers = [
    {
      thickness: v.insulation_thickness_mm / 1000,
      material: v.insulation_material,
    },
  ];

  if (count >= 2 && v.second_insulation_thickness_mm != null && v.second_insulation_material) {
    layers.push({
      thickness: v.second_insulation_thickness_mm / 1000,
      material: v.second_insulation_material,
    });
  }
  if (count >= 3 && v.third_insulation_thickness_mm != null && v.third_insulation_material) {
    layers.push({
      thickness: v.third_insulation_thickness_mm / 1000,
      material: v.third_insulation_material,
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
    insulation_thickness_mm:
      layers[0]?.thickness != null
        ? Number(layers[0].thickness) * 1000
        : p.insulation_thickness != null ? Number(p.insulation_thickness) * 1000 : undefined,
    insulation_material:
      (layers[0]?.material as string | undefined) ?? (p.insulation_material as string | undefined),
    insulation_layer_count:
      p.insulation_layer_count != null
        ? String(p.insulation_layer_count) as PipeFormValues['insulation_layer_count']
        : layers.length > 0 ? String(Math.min(layers.length, 3)) as PipeFormValues['insulation_layer_count'] : '1',
    second_insulation_thickness_mm:
      layers[1]?.thickness != null ? Number(layers[1].thickness) * 1000 : undefined,
    second_insulation_material: layers[1]?.material as string | undefined,
    third_insulation_thickness_mm:
      layers[2]?.thickness != null ? Number(layers[2].thickness) * 1000 : undefined,
    third_insulation_material: layers[2]?.material as string | undefined,
    ambient_temperature: p.ambient_temperature as number | undefined,
    process_temperature: p.process_temperature as number | undefined,
    pipe_length: p.pipe_length as number | undefined,
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
    insulation_thickness_mm:
      layers[0]?.thickness != null
        ? Number(layers[0].thickness) * 1000
        : p.insulation_thickness != null ? Number(p.insulation_thickness) * 1000 : undefined,
    insulation_material:
      (layers[0]?.material as string | undefined) ?? (p.insulation_material as string | undefined),
    insulation_layer_count:
      p.insulation_layer_count != null
        ? String(p.insulation_layer_count) as TankFormValues['insulation_layer_count']
        : layers.length > 0 ? String(Math.min(layers.length, 3)) as TankFormValues['insulation_layer_count'] : '1',
    second_insulation_thickness_mm:
      layers[1]?.thickness != null ? Number(layers[1].thickness) * 1000 : undefined,
    second_insulation_material: layers[1]?.material as string | undefined,
    third_insulation_thickness_mm:
      layers[2]?.thickness != null ? Number(layers[2].thickness) * 1000 : undefined,
    third_insulation_material: layers[2]?.material as string | undefined,
    ambient_temperature: p.ambient_temperature as number | undefined,
    process_temperature: p.process_temperature as number | undefined,
    name: p.name as string | undefined,
  };
}

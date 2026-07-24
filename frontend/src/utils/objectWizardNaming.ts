/**
 * Pure DN lookup and automatic pipe/tank name generation for the object wizard.
 * No React, stores, API, or feature-page imports.
 */

// DN lookup — outer diameter in mm → closest nominal pipe diameter (DN)
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

// Short material labels for auto-name (trimmed from full display names)
const MATERIAL_SHORT: Record<string, string> = {
  mineral_wool: 'МВ',
  mineral_wool_boards_120: 'МВ120',
  mineral_wool_boards_150: 'МВ150',
  mineral_wool_cylinders_100: 'МВЦ100',
  glass_wool: 'СВ',
  polyurethane: 'ППУ',
  polyurethane_products_50: 'ППУ50',
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

/** Format number for auto-names; strip trailing zeros only after a decimal point. */
export function formatWizardNameNumber(val: number, decimals = 0): string {
  // "50.00" → "50", but integer "50" stays "50" (must not become "5").
  return val.toFixed(decimals).replace(/\.0+$|(\.\d*?)0+$/, '$1');
}

function tempSign(t: number): string {
  return t >= 0 ? `+${formatWizardNameNumber(t)}` : formatWizardNameNumber(t);
}

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

/** Fields actually read by name generators; Partial accepts incomplete form watches. */
export type PipeNameFields = Partial<{
  outer_diameter_mm: number;
  pipe_length: number;
  insulation_thickness_mm: number;
  insulation_material: string;
  ambient_temperature: number;
  process_temperature: number;
}>;

export type TankNameFields = Partial<{
  shape: 'cylindrical' | 'rectangular' | 'spherical';
  diameter_mm: number;
  height_mm: number;
  length_mm: number;
  width_mm: number;
  insulation_thickness_mm: number;
  insulation_material: string;
  ambient_temperature: number;
  process_temperature: number;
}>;

export function generatePipeName(v: PipeNameFields): string {
  const dn = findDN(v.outer_diameter_mm!);
  const dnPart = dn != null ? ` (DN${dn})` : '';
  const mat = shortMaterial(v.insulation_material ?? '');
  const tAmb = tempSign(v.ambient_temperature!);
  const tProc = tempSign(v.process_temperature!);
  return `Труба Ø${formatWizardNameNumber(v.outer_diameter_mm!)} мм${dnPart}, δ=${formatWizardNameNumber(v.insulation_thickness_mm!)} мм, ${mat}, L=${formatWizardNameNumber(v.pipe_length!, 1)} м, ${tAmb}→${tProc}°C`;
}

export function generateTankName(v: TankNameFields): string {
  const mat = shortMaterial(v.insulation_material ?? '');
  const tAmb = tempSign(v.ambient_temperature!);
  const tProc = tempSign(v.process_temperature!);
  const ins = `δ=${formatWizardNameNumber(v.insulation_thickness_mm!)} мм, ${mat}`;
  if (v.shape === 'cylindrical') {
    const d = v.diameter_mm ? `Ø${formatWizardNameNumber(v.diameter_mm)} мм` : '';
    const h = v.height_mm ? `×H${formatWizardNameNumber(v.height_mm)} мм` : '';
    return `Бак цил. ${d}${h}, ${ins}, ${tAmb}→${tProc}°C`;
  }
  if (v.shape === 'rectangular') {
    const dims = [v.length_mm, v.width_mm, v.height_mm]
      .filter(Boolean)
      .map((x) => formatWizardNameNumber(x!))
      .join('×');
    return `Бак прям. ${dims} мм, ${ins}, ${tAmb}→${tProc}°C`;
  }
  if (v.shape === 'spherical') {
    const d = v.diameter_mm ? `Ø${formatWizardNameNumber(v.diameter_mm)} мм` : '';
    return `Бак сфер. ${d}, ${ins}, ${tAmb}→${tProc}°C`;
  }
  return `Бак, ${ins}, ${tAmb}→${tProc}°C`;
}

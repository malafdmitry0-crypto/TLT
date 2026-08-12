/** Pure automatic pipe/tank name generation for the object wizard. */

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
  shape: 'cylindrical' | 'rectangular';
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
  const mat = shortMaterial(v.insulation_material ?? '');
  const tAmb = tempSign(v.ambient_temperature!);
  const tProc = tempSign(v.process_temperature!);
  return `Труба Ø${formatWizardNameNumber(v.outer_diameter_mm!)} мм, δ=${formatWizardNameNumber(v.insulation_thickness_mm!)} мм, ${mat}, L=${formatWizardNameNumber(v.pipe_length!, 1)} м, ${tAmb}→${tProc}°C`;
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
  return `Бак, ${ins}, ${tAmb}→${tProc}°C`;
}

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
  placement: string;
  ambient_temperature: number;
  ground_temperature: number;
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
  placement: string;
  ambient_temperature: number;
  ground_temperature: number;
  process_temperature: number;
}>;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function environmentTemperature({ placement, ambient_temperature, ground_temperature }: Pick<PipeNameFields, 'placement' | 'ambient_temperature' | 'ground_temperature'>): number | undefined {
  return placement === 'underground' ? ground_temperature : ambient_temperature;
}

export function generatePipeName(v: PipeNameFields): string {
  const environmentTemperatureValue = environmentTemperature(v);
  const {
    outer_diameter_mm: outerDiameter,
    pipe_length: pipeLength,
    insulation_thickness_mm: insulationThickness,
    insulation_material: insulationMaterial,
    process_temperature: processTemperature,
  } = v;
  if (
    !insulationMaterial ||
    !isFiniteNumber(outerDiameter) ||
    !isFiniteNumber(pipeLength) ||
    !isFiniteNumber(insulationThickness) ||
    !isFiniteNumber(environmentTemperatureValue) ||
    !isFiniteNumber(processTemperature)
  ) {
    return '';
  }

  const mat = shortMaterial(insulationMaterial);
  return `Труба Ø${formatWizardNameNumber(outerDiameter)} мм, δ=${formatWizardNameNumber(insulationThickness)} мм, ${mat}, L=${formatWizardNameNumber(pipeLength, 1)} м, ${tempSign(environmentTemperatureValue)}→${tempSign(processTemperature)}°C`;
}

export function generateTankName(v: TankNameFields): string {
  const environmentTemperatureValue = environmentTemperature(v);
  const {
    insulation_thickness_mm: insulationThickness,
    insulation_material: insulationMaterial,
    process_temperature: processTemperature,
  } = v;
  if (
    !insulationMaterial ||
    !isFiniteNumber(insulationThickness) ||
    !isFiniteNumber(environmentTemperatureValue) ||
    !isFiniteNumber(processTemperature)
  ) {
    return '';
  }

  const mat = shortMaterial(insulationMaterial);
  const ins = `δ=${formatWizardNameNumber(insulationThickness)} мм, ${mat}`;
  const temperatures = `${tempSign(environmentTemperatureValue)}→${tempSign(processTemperature)}°C`;
  if (v.shape === 'cylindrical') {
    const { diameter_mm: diameter, height_mm: height } = v;
    if (!isFiniteNumber(diameter) || !isFiniteNumber(height)) return '';
    return `Бак цил. Ø${formatWizardNameNumber(diameter)} мм×H${formatWizardNameNumber(height)} мм, ${ins}, ${temperatures}`;
  }
  if (v.shape === 'rectangular') {
    const { length_mm: length, width_mm: width, height_mm: height } = v;
    if (!isFiniteNumber(length) || !isFiniteNumber(width) || !isFiniteNumber(height)) return '';
    const dims = [length, width, height].map((value) => formatWizardNameNumber(value)).join('×');
    return `Бак прям. ${dims} мм, ${ins}, ${temperatures}`;
  }
  return '';
}

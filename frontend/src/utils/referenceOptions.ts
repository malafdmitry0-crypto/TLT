import type {
  InsulationEntry,
  PipeMaterialEntry,
  SoilConductivityEntry,
} from '@/types/reference';

export interface ReferenceOption<Value extends string | number = string> {
  value: Value;
  label: string;
  description?: string;
  searchText?: string;
}

export interface SoilReferenceOption extends ReferenceOption<string> {
  entry: SoilConductivityEntry;
}

function formatNumber(value: number | string, fractionDigits = 4) {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) return String(value);
  return String(Number(numeric.toFixed(fractionDigits)));
}

function formatDensity(value: InsulationEntry['density_kg_m3'] | SoilConductivityEntry['density_kg_m3']) {
  if (value == null || value === '') return undefined;
  return `ρ ${formatNumber(value, 0)} кг/м³`;
}

function formatConductivity(value: number) {
  return `λ ${formatNumber(value)} Вт/мК`;
}

export function formatInsulationTemperatureRange(range: InsulationEntry['temperature_range']) {
  if (!range) return undefined;
  const [from, to] = range;
  return `${formatNumber(from, 1)}...${formatNumber(to, 1)} °C`;
}

function duplicateNames(entries: InsulationEntry[]) {
  const counts = new Map<string, number>();
  entries.forEach((entry) => counts.set(entry.name, (counts.get(entry.name) ?? 0) + 1));
  return new Set([...counts.entries()].filter(([, count]) => count > 1).map(([name]) => name));
}

export function buildInsulationReferenceOptions(materials: InsulationEntry[]): ReferenceOption[] {
  const namesWithVariants = duplicateNames(materials);

  return materials.map((entry) => {
    const density = formatDensity(entry.density_kg_m3);
    const conductivity = formatConductivity(entry.conductivity);
    const labelDetails = [density, conductivity].filter(Boolean);
    const description = [
      density,
      conductivity,
      formatInsulationTemperatureRange(entry.temperature_range),
      entry.material,
    ].filter(Boolean).join(' · ');

    return {
      value: entry.material,
      label: namesWithVariants.has(entry.name) && labelDetails.length > 0
        ? `${entry.name} · ${labelDetails.join(' · ')}`
        : entry.name,
      description,
      searchText: [entry.name, entry.material, description, entry.source].filter(Boolean).join(' '),
    };
  });
}

export function buildPipeMaterialReferenceOptions(materials: PipeMaterialEntry[]): ReferenceOption[] {
  return materials.map((entry) => ({
    value: entry.material,
    label: entry.name,
    description: `λ(T): ${entry.formula}`,
    searchText: [entry.name, entry.material, entry.formula, entry.accuracy].join(' '),
  }));
}

export function buildSoilReferenceOptions(entries: SoilConductivityEntry[]): SoilReferenceOption[] {
  return entries.map((entry) => {
    const density = formatDensity(entry.density_kg_m3);
    const moisture = `W ${formatNumber(entry.moisture_percent, 2)}%`;
    const conductivity = formatConductivity(entry.conductivity);
    const details = [density, moisture, conductivity].filter(Boolean);

    return {
      value: `${entry.soil_code}:${entry.density_kg_m3 ?? 'na'}:${entry.moisture_percent}`,
      label: `${entry.soil} · ${details.join(' · ')}`,
      description: entry.soil_code,
      searchText: [entry.soil, entry.soil_code, ...details].join(' '),
      entry,
    };
  });
}

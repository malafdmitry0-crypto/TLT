import electricalFieldsConfig from '@/config/electrical-fields.default.json';

export interface ElectricalFieldLabels {
  short: string;
  full: string;
  compact: string;
}

export interface ElectricalColumnConfig {
  labels: ElectricalFieldLabels;
  group: string;
  source: string;
  valueType: string;
  description?: string;
}

export interface ElectricalRegistryTableColumn {
  key: string;
  defaultWidthPct?: number;
  minWidthPx?: number;
  required?: boolean;
  ellipsis?: boolean;
}

interface ElectricalFieldsConfig {
  version: number;
  columns: Record<string, ElectricalColumnConfig>;
  table: {
    default_visible: string[];
    registry: ElectricalRegistryTableColumn[];
  };
}

const config = electricalFieldsConfig as ElectricalFieldsConfig;

export const ELECTRICAL_FIELD_REGISTRY_VERSION = config.version;

function fallbackLabels(key: string): ElectricalFieldLabels {
  return {
    short: key,
    full: key,
    compact: key,
  };
}

export function getElectricalColumnConfig(key: string) {
  return config.columns[key] ?? null;
}

export function getElectricalTableColumnRegistry() {
  return config.table.registry;
}

export function getElectricalDefaultVisibleTableKeys() {
  return config.table.default_visible;
}

export function getElectricalColumnLabel(
  key: string,
  variant: keyof ElectricalFieldLabels = 'short',
) {
  const labels = config.columns[key]?.labels ?? fallbackLabels(key);
  return labels[variant] || labels.full || labels.short || key;
}

export function getElectricalColumnDescription(key: string) {
  return config.columns[key]?.description ?? '';
}

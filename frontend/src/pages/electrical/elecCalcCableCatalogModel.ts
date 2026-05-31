import type { ElectricalCalcSummary } from '@/types/calculation';
import type { CableCatalogRow } from '@/utils/cableCatalogSourceLabels';
import type { CableTypeKey } from '@/pages/electrical/elecCalcMainTableModel';

export type CatalogStatusColor = 'default' | 'success' | 'warning' | 'error';
export type CatalogStatus = { label: string; color: CatalogStatusColor };

export type CableStatusRow = CableCatalogRow & {
  technical_data_complete?: boolean;
  price_per_meter?: number | null;
  stock_quantity_m?: number | null;
  stock_status?: string | null;
  lead_time_days?: number | null;
  supplier_priority?: number | null;
  is_preferred?: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function hasCommercialData(row: CableStatusRow) {
  return row.price_per_meter != null
    || row.stock_quantity_m != null
    || (row.stock_status != null && row.stock_status !== 'unknown')
    || row.lead_time_days != null
    || row.supplier_priority != null
    || row.is_preferred === true;
}

export function commercialStatus(rows: CableStatusRow[]): CatalogStatus {
  if (rows.length === 0) return { label: 'Нет коммерческих данных', color: 'default' };
  const completeCount = rows.filter(hasCommercialData).length;
  if (completeCount === 0) return { label: 'Нет коммерческих данных', color: 'default' };
  if (completeCount < rows.length) return { label: 'Коммерческие данные неполные', color: 'warning' };
  return { label: 'Коммерческие данные есть', color: 'success' };
}

export function hasValue(value: unknown) {
  return value !== null && value !== undefined;
}

export function hasTechnicalData(type: CableTypeKey, row: CableStatusRow) {
  if (typeof row.technical_data_complete === 'boolean') return row.technical_data_complete;
  if (type === 'self_regulating') {
    return hasValue(row.power_per_meter)
      && hasValue(row.max_temperature)
      && hasValue(row.min_temperature);
  }
  if (type === 'self_regulating_tt') {
    return hasValue(row.q1)
      && hasValue(row.q2)
      && hasValue(row.max_product_temp)
      && hasValue(row.max_vapor_temp);
  }
  if (type === 'single_core' || type === 'three_core') {
    return hasValue(row.resistance_ohm_km)
      && (hasValue(row.conductor_section_mm2) || hasValue(row.conductor_cross_section));
  }
  return false;
}

export function technicalStatus(type: CableTypeKey | null, rows: CableStatusRow[]): CatalogStatus {
  if (!type) return { label: 'Техданные: несколько типов', color: 'default' };
  if (rows.length === 0) return { label: 'Нет техданных', color: 'error' };
  const completeCount = rows.filter((row) => hasTechnicalData(type, row)).length;
  if (completeCount === rows.length) return { label: 'Техданные полные', color: 'success' };
  if (completeCount > 0) return { label: 'Техданные неполные', color: 'warning' };
  return { label: 'Нет техданных', color: 'error' };
}

export function cableSnapshotRow(calc: ElectricalCalcSummary | undefined): CableStatusRow | null {
  const snapshot = calc?.cable_snapshot;
  if (!isRecord(snapshot)) return null;
  const technical = isRecord(snapshot.technical) ? snapshot.technical : {};
  const commercial = isRecord(snapshot.commercial) ? snapshot.commercial : {};
  const model = typeof snapshot.cable_mark === 'string' ? snapshot.cable_mark : technical.model;
  return {
    ...technical,
    ...commercial,
    model: typeof model === 'string' ? model : null,
    cable_type: typeof snapshot.cable_type === 'string' ? snapshot.cable_type : null,
    source: typeof snapshot.actual_catalog_source === 'string'
      ? snapshot.actual_catalog_source
      : typeof snapshot.requested_catalog_source === 'string'
        ? snapshot.requested_catalog_source
        : 'project',
  };
}

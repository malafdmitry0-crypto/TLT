import type { CableSource } from '@/api/calculations';
import type { ElectricalCalcSummary } from '@/types/calculation';
import {
  externalLabelSourceForCableRow,
  type CableCatalogRow,
} from '@/utils/cableCatalogSourceLabels';

export type CableMarkOptionSource = CableSource | 'project';

export const AUTO_CABLE_MARK_VALUE = '__auto__';
export const CABLE_MARK_OPTION_SEPARATOR = '::';

export function normalizeCableSource(value: unknown): CableSource | null {
  return value === 'builtin'
    || value === 'commercial'
    || value === 'extended'
    || value === 'all'
    ? value
    : null;
}

export function normalizeCableMarkOptionSource(value: unknown): CableMarkOptionSource {
  if (value === 'project') return 'project';
  return normalizeCableSource(value) ?? 'builtin';
}

export function cableMarkOptionValue(source: CableMarkOptionSource, mark: string) {
  return `${source}${CABLE_MARK_OPTION_SEPARATOR}${encodeURIComponent(mark)}`;
}

export function catalogSourceFromSnapshot(calc: ElectricalCalcSummary | undefined): CableSource | null {
  const snapshot = calc?.cable_snapshot;
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return null;
  return normalizeCableSource(snapshot.actual_catalog_source)
    ?? normalizeCableSource(snapshot.requested_catalog_source);
}

export function shouldShowProjectCableOption(calc: ElectricalCalcSummary | undefined) {
  if (!calc?.cable_snapshot) return false;
  const technicalStatus = calc.cable_snapshot_status?.technical_status;
  return technicalStatus === 'missing' || technicalStatus === 'changed';
}

export function externalCableOptionLabelSource<TRow extends CableCatalogRow>(
  row: TRow,
  rows: TRow[],
  builtinRows: CableCatalogRow[],
  source: CableSource,
): CableMarkOptionSource | null {
  return externalLabelSourceForCableRow(row, rows, builtinRows, source);
}

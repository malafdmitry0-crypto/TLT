/**
 * @module specification/generation-options-sync-model
 * @owner specification
 * Pure mapping: saved specification snapshot → local form state.
 */

import type { SpecificationGroupingMode } from '@/api/specifications';

export const DEFAULT_SPECIFICATION_GROUPING_MODE: SpecificationGroupingMode =
  'separate_by_object_type';

export type SpecSettingsFormSnapshot = {
  exZone: boolean;
  reserveCoeff: string;
  indicationOnBoxes: boolean;
  endSectionIndication: boolean;
  topIndication: boolean;
  minLengthK2i: string;
  groupingMode: SpecificationGroupingMode;
};

/**
 * Build local drawer state from a canonical specification snapshot.
 * Missing binary values use the explicit «Нет» default. Missing or invalid
 * grouping uses the canonical Case 1 mode; numeric values remain unset.
 */
export function buildSpecSettingsFormSnapshot(
  opts: Record<string, unknown>,
): SpecSettingsFormSnapshot {
  const source = opts.resolved_options && typeof opts.resolved_options === 'object'
    ? opts.resolved_options as Record<string, unknown>
    : opts;
  const booleanOrFalse = (value: unknown) => typeof value === 'boolean' ? value : false;
  const decimalOrEmpty = (value: unknown) => value == null ? '' : String(value);
  const snapshot: SpecSettingsFormSnapshot = {
    exZone: booleanOrFalse(source.Ex),
    reserveCoeff: decimalOrEmpty(source.R_gr),
    indicationOnBoxes: booleanOrFalse(source.K1i),
    endSectionIndication: booleanOrFalse(source.K2i),
    topIndication: booleanOrFalse(source.Kiu),
    minLengthK2i: decimalOrEmpty(source.L_K2i_m),
    groupingMode: source.grouping_mode === 'separate_by_object_type'
      || source.grouping_mode === 'merge_materials'
      ? source.grouping_mode
      : DEFAULT_SPECIFICATION_GROUPING_MODE,
  };
  return snapshot;
}

export function resolveSpecificationCatalogLabel(
  snapshot: Record<string, unknown> | null | undefined,
): string {
  const catalog = snapshot?.catalog;
  if (catalog && typeof catalog === 'object') {
    const record = catalog as Record<string, unknown>;
    const key = typeof record.catalog_key === 'string' ? record.catalog_key : 'Каталог';
    if (typeof record.version === 'string' && record.version.trim() !== '') {
      return `${key} · ${record.version}`;
    }
  }
  return 'Не определена — backend разрешит при формировании';
}

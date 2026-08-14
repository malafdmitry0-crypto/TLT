/**
 * @module specification/generation-options-sync-model
 * @owner specification
 * Pure mapping: saved specification snapshot → local form state.
 */

import type { SpecificationGroupingMode } from '@/api/specifications';

export const DEFAULT_SPECIFICATION_GROUPING_MODE: SpecificationGroupingMode =
  'separate_by_object_type';
export const DEFAULT_SPECIFICATION_MIN_LENGTH_K2I_M = '1';
export const DEFAULT_SPECIFICATION_RESERVE_COEFF = '1';

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
 * grouping uses the canonical Case 1 mode; required numeric values start at one.
 */
export function buildSpecSettingsFormSnapshot(
  opts: Record<string, unknown>,
): SpecSettingsFormSnapshot {
  const source = opts.resolved_options && typeof opts.resolved_options === 'object'
    ? opts.resolved_options as Record<string, unknown>
    : opts;
  const booleanOrFalse = (value: unknown) => typeof value === 'boolean' ? value : false;
  const decimalOrDefault = (value: unknown, fallback: string) => (
    value == null ? fallback : String(value)
  );
  const snapshot: SpecSettingsFormSnapshot = {
    exZone: booleanOrFalse(source.Ex),
    reserveCoeff: decimalOrDefault(source.R_gr, DEFAULT_SPECIFICATION_RESERVE_COEFF),
    indicationOnBoxes: booleanOrFalse(source.K1i),
    endSectionIndication: booleanOrFalse(source.K2i),
    topIndication: booleanOrFalse(source.Kiu),
    minLengthK2i: decimalOrDefault(
      source.L_K2i_m,
      DEFAULT_SPECIFICATION_MIN_LENGTH_K2I_M,
    ),
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
  return 'Может быть выбрана при формировании';
}

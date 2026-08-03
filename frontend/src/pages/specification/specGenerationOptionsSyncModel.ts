/**
 * @module specification/generation-options-sync-model
 * @owner specification
 * Pure mapping: API generation_options / project settings → local form state.
 *
 * PDL-ER-07: snapshot from last generation (or project defaults) hydrates the
 * settings drawer without rewriting project defaults on the server.
 */

import type { SpecificationGroupingMode } from '@/api/specifications';

export type SpecSettingsFormSnapshot = {
  exZone: boolean | null;
  reserveCoeff: string;
  indicationOnBoxes: boolean | null;
  endSectionIndication: boolean | null;
  topIndication: boolean | null;
  minLengthK2i: string;
  groupingMode: SpecificationGroupingMode | null;
};

/**
 * Build local drawer state from generation_options or project settings payload.
 * Missing keys remain visibly unset; explicit false and zero are preserved.
 */
export function buildSpecSettingsFormSnapshot(
  opts: Record<string, unknown>,
): SpecSettingsFormSnapshot {
  const source = opts.resolved_options && typeof opts.resolved_options === 'object'
    ? opts.resolved_options as Record<string, unknown>
    : opts;
  const booleanOrNull = (value: unknown) => typeof value === 'boolean' ? value : null;
  const decimalOrEmpty = (value: unknown) => value == null ? '' : String(value);
  const snapshot: SpecSettingsFormSnapshot = {
    exZone: booleanOrNull(source.Ex),
    reserveCoeff: decimalOrEmpty(source.R_gr),
    indicationOnBoxes: booleanOrNull(source.K1i),
    endSectionIndication: booleanOrNull(source.K2i),
    topIndication: booleanOrNull(source.Kiu),
    minLengthK2i: decimalOrEmpty(source.L_K2i_m),
    groupingMode: source.grouping_mode === 'separate_by_object_type'
      || source.grouping_mode === 'merge_materials'
      ? source.grouping_mode
      : null,
  };
  return snapshot;
}

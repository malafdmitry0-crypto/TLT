/**
 * @module specification/generation-options-sync-model
 * @owner specification
 * Pure mapping: API generation_options / project settings → local form state.
 *
 * PDL-ER-07: snapshot from last generation (or project defaults) hydrates the
 * settings drawer without rewriting project defaults on the server.
 */

import type { SpecGroupBy } from '@/pages/specification/specFormatModel';

export type SpecSettingsFormSnapshot = {
  exZone: boolean;
  reserveCoeff: number;
  indicationOnBoxes: boolean;
  endSectionIndication: boolean;
  topIndication: boolean;
  minLengthK2i: number;
  connectorKitSectionsPerKit: 1 | 2;
  mergeIdentical?: boolean;
  groupBy?: SpecGroupBy;
};

/**
 * Build local drawer state from generation_options or project settings payload.
 * Missing keys use product defaults (reserve=1, kit sections=1, flags false).
 */
export function buildSpecSettingsFormSnapshot(
  opts: Record<string, unknown>,
): SpecSettingsFormSnapshot {
  const cap = Number(opts.connector_kit_sections_per_kit ?? 1);
  const snapshot: SpecSettingsFormSnapshot = {
    exZone: Boolean(opts.ex_zone),
    reserveCoeff: Number(opts.reserve_coefficient ?? 1),
    indicationOnBoxes: Boolean(opts.indication_on_boxes),
    endSectionIndication: Boolean(opts.end_section_indication),
    topIndication: Boolean(opts.top_indication),
    minLengthK2i: Number(opts.min_length_for_end_indication ?? 0),
    connectorKitSectionsPerKit: cap === 2 ? 2 : 1,
  };
  if (typeof opts.merge_identical === 'boolean') {
    snapshot.mergeIdentical = opts.merge_identical;
  }
  if (typeof opts.group_by === 'string') {
    snapshot.groupBy = opts.group_by as SpecGroupBy;
  }
  return snapshot;
}

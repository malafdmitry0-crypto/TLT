/**
 * @module specification/generate-options-model
 * @owner specification
 * @depends none
 * @does-not heat, electrical page modules
 */
import type { SpecGroupBy } from '@/pages/specification/specFormatModel';

export type SpecGenerateOptionsInput = {
  exZone: boolean;
  reserveCoeff: number;
  indicationOnBoxes: boolean;
  endSectionIndication: boolean;
  topIndication: boolean;
  minLengthK2i: number;
  connectorKitSectionsPerKit: 1 | 2;
  groupBy: SpecGroupBy;
  mergeIdentical: boolean;
};

/** Payload for generate/settings API (snake_case keys). */
export function buildSpecGenerateOptions(input: SpecGenerateOptionsInput) {
  return {
    ex_zone: input.exZone,
    reserve_coefficient: input.reserveCoeff,
    indication_on_boxes: input.indicationOnBoxes,
    end_section_indication: input.endSectionIndication,
    top_indication: input.topIndication,
    min_length_for_end_indication: input.minLengthK2i,
    connector_kit_sections_per_kit: input.connectorKitSectionsPerKit,
    group_by: input.groupBy,
    merge_identical: input.mergeIdentical,
  };
}

export function isSpecificationPartial(spec: {
  is_partial?: boolean;
  generation_options?: { is_partial?: boolean } | null;
} | null | undefined): boolean {
  return Boolean(
    spec?.is_partial
    || spec?.generation_options?.is_partial,
  );
}

export type SpecExcludedGroup = {
  error_code?: string;
  message?: string;
  group?: string;
};

export function resolveSpecificationExcludedGroups(spec: {
  excluded_groups?: SpecExcludedGroup[];
  generation_options?: { excluded_groups?: SpecExcludedGroup[] } | null;
} | null | undefined): SpecExcludedGroup[] {
  return (
    spec?.excluded_groups
    ?? spec?.generation_options?.excluded_groups
    ?? []
  );
}

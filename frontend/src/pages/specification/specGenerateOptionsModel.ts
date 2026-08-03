/**
 * @module specification/generate-options-model
 * @owner specification
 * @depends none
 * @does-not heat, electrical page modules
 */
import type {
  SpecificationGroupingMode,
  SpecificationOptions,
} from '@/api/specifications';

export type SpecGenerateOptionsInput = {
  exZone: boolean | null;
  reserveCoeff: string;
  indicationOnBoxes: boolean | null;
  endSectionIndication: boolean | null;
  topIndication: boolean | null;
  minLengthK2i: string;
  groupingMode: SpecificationGroupingMode | null;
};

/** Canonical request/project options. Empty values remain absent. */
export function buildSpecGenerateOptions(input: SpecGenerateOptionsInput): SpecificationOptions {
  return {
    ...(input.groupingMode == null ? {} : { grouping_mode: input.groupingMode }),
    ...(input.exZone == null ? {} : { Ex: input.exZone }),
    ...(input.indicationOnBoxes == null ? {} : { K1i: input.indicationOnBoxes }),
    ...(input.endSectionIndication == null ? {} : { K2i: input.endSectionIndication }),
    ...(input.topIndication == null ? {} : { Kiu: input.topIndication }),
    ...(input.minLengthK2i.trim() === '' ? {} : { L_K2i_m: input.minLengthK2i.trim() }),
    ...(input.reserveCoeff.trim() === '' ? {} : { R_gr: input.reserveCoeff.trim() }),
  };
}

export function missingSpecGenerateFields(input: SpecGenerateOptionsInput): string[] {
  return [
    [input.groupingMode, 'режим группировки'],
    [input.exZone, 'Ex'],
    [input.indicationOnBoxes, 'К1i'],
    [input.endSectionIndication, 'К2i'],
    [input.topIndication, 'Кiu'],
    [input.minLengthK2i.trim() === '' ? null : input.minLengthK2i, 'L,К2i'],
    [input.reserveCoeff.trim() === '' ? null : input.reserveCoeff, 'R,гр'],
  ].filter(([value]) => value == null).map(([, label]) => String(label));
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

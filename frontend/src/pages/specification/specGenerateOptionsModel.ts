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
  exZone: boolean;
  reserveCoeff: string;
  indicationOnBoxes: boolean;
  endSectionIndication: boolean;
  topIndication: boolean;
  minLengthK2i: string;
  groupingMode: SpecificationGroupingMode | null;
};

export type SpecGenerateField =
  | 'groupingMode'
  | 'exZone'
  | 'indicationOnBoxes'
  | 'endSectionIndication'
  | 'topIndication'
  | 'minLengthK2i'
  | 'reserveCoeff';

export type SpecGenerateFieldErrors = Partial<Record<SpecGenerateField, string>>;

/** Canonical request/project options. Empty values remain absent. */
export function buildSpecGenerateOptions(input: SpecGenerateOptionsInput): SpecificationOptions {
  return {
    ...(input.groupingMode == null ? {} : { grouping_mode: input.groupingMode }),
    Ex: input.exZone,
    K1i: input.indicationOnBoxes,
    K2i: input.endSectionIndication,
    Kiu: input.topIndication,
    ...(input.minLengthK2i.trim() === '' ? {} : { L_K2i_m: input.minLengthK2i.trim() }),
    ...(input.reserveCoeff.trim() === '' ? {} : { R_gr: input.reserveCoeff.trim() }),
  };
}

export function specificationBackendFieldErrors(
  diagnostics: Array<{ issues?: Array<Record<string, unknown>> }>,
): SpecGenerateFieldErrors {
  const fieldMap: Record<string, SpecGenerateField> = {
    grouping_mode: 'groupingMode',
    Ex: 'exZone',
    K1i: 'indicationOnBoxes',
    K2i: 'endSectionIndication',
    Kiu: 'topIndication',
    L_K2i_m: 'minLengthK2i',
    R_gr: 'reserveCoeff',
  };
  const errors: SpecGenerateFieldErrors = {};
  diagnostics.flatMap((item) => item.issues ?? []).forEach((issue) => {
    const field = typeof issue.field === 'string' ? fieldMap[issue.field] : undefined;
    if (field) errors[field] = 'Проверьте значение';
  });
  return errors;
}

/**
 * @module specification/generate-options-model
 * @owner specification
 * @depends none
 * @does-not heat, electrical page modules
 */
import {
  type SpecificationGroupingMode,
  type SpecificationOptions,
} from '@/api/specifications';
import { DEFAULT_SPECIFICATION_GROUPING_MODE } from '@/pages/specification/specGenerationOptionsSyncModel';

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

const requiredFieldMessages: Record<SpecGenerateField, string> = {
  groupingMode: 'Выберите группировку строк',
  exZone: 'Выберите значение Ex',
  indicationOnBoxes: 'Выберите значение К1i',
  endSectionIndication: 'Выберите значение К2i',
  topIndication: 'Выберите значение Кiu',
  minLengthK2i: 'Укажите минимальную длину секции',
  reserveCoeff: 'Укажите коэффициент горячего резервирования',
};

const invalidFieldMessages: Record<SpecGenerateField, string> = {
  groupingMode: 'Выберите доступную группировку строк',
  exZone: 'Недопустимое значение параметра Ex',
  indicationOnBoxes: 'Недопустимое значение параметра К1i',
  endSectionIndication: 'Недопустимое значение параметра К2i',
  topIndication: 'Недопустимое значение параметра Кiu',
  minLengthK2i: 'Укажите длину секции не меньше 0',
  reserveCoeff: 'Укажите числовой коэффициент горячего резервирования',
};

/** Canonical request/project options. Empty values remain absent. */
export function buildSpecGenerateOptions(input: SpecGenerateOptionsInput): SpecificationOptions {
  return {
    grouping_mode: input.groupingMode ?? DEFAULT_SPECIFICATION_GROUPING_MODE,
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
    if (!field) return;
    if (typeof issue.message === 'string' && issue.message.trim() !== '') {
      errors[field] = issue.message.trim();
      return;
    }
    errors[field] = issue.reason === 'required_option_unresolved'
      ? requiredFieldMessages[field]
      : invalidFieldMessages[field];
  });
  return errors;
}

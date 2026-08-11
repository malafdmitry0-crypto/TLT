import { describe, expect, it } from 'vitest';

import {
  buildSpecGenerateOptions,
  specificationBackendFieldErrors,
} from '@/pages/specification/specGenerateOptionsModel';

describe('specGenerateOptionsModel', () => {
  it('builds canonical options and preserves explicit false and zero', () => {
    expect(buildSpecGenerateOptions({
      exZone: false,
      reserveCoeff: '1.1',
      indicationOnBoxes: false,
      endSectionIndication: false,
      topIndication: true,
      minLengthK2i: '0',
      groupingMode: 'separate_by_object_type',
    })).toEqual({
      grouping_mode: 'separate_by_object_type',
      Ex: false,
      K1i: false,
      K2i: false,
      Kiu: true,
      L_K2i_m: '0',
      R_gr: '1.1',
    });
  });

  it('always materializes the binary options and default grouping mode', () => {
    const input = {
      exZone: false,
      reserveCoeff: '',
      indicationOnBoxes: false,
      endSectionIndication: false,
      topIndication: false,
      minLengthK2i: '',
      groupingMode: null,
    } as const;
    expect(buildSpecGenerateOptions(input)).toEqual({
      grouping_mode: 'separate_by_object_type',
      Ex: false,
      K1i: false,
      K2i: false,
      Kiu: false,
    });
  });

  it('maps backend issues to field-specific messages and preserves backend copy', () => {
    expect(specificationBackendFieldErrors([{
      issues: [
        { field: 'grouping_mode', reason: 'required_option_unresolved' },
        { field: 'L_K2i_m', reason: 'resolved_option_invalid' },
        { field: 'R_gr', reason: 'invalid', message: 'Коэффициент должен быть не меньше нуля' },
        { field: 'Ex', reason: 'unexpected_backend_reason' },
      ],
    }])).toEqual({
      groupingMode: 'Выберите группировку строк',
      minLengthK2i: 'Укажите длину секции не меньше 0',
      reserveCoeff: 'Коэффициент должен быть не меньше нуля',
      exZone: 'Недопустимое значение параметра Ex',
    });
  });
});

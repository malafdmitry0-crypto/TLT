import { describe, expect, it } from 'vitest';

import {
  isApiError,
  isBatchElectricalResponse,
  isTargetVariantNotEmptyError,
} from '@/pages/electrical/elecCalcApiResponseGuards';

describe('elecCalcApiResponseGuards', () => {
  it('recognizes batch electrical responses by the current calculated marker', () => {
    expect(isBatchElectricalResponse({ calculated: 0 })).toBe(true);
    expect(isBatchElectricalResponse({ calculated: 2, results: [] })).toBe(true);
    expect(isBatchElectricalResponse(null)).toBe(false);
    expect(isBatchElectricalResponse([])).toBe(false);
    expect(isBatchElectricalResponse({ results: [] })).toBe(false);
    expect(isBatchElectricalResponse({ calculated: '2', results: [] })).toBe(false);
    expect(isBatchElectricalResponse({ calculated: Number.NaN, results: [] })).toBe(false);
  });

  it('preserves the existing ApiError guard semantics', () => {
    const error = new Error('Conflict');
    expect(isApiError(error)).toBe(true);
    expect(isApiError({ status: 409, code: 'target_not_empty' })).toBe(false);
  });

  it('recognizes the target variant conflict error used by copy confirmation', () => {
    const conflict = Object.assign(new Error('Conflict'), {
      status: 409,
      code: 'target_not_empty',
    });
    const otherConflict = Object.assign(new Error('Conflict'), {
      status: 409,
      code: 'other',
    });
    const validationError = Object.assign(new Error('Validation'), {
      status: 422,
      code: 'target_not_empty',
    });

    expect(isTargetVariantNotEmptyError(conflict)).toBe(true);
    expect(isTargetVariantNotEmptyError(otherConflict)).toBe(false);
    expect(isTargetVariantNotEmptyError(validationError)).toBe(false);
    expect(isTargetVariantNotEmptyError({ status: 409, code: 'target_not_empty' })).toBe(false);
  });
});

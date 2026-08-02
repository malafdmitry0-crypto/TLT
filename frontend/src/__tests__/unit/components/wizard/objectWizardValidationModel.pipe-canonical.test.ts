// @vitest-environment node
import { describe, expect, it } from 'vitest';

import {
  buildCalculationFieldErrors,
  normalizeFieldErrorsForForm,
} from '@/components/wizard/objectWizardValidationModel';

describe('objectWizardValidationModel canonical pipe fields', () => {
  it('maps canonical API fields to their pipe form controls', () => {
    expect(normalizeFieldErrorsForForm({
      ground_temperature: 'Укажите T грунта',
      pipe_centerline_depth: 'Укажите глубину',
      num_local_elements: 'Укажите количество',
    }, 'pipe')).toEqual({
      ground_temperature: { message: 'Укажите T грунта' },
      burial_depth: { message: 'Укажите глубину' },
      num_local_elements: { message: 'Укажите количество' },
    });
  });

  it('maps a ground-temperature validation message without a structured field', () => {
    expect(buildCalculationFieldErrors({
      message: 'Температура грунта должна быть ниже температуры продукта',
    }, 'pipe')).toHaveProperty('ground_temperature');
  });
});

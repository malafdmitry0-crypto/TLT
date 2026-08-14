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

  it('keeps structured wall detail over the generic message-derived error', () => {
    const relationMessage = 'Толщина стенки должна быть меньше половины наружного диаметра';

    expect(buildCalculationFieldErrors({
      error_code: 'wall_exceeds_pipe_radius',
      field: 'wall_thickness',
      fields: { wall_thickness: relationMessage },
      message: 'Проверьте параметры объекта wall_thickness',
    }, 'pipe')).toEqual({
      wall_thickness_mm: { message: relationMessage },
    });
  });

});

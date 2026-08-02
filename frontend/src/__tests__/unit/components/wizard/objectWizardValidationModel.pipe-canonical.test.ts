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

  it('maps the spherical critical-radius API code to a blocking insulation field error', () => {
    expect(buildCalculationFieldErrors({
      error_code: 'sphere_below_critical_insulation_radius',
      error_context: { router: 0.91, rcritical: 1.02, conductivity_outermost: 0.05, alpha_vnesh_applied: 9 },
    }, 'tank')).toEqual({
      insulation_thickness_mm: {
        message: 'Наружный радиус изоляции 0.910 м меньше критического 1.020 м; увеличьте толщину изоляции.',
      },
    });
  });
});

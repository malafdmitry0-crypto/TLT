// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  projectPipeFormValuesFromRecord,
  projectTankFormValuesFromRecord,
} from '@/utils/heatCalcInlineFormProjection';

describe('heatCalcInlineFormProjection ambient temperature bounds', () => {
  it('preserves a pipe ambient maximum in the explicit form projection', () => {
    const projected = projectPipeFormValuesFromRecord({
      ambient_temperature: -30,
      max_ambient_temperature: 35,
      process_temperature: 80,
    });

    expect(projected.max_ambient_temperature).toBe(35);
  });

  it('preserves a tank ambient maximum, including zero, in the explicit form projection', () => {
    const projected = projectTankFormValuesFromRecord({
      ambient_temperature: -20,
      max_ambient_temperature: 0,
      process_temperature: 70,
    });

    expect(projected.max_ambient_temperature).toBe(0);
  });

  it('continues to drop unknown client-only keys', () => {
    const projected = projectPipeFormValuesFromRecord({
      max_ambient_temperature: 35,
      unknown_client_only: 'drop-me',
    });

    expect(projected).not.toHaveProperty('unknown_client_only');
  });
});

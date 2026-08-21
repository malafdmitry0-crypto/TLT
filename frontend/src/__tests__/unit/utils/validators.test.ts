// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  loginSchema,
  pipeParamsSchema,
  projectSchema,
  validateRequired,
} from '@/utils/validators';

describe('loginSchema', () => {
  it('accepts valid credentials', () => {
    expect(loginSchema.safeParse({ email: 'user@example.com', password: 'x' }).success).toBe(true);
  });
  it('rejects bad email', () => {
    expect(loginSchema.safeParse({ email: 'x', password: 'y' }).success).toBe(false);
  });
  it('rejects empty password', () => {
    expect(loginSchema.safeParse({ email: 'a@b.c', password: '' }).success).toBe(false);
  });
});

describe('projectSchema', () => {
  it('requires name', () => {
    expect(projectSchema.safeParse({ name: '' }).success).toBe(false);
  });
  it('allows optional description', () => {
    expect(projectSchema.safeParse({ name: 'x' }).success).toBe(true);
  });
});

describe('pipeParamsSchema', () => {
  const valid = {
    outer_diameter: 0.1,
    insulation_thickness: 0.05,
    insulation_material: 'mineral_wool',
    ambient_temperature: -20,
    process_temperature: 80,
    pipe_length: 10,
  };
  it('accepts valid', () => {
    expect(pipeParamsSchema.safeParse(valid).success).toBe(true);
  });
  it('rejects negative diameter', () => {
    expect(
      pipeParamsSchema.safeParse({ ...valid, outer_diameter: -1 }).success
    ).toBe(false);
  });
});

describe('validateRequired', () => {
  it.each([
    [null, false],
    [undefined, false],
    ['', false],
    [0, true],
    ['x', true],
  ])('for %p returns %p', (v, expected) => {
    expect(validateRequired(v)).toBe(expected);
  });
});

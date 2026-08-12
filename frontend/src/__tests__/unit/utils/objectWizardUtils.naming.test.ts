// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  generatePipeName,
  generateTankName,
} from '@/utils/objectWizardUtils';

describe('generatePipeName', () => {
  it('собирает имя со всеми компонентами', () => {
    const name = generatePipeName({
      outer_diameter_mm: 114,
      pipe_length: 50,
      insulation_thickness_mm: 50,
      insulation_material: 'mineral_wool',
      ambient_temperature: -20,
      process_temperature: 80,
    });
    expect(name).toBe('Труба Ø114 мм, δ=50 мм, МВ, L=50 м, -20→+80°C');
    expect(name).toContain('Ø114');
    expect(name).toContain('δ=50');
    expect(name).toContain('L=50');
    expect(name).toContain('-20');
    expect(name).toContain('+80');
  });

  it('использует наружный диаметр без дополнительной номинальной характеристики', () => {
    const name = generatePipeName({
      outer_diameter_mm: 234,
      pipe_length: 10,
      insulation_thickness_mm: 30,
      insulation_material: 'polyurethane',
      ambient_temperature: 0,
      process_temperature: 50,
    });
    expect(name).toBe('Труба Ø234 мм, δ=30 мм, ППУ, L=10 м, +0→+50°C');
  });

  it('не срезает trailing zeros у целых толщин (δ=50, не δ=5)', () => {
    const name = generatePipeName({
      outer_diameter_mm: 114.3,
      pipe_length: 12.5,
      insulation_thickness_mm: 50,
      insulation_material: 'mineral_wool',
      ambient_temperature: -10,
      process_temperature: 60,
    });
    expect(name).toContain('δ=50 мм');
    expect(name).not.toMatch(/δ=5 мм/);
    expect(name).toContain('L=12.5 м');
  });

  it('принимает partial/empty inputs без type assertion (runtime throws, callers catch)', () => {
    // PipeNameFields is Partial — incomplete watches type-check at the call site.
    const partial = { outer_diameter_mm: 114, ambient_temperature: -20 };
    const empty = {};
    expect(() => generatePipeName(partial)).toThrow(/toFixed/);
    expect(() => generatePipeName(empty)).toThrow(/toFixed/);
  });
});
describe('generateTankName', () => {
  it('цилиндр содержит Ø и H', () => {
    const name = generateTankName({
      shape: 'cylindrical',
      diameter_mm: 2000,
      height_mm: 3000,
      insulation_thickness_mm: 80,
      insulation_material: 'mineral_wool',
      ambient_temperature: -20,
      process_temperature: 80,
    });
    expect(name).toBe('Бак цил. Ø2000 мм×H3000 мм, δ=80 мм, МВ, -20→+80°C');
    expect(name).toContain('цил.');
    expect(name).toContain('Ø2000');
    expect(name).toContain('H3000');
  });

  it('параллелепипед собирает все 3 размера', () => {
    const name = generateTankName({
      shape: 'rectangular',
      length_mm: 5000,
      width_mm: 3000,
      height_mm: 4000,
      insulation_thickness_mm: 80,
      insulation_material: 'mineral_wool',
      ambient_temperature: -20,
      process_temperature: 60,
    });
    expect(name).toBe('Бак прям. 5000×3000×4000 мм, δ=80 мм, МВ, -20→+60°C');
    expect(name).toContain('5000×3000×4000');
    expect(name).toContain('прям.');
  });

  it('принимает partial/empty inputs без type assertion (runtime throws, callers catch)', () => {
    const partial = { shape: 'cylindrical' as const, diameter_mm: 2000 };
    const empty = {};
    expect(() => generateTankName(partial)).toThrow(/toFixed/);
    expect(() => generateTankName(empty)).toThrow(/toFixed/);
  });
});

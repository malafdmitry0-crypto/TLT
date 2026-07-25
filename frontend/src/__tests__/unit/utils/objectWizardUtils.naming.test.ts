import { describe, it, expect } from 'vitest';
import {
  findDN,
  generatePipeName,
  generateTankName,
} from '@/utils/objectWizardUtils';

describe('findDN', () => {
  it('возвращает DN если диаметр близок к стандартному (≤5 мм)', () => {
    expect(findDN(114)).toBe(100);    // OD 114.3 = DN100
    expect(findDN(60)).toBe(50);      // OD 60.3 = DN50
    expect(findDN(168.3)).toBe(150);  // exact
  });

  it('возвращает null если разница > 5 мм', () => {
    expect(findDN(108)).toBeNull();   // ближайший 114.3, diff 6.3
    expect(findDN(999)).toBeNull();
  });

  it('возвращает null для нулевого/отрицательного', () => {
    expect(findDN(0)).toBeNull();
    expect(findDN(-50)).toBeNull();
  });

  it('boundary: accepts at exactly 5 mm and rejects just over', () => {
    // OD 114.3 is DN100; 114.3 - 5 = 109.3 → still match; 109.2 → null
    expect(findDN(109.3)).toBe(100);
    expect(findDN(109.2)).toBeNull();
    // OD 60.3 is DN50; 60.3 + 5 = 65.3 → match; 65.4 → may match other OD
    expect(findDN(65.3)).toBe(50);
  });
});
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
    expect(name).toBe('Труба Ø114 мм (DN100), δ=50 мм, МВ, L=50 м, -20→+80°C');
    expect(name).toContain('Ø114');
    expect(name).toContain('DN100');
    expect(name).toContain('δ=50');
    expect(name).toContain('L=50');
    expect(name).toContain('-20');
    expect(name).toContain('+80');
  });

  it('без DN если диаметр нестандартный', () => {
    const name = generatePipeName({
      outer_diameter_mm: 234,
      pipe_length: 10,
      insulation_thickness_mm: 30,
      insulation_material: 'polyurethane',
      ambient_temperature: 0,
      process_temperature: 50,
    });
    expect(name).toBe('Труба Ø234 мм, δ=30 мм, ППУ, L=10 м, +0→+50°C');
    expect(name).not.toContain('DN');
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
    expect(name).toContain('DN100');
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

  it('шар содержит Ø', () => {
    const name = generateTankName({
      shape: 'spherical',
      diameter_mm: 1500,
      insulation_thickness_mm: 60,
      insulation_material: 'polyurethane',
      ambient_temperature: -20,
      process_temperature: 60,
    });
    expect(name).toBe('Бак сфер. Ø1500 мм, δ=60 мм, ППУ, -20→+60°C');
    expect(name).toContain('сфер.');
    expect(name).toContain('Ø1500');
  });

  it('принимает partial/empty inputs без type assertion (runtime throws, callers catch)', () => {
    const partial = { shape: 'cylindrical' as const, diameter_mm: 2000 };
    const empty = {};
    expect(() => generateTankName(partial)).toThrow(/toFixed/);
    expect(() => generateTankName(empty)).toThrow(/toFixed/);
  });
});

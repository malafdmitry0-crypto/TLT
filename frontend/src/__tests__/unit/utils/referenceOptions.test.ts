// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  buildInsulationReferenceOptions,
  buildSoilReferenceOptions,
} from '@/utils/referenceOptions';

describe('referenceOptions', () => {
  it('различает варианты изоляции с одинаковым названием', () => {
    const options = buildInsulationReferenceOptions([
      {
        material: 'mineral_wool_boards_120',
        name: 'Плиты минераловатные прошивные',
        conductivity: 0.044,
        density_kg_m3: 120,
      },
      {
        material: 'mineral_wool_boards_150',
        name: 'Плиты минераловатные прошивные',
        conductivity: 0.048,
        density_kg_m3: 150,
      },
      {
        material: 'foam_glass',
        name: 'Пеностекло',
        conductivity: 0.058,
      },
    ]);

    expect(options.map((option) => option.label)).toEqual([
      'Плиты минераловатные прошивные · ρ 120 кг/м³ · λ 0.044 Вт/мК',
      'Плиты минераловатные прошивные · ρ 150 кг/м³ · λ 0.048 Вт/мК',
      'Пеностекло',
    ]);
    expect(new Set(options.map((option) => option.label)).size).toBe(options.length);
  });

  it('различает варианты грунта по плотности, влажности и λ', () => {
    const options = buildSoilReferenceOptions([
      {
        soil: 'Суглинок',
        soil_code: 'loam_a',
        density_kg_m3: 1600,
        moisture_percent: 10,
        conductivity: 1.1,
      },
      {
        soil: 'Суглинок',
        soil_code: 'loam_b',
        density_kg_m3: 1800,
        moisture_percent: 10,
        conductivity: 1.4,
      },
    ]);

    expect(options[0].label).toBe('Суглинок · ρ 1600 кг/м³ · W 10% · λ 1.1 Вт/мК');
    expect(options[1].label).toBe('Суглинок · ρ 1800 кг/м³ · W 10% · λ 1.4 Вт/мК');
    expect(new Set(options.map((option) => option.label)).size).toBe(options.length);
  });

  it('даёт разные ключи вариантам грунта с одинаковыми плотностью и влажностью, но разной λ', () => {
    const options = buildSoilReferenceOptions([
      {
        soil: 'Суглинок',
        soil_code: 'suglinok',
        density_kg_m3: 1300,
        moisture_percent: 8,
        conductivity: 0.98,
      },
      {
        soil: 'Суглинок',
        soil_code: 'suglinok',
        density_kg_m3: 1300,
        moisture_percent: 8,
        conductivity: 1.12,
      },
    ]);

    expect(options.map((option) => option.value)).toEqual([
      'suglinok:1300:8:0.98',
      'suglinok:1300:8:1.12',
    ]);
  });
});

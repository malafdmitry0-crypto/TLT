/**
 * Справочные данные визарда для изолированного рендера.
 *
 * Общий источник для Storybook-историй и интеграционного харнесса
 * `__tests__/integration/components/ObjectWizardDependencies.test-harness.tsx`:
 * харнесс тянет `vi` из vitest и в Storybook не подключается, поэтому чистые
 * данные живут отдельно от способа их подстановки.
 */
import type { InsulationEntry } from '@/types/reference';

export const climateRows = [
  {
    city: 'Москва',
    region: 'Москва',
    t_0_92: -25,
    t_0_98: -28,
    t_abs_min: -42,
    wind_avg_cold: 4.2,
  },
];

export const insulationRows: InsulationEntry[] = [
  {
    material: 'mineral_wool',
    name: 'Минеральная вата',
    conductivity: 0.045,
    temperature_range: [-60, 400],
  },
  {
    material: 'foam_glass',
    name: 'Пеностекло',
    conductivity: 0.052,
    temperature_range: [-180, 430],
  },
];

export const pipeMaterialRows = [
  {
    material: 'carbon_steel',
    name: 'Сталь углеродистая',
    formula: 'a + b*T',
    a: 56,
    b: 0,
    accuracy: 'reference',
  },
];

export const soilRows = [
  {
    soil: 'Песок',
    soil_code: 'dry_sand',
    density_kg_m3: null,
    moisture_percent: 0,
    conductivity: 0.8,
  },
];

/** Заполненная труба — базовый набор значений для «happy» сценариев. */
export const basePipeParams = {
  name: 'Тестовая труба',
  outer_diameter: 0.108,
  wall_thickness: 0.004,
  pipe_material: 'carbon_steel',
  pipe_length: 25,
  insulation_layers: [{ thickness: 0.05, material: 'mineral_wool' }],
  ambient_temperature: -25,
  process_temperature: 80,
  min_switch_temperature: -20,
  placement: 'outdoor',
  wind_speed: 0,
};

/** Shared fixtures for ObjectWizardDependencies scenario tests (no tests). */
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ComponentProps } from 'react';
import ObjectWizard from '@/components/wizard/ObjectWizard';
import type { InsulationEntry } from '@/types/reference';
import { vi } from 'vitest';

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
  { material: 'mineral_wool', name: 'Минеральная вата', conductivity: 0.045, temperature_range: [-60, 400] },
  { material: 'foam_glass', name: 'Пеностекло', conductivity: 0.052, temperature_range: [-180, 430] },
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

export async function mockReferences() {
  const refs = await import('@/api/references');
  vi.mocked(refs.getClimate).mockResolvedValue(climateRows);
  vi.mocked(refs.getInsulation).mockResolvedValue(insulationRows);
  vi.mocked(refs.getPipeMaterials).mockResolvedValue(pipeMaterialRows);
  vi.mocked(refs.getSoilConductivity).mockResolvedValue(soilRows);
}

export function renderWizard(
  props: Partial<ComponentProps<typeof ObjectWizard>> = {},
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ObjectWizard
        objectType="pipe"
        onClose={vi.fn()}
        onSubmit={vi.fn()}
        {...props}
      />
    </QueryClientProvider>,
  );
}

export function spinValue(testId: string) {
  return screen.getByTestId(testId);
}

export const basePipeParams = {
  name: 'Тестовая труба',
  outer_diameter: 0.108,
  wall_thickness: 0.004,
  pipe_material: 'carbon_steel',
  pipe_length: 25,
  insulation_thickness: 0.05,
  insulation_material: 'mineral_wool',
  ambient_temperature: -25,
  process_temperature: 80,
  placement: 'outdoor',
};

import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getClimate, getInsulation, getPipeMaterials, getSoilConductivity } from '@/api/references';
import { useObjectWizardReferenceData } from '@/components/wizard/useObjectWizardReferenceData';
import type { ClimateEntry, InsulationEntry, PipeMaterialEntry, SoilConductivityEntry } from '@/types/reference';

vi.mock('@/api/references', () => ({
  getClimate: vi.fn(),
  getInsulation: vi.fn(),
  getPipeMaterials: vi.fn(),
  getSoilConductivity: vi.fn(),
}));

const climateRows: ClimateEntry[] = [
  {
    city: 'Москва',
    region: 'Москва',
    t_0_92: -25,
    t_0_98: -28,
    t_abs_min: -42,
    wind_avg_cold: 4.2,
  },
];

const insulationRows: InsulationEntry[] = [
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

const pipeMaterialRows: PipeMaterialEntry[] = [
  {
    material: 'carbon_steel',
    name: 'Сталь углеродистая',
    formula: 'a + b*T',
    a: 56,
    b: 0,
    accuracy: 'reference',
  },
];

const soilRows: SoilConductivityEntry[] = [
  {
    soil: 'Песок',
    soil_code: 'dry_sand',
    density_kg_m3: null,
    moisture_percent: 0,
    conductivity: 0.8,
  },
];

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

function renderReferenceData(
  overrides: Partial<Parameters<typeof useObjectWizardReferenceData>[0]> = {},
) {
  return renderHook(
    () => useObjectWizardReferenceData({
      selectedClimateKey: '',
      selectedGroundType: '',
      secondInsulationMaterial: '',
      thirdInsulationMaterial: '',
      ...overrides,
    }),
    { wrapper: createWrapper() },
  );
}

describe('useObjectWizardReferenceData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getClimate).mockResolvedValue(climateRows);
    vi.mocked(getInsulation).mockResolvedValue(insulationRows);
    vi.mocked(getPipeMaterials).mockResolvedValue(pipeMaterialRows);
    vi.mocked(getSoilConductivity).mockResolvedValue(soilRows);
  });

  it('loads insulation and pipe materials immediately; keeps climate/soil lazy', async () => {
    renderReferenceData();

    await waitFor(() => {
      expect(getInsulation).toHaveBeenCalledTimes(1);
      expect(getPipeMaterials).toHaveBeenCalledTimes(1);
    });
    expect(getClimate).not.toHaveBeenCalled();
    expect(getSoilConductivity).not.toHaveBeenCalled();
  });

  it('enables climate query when a climate key is already selected', async () => {
    renderReferenceData({ selectedClimateKey: 'Москва|||Москва' });

    await waitFor(() => {
      expect(getClimate).toHaveBeenCalledTimes(1);
    });
  });

  it('enables soil query when a ground type is already selected', async () => {
    renderReferenceData({ selectedGroundType: 'dry_sand:na:0' });

    await waitFor(() => {
      expect(getSoilConductivity).toHaveBeenCalledTimes(1);
    });
  });

  it('loads climate/soil only after picker open requests', async () => {
    const { result } = renderReferenceData();

    await waitFor(() => {
      expect(getInsulation).toHaveBeenCalled();
    });
    expect(getClimate).not.toHaveBeenCalled();
    expect(getSoilConductivity).not.toHaveBeenCalled();

    act(() => {
      result.current.requestClimateReference();
      result.current.requestSoilReference();
    });

    await waitFor(() => {
      expect(getClimate).toHaveBeenCalledTimes(1);
      expect(getSoilConductivity).toHaveBeenCalledTimes(1);
    });
  });

  it('derives options and selected reference indexes', async () => {
    const { result } = renderReferenceData({
      selectedClimateKey: 'Москва|||Москва',
      selectedGroundType: 'dry_sand:na:0',
      secondInsulationMaterial: 'mineral_wool',
      thirdInsulationMaterial: 'foam_glass',
    });

    await waitFor(() => {
      expect(result.current.insulationMaterials).toHaveLength(2);
      expect(result.current.pipeMaterialOptions.some((option) => option.value === 'carbon_steel')).toBe(true);
      expect(result.current.climateOptions).toEqual([
        {
          value: 'Москва|||Москва',
          label: 'Москва · Москва',
          group: 'Москва',
        },
      ]);
      expect(result.current.soilOptions).toHaveLength(1);
    });

    expect(result.current.selectedClimate).toMatchObject({ city: 'Москва', region: 'Москва' });
    expect(result.current.selectedSecondInsulation?.material).toBe('mineral_wool');
    expect(result.current.selectedThirdInsulation?.material).toBe('foam_glass');
    expect(result.current.insulationMaterialOptions.map((option) => option.value)).toContain('other');
    expect(result.current.pipeMaterialOptions.map((option) => option.value)).toContain('other');
  });
});

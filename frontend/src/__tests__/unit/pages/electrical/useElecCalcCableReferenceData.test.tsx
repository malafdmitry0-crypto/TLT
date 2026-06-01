import type { ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  listCables,
  type CableInfo,
} from '@/api/calculations';
import { getCablesTt, getResistiveCables } from '@/api/references';
import type { CableTypeKey } from '@/pages/electrical/elecCalcMainTableModel';
import { useElecCalcCableReferenceData } from '@/pages/electrical/useElecCalcCableReferenceData';
import type {
  CableTtEntry,
  ResistiveCableEntry,
  ResistiveCablesReference,
} from '@/types/reference';

vi.mock('@/api/calculations', () => ({
  listCables: vi.fn(),
}));

vi.mock('@/api/references', () => ({
  getCablesTt: vi.fn(),
  getResistiveCables: vi.fn(),
}));

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

function cable(overrides: Partial<CableInfo> = {}): CableInfo {
  return {
    brand: 'TLT',
    model: 'ТЛТ-25',
    cable_type: 'self_regulating',
    power_per_meter: 25,
    max_temperature: 65,
    min_temperature: -60,
    source: 'builtin',
    ...overrides,
  };
}

function ttCable(overrides: Partial<CableTtEntry> = {}): CableTtEntry {
  return {
    model: '30ТТВ2',
    series: 'ТТВ',
    nominal_power: 30,
    q1: 1,
    q2: 2,
    max_product_temp: 80,
    max_vapor_temp: 150,
    voltage: 220,
    ...overrides,
  };
}

function resistiveCable(overrides: Partial<ResistiveCableEntry> = {}): ResistiveCableEntry {
  return {
    cable_type: 'single_core',
    brand: 'TLT',
    model: 'R-1',
    source: 'builtin',
    resistance_ohm_km: 100,
    ...overrides,
  };
}

function resistiveReference(rows: ResistiveCableEntry[] = []): ResistiveCablesReference {
  return {
    single_core: rows,
    three_core: [],
    common: {},
  };
}

function renderReferenceData(
  overrides: Partial<Parameters<typeof useElecCalcCableReferenceData>[0]> = {},
) {
  return renderHook(() => useElecCalcCableReferenceData({
    projectSelected: true,
    commercialFeaturesAvailable: true,
    availableCableTypes: new Set<CableTypeKey>([
      'self_regulating',
      'self_regulating_tt',
      'single_core',
    ]),
    effectiveSource: 'all',
    visibleCableTypeControl: 'self_regulating',
    aggressiveProduct: false,
    cableSizingEffectiveCableType: 'self_regulating',
    ...overrides,
  }), {
    wrapper: createWrapper(),
  });
}

describe('useElecCalcCableReferenceData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listCables).mockImplementation(async (source) => {
      if (source === 'builtin') return [cable({ model: 'ТЛТ-25', source: 'builtin' })];
      return [
        cable({
          model: 'ТЛТ-30',
          source: 'extended',
          power_per_meter: 30,
          price_per_meter: 120,
        }),
      ];
    });
    vi.mocked(getCablesTt).mockResolvedValue([ttCable()]);
    vi.mocked(getResistiveCables).mockImplementation(async (source) => {
      if (source === 'builtin') {
        return resistiveReference([resistiveCable({ model: 'R-BUILTIN', source: 'builtin' })]);
      }
      return resistiveReference([resistiveCable({ model: 'R-EXT', source: 'extended' })]);
    });
  });

  it('skips cable reference queries without a selected project', () => {
    renderReferenceData({
      projectSelected: false,
      commercialFeaturesAvailable: true,
    });

    expect(listCables).not.toHaveBeenCalled();
    expect(getCablesTt).not.toHaveBeenCalled();
    expect(getResistiveCables).not.toHaveBeenCalled();
  });

  it('enables TT and resistive reference queries only for selected commercial projects', async () => {
    renderReferenceData({
      projectSelected: true,
      commercialFeaturesAvailable: true,
      effectiveSource: 'extended',
    });

    await waitFor(() => {
      expect(getCablesTt).toHaveBeenCalledTimes(1);
      expect(getResistiveCables).toHaveBeenCalledWith('extended');
      expect(getResistiveCables).toHaveBeenCalledWith('builtin');
    });
  });

  it('returns the composed catalog statuses and manual option builders', async () => {
    const { result } = renderReferenceData({
      aggressiveProduct: true,
      cableSizingEffectiveCableType: 'self_regulating_tt',
    });

    await waitFor(() => {
      expect(result.current.manualCableOptionsForType('self_regulating')).toHaveLength(1);
      expect(result.current.cableSizingManualOptions).toHaveLength(1);
    });

    expect(result.current.manualCableOptionsForType('self_regulating').map((option) => option.mark))
      .toEqual(['ТЛТ-30']);
    expect(result.current.cableSizingManualOptions[0].mark).toBe('30ТТВ2-СТ');
    expect(result.current.commercialDataStatus.label).toBe('Коммерческие данные есть');
    expect(result.current.technicalDataStatus.label).toBe('Техданные полные');
  });
});

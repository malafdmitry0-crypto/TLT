import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const resolveCableRowForMark = vi.hoisted(() => vi.fn());
const getCableMark = vi.hoisted(() => vi.fn());
const catalogSourceFromSnapshot = vi.hoisted(() => vi.fn());
const shouldShowProjectCableOption = vi.hoisted(() => vi.fn());
const cableMarkOptionValue = vi.hoisted(() => vi.fn((source: string, mark: string) => `${source}:${mark}`));

vi.mock('@/pages/electrical/elecCalcCableCatalogModel', () => ({
  resolveCableRowForMark,
}));

vi.mock('@/domain/electrical/elecCalcResultValueModel', () => ({
  getCableMark,
}));

vi.mock('@/pages/electrical/elecCalcCableOptionModel', () => ({
  AUTO_CABLE_MARK_VALUE: '__auto__',
  cableMarkOptionValue,
  catalogSourceFromSnapshot,
  shouldShowProjectCableOption,
}));

import { useElecCalcCableMarkPresentation } from '@/pages/electrical/useElecCalcCableMarkPresentation';

describe('useElecCalcCableMarkPresentation', () => {
  it('returns auto mark when mark missing', () => {
    shouldShowProjectCableOption.mockReturnValue(false);
    const { result } = renderHook(() => useElecCalcCableMarkPresentation({
      effectiveSource: 'builtin',
      cableRowsForType: () => [],
      manualCableOptionsForType: () => [],
      cableSizingEffectiveCableType: null,
      cableSizingManualMark: null,
      cableSizingModalCalc: undefined,
    }));
    expect(result.current.cableMarkValueForCalc('self_regulating', undefined, undefined))
      .toBe('__auto__');
  });

  it('uses project option when snapshot shows project cable', () => {
    shouldShowProjectCableOption.mockReturnValue(true);
    const { result } = renderHook(() => useElecCalcCableMarkPresentation({
      effectiveSource: 'builtin',
      cableRowsForType: () => [],
      manualCableOptionsForType: () => [],
      cableSizingEffectiveCableType: null,
      cableSizingManualMark: null,
      cableSizingModalCalc: undefined,
    }));
    expect(result.current.cableMarkValueForCalc('self_regulating', 'TLT-10', {} as never))
      .toBe('project:TLT-10');
  });

  it('resolves sizing selected cable via catalog helper', () => {
    resolveCableRowForMark.mockReturnValue({ mark: 'X' });
    getCableMark.mockReturnValue('X');
    catalogSourceFromSnapshot.mockReturnValue('builtin');
    const { result } = renderHook(() => useElecCalcCableMarkPresentation({
      effectiveSource: 'builtin',
      cableRowsForType: () => [{ mark: 'X' } as never],
      manualCableOptionsForType: () => [],
      cableSizingEffectiveCableType: 'self_regulating',
      cableSizingManualMark: null,
      cableSizingModalCalc: { id: 'c' } as never,
    }));
    expect(result.current.cableSizingModalSelectedCable).toEqual({ mark: 'X' });
    expect(resolveCableRowForMark).toHaveBeenCalled();
  });
});

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const validateElectricalLayoutCellCommit = vi.hoisted(() => vi.fn());
const resolveElectricalLayoutCellEditable = vi.hoisted(() => vi.fn());
const getCableMarkSource = vi.hoisted(() => vi.fn());
const catalogSourceFromSnapshot = vi.hoisted(() => vi.fn());

vi.mock('@/pages/electrical/elecCalcLayoutModel', () => ({
  validateElectricalLayoutCellCommit,
  isElectricalLayoutCellEditable: resolveElectricalLayoutCellEditable,
}));

vi.mock('@/domain/electrical/elecCalcResultValueModel', () => ({
  getCableMarkSource,
}));

vi.mock('@/pages/electrical/elecCalcCableOptionModel', () => ({
  catalogSourceFromSnapshot,
}));

import {
  ELECCALC_READ_ONLY_MESSAGE,
  useElecCalcGlideLayoutCommit,
} from '@/pages/electrical/useElecCalcGlideLayoutCommit';
import type { ProjectObject } from '@/types/project';

const obj = { id: 'o1' } as ProjectObject;

describe('useElecCalcGlideLayoutCommit', () => {
  const electricalLayoutMutate = vi.fn();
  const activateRowId = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    resolveElectricalLayoutCellEditable.mockReturnValue(true);
    getCableMarkSource.mockReturnValue('auto');
    catalogSourceFromSnapshot.mockReturnValue('builtin');
  });

  function render(overrides?: Partial<Parameters<typeof useElecCalcGlideLayoutCommit>[0]>) {
    return renderHook(() => useElecCalcGlideLayoutCommit({
      canMutate: true,
      projectSelected: true,
      effectiveSource: 'builtin',
      calcByObjectId: {},
      getCableTypeForObject: () => 'self_regulating',
      getObjectCalculationDisabledReason: () => null,
      isCableMarkPending: false,
      electricalLayoutMutate,
      activateRowId,
      ...overrides,
    }));
  }

  it('returns read-only message when cannot mutate', () => {
    const { result } = render({ canMutate: false });
    expect(result.current.handleElectricalGlideCommitCell(obj, 'winding_pitch_mm', 10))
      .toBe(ELECCALC_READ_ONLY_MESSAGE);
    expect(electricalLayoutMutate).not.toHaveBeenCalled();
  });

  it('returns assignment reason before validation', () => {
    const { result } = render({
      getObjectCalculationDisabledReason: () => 'назначьте',
    });
    expect(result.current.handleElectricalGlideCommitCell(obj, 'winding_pitch_mm', 10))
      .toBe('назначьте');
  });

  it('mutates on successful validation', () => {
    validateElectricalLayoutCellCommit.mockReturnValue({
      status: 'valid',
      calc: { id: 'c1' },
      mark: 'TLT-10',
      cableType: 'self_regulating',
      windingPitchMm: 100,
      numberOfThreads: 2,
    });
    getCableMarkSource.mockReturnValue('manual');
    catalogSourceFromSnapshot.mockReturnValue('extended');

    const { result } = render();
    let error: string | null = 'x';
    act(() => {
      error = result.current.handleElectricalGlideCommitCell(obj, 'winding_pitch_mm', 100);
    });
    expect(error).toBeNull();
    expect(electricalLayoutMutate).toHaveBeenCalledWith({
      objectId: 'o1',
      cableMark: 'TLT-10',
      cableSource: 'extended',
      cableType: 'self_regulating',
      windingPitchMm: 100,
      numberOfThreads: 2,
    });
  });

  it('starts edit by activating row', () => {
    const { result } = render();
    act(() => {
      result.current.handleElectricalGlideStartCellEdit(obj);
    });
    expect(activateRowId).toHaveBeenCalledWith('o1');
  });
});

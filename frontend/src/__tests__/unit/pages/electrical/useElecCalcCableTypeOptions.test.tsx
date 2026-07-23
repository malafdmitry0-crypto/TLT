import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const warning = vi.hoisted(() => vi.fn());

vi.mock('antd', async () => {
  const actual = await vi.importActual<typeof import('antd')>('antd');
  return {
    ...actual,
    message: { ...actual.message, warning },
  };
});

import { useElecCalcCableTypeOptions } from '@/pages/electrical/useElecCalcCableTypeOptions';
import type { ElectricalQueryAssignment } from '@/types/calculation';

const assignment = (
  id: string,
  system: ElectricalQueryAssignment['system_type'],
): ElectricalQueryAssignment => ({
  object_id: id,
  system_type: system,
  assignment_state: 'ready',
  version: 1,
});

describe('useElecCalcCableTypeOptions', () => {
  const setDefaultCableType = vi.fn();
  const setCableTypeDraftByObjectId = vi.fn();
  const resetConnectionType = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sets default type when nothing selected', () => {
    const { result } = renderHook(() => useElecCalcCableTypeOptions({
      availableCableTypeKeys: ['self_regulating', 'single_core'],
      assignmentByObjectId: new Map(),
      isEmployee: false,
      canMutate: true,
      selectedRowKeys: [],
      normalizeAvailableCableType: (t) => t,
      setDefaultCableType,
      setCableTypeDraftByObjectId,
      getSavedCableTypeForObject: () => 'self_regulating',
      resetConnectionType,
    }));

    act(() => {
      result.current.handleCableTypeControlChange('single_core');
    });
    expect(setDefaultCableType).toHaveBeenCalledWith('single_core');
    expect(resetConnectionType).toHaveBeenCalled();
  });

  it('warns when selection is incompatible with next type', () => {
    const { result } = renderHook(() => useElecCalcCableTypeOptions({
      availableCableTypeKeys: ['self_regulating', 'single_core'],
      assignmentByObjectId: new Map([
        ['a', assignment('a', 'resistive')],
      ]),
      isEmployee: true,
      canMutate: true,
      selectedRowKeys: ['a'],
      normalizeAvailableCableType: (t) => t,
      setDefaultCableType,
      setCableTypeDraftByObjectId,
      getSavedCableTypeForObject: () => 'single_core',
      resetConnectionType,
    }));

    act(() => {
      result.current.handleCableTypeControlChange('self_regulating');
    });
    expect(warning).toHaveBeenCalled();
    expect(setCableTypeDraftByObjectId).not.toHaveBeenCalled();
  });

  it('filters options for object assignment', () => {
    const { result } = renderHook(() => useElecCalcCableTypeOptions({
      availableCableTypeKeys: ['self_regulating', 'single_core'],
      assignmentByObjectId: new Map([
        ['a', assignment('a', 'self_regulating')],
      ]),
      isEmployee: false,
      canMutate: true,
      selectedRowKeys: [],
      normalizeAvailableCableType: (t) => t,
      setDefaultCableType,
      setCableTypeDraftByObjectId,
      getSavedCableTypeForObject: () => 'self_regulating',
      resetConnectionType,
    }));

    expect(result.current.cableTypeOptionsForObject('a').map((o) => o.value))
      .toEqual(['self_regulating']);
    expect(result.current.cableSourceOptions).toHaveLength(1);
  });
});

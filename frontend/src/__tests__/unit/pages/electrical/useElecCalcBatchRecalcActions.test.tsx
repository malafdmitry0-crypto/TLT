import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const warning = vi.hoisted(() => vi.fn());

vi.mock('@/feedback/appFeedback', async () => {
  const actual = await vi.importActual<typeof import('@/feedback/appFeedback')>(
    '@/feedback/appFeedback',
  );
  return {
    ...actual,
    appMessage: { ...actual.appMessage, warning },
  };
});

import { useElecCalcBatchRecalcActions } from '@/pages/electrical/useElecCalcBatchRecalcActions';
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

describe('useElecCalcBatchRecalcActions', () => {
  const mutateBatch = vi.fn();
  const cancelJob = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('filters incompatible selection and warns', () => {
    const { result } = renderHook(() => useElecCalcBatchRecalcActions({
      canMutate: true,
      selectedRowKeys: ['ok', 'bad'],
      assignmentByObjectId: new Map([
        ['ok', assignment('ok', 'self_regulating')],
        ['bad', assignment('bad', 'resistive')],
      ]),
      cableTypeForRecalculation: 'self_regulating',
      mutateBatch,
      cancelJob,
    }));

    act(() => {
      result.current.onRecalculateSelected(true);
    });
    expect(warning).toHaveBeenCalled();
    expect(mutateBatch).toHaveBeenCalledWith({
      scope: 'selected',
      objectIds: ['ok'],
      skipManual: true,
    });
  });

  it('recalculates all when allowed', () => {
    const { result } = renderHook(() => useElecCalcBatchRecalcActions({
      canMutate: true,
      selectedRowKeys: [],
      assignmentByObjectId: new Map(),
      cableTypeForRecalculation: 'self_regulating',
      mutateBatch,
      cancelJob,
    }));
    act(() => {
      result.current.onRecalculateAll(false);
    });
    expect(mutateBatch).toHaveBeenCalledWith({ scope: 'all', skipManual: false });
  });

  it('no-ops when cannot mutate', () => {
    const { result } = renderHook(() => useElecCalcBatchRecalcActions({
      canMutate: false,
      selectedRowKeys: ['a'],
      assignmentByObjectId: new Map([['a', assignment('a', 'self_regulating')]]),
      cableTypeForRecalculation: 'self_regulating',
      mutateBatch,
      cancelJob,
    }));
    act(() => {
      result.current.onRecalculateSelected(true);
      result.current.onCancelJob();
    });
    expect(mutateBatch).not.toHaveBeenCalled();
    expect(cancelJob).not.toHaveBeenCalled();
  });
});

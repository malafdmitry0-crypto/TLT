import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const initializeElectricalVariants = vi.hoisted(() => vi.fn());
const warning = vi.hoisted(() => vi.fn());
const error = vi.hoisted(() => vi.fn());

vi.mock('@/api/electricalVariants', () => ({
  initializeElectricalVariants,
}));

vi.mock('@/feedback/appFeedback', async () => {
  const actual = await vi.importActual<typeof import('@/feedback/appFeedback')>(
    '@/feedback/appFeedback',
  );
  return {
    ...actual,
    appMessage: { ...actual.appMessage, warning, error },
  };
});

vi.mock('@/routes/routes', () => ({
  ROUTES: { elecCalc: '/workspace/elec' },
}));

import { useHeatCalcContinueToElectrical } from '@/pages/heatcalc/useHeatCalcContinueToElectrical';

describe('useHeatCalcContinueToElectrical', () => {
  const navigate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    initializeElectricalVariants.mockResolvedValue(undefined);
  });

  it('warns and does not navigate when project has no objects', async () => {
    const { result } = renderHook(() => useHeatCalcContinueToElectrical({
      projectId: 'p1',
      objects: [],
      navigate,
    }));

    expect(result.current.continueToElectricalDisabled).toBe(true);

    await act(async () => {
      result.current.handleContinueToElectrical();
    });

    expect(warning).toHaveBeenCalled();
    expect(initializeElectricalVariants).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('errors when objects invalid', async () => {
    const { result } = renderHook(() => useHeatCalcContinueToElectrical({
      projectId: 'p1',
      objects: [{ is_valid: false }],
      navigate,
    }));

    await act(async () => {
      result.current.handleContinueToElectrical();
    });

    expect(error).toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('initializes variants and navigates when ready', async () => {
    const { result } = renderHook(() => useHeatCalcContinueToElectrical({
      projectId: 'p1',
      objects: [{ is_valid: true }],
      navigate,
    }));

    await act(async () => {
      result.current.handleContinueToElectrical();
    });
    // flush microtask from void async IIFE
    await act(async () => {
      await Promise.resolve();
    });

    expect(initializeElectricalVariants).toHaveBeenCalledWith('p1');
    expect(navigate).toHaveBeenCalledWith('/workspace/elec');
  });

  it('still navigates when initialize fails', async () => {
    initializeElectricalVariants.mockRejectedValueOnce(new Error('exists'));
    const { result } = renderHook(() => useHeatCalcContinueToElectrical({
      projectId: 'p1',
      objects: [{ is_valid: true }],
      navigate,
    }));

    await act(async () => {
      result.current.handleContinueToElectrical();
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(navigate).toHaveBeenCalledWith('/workspace/elec');
  });
});

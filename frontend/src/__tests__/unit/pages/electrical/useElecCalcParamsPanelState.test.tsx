import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const readStorageJson = vi.hoisted(() => vi.fn());

vi.mock('@/utils/storage', () => ({
  readStorageJson,
}));

import {
  ELECCALC_PARAMS_PANEL_STORAGE_KEY,
  useElecCalcParamsPanelState,
} from '@/pages/electrical/useElecCalcParamsPanelState';

describe('useElecCalcParamsPanelState', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    readStorageJson.mockReturnValue(undefined);
    vi.stubGlobal('localStorage', {
      setItem: vi.fn(),
      getItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
    });
  });

  it('defaults panel hidden', () => {
    const { result } = renderHook(() => useElecCalcParamsPanelState());
    expect(result.current.paramsPanelVisible).toBe(false);
  });

  it('restores true from storage', () => {
    readStorageJson.mockReturnValue(true);
    const { result } = renderHook(() => useElecCalcParamsPanelState());
    expect(result.current.paramsPanelVisible).toBe(true);
  });

  it('persists toggle', () => {
    const { result } = renderHook(() => useElecCalcParamsPanelState());
    act(() => {
      result.current.toggleParamsPanel(true);
    });
    expect(result.current.paramsPanelVisible).toBe(true);
    expect(localStorage.setItem).toHaveBeenCalledWith(
      ELECCALC_PARAMS_PANEL_STORAGE_KEY,
      'true',
    );
  });
});

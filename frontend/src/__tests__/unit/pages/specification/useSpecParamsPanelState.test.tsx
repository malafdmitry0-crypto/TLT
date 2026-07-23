import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const readStorageJson = vi.hoisted(() => vi.fn());

vi.mock('@/utils/storage', () => ({
  readStorageJson,
}));

import {
  SPEC_PARAMS_PANEL_STORAGE_KEY,
  useSpecParamsPanelState,
} from '@/pages/specification/useSpecParamsPanelState';

describe('useSpecParamsPanelState', () => {
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

  it('defaults closed', () => {
    const { result } = renderHook(() => useSpecParamsPanelState());
    expect(result.current.settingsOpen).toBe(false);
  });

  it('restores and persists open state', () => {
    readStorageJson.mockReturnValue(true);
    const { result } = renderHook(() => useSpecParamsPanelState());
    expect(result.current.settingsOpen).toBe(true);
    act(() => {
      result.current.toggleSettings(false);
    });
    expect(localStorage.setItem).toHaveBeenCalledWith(
      SPEC_PARAMS_PANEL_STORAGE_KEY,
      'false',
    );
  });
});

import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useHeatCalcRouteShellEffects } from '@/pages/heatcalc/useHeatCalcRouteShellEffects';

type IdleWindow = Window & {
  requestIdleCallback?: (callback: () => void, options?: { timeout?: number }) => number;
  cancelIdleCallback?: (handle: number) => void;
};

describe('useHeatCalcRouteShellEffects', () => {
  const originalRequestIdleCallback = (window as IdleWindow).requestIdleCallback;
  const originalCancelIdleCallback = (window as IdleWindow).cancelIdleCallback;

  afterEach(() => {
    (window as IdleWindow).requestIdleCallback = originalRequestIdleCallback;
    (window as IdleWindow).cancelIdleCallback = originalCancelIdleCallback;
    vi.restoreAllMocks();
  });

  it('resets workspace header context', () => {
    const setWorkspaceHeaderContext = vi.fn();

    renderHook(() => useHeatCalcRouteShellEffects({
      projectPresent: false,
      setWorkspaceHeaderContext,
      preloadWizard: vi.fn(),
    }));

    expect(setWorkspaceHeaderContext).toHaveBeenCalledWith(null);
  });

  it('does not preload the wizard without a project', () => {
    const preloadWizard = vi.fn();

    renderHook(() => useHeatCalcRouteShellEffects({
      projectPresent: false,
      setWorkspaceHeaderContext: vi.fn(),
      preloadWizard,
    }));

    expect(preloadWizard).not.toHaveBeenCalled();
  });

  it('preloads the wizard on idle and cancels the idle callback on cleanup', () => {
    const preloadWizard = vi.fn();
    const cancelIdleCallback = vi.fn();
    const requestIdleCallback = vi.fn((callback: () => void) => {
      callback();
      return 42;
    });
    (window as IdleWindow).requestIdleCallback = requestIdleCallback;
    (window as IdleWindow).cancelIdleCallback = cancelIdleCallback;

    const { unmount } = renderHook(() => useHeatCalcRouteShellEffects({
      projectPresent: true,
      setWorkspaceHeaderContext: vi.fn(),
      preloadWizard,
    }));

    expect(requestIdleCallback).toHaveBeenCalledWith(preloadWizard, { timeout: 2_000 });
    expect(preloadWizard).toHaveBeenCalledTimes(1);

    unmount();

    expect(cancelIdleCallback).toHaveBeenCalledWith(42);
  });
});

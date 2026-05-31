import { useEffect } from 'react';

import { preloadHeatCalcObjectWizard } from '@/pages/heatcalc/heatCalcObjectWizardLoader';

interface UseHeatCalcRouteShellEffectsOptions {
  projectPresent: boolean;
  setWorkspaceHeaderContext: (context: null) => void;
  preloadWizard?: () => void;
}

export function useHeatCalcRouteShellEffects({
  projectPresent,
  setWorkspaceHeaderContext,
  preloadWizard = preloadHeatCalcObjectWizard,
}: UseHeatCalcRouteShellEffectsOptions) {
  useEffect(() => {
    setWorkspaceHeaderContext(null);
  }, [setWorkspaceHeaderContext]);

  useEffect(() => {
    if (!projectPresent) return undefined;
    const win = window as Window & {
      requestIdleCallback?: (callback: () => void, options?: { timeout?: number }) => number;
      cancelIdleCallback?: (handle: number) => void;
    };
    if (win.requestIdleCallback) {
      const handle = win.requestIdleCallback(preloadWizard, { timeout: 2_000 });
      return () => win.cancelIdleCallback?.(handle);
    }
    const handle = window.setTimeout(preloadWizard, 0);
    return () => window.clearTimeout(handle);
  }, [preloadWizard, projectPresent]);
}

/**
 * @module electrical/params-panel-state
 * @owner electrical
 * @depends utils/storage
 * @does-not heat
 *
 * Optional advanced params panel (PDF page 35 has none). Default OFF.
 */
import { useCallback, useState } from 'react';

import { readStorageJson } from '@/utils/storage';

export const ELECCALC_PARAMS_PANEL_STORAGE_KEY = 'tlt-eleccalc-params-panel';

export function useElecCalcParamsPanelState() {
  const [paramsPanelVisible, setParamsPanelVisible] = useState<boolean>(
    () => readStorageJson(ELECCALC_PARAMS_PANEL_STORAGE_KEY) === true,
  );

  const toggleParamsPanel = useCallback((visible: boolean) => {
    setParamsPanelVisible(visible);
    try {
      localStorage.setItem(ELECCALC_PARAMS_PANEL_STORAGE_KEY, JSON.stringify(visible));
    } catch {
      // localStorage may be unavailable — keep in-session only
    }
  }, []);

  return {
    paramsPanelVisible,
    toggleParamsPanel,
  };
}

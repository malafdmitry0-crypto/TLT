/**
 * @module specification/params-panel-state
 * @owner specification
 */
import { useCallback, useState } from 'react';
import { readStorageJson } from '@/utils/storage';

export const SPEC_PARAMS_PANEL_STORAGE_KEY = 'tlt-spec-params-panel';

export function useSpecParamsPanelState() {
  const [settingsOpen, setSettingsOpen] = useState<boolean>(
    () => readStorageJson(SPEC_PARAMS_PANEL_STORAGE_KEY) === true,
  );
  const toggleSettings = useCallback((visible: boolean) => {
    setSettingsOpen(visible);
    try {
      localStorage.setItem(SPEC_PARAMS_PANEL_STORAGE_KEY, JSON.stringify(visible));
    } catch {
      // session-only if storage blocked
    }
  }, []);
  return { settingsOpen, toggleSettings };
}

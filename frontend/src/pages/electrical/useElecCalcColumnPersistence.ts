import {
  useCallback,
  useEffect,
  useRef,
  type Dispatch,
  type PointerEvent as ReactPointerEvent,
  type SetStateAction,
} from 'react';
import { appMessage as message } from '@/feedback/appFeedback';

import type {
  ElectricalCandidateTableColumnPreferenceMutation,
  ElectricalTableColumnPreferenceMutation,
  ElectricalTableSettingsPreferenceMutation,
} from '@/pages/electrical/elecCalcPageModel';
import {
  clearRegisteredElectricalCandidateTableColumnCache,
  normalizeElectricalCandidateTableColumnSettings,
  setElectricalCandidateTableColumnWidthPct,
  writeGuestElectricalCandidateTableColumnSettings,
  type ElectricalCandidateColumnKey,
  type ElectricalCandidateTableColumnSettings,
} from '@/utils/electricalCandidateTableColumns';
import {
  clampElectricalTableColumnWidthPct,
  clearRegisteredElectricalTableColumnCache,
  electricalTableColumnWidthPxToPct,
  normalizeElectricalTableColumnSettings,
  setElectricalTableColumnWidthPct,
  writeGuestElectricalTableColumnSettings,
  type ElectricalColumnKey,
  type ElectricalTableColumnSettings,
} from '@/utils/electricalTableColumns';
import {
  clearRegisteredElectricalTableViewCache,
  normalizeElectricalTableViewSettings,
  writeGuestElectricalTableViewSettings,
  type ElectricalTableViewSettings,
} from '@/utils/electricalTableViewSettings';

type PersistOptions = { closeModal?: boolean; showMessage?: boolean };

type ResizeMeta<TKey extends string> = {
  key: TKey;
  width: number;
  widthPct: number;
};

type UseElecCalcColumnPersistenceOptions = {
  tableColumnSettings: ElectricalTableColumnSettings;
  candidateTableColumnSettings: ElectricalCandidateTableColumnSettings;
  isRegisteredUser: boolean;
  registeredUserId: string | null;
  setTableColumnSettings: Dispatch<SetStateAction<ElectricalTableColumnSettings>>;
  setCandidateTableColumnSettings: Dispatch<SetStateAction<ElectricalCandidateTableColumnSettings>>;
  setTableViewSettings: Dispatch<SetStateAction<ElectricalTableViewSettings>>;
  setColumnSettingsOpen: (open: boolean) => void;
  setCandidateColumnSettingsOpen: (open: boolean) => void;
  updateTableColumnPreference: (mutation: ElectricalTableColumnPreferenceMutation) => void;
  updateCandidateTableColumnPreference: (
    mutation: ElectricalCandidateTableColumnPreferenceMutation,
  ) => void;
  updateTableSettingsPreference: (mutation: ElectricalTableSettingsPreferenceMutation) => void;
};

export function useElecCalcColumnPersistence({
  tableColumnSettings,
  candidateTableColumnSettings,
  isRegisteredUser,
  registeredUserId,
  setTableColumnSettings,
  setCandidateTableColumnSettings,
  setTableViewSettings,
  setColumnSettingsOpen,
  setCandidateColumnSettingsOpen,
  updateTableColumnPreference,
  updateCandidateTableColumnPreference,
  updateTableSettingsPreference,
}: UseElecCalcColumnPersistenceOptions) {
  const tableColumnSettingsRef = useRef(tableColumnSettings);
  const candidateTableColumnSettingsRef = useRef(candidateTableColumnSettings);

  useEffect(() => {
    tableColumnSettingsRef.current = tableColumnSettings;
  }, [tableColumnSettings]);

  useEffect(() => {
    candidateTableColumnSettingsRef.current = candidateTableColumnSettings;
  }, [candidateTableColumnSettings]);

  const persistTableColumnSettings = useCallback((
    settings: ElectricalTableColumnSettings,
    options: PersistOptions = {},
  ) => {
    const normalized = normalizeElectricalTableColumnSettings(settings);
    setTableColumnSettings(normalized);
    if (isRegisteredUser) {
      clearRegisteredElectricalTableColumnCache(registeredUserId);
      updateTableColumnPreference({
        settings: normalized,
        closeModal: options.closeModal,
        showMessage: options.showMessage,
      });
      return;
    }
    writeGuestElectricalTableColumnSettings(normalized);
    if (options.closeModal) setColumnSettingsOpen(false);
    if (options.showMessage !== false) message.success('Настройки таблицы сохранены');
  }, [
    isRegisteredUser,
    registeredUserId,
    setColumnSettingsOpen,
    setTableColumnSettings,
    updateTableColumnPreference,
  ]);

  const persistCandidateTableColumnSettings = useCallback((
    settings: ElectricalCandidateTableColumnSettings,
    options: PersistOptions = {},
  ) => {
    const normalized = normalizeElectricalCandidateTableColumnSettings(settings);
    setCandidateTableColumnSettings(normalized);
    if (isRegisteredUser) {
      clearRegisteredElectricalCandidateTableColumnCache(registeredUserId);
      updateCandidateTableColumnPreference({
        settings: normalized,
        closeModal: options.closeModal,
        showMessage: options.showMessage,
      });
      return;
    }
    writeGuestElectricalCandidateTableColumnSettings(normalized);
    if (options.closeModal) setCandidateColumnSettingsOpen(false);
    if (options.showMessage !== false) message.success('Настройки таблицы подбора сохранены');
  }, [
    isRegisteredUser,
    registeredUserId,
    setCandidateColumnSettingsOpen,
    setCandidateTableColumnSettings,
    updateCandidateTableColumnPreference,
  ]);

  const persistTableSettings = useCallback((
    columnSettings: ElectricalTableColumnSettings,
    viewSettings: ElectricalTableViewSettings,
  ) => {
    const normalizedColumns = normalizeElectricalTableColumnSettings(columnSettings);
    const normalizedView = normalizeElectricalTableViewSettings(viewSettings);
    setTableColumnSettings(normalizedColumns);
    setTableViewSettings(normalizedView);
    if (isRegisteredUser) {
      clearRegisteredElectricalTableColumnCache(registeredUserId);
      clearRegisteredElectricalTableViewCache(registeredUserId);
      updateTableSettingsPreference({
        columnSettings: normalizedColumns,
        viewSettings: normalizedView,
      });
      return;
    }
    writeGuestElectricalTableColumnSettings(normalizedColumns);
    writeGuestElectricalTableViewSettings(normalizedView);
    setColumnSettingsOpen(false);
    message.success('Настройки таблицы сохранены');
  }, [
    isRegisteredUser,
    registeredUserId,
    setColumnSettingsOpen,
    setTableColumnSettings,
    setTableViewSettings,
    updateTableSettingsPreference,
  ]);

  const applyColumnWidth = useCallback((key: ElectricalColumnKey, widthPct: number) => {
    const nextSettings = setElectricalTableColumnWidthPct(
      tableColumnSettingsRef.current,
      key,
      clampElectricalTableColumnWidthPct(widthPct),
    );
    persistTableColumnSettings(nextSettings, { showMessage: false });
  }, [persistTableColumnSettings]);

  const applyElectricalGlideColumnDraftWidth = useCallback((
    key: string,
    widthPx: number,
  ) => {
    setTableColumnSettings((settings) =>
      setElectricalTableColumnWidthPct(
        settings,
        key,
        electricalTableColumnWidthPxToPct(widthPx),
      ),
    );
  }, [setTableColumnSettings]);

  const commitElectricalGlideColumnWidth = useCallback((
    key: string,
    widthPx: number,
  ) => {
    applyColumnWidth(key, electricalTableColumnWidthPxToPct(widthPx));
  }, [applyColumnWidth]);

  const applyCandidateColumnWidth = useCallback((
    key: ElectricalCandidateColumnKey,
    widthPct: number,
  ) => {
    const nextSettings = setElectricalCandidateTableColumnWidthPct(
      candidateTableColumnSettingsRef.current,
      key,
      clampElectricalTableColumnWidthPct(widthPct),
    );
    persistCandidateTableColumnSettings(nextSettings, { showMessage: false });
  }, [persistCandidateTableColumnSettings]);

  const applyElectricalCandidateGlideColumnDraftWidth = useCallback((
    key: string,
    widthPx: number,
  ) => {
    setCandidateTableColumnSettings((settings) =>
      setElectricalCandidateTableColumnWidthPct(
        settings,
        key,
        electricalTableColumnWidthPxToPct(widthPx),
      ),
    );
  }, [setCandidateTableColumnSettings]);

  const commitElectricalCandidateGlideColumnWidth = useCallback((
    key: string,
    widthPx: number,
  ) => {
    applyCandidateColumnWidth(key, electricalTableColumnWidthPxToPct(widthPx));
  }, [applyCandidateColumnWidth]);

  const startColumnResize = useCallback((
    meta: ResizeMeta<ElectricalColumnKey>,
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startWidth = meta.width;
    let latestWidthPct = meta.widthPct;
    let frameId: number | null = null;

    function flushDraftWidth() {
      frameId = null;
      setTableColumnSettings((settings) =>
        setElectricalTableColumnWidthPct(settings, meta.key, latestWidthPct),
      );
    }

    function handlePointerMove(pointerEvent: PointerEvent) {
      const nextWidthPx = Math.max(30, startWidth + pointerEvent.clientX - startX);
      latestWidthPct = electricalTableColumnWidthPxToPct(nextWidthPx);
      if (frameId == null) {
        frameId = window.requestAnimationFrame(flushDraftWidth);
      }
    }

    function handlePointerUp() {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      if (frameId != null) {
        window.cancelAnimationFrame(frameId);
        frameId = null;
      }
      applyColumnWidth(meta.key, latestWidthPct);
    }

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  }, [applyColumnWidth, setTableColumnSettings]);

  return {
    persistTableColumnSettings,
    persistCandidateTableColumnSettings,
    persistTableSettings,
    applyColumnWidth,
    applyElectricalGlideColumnDraftWidth,
    commitElectricalGlideColumnWidth,
    applyCandidateColumnWidth,
    applyElectricalCandidateGlideColumnDraftWidth,
    commitElectricalCandidateGlideColumnWidth,
    startColumnResize,
  };
}

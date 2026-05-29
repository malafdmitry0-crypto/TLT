import {
  useCallback,
  useRef,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react';

import {
  clampTableColumnWidthPct,
  setTableColumnWidthPct,
  tableColumnWidthPxToPct,
  type HeatCalcColumnKey,
  type HeatCalcResolvedColumnMeta,
  type HeatCalcTableColumnScope,
  type HeatCalcTableColumnSettings,
} from '@/utils/heatCalcTableColumns';
import {
  normalizeTableViewSettings,
  type HeatCalcFormPlacement,
  type HeatCalcTableViewSettings,
} from '@/utils/heatCalcTableViewSettings';

type SideFormPlacement = Extract<HeatCalcFormPlacement, 'left' | 'right'>;

interface SideResizeState {
  placement: SideFormPlacement;
  rect: Pick<DOMRect, 'left' | 'right' | 'width'>;
}

interface ResolveSideFormWidthPctOptions {
  clientX: number;
  currentViewSettings: HeatCalcTableViewSettings;
  state: SideResizeState | null;
}

interface UseHeatCalcResizeModelOptions {
  activeTableColumnScope: HeatCalcTableColumnScope;
  applySideFormWidthPct: (widthPct: number) => HeatCalcTableViewSettings;
  formPlacement: HeatCalcFormPlacement;
  persistTableColumnSettings: (
    settings: HeatCalcTableColumnSettings,
    options?: { closeModal?: boolean; showMessage?: boolean },
  ) => void;
  persistTableViewOnly: (viewSettings: HeatCalcTableViewSettings) => void;
  sideWorkspaceRef: RefObject<HTMLDivElement | null>;
  tableColumnSettingsRef: { current: HeatCalcTableColumnSettings };
  tableViewSettingsRef: { current: HeatCalcTableViewSettings };
  updateTableColumnSettingsDraft: (
    updater: (settings: HeatCalcTableColumnSettings) => HeatCalcTableColumnSettings,
  ) => void;
}

export function resolveSideFormWidthPctFromClientX({
  clientX,
  currentViewSettings,
  state,
}: ResolveSideFormWidthPctOptions) {
  if (!state || state.rect.width <= 0) return null;
  const rawWidthPct = state.placement === 'left'
    ? ((clientX - state.rect.left) / state.rect.width) * 100
    : ((state.rect.right - clientX) / state.rect.width) * 100;
  return normalizeTableViewSettings({
    ...currentViewSettings,
    sideFormWidthPct: rawWidthPct,
  }).sideFormWidthPct;
}

export function useHeatCalcResizeModel({
  activeTableColumnScope,
  applySideFormWidthPct,
  formPlacement,
  persistTableColumnSettings,
  persistTableViewOnly,
  sideWorkspaceRef,
  tableColumnSettingsRef,
  tableViewSettingsRef,
  updateTableColumnSettingsDraft,
}: UseHeatCalcResizeModelOptions) {
  const sideResizeStateRef = useRef<SideResizeState | null>(null);

  const sideFormWidthPctFromClientX = useCallback((clientX: number) => (
    resolveSideFormWidthPctFromClientX({
      clientX,
      currentViewSettings: tableViewSettingsRef.current,
      state: sideResizeStateRef.current,
    })
  ), [tableViewSettingsRef]);

  const startSideFormResizeDrag = useCallback((
    moveEventName: 'pointermove' | 'mousemove',
    upEventName: 'pointerup' | 'mouseup',
    cancelEventName?: 'pointercancel',
  ) => {
    if (formPlacement !== 'left' && formPlacement !== 'right') return;
    const rect = sideWorkspaceRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return;
    sideResizeStateRef.current = { placement: formPlacement, rect };
    document.body.classList.add('heatcalc-side-resizing');

    const finishResize = (resizeEvent?: PointerEvent | MouseEvent) => {
      window.removeEventListener(moveEventName, handlePointerMove as EventListener);
      window.removeEventListener(upEventName, handlePointerUp as EventListener);
      if (cancelEventName) window.removeEventListener(cancelEventName, handlePointerCancel as EventListener);
      document.body.classList.remove('heatcalc-side-resizing');
      const finalWidthPct = resizeEvent
        ? sideFormWidthPctFromClientX(resizeEvent.clientX)
        : tableViewSettingsRef.current.sideFormWidthPct;
      sideResizeStateRef.current = null;
      const normalizedView = applySideFormWidthPct(finalWidthPct ?? tableViewSettingsRef.current.sideFormWidthPct);
      persistTableViewOnly(normalizedView);
    };

    function handlePointerMove(resizeEvent: PointerEvent | MouseEvent) {
      const nextWidthPct = sideFormWidthPctFromClientX(resizeEvent.clientX);
      if (nextWidthPct == null) return;
      applySideFormWidthPct(nextWidthPct);
    }

    function handlePointerUp(resizeEvent: PointerEvent | MouseEvent) {
      finishResize(resizeEvent);
    }

    function handlePointerCancel() {
      finishResize();
    }

    window.addEventListener(moveEventName, handlePointerMove as EventListener);
    window.addEventListener(upEventName, handlePointerUp as EventListener);
    if (cancelEventName) window.addEventListener(cancelEventName, handlePointerCancel as EventListener);
  }, [
    applySideFormWidthPct,
    formPlacement,
    persistTableViewOnly,
    sideFormWidthPctFromClientX,
    sideWorkspaceRef,
    tableViewSettingsRef,
  ]);

  const startSideFormResize = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    startSideFormResizeDrag('pointermove', 'pointerup', 'pointercancel');
  }, [startSideFormResizeDrag]);

  const startSideFormMouseResize = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    startSideFormResizeDrag('mousemove', 'mouseup');
  }, [
    startSideFormResizeDrag,
  ]);

  const applyColumnWidth = useCallback((
    type: HeatCalcTableColumnScope,
    key: HeatCalcColumnKey,
    widthPct: number,
  ) => {
    const nextSettings = setTableColumnWidthPct(
      tableColumnSettingsRef.current,
      type,
      key,
      clampTableColumnWidthPct(widthPct),
    );
    persistTableColumnSettings(nextSettings, { showMessage: false });
  }, [persistTableColumnSettings, tableColumnSettingsRef]);

  const updateColumnWidthDraft = useCallback((
    type: HeatCalcTableColumnScope,
    key: HeatCalcColumnKey,
    widthPx: number,
  ) => {
    const widthPct = tableColumnWidthPxToPct(widthPx);
    updateTableColumnSettingsDraft((settings) => setTableColumnWidthPct(settings, type, key, widthPct));
  }, [updateTableColumnSettingsDraft]);

  const handleGlideColumnResize = useCallback((key: string, widthPx: number) => {
    updateColumnWidthDraft(activeTableColumnScope, key, widthPx);
  }, [activeTableColumnScope, updateColumnWidthDraft]);

  const handleGlideColumnResizeEnd = useCallback((key: string, widthPx: number) => {
    applyColumnWidth(activeTableColumnScope, key, tableColumnWidthPxToPct(widthPx));
  }, [activeTableColumnScope, applyColumnWidth]);

  const startColumnResize = useCallback((
    type: HeatCalcTableColumnScope,
    meta: HeatCalcResolvedColumnMeta,
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const startX = event.clientX;
    const startWidth = meta.width;
    const minWidthPx = meta.minWidthPx;
    let latestWidthPct = meta.widthPct;
    let frameId: number | null = null;
    document.body.classList.add('heatcalc-column-resizing');

    function flushDraftWidth() {
      frameId = null;
      updateTableColumnSettingsDraft((settings) => setTableColumnWidthPct(settings, type, meta.key, latestWidthPct));
    }

    function handlePointerMove(pointerEvent: PointerEvent) {
      const nextWidthPx = Math.max(minWidthPx, startWidth + pointerEvent.clientX - startX);
      latestWidthPct = tableColumnWidthPxToPct(nextWidthPx);
      if (frameId == null) {
        frameId = window.requestAnimationFrame(flushDraftWidth);
      }
    }

    function finishResize() {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', finishResize);
      window.removeEventListener('pointercancel', finishResize);
      window.removeEventListener('blur', finishResize);
      if (frameId != null) {
        window.cancelAnimationFrame(frameId);
        frameId = null;
      }
      document.body.classList.remove('heatcalc-column-resizing');
      applyColumnWidth(type, meta.key, latestWidthPct);
    }

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', finishResize);
    window.addEventListener('pointercancel', finishResize);
    window.addEventListener('blur', finishResize);
  }, [applyColumnWidth, updateTableColumnSettingsDraft]);

  return {
    handleGlideColumnResize,
    handleGlideColumnResizeEnd,
    startColumnResize,
    startSideFormMouseResize,
    startSideFormResize,
  };
}

import {
  useCallback,
  useEffect,
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
  HEATCALC_SIDE_FORM_MIN_WIDTH_PX,
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
  const minimumWidthPct = (HEATCALC_SIDE_FORM_MIN_WIDTH_PX / state.rect.width) * 100;
  return normalizeTableViewSettings({
    ...currentViewSettings,
    sideFormWidthPct: Math.max(rawWidthPct, minimumWidthPct),
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
  const glideResizeFrameRef = useRef<number | null>(null);
  const pendingGlideResizeRef = useRef<{
    type: HeatCalcTableColumnScope;
    key: HeatCalcColumnKey;
    widthPx: number;
  } | null>(null);

  useEffect(() => () => {
    if (glideResizeFrameRef.current != null) {
      window.cancelAnimationFrame(glideResizeFrameRef.current);
      glideResizeFrameRef.current = null;
    }
  }, []);

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
    let frameId: number | null = null;
    let latestWidthPct = tableViewSettingsRef.current.sideFormWidthPct;

    const finishResize = (resizeEvent?: PointerEvent | MouseEvent) => {
      window.removeEventListener(moveEventName, handlePointerMove as EventListener);
      window.removeEventListener(upEventName, handlePointerUp as EventListener);
      if (cancelEventName) window.removeEventListener(cancelEventName, handlePointerCancel as EventListener);
      if (frameId != null) {
        window.cancelAnimationFrame(frameId);
        frameId = null;
      }
      document.body.classList.remove('heatcalc-side-resizing');
      const finalWidthPct = resizeEvent
        ? sideFormWidthPctFromClientX(resizeEvent.clientX)
        : latestWidthPct ?? tableViewSettingsRef.current.sideFormWidthPct;
      sideResizeStateRef.current = null;
      const normalizedView = applySideFormWidthPct(finalWidthPct ?? tableViewSettingsRef.current.sideFormWidthPct);
      persistTableViewOnly(normalizedView);
    };

    function flushSideWidth() {
      frameId = null;
      if (latestWidthPct == null) return;
      applySideFormWidthPct(latestWidthPct);
    }

    function handlePointerMove(resizeEvent: PointerEvent | MouseEvent) {
      const nextWidthPct = sideFormWidthPctFromClientX(resizeEvent.clientX);
      if (nextWidthPct == null) return;
      latestWidthPct = nextWidthPct;
      if (frameId == null) {
        frameId = window.requestAnimationFrame(flushSideWidth);
      }
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
    pendingGlideResizeRef.current = { type: activeTableColumnScope, key, widthPx };
    if (glideResizeFrameRef.current != null) return;
    glideResizeFrameRef.current = window.requestAnimationFrame(() => {
      glideResizeFrameRef.current = null;
      const pending = pendingGlideResizeRef.current;
      pendingGlideResizeRef.current = null;
      if (!pending) return;
      updateColumnWidthDraft(pending.type, pending.key, pending.widthPx);
    });
  }, [activeTableColumnScope, updateColumnWidthDraft]);

  const handleGlideColumnResizeEnd = useCallback((key: string, widthPx: number) => {
    if (glideResizeFrameRef.current != null) {
      window.cancelAnimationFrame(glideResizeFrameRef.current);
      glideResizeFrameRef.current = null;
      pendingGlideResizeRef.current = null;
    }
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

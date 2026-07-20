import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react';
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  resolveSideFormWidthPctFromClientX,
  useHeatCalcResizeModel,
} from '@/pages/heatcalc/useHeatCalcResizeModel';
import {
  getDefaultTableColumnSettings,
  type HeatCalcResolvedColumnMeta,
} from '@/utils/heatCalcTableColumns';
import {
  getDefaultTableViewSettings,
  normalizeTableViewSettings,
} from '@/utils/heatCalcTableViewSettings';

function makeRect(overrides: Partial<DOMRect> = {}): DOMRect {
  return {
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: 1000,
    bottom: 600,
    width: 1000,
    height: 600,
    toJSON: () => ({}),
    ...overrides,
  } as DOMRect;
}

function makeMeta(overrides: Partial<HeatCalcResolvedColumnMeta> = {}): HeatCalcResolvedColumnMeta {
  const key = overrides.key ?? 'name';
  return {
    key,
    labels: { short: key, compact: key, full: key },
    label: key,
    title: key,
    group: 'main',
    width: 120,
    defaultWidthPct: 12,
    minWidthPx: 80,
    widthPct: 12,
    visible: true,
    filterable: true,
    sortable: true,
    resizable: true,
    ...overrides,
  };
}

function makeMouseDownEvent(): ReactMouseEvent<HTMLDivElement> {
  return {
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    currentTarget: document.createElement('div'),
  } as unknown as ReactMouseEvent<HTMLDivElement>;
}

function makePointerDownEvent(clientX: number): ReactPointerEvent<HTMLButtonElement> {
  return {
    clientX,
    pointerId: 1,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    currentTarget: {
      setPointerCapture: vi.fn(),
    },
  } as unknown as ReactPointerEvent<HTMLButtonElement>;
}

function setupHook(overrides: Partial<Parameters<typeof useHeatCalcResizeModel>[0]> = {}) {
  const sideWorkspace = document.createElement('div');
  vi.spyOn(sideWorkspace, 'getBoundingClientRect').mockReturnValue(makeRect());
  const tableViewSettingsRef = {
    current: normalizeTableViewSettings({
      ...getDefaultTableViewSettings(),
      formPlacement: overrides.formPlacement ?? 'left',
      sideFormWidthPct: 34,
    }),
  };
  const tableColumnSettingsRef = { current: getDefaultTableColumnSettings() };
  const applySideFormWidthPct = vi.fn((widthPct: number) => {
    const normalized = normalizeTableViewSettings({
      ...tableViewSettingsRef.current,
      sideFormWidthPct: widthPct,
    });
    tableViewSettingsRef.current = normalized;
    return normalized;
  });
  const persistTableViewOnly = vi.fn((settings) => {
    tableViewSettingsRef.current = settings;
  });
  const persistTableColumnSettings = vi.fn((settings) => {
    tableColumnSettingsRef.current = settings;
  });
  const updateTableColumnSettingsDraft = vi.fn((updater) => {
    tableColumnSettingsRef.current = updater(tableColumnSettingsRef.current);
  });
  const options = {
    activeTableColumnScope: 'pipe',
    applySideFormWidthPct,
    formPlacement: 'left',
    persistTableColumnSettings,
    persistTableViewOnly,
    sideWorkspaceRef: { current: sideWorkspace },
    tableColumnSettingsRef,
    tableViewSettingsRef,
    updateTableColumnSettingsDraft,
    ...overrides,
  } satisfies Parameters<typeof useHeatCalcResizeModel>[0];
  const rendered = renderHook((props: typeof options) => useHeatCalcResizeModel(props), {
    initialProps: options,
  });

  return {
    ...rendered,
    applySideFormWidthPct,
    persistTableColumnSettings,
    persistTableViewOnly,
    tableColumnSettingsRef,
    tableViewSettingsRef,
    updateTableColumnSettingsDraft,
  };
}

function mockRequestAnimationFrameImmediate() {
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
}

describe('useHeatCalcResizeModel', () => {
  afterEach(() => {
    document.body.classList.remove('heatcalc-side-resizing', 'heatcalc-column-resizing');
    vi.restoreAllMocks();
  });

  it('resolves side form width from pointer position for left and right placements', () => {
    const currentViewSettings = getDefaultTableViewSettings();
    const rect = makeRect();

    expect(resolveSideFormWidthPctFromClientX({
      clientX: 480,
      currentViewSettings,
      state: { placement: 'left', rect },
    })).toBe(52);
    expect(resolveSideFormWidthPctFromClientX({
      clientX: 520,
      currentViewSettings,
      state: { placement: 'right', rect },
    })).toBe(52);
    expect(resolveSideFormWidthPctFromClientX({
      clientX: 900,
      currentViewSettings,
      state: { placement: 'left', rect },
    })).toBe(62);
    expect(resolveSideFormWidthPctFromClientX({
      clientX: 200,
      currentViewSettings,
      state: { placement: 'left', rect },
    })).toBe(52);
    expect(resolveSideFormWidthPctFromClientX({
      clientX: 800,
      currentViewSettings,
      state: { placement: 'right', rect },
    })).toBe(52);
    expect(resolveSideFormWidthPctFromClientX({
      clientX: 480,
      currentViewSettings,
      state: { placement: 'left', rect: makeRect({ width: 0 }) },
    })).toBeNull();
  });

  it('applies and persists side form width after mouse resize', () => {
    mockRequestAnimationFrameImmediate();
    const { result, applySideFormWidthPct, persistTableViewOnly } = setupHook();

    act(() => {
      result.current.startSideFormMouseResize(makeMouseDownEvent());
    });
    expect(document.body).toHaveClass('heatcalc-side-resizing');

    act(() => {
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: 480, bubbles: true }));
    });
    expect(applySideFormWidthPct).toHaveBeenCalledWith(52);

    act(() => {
      window.dispatchEvent(new MouseEvent('mouseup', { clientX: 480, bubbles: true }));
    });

    expect(persistTableViewOnly).toHaveBeenCalledWith(expect.objectContaining({
      formPlacement: 'left',
      sideFormWidthPct: 52,
    }));
    expect(document.body).not.toHaveClass('heatcalc-side-resizing');
  });

  it('updates Glide column width as draft during resize and persists on resize end', () => {
    mockRequestAnimationFrameImmediate();
    const {
      result,
      persistTableColumnSettings,
      tableColumnSettingsRef,
      updateTableColumnSettingsDraft,
    } = setupHook();

    act(() => {
      result.current.handleGlideColumnResize('name', 180);
    });

    expect(updateTableColumnSettingsDraft).toHaveBeenCalledTimes(1);
    expect(tableColumnSettingsRef.current.types.pipe.columns.name.widthPct).toBe(18);

    act(() => {
      result.current.handleGlideColumnResizeEnd('name', 220);
    });

    expect(persistTableColumnSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        types: expect.objectContaining({
          pipe: expect.objectContaining({
            columns: expect.objectContaining({
              name: expect.objectContaining({ widthPct: 22 }),
            }),
          }),
        }),
      }),
      { showMessage: false },
    );
  });

  it('clamps header resize drafts to the column minimum and persists final width', () => {
    mockRequestAnimationFrameImmediate();
    const {
      result,
      persistTableColumnSettings,
      tableColumnSettingsRef,
      updateTableColumnSettingsDraft,
    } = setupHook();

    act(() => {
      result.current.startColumnResize(
        'pipe',
        makeMeta({ key: 'name', width: 120, minWidthPx: 80, widthPct: 12 }),
        makePointerDownEvent(100),
      );
    });
    expect(document.body).toHaveClass('heatcalc-column-resizing');

    act(() => {
      window.dispatchEvent(new MouseEvent('pointermove', { clientX: 10, bubbles: true }));
    });
    expect(updateTableColumnSettingsDraft).toHaveBeenCalledTimes(1);
    expect(tableColumnSettingsRef.current.types.pipe.columns.name.widthPct).toBe(8);

    act(() => {
      window.dispatchEvent(new MouseEvent('pointerup', { clientX: 10, bubbles: true }));
    });

    expect(persistTableColumnSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        types: expect.objectContaining({
          pipe: expect.objectContaining({
            columns: expect.objectContaining({
              name: expect.objectContaining({ widthPct: 8 }),
            }),
          }),
        }),
      }),
      { showMessage: false },
    );
    expect(document.body).not.toHaveClass('heatcalc-column-resizing');
  });
});

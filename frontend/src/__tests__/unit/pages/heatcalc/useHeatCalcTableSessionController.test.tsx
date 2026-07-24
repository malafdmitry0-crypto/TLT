/**
 * Characterization for Heat table session controller surface.
 * Locks: named groups (table/editing/excel/focus); editing mode starts normal;
 * commercial clamp; focusable scroll regions project-gated; excel selection clear.
 */
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const {
  focusableSpy,
  commercialFlag,
} = vi.hoisted(() => {
  const focusableSpy = vi.fn();
  const commercialFlag = { enabled: true };
  return { focusableSpy, commercialFlag };
});

vi.mock('@/hooks/useFocusableTableScrollRegions', () => ({
  useFocusableTableScrollRegions: (
    ...args: Parameters<typeof import('@/hooks/useFocusableTableScrollRegions').useFocusableTableScrollRegions>
  ) => {
    focusableSpy(...args);
  },
}));

vi.mock('@/config/featureFlags', () => ({
  areCommercialFeaturesEnabled: () => commercialFlag.enabled,
}));

import {
  useHeatCalcTableSessionController,
} from '@/pages/heatcalc/useHeatCalcTableSessionController';

const SESSION_GROUP_KEYS = ['table', 'editing', 'excel', 'focus'] as const;

const EDITING_KEYS = [
  'tableEditingMode',
  'setTableEditingMode',
  'commercialFeaturesAvailable',
  'tableFindabilityAvailable',
] as const;

const FOCUS_KEYS = [
  'sideWorkspaceRef',
  'pendingTableFocusObject',
  'setPendingTableFocusObject',
] as const;

const EXCEL_KEYS = [
  'selectedExcelCell',
  'setSelectedExcelCell',
  'excelSelectionRange',
  'setExcelSelectionRange',
  'excelContextMenu',
  'setExcelContextMenu',
  'clearExcelSelectionForProject',
] as const;

describe('useHeatCalcTableSessionController', () => {
  it('exposes named groups table/editing/excel/focus (not a flat mega-bag)', () => {
    const { result } = renderHook(() =>
      useHeatCalcTableSessionController({ projectId: 'project-1' }),
    );

    expect(Object.keys(result.current).sort()).toEqual([...SESSION_GROUP_KEYS].sort());
    expect(Object.keys(result.current.editing).sort()).toEqual([...EDITING_KEYS].sort());
    expect(Object.keys(result.current.focus).sort()).toEqual([...FOCUS_KEYS].sort());
    expect(Object.keys(result.current.excel).sort()).toEqual([...EXCEL_KEYS].sort());
    expect(result.current.table.activeObjectScope).toBe('pipe');
    expect(typeof result.current.table.selectObjectScope).toBe('function');
  });

  it('starts editing mode as normal with findability on and no pending focus', () => {
    commercialFlag.enabled = true;
    const { result } = renderHook(() =>
      useHeatCalcTableSessionController({ projectId: 'project-1' }),
    );

    expect(result.current.editing.tableEditingMode).toBe('normal');
    expect(result.current.editing.commercialFeaturesAvailable).toBe(true);
    expect(result.current.editing.tableFindabilityAvailable).toBe(true);
    expect(result.current.focus.pendingTableFocusObject).toBeNull();
    expect(result.current.excel.selectedExcelCell).toBeNull();
    expect(result.current.excel.excelSelectionRange).toBeNull();
  });

  it('clamps excel editing mode back to normal when commercial features are off', () => {
    commercialFlag.enabled = true;
    const { result, rerender } = renderHook(() =>
      useHeatCalcTableSessionController({ projectId: 'project-1' }),
    );

    act(() => {
      result.current.editing.setTableEditingMode('excel');
    });
    expect(result.current.editing.tableEditingMode).toBe('excel');

    commercialFlag.enabled = false;
    rerender();

    expect(result.current.editing.commercialFeaturesAvailable).toBe(false);
    expect(result.current.editing.tableEditingMode).toBe('normal');
  });

  it('wires focusable table scroll regions with project-gated enabled flag', () => {
    focusableSpy.mockClear();
    const { result } = renderHook(() =>
      useHeatCalcTableSessionController({ projectId: 'project-1' }),
    );

    expect(focusableSpy).toHaveBeenCalled();
    const [ref, label, enabled] = focusableSpy.mock.calls[0];
    expect(ref).toBe(result.current.focus.sideWorkspaceRef);
    expect(label).toBe('Таблица расчёта теплопотерь');
    expect(enabled).toBe(true);
  });

  it('disables focusable scroll regions when projectId is absent', () => {
    focusableSpy.mockClear();
    renderHook(() => useHeatCalcTableSessionController({ projectId: null }));

    const [, , enabled] = focusableSpy.mock.calls[0];
    expect(enabled).toBe(false);
  });

  it('clears excel selection via clearExcelSelectionForProject', () => {
    const { result } = renderHook(() =>
      useHeatCalcTableSessionController({ projectId: 'project-1' }),
    );

    act(() => {
      result.current.excel.setSelectedExcelCell({ objectId: 'row-1', columnKey: 'name' });
      result.current.excel.setExcelSelectionRange({
        anchor: { rowId: 'row-1', columnKey: 'name' },
        focus: { rowId: 'row-2', columnKey: 'pipe_length' },
      });
    });
    expect(result.current.excel.selectedExcelCell).toEqual({
      objectId: 'row-1',
      columnKey: 'name',
    });
    expect(result.current.excel.excelSelectionRange).not.toBeNull();

    act(() => {
      result.current.excel.clearExcelSelectionForProject();
    });
    expect(result.current.excel.selectedExcelCell).toBeNull();
    expect(result.current.excel.excelSelectionRange).toBeNull();
  });
});

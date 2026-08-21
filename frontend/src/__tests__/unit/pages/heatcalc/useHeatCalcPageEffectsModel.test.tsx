import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useHeatCalcPageEffectsModel } from '@/pages/heatcalc/useHeatCalcPageEffectsModel';
import type { ProjectObject } from '@/types/project';

function makeObject(overrides: Partial<ProjectObject> = {}): ProjectObject {
  return {
    id: 'pipe-1',
    project_id: 'project-1',
    object_type: 'pipe',
    sort_order: 0,
    version: 1,
    params: { name: 'Труба DN100' },
    results: null,
    is_valid: true,
    validation_errors: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeOptions(
  overrides: Partial<Parameters<typeof useHeatCalcPageEffectsModel>[0]> = {},
) {
  const visibleObject = makeObject();
  return {
    activeObjectScope: 'pipe',
    activeTableObjectType: 'pipe',
    clearExcelSelectionState: vi.fn(),
    clearLastSavedObject: vi.fn(),
    cleanHiddenColumnState: vi.fn(),
    currentTableViewActive: false,
    dirtyDraftRowCount: 0,
    isAllObjectScope: false,
    lastSavedObject: null,
    pendingTableFocusObject: null,
    pruneSelectedRows: vi.fn(),
    selectObjectScope: vi.fn(),
    setPendingTableFocusObject: vi.fn(),
    setTableEditingMode: vi.fn(),
    tableCellEditingEnabled: true,
    tableEditingMode: 'normal',
    visibleTableColumnKeys: ['name'],
    visibleTableObjects: [visibleObject],
    notifyInfo: vi.fn(),
    scrollRowIntoView: vi.fn(),
    ...overrides,
  } satisfies Parameters<typeof useHeatCalcPageEffectsModel>[0];
}

describe('useHeatCalcPageEffectsModel', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('syncs hidden column state and prunes selected rows from visible models', async () => {
    const cleanHiddenColumnState = vi.fn();
    const pruneSelectedRows = vi.fn();
    const visibleTableObjects = [makeObject({ id: 'pipe-visible' })];

    renderHook(() => useHeatCalcPageEffectsModel(makeOptions({
      cleanHiddenColumnState,
      pruneSelectedRows,
      visibleTableColumnKeys: ['name', 'pipe_length'],
      visibleTableObjects,
    })));

    await waitFor(() => {
      expect(cleanHiddenColumnState).toHaveBeenCalledWith(['name', 'pipe_length']);
      expect(pruneSelectedRows).toHaveBeenCalledWith(visibleTableObjects);
    });
  });

  it('adds and removes beforeunload guard only while draft rows are dirty', async () => {
    const addEventListenerSpy = vi.spyOn(window, 'addEventListener');
    const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');
    const { unmount } = renderHook(() => useHeatCalcPageEffectsModel(makeOptions({
      dirtyDraftRowCount: 2,
    })));

    await waitFor(() => {
      expect(addEventListenerSpy).toHaveBeenCalledWith('beforeunload', expect.any(Function));
    });
    const beforeUnloadHandler = addEventListenerSpy.mock.calls.find(([eventName]) => eventName === 'beforeunload')?.[1];

    unmount();

    expect(beforeUnloadHandler).toBeDefined();
    expect(removeEventListenerSpy).toHaveBeenCalledWith('beforeunload', beforeUnloadHandler);
  });

  it('returns Excel editing mode to normal when the object scope becomes all', async () => {
    const clearExcelSelectionState = vi.fn();
    const setTableEditingMode = vi.fn();

    renderHook(() => useHeatCalcPageEffectsModel(makeOptions({
      activeObjectScope: 'all',
      clearExcelSelectionState,
      isAllObjectScope: true,
      setTableEditingMode,
      tableEditingMode: 'excel',
    })));

    await waitFor(() => {
      expect(setTableEditingMode).toHaveBeenCalledWith('normal');
      expect(clearExcelSelectionState).toHaveBeenCalledTimes(1);
    });
  });

  it('notifies when the last saved object is hidden by the current table view', async () => {
    const clearLastSavedObject = vi.fn();
    const notifyInfo = vi.fn();

    renderHook(() => useHeatCalcPageEffectsModel(makeOptions({
      clearLastSavedObject,
      currentTableViewActive: true,
      lastSavedObject: makeObject({ id: 'pipe-hidden' }),
      notifyInfo,
      visibleTableObjects: [makeObject({ id: 'pipe-visible' })],
    })));

    await waitFor(() => {
      expect(notifyInfo).toHaveBeenCalledWith('Объект сохранён, но скрыт текущими фильтрами');
      expect(clearLastSavedObject).toHaveBeenCalledTimes(1);
    });
  });

  it('switches scope before focusing a pending object of another type', async () => {
    const scrollRowIntoView = vi.fn();
    const selectObjectScope = vi.fn();
    const setPendingTableFocusObject = vi.fn();

    renderHook(() => useHeatCalcPageEffectsModel(makeOptions({
      pendingTableFocusObject: makeObject({
        id: 'tank-pending',
        object_type: 'tank',
      }),
      scrollRowIntoView,
      selectObjectScope,
      setPendingTableFocusObject,
      visibleTableObjects: [],
    })));

    await waitFor(() => {
      expect(selectObjectScope).toHaveBeenCalledWith('tank');
    });
    expect(scrollRowIntoView).not.toHaveBeenCalled();
    expect(setPendingTableFocusObject).not.toHaveBeenCalled();
  });

  it('scrolls to and clears a pending focus object once it is visible', async () => {
    const pending = makeObject({ id: 'pipe-pending' });
    const scrollRowIntoView = vi.fn();
    const setPendingTableFocusObject = vi.fn();

    renderHook(() => useHeatCalcPageEffectsModel(makeOptions({
      pendingTableFocusObject: pending,
      scrollRowIntoView,
      setPendingTableFocusObject,
      visibleTableObjects: [pending],
    })));

    await waitFor(() => {
      expect(scrollRowIntoView).toHaveBeenCalledWith('pipe-pending');
      expect(setPendingTableFocusObject).toHaveBeenCalledWith(null);
    });
  });
});

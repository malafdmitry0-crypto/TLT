import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useHeatCalcBulkActions } from '@/pages/heatcalc/useHeatCalcBulkActions';
import type { ProjectObject } from '@/types/project';
import type { DraftRowsById } from '@/utils/heatCalcInlineEdit';
import type { ExcelLocalProjectObject } from '@/utils/heatCalcExcelRows';

function makeObject(overrides: Partial<ProjectObject> = {}): ProjectObject {
  return {
    id: 'pipe-1',
    project_id: 'project-1',
    object_type: 'pipe',
    sort_order: 0,
    params: { name: 'Труба DN100' },
    results: null,
    is_valid: true,
    validation_errors: null,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    version: 1,
    ...overrides,
  };
}

function makeDraftRowsById(rowIds: string[]): DraftRowsById {
  return Object.fromEntries(rowIds.map((id) => [id, {
    objectId: id,
    objectType: 'pipe',
    baseVersion: 1,
    baseFormValues: {},
    draftFormValues: {},
    dirtyFields: { name: `${id} draft` },
    errors: {},
    saving: false,
    sourceParams: {},
  }]));
}

function makeOptions(overrides: Partial<Parameters<typeof useHeatCalcBulkActions>[0]> = {}) {
  return {
    activeObjectScope: 'pipe',
    activeTypeTotalCount: 24,
    allFilteredSortedTableRowCount: 24,
    clearSelectedRows: vi.fn(),
    draftRowsById: {},
    excelLocalRows: [],
    excelModeEnabled: false,
    objectQueryFilteredCount: 24,
    objectQueryPageSize: 25,
    openEditWizard: vi.fn(),
    projectObjectCount: 2,
    removeNormalLoadedRows: vi.fn(),
    selectedExcelRows: [],
    selectedVisibleRows: [],
    setActiveInlineCell: vi.fn(),
    setDraftRowsById: vi.fn(),
    setExcelLocalRows: vi.fn(),
    setExcelSelectionRange: vi.fn(),
    setPendingTableFocusObject: vi.fn(),
    setSelectedExcelCell: vi.fn(),
    setTablePage: vi.fn(),
    addObject: vi.fn(async (payload) => makeObject({
      id: `copy-${payload.sort_order}`,
      object_type: payload.object_type,
      params: payload.params,
      sort_order: payload.sort_order,
    })),
    removeObject: vi.fn(),
    notifySuccess: vi.fn(),
    ...overrides,
  } satisfies Parameters<typeof useHeatCalcBulkActions>[0];
}

describe('useHeatCalcBulkActions', () => {
  it('duplicates selected rows with copy suffix and focuses the last created object', async () => {
    const first = makeObject();
    const second = makeObject({
      id: 'pipe-2',
      sort_order: 1,
      params: { name: 'Труба DN150' },
    });
    const options = makeOptions({
      selectedVisibleRows: [
        { record: first, sourceIndex: 0 },
        { record: second, sourceIndex: 1 },
      ],
    });
    const { result } = renderHook(() => useHeatCalcBulkActions(options));

    await act(async () => {
      await result.current.duplicateSelectedObjects();
    });

    expect(options.addObject).toHaveBeenNthCalledWith(1, {
      object_type: 'pipe',
      params: { name: 'Труба DN100 (копия)' },
      sort_order: 2,
    });
    expect(options.addObject).toHaveBeenNthCalledWith(2, {
      object_type: 'pipe',
      params: { name: 'Труба DN150 (копия)' },
      sort_order: 3,
    });
    expect(options.clearSelectedRows).toHaveBeenCalled();
    expect(options.setTablePage).toHaveBeenCalledWith('pipe', 2);
    expect(options.setPendingTableFocusObject).toHaveBeenCalledWith(expect.objectContaining({
      id: 'copy-3',
    }));
    expect(options.openEditWizard).toHaveBeenCalledWith(expect.objectContaining({
      params: { name: 'Труба DN150 (копия)' },
    }));
  });

  it('removes persisted rows and prunes selected local Excel rows', () => {
    const localRow = makeObject({
      id: 'new:pipe:0',
      version: 0,
      params: {},
    }) as ExcelLocalProjectObject;
    const persisted = makeObject({ id: 'pipe-1' });
    const draftRowsById = makeDraftRowsById([localRow.id, persisted.id]);
    const options = makeOptions({
      draftRowsById,
      excelLocalRows: [localRow],
      excelModeEnabled: true,
      selectedExcelRows: [
        { record: localRow, sourceIndex: 0 },
        { record: persisted, sourceIndex: 1 },
      ],
    });
    const { result } = renderHook(() => useHeatCalcBulkActions(options));

    act(() => {
      result.current.removeSelectedObjects();
    });

    expect(result.current.selectedObjectCount).toBe(0);
    expect(result.current.deleteTargetCount).toBe(2);
    expect(options.setExcelLocalRows).toHaveBeenCalledWith([]);
    expect(options.setDraftRowsById).toHaveBeenCalledWith({
      [persisted.id]: draftRowsById[persisted.id],
    });
    expect(options.removeObject).toHaveBeenCalledWith(persisted.id);
    expect(options.removeNormalLoadedRows).toHaveBeenCalledWith(new Set([persisted.id]));
    expect(options.setSelectedExcelCell).toHaveBeenCalledWith(null);
    expect(options.setExcelSelectionRange).toHaveBeenCalledWith(null);
    expect(options.setActiveInlineCell).toHaveBeenCalledWith(null);
    expect(options.clearSelectedRows).toHaveBeenCalled();
    expect(options.notifySuccess).not.toHaveBeenCalled();
  });

  it('notifies when removing only local Excel rows', () => {
    const left = makeObject({ id: 'new:pipe:0', version: 0 }) as ExcelLocalProjectObject;
    const right = makeObject({ id: 'new:pipe:1', version: 0 }) as ExcelLocalProjectObject;
    const options = makeOptions({
      draftRowsById: makeDraftRowsById([left.id, right.id]),
      excelLocalRows: [left, right],
      excelModeEnabled: true,
      selectedExcelRows: [
        { record: left, sourceIndex: 0 },
        { record: right, sourceIndex: 1 },
      ],
    });
    const { result } = renderHook(() => useHeatCalcBulkActions(options));

    act(() => {
      result.current.removeSelectedObjects();
    });

    expect(options.removeObject).not.toHaveBeenCalled();
    expect(options.removeNormalLoadedRows).not.toHaveBeenCalled();
    expect(options.setExcelLocalRows).toHaveBeenCalledWith([]);
    expect(options.setDraftRowsById).toHaveBeenCalledWith({});
    expect(options.notifySuccess).toHaveBeenCalledWith('Строки удалены');
  });
});

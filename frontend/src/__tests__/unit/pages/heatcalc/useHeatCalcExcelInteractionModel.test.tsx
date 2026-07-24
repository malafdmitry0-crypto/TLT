import { act, renderHook, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { HeatCalcContextMenuTrigger } from '@/components/heatcalc/HeatCalcContextMenuTrigger';
import {
  clampExcelContextMenuPosition,
  useHeatCalcExcelInteractionModel,
  useHeatCalcExcelInteractionState,
} from '@/pages/heatcalc/useHeatCalcExcelInteractionModel';
import type { HeatCalcExcelCellRef } from '@/hooks/useHeatCalcExcelSelection';
import type { ProjectObject } from '@/types/project';
import { createExcelSelectionRange } from '@/utils/heatCalcExcelMode';
import type {
  DraftRowsById,
  DraftRowState,
} from '@/utils/heatCalcInlineEdit';
import type { ExcelLocalProjectObject } from '@/utils/heatCalcExcelRows';
import type { HeatCalcResolvedColumnMeta } from '@/utils/heatCalcTableColumns';
import type { HeatCalcIndexedTableRow } from '@/utils/heatCalcTableFindability';

function makeObject(overrides: Partial<ProjectObject> = {}): ProjectObject {
  return {
    id: 'row-1',
    project_id: 'project-1',
    object_type: 'pipe',
    sort_order: 0,
    version: 1,
    params: { name: 'Труба DN100', pipe_length: 25 },
    results: null,
    is_valid: true,
    validation_errors: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeDraft(row: ProjectObject): DraftRowState {
  return {
    objectId: row.id,
    objectType: 'pipe',
    baseVersion: row.version,
    baseFormValues: { name: row.params.name },
    draftFormValues: { name: `${row.params.name} draft` },
    dirtyFields: { name: `${row.params.name} draft` },
    errors: {},
    saving: false,
    sourceParams: row.params,
  };
}

function column(key: string): HeatCalcResolvedColumnMeta {
  return {
    key,
    labels: { short: key, full: key, compact: key },
    label: key,
    title: key,
    group: 'test',
    width: 80,
    defaultWidthPct: 8,
    minWidthPx: 40,
    widthPct: 8,
    visible: true,
  };
}

function makeContextMenuEvent(
  clientX = 120,
  clientY = 160,
): HeatCalcContextMenuTrigger {
  return {
    clientX,
    clientY,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  };
}

type SetupOptions = {
  appendExcelLocalRows?: (count: number, insertAfterObjectId?: string | null) => ExcelLocalProjectObject[];
  excelModeEnabled?: boolean;
  initialDraftRowsById?: DraftRowsById;
  initialExcelLocalRows?: ExcelLocalProjectObject[];
  notifySuccess?: (message: string) => void;
  rows?: ProjectObject[];
  selectedExcelRows?: HeatCalcIndexedTableRow<ProjectObject>[];
};

function setupHook(options: SetupOptions = {}) {
  const rows = options.rows ?? [
    makeObject({ id: 'row-1', sort_order: 0 }),
    makeObject({ id: 'row-2', sort_order: 1, params: { name: 'Труба 2', pipe_length: 30 } }),
  ];
  const appendExcelLocalRows = options.appendExcelLocalRows ?? vi.fn(() => []);
  const notifySuccess = options.notifySuccess ?? vi.fn();
  const syncWizardWithRecord = vi.fn();

  const rendered = renderHook((props: SetupOptions) => {
    const state = useHeatCalcExcelInteractionState();
    const [draftRowsById, setDraftRowsById] = useState<DraftRowsById>(
      props.initialDraftRowsById ?? {},
    );
    const [excelLocalRows, setExcelLocalRows] = useState<ExcelLocalProjectObject[]>(
      props.initialExcelLocalRows ?? [],
    );
    const [activeInlineCell, setActiveInlineCell] = useState<HeatCalcExcelCellRef>(null);
    const activeExcelCellPosition = state.selectedExcelCell
      ? {
        rowId: state.selectedExcelCell.objectId,
        columnKey: state.selectedExcelCell.columnKey,
      }
      : null;
    const model = useHeatCalcExcelInteractionModel({
      ...state,
      activeExcelCellPosition,
      appendExcelLocalRows,
      draftRowsById,
      editableExcelColumnKeys: ['name', 'pipe_length'],
      excelCellDisplayValue: (record, columnKey) => String(record.params[columnKey] ?? ''),
      excelLocalRows,
      excelModeEnabled: props.excelModeEnabled ?? true,
      excelRowIds: rows.map((row) => row.id),
      selectedExcelRows: props.selectedExcelRows ?? [],
      selectedRowId: null,
      setActiveInlineCell,
      setDraftRowsById,
      setExcelLocalRows,
      sourceColumnMetas: [column('name'), column('pipe_length')],
      syncWizardWithRecord,
      tableCellEditingEnabled: true,
      visibleTableObjects: rows,
      notifySuccess,
      notifyError: vi.fn(),
      notifyInfo: vi.fn(),
    });
    return {
      ...model,
      activeInlineCell,
      draftRowsById,
      excelLocalRows,
    };
  }, {
    initialProps: options,
  });

  return {
    ...rendered,
    appendExcelLocalRows,
    notifySuccess,
    rows,
    syncWizardWithRecord,
  };
}

describe('useHeatCalcExcelInteractionModel', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('clamps context menu coordinates to the viewport', () => {
    expect(clampExcelContextMenuPosition(1_000, 1_000, 500, 400)).toEqual({ x: 260, y: 70 });
    expect(clampExcelContextMenuPosition(2, 3, 500, 400)).toEqual({ x: 8, y: 8 });
  });

  it('opens and closes Excel context menu with clamped coordinates', () => {
    const { result } = setupHook();
    const event = makeContextMenuEvent(1_000, 1_000);

    act(() => {
      result.current.openExcelContextMenu(event);
    });

    expect(event.preventDefault).toHaveBeenCalled();
    expect(event.stopPropagation).toHaveBeenCalled();
    expect(result.current.excelContextMenu).toEqual({
      x: Math.max(8, window.innerWidth - 240),
      y: Math.max(8, window.innerHeight - 330),
    });

    act(() => {
      result.current.closeExcelContextMenu();
    });

    expect(result.current.excelContextMenu).toBeNull();
  });

  it('closes context menu when Excel mode turns off', async () => {
    const { result, rerender } = setupHook({ excelModeEnabled: true });

    act(() => {
      result.current.openExcelContextMenu(makeContextMenuEvent());
    });
    expect(result.current.excelContextMenu).not.toBeNull();

    rerender({ excelModeEnabled: false });

    await waitFor(() => {
      expect(result.current.excelContextMenu).toBeNull();
    });
  });

  it('closes context menu on outside pointerdown but keeps it for menu pointerdown', async () => {
    const { result } = setupHook();
    const menu = document.createElement('div');
    menu.className = 'excel-context-menu';
    document.body.appendChild(menu);

    act(() => {
      result.current.openExcelContextMenu(makeContextMenuEvent());
    });
    expect(result.current.excelContextMenu).not.toBeNull();

    act(() => {
      menu.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    });
    expect(result.current.excelContextMenu).not.toBeNull();

    act(() => {
      document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    });

    await waitFor(() => {
      expect(result.current.excelContextMenu).toBeNull();
    });
  });

  it('closes context menu on Escape and window scroll', async () => {
    const { result } = setupHook();

    act(() => {
      result.current.openExcelContextMenu(makeContextMenuEvent());
    });
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    await waitFor(() => {
      expect(result.current.excelContextMenu).toBeNull();
    });

    act(() => {
      result.current.openExcelContextMenu(makeContextMenuEvent());
    });
    act(() => {
      window.dispatchEvent(new Event('scroll'));
    });
    await waitFor(() => {
      expect(result.current.excelContextMenu).toBeNull();
    });
  });

  it('adds rows below the selected Excel position using the selected row as anchor', () => {
    vi.useFakeTimers();
    const addedRow = makeObject({ id: 'new:pipe:1', version: 0 }) as ExcelLocalProjectObject;
    const appendExcelLocalRows = vi.fn(() => [addedRow]);
    const { result } = setupHook({ appendExcelLocalRows });

    act(() => {
      result.current.setExcelSelectionRange(createExcelSelectionRange(
        { rowId: 'row-2', columnKey: 'name' },
        { rowId: 'row-2', columnKey: 'name' },
      ));
    });
    act(() => {
      result.current.addExcelRowsBelowSelection(3);
    });

    expect(appendExcelLocalRows).toHaveBeenCalledWith(3, 'row-2');
    expect(vi.getTimerCount()).toBe(1);

    act(() => {
      vi.runOnlyPendingTimers();
    });
  });

  it('resets selected Excel rows and clears active inline cell', () => {
    const target = makeObject({ id: 'row-1' });
    const notifySuccess = vi.fn();
    const { result } = setupHook({
      initialDraftRowsById: { [target.id]: makeDraft(target) },
      notifySuccess,
      rows: [target],
      selectedExcelRows: [{ record: target, sourceIndex: 0 }],
    });

    act(() => {
      result.current.startInlineCellEdit(target, 'name');
    });
    expect(result.current.activeInlineCell).toEqual({ objectId: target.id, columnKey: 'name' });

    act(() => {
      result.current.resetSelectedExcelRows();
    });

    expect(result.current.activeInlineCell).toBeNull();
    expect(result.current.draftRowsById[target.id]).toBeUndefined();
    expect(notifySuccess).toHaveBeenCalledWith('Изменения строки сброшены');
  });

  it('does nothing when resetting with no selected Excel rows', () => {
    const target = makeObject({ id: 'row-1' });
    const notifySuccess = vi.fn();
    const { result } = setupHook({
      initialDraftRowsById: { [target.id]: makeDraft(target) },
      notifySuccess,
      rows: [target],
      selectedExcelRows: [],
    });

    act(() => {
      result.current.resetSelectedExcelRows();
    });

    expect(result.current.draftRowsById[target.id]).toBeDefined();
    expect(notifySuccess).not.toHaveBeenCalled();
  });
});

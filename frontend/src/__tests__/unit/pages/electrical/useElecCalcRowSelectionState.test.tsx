import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useElecCalcRowSelectionState } from '@/pages/electrical/useElecCalcRowSelectionState';
import type { ProjectObject } from '@/types/project';

function object(id: string): ProjectObject {
  return {
    id,
    project_id: 'project-1',
    object_type: 'pipe',
    sort_order: 1,
    version: 1,
    params: {},
    results: null,
    is_valid: true,
    validation_errors: null,
    created_at: '',
    updated_at: '',
  };
}

describe('useElecCalcRowSelectionState', () => {
  it('tracks active row and selected row keys', () => {
    const { result } = renderHook(() => useElecCalcRowSelectionState({
      projectId: 'project-1',
      variant: 1,
      tablePage: 1,
      tablePageSize: 50,
      objects: [object('obj-1'), object('obj-2')],
    }));

    act(() => {
      result.current.openElectricalRow(object('obj-1'));
      result.current.setSelectedRowKeys(['obj-1', 'obj-2']);
    });

    expect(result.current.activeRowId).toBe('obj-1');
    expect(result.current.selectedRowKeys).toEqual(['obj-1', 'obj-2']);
  });

  it('clears active row on pagination changes without clearing selected rows', () => {
    const { result, rerender } = renderHook(
      (props: { tablePage: number }) => useElecCalcRowSelectionState({
        projectId: 'project-1',
        variant: 1,
        tablePage: props.tablePage,
        tablePageSize: 50,
        objects: [object('obj-1'), object('obj-2')],
      }),
      { initialProps: { tablePage: 1 } },
    );

    act(() => {
      result.current.activateRowId('obj-1');
      result.current.setSelectedRowKeys(['obj-1']);
    });

    rerender({ tablePage: 2 });

    expect(result.current.activeRowId).toBeNull();
    expect(result.current.selectedRowKeys).toEqual(['obj-1']);
  });

  it('clears selected rows on project or variant changes', () => {
    const { result, rerender } = renderHook(
      (props: { projectId: string; variant: number }) => useElecCalcRowSelectionState({
        projectId: props.projectId,
        variant: props.variant,
        tablePage: 1,
        tablePageSize: 50,
        objects: [object('obj-1'), object('obj-2')],
      }),
      { initialProps: { projectId: 'project-1', variant: 1 } },
    );

    act(() => {
      result.current.activateRowId('obj-1');
      result.current.setSelectedRowKeys(['obj-1']);
    });

    rerender({ projectId: 'project-1', variant: 2 });

    expect(result.current.activeRowId).toBeNull();
    expect(result.current.selectedRowKeys).toEqual([]);
  });

  it('prunes selected rows that are no longer visible', () => {
    const { result, rerender } = renderHook(
      (props: { objects: ProjectObject[] }) => useElecCalcRowSelectionState({
        projectId: 'project-1',
        variant: 1,
        tablePage: 1,
        tablePageSize: 50,
        objects: props.objects,
      }),
      { initialProps: { objects: [object('obj-1'), object('obj-2')] } },
    );

    act(() => {
      result.current.setSelectedRowKeys(['obj-1', 'obj-2']);
    });

    rerender({ objects: [object('obj-2')] });

    expect(result.current.selectedRowKeys).toEqual(['obj-2']);
  });
});

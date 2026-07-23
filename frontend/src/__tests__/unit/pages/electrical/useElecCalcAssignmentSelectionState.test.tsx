import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const warning = vi.hoisted(() => vi.fn());

vi.mock('antd', async () => {
  const actual = await vi.importActual<typeof import('antd')>('antd');
  return {
    ...actual,
    message: {
      ...actual.message,
      warning,
    },
  };
});

import { useElecCalcAssignmentSelectionState } from '@/pages/electrical/useElecCalcAssignmentSelectionState';
import type { ElectricalQueryAssignment } from '@/types/calculation';
import type { ProjectObject } from '@/types/project';

const assignment = (
  objectId: string,
  systemType: ElectricalQueryAssignment['system_type'],
  assignmentState: ElectricalQueryAssignment['assignment_state'] = 'ready',
  version = 1,
): ElectricalQueryAssignment => ({
  object_id: objectId,
  system_type: systemType,
  assignment_state: assignmentState,
  version,
});

const obj = (id: string): ProjectObject => ({ id } as ProjectObject);

describe('useElecCalcAssignmentSelectionState', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('projects assignments and prunes selection outside scoped objects', () => {
    let selected: string[] = ['a', 'b'];
    const setSelectedRowKeys = vi.fn((next: string[] | ((prev: string[]) => string[])) => {
      selected = typeof next === 'function' ? next(selected) : next;
    });

    const { result, rerender } = renderHook(
      ({ objects, systemView }) => useElecCalcAssignmentSelectionState({
        electricalLoadedPages: [{
          assignments: [
            assignment('a', 'self_regulating'),
            assignment('b', null, 'unassigned'),
          ],
        }],
        objects,
        systemView,
        selectedRowKeys: selected,
        setSelectedRowKeys,
        batchCableType: 'self_regulating',
        getSavedCableTypeForObject: () => 'self_regulating',
      }),
      {
        initialProps: {
          objects: [obj('a'), obj('b')],
          systemView: 'self_regulating' as const,
        },
      },
    );

    expect(result.current.assignmentByObjectId.get('a')?.system_type).toBe('self_regulating');
    expect(result.current.versionByObjectId.get('a')).toBe(1);
    expect(result.current.scopedObjects.map((row) => row.id)).toEqual(['a']);

    // effect prunes b (unassigned not in self_regulating scope)
    expect(setSelectedRowKeys).toHaveBeenCalled();
    act(() => {
      // re-run with updated selected after prune simulation
      selected = ['a'];
      rerender({ objects: [obj('a'), obj('b')], systemView: 'self_regulating' });
    });
    expect(result.current.compatibleSelectedRowKeys).toEqual(['a']);
  });

  it('allows free selection on unassigned tab', () => {
    const setSelectedRowKeys = vi.fn();
    const { result } = renderHook(() => useElecCalcAssignmentSelectionState({
      electricalLoadedPages: [{
        assignments: [assignment('a', null, 'unassigned')],
      }],
      objects: [obj('a')],
      systemView: 'unassigned',
      selectedRowKeys: [],
      setSelectedRowKeys,
      batchCableType: 'self_regulating',
      getSavedCableTypeForObject: () => 'self_regulating',
    }));

    act(() => {
      result.current.handleAssignmentAwareSelectionChange(['a']);
    });
    expect(setSelectedRowKeys).toHaveBeenCalledWith(['a']);
    expect(warning).not.toHaveBeenCalled();
  });

  it('filters incompatible selection and warns on system tabs', () => {
    const setSelectedRowKeys = vi.fn();
    const { result } = renderHook(() => useElecCalcAssignmentSelectionState({
      electricalLoadedPages: [{
        assignments: [
          assignment('ok', 'self_regulating'),
          assignment('bad', 'resistive'),
        ],
      }],
      objects: [obj('ok'), obj('bad')],
      systemView: 'all',
      selectedRowKeys: [],
      setSelectedRowKeys,
      batchCableType: 'self_regulating',
      getSavedCableTypeForObject: () => 'self_regulating',
    }));

    act(() => {
      result.current.handleAssignmentAwareSelectionChange(['ok', 'bad']);
    });
    expect(setSelectedRowKeys).toHaveBeenCalledWith(['ok']);
    expect(warning).toHaveBeenCalled();
  });

  it('exposes action/calc disable reasons from assignment', () => {
    const { result } = renderHook(() => useElecCalcAssignmentSelectionState({
      electricalLoadedPages: [{
        assignments: [assignment('u', null, 'unassigned')],
      }],
      objects: [obj('u')],
      systemView: 'unassigned',
      selectedRowKeys: [],
      setSelectedRowKeys: vi.fn(),
      batchCableType: 'self_regulating',
      getSavedCableTypeForObject: () => 'self_regulating',
    }));

    expect(result.current.getObjectActionDisabledReason(obj('u'))).toContain('назначьте');
    expect(result.current.getObjectCalculationDisabledReason(obj('u'))).toContain('назначьте');
    expect(result.current.preferredObjectActionCableType(obj('u'))).toBeNull();
  });
});

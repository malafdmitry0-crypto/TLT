/**
 * Characterization for ELEC2 candidate workflow controller surface.
 * Locks return keys and that candidate state + Glide handlers are composed;
 * sub-hooks are stubbed so this stays a thin composition contract.
 */
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const {
  stableCandidateState,
  stableCellActions,
  stableCellAction,
  stableActionMenuItems,
  stableCellState,
} = vi.hoisted(() => {
  const stableCellState = vi.fn(() => ({ displayValue: '', editable: false }));
  const stableCellActions = vi.fn(() => undefined);
  const stableCellAction = vi.fn();
  const stableActionMenuItems = vi.fn(() => null);
  const stableCandidateState = {
    activeCandidateFolderKey: 'all',
    setActiveCandidateFolderKey: vi.fn(),
    candidateFolderModalMode: 'create' as const,
    candidateFolderModalOpen: false,
    candidateFolderName: '',
    setCandidateFolderName: vi.fn(),
    closeCandidateFolderModal: vi.fn(),
    updateCandidateMut: { isPending: false, mutate: vi.fn() },
    createCandidateFolderMut: { isPending: false, mutate: vi.fn() },
    updateCandidateFolderMut: { isPending: false, mutate: vi.fn() },
    deleteCandidateFolderMut: { isPending: false, mutate: vi.fn() },
    toggleCandidateFolderItemMut: { isPending: false, mutate: vi.fn() },
    applyCandidateMut: { isPending: false, mutate: vi.fn() },
    submitCandidateFolderModal: vi.fn(),
    cableSizingCandidates: [],
    cableSizingCandidateFolders: [],
    activeCustomCandidateFolder: null,
    markedCableSizingCandidateSet: new Set<string>(),
    candidateColumnValueAccessors: {},
    resetMarkedCableSizingCandidates: vi.fn(),
    cableSizingCandidateCompareActive: false,
    candidateCompareDiffColumnKeys: new Set<string>(),
  };
  return {
    stableCandidateState,
    stableCellActions,
    stableCellAction,
    stableActionMenuItems,
    stableCellState,
  };
});

vi.mock('@/pages/electrical/useElecCalcCandidateState', () => ({
  useElecCalcCandidateState: () => stableCandidateState,
}));
vi.mock('@/pages/electrical/useElecCalcCandidateGlideActions', () => ({
  useElecCalcCandidateGlideActions: () => ({
    getElectricalCandidateGlideCellActions: stableCellActions,
    handleElectricalCandidateGlideCellAction: stableCellAction,
    getElectricalCandidateGlideActionMenuItems: stableActionMenuItems,
  }),
}));
vi.mock('@/pages/electrical/useElecCalcCandidateGlideCellState', () => ({
  useElecCalcCandidateGlideCellState: () => stableCellState,
}));

import {
  useElecCalcCandidateWorkflowController,
  type UseElecCalcCandidateWorkflowControllerArgs,
} from '@/pages/electrical/useElecCalcCandidateWorkflowController';

const CANDIDATE_WORKFLOW_RETURN_KEYS = [
  'candidate',
  'electricalCandidateGlideColumns',
  'getElectricalCandidateGlideActionMenuItems',
  'getElectricalCandidateGlideCellState',
  'handleElectricalCandidateGlideCellAction',
] as const;

function baseArgs(
  overrides: Partial<UseElecCalcCandidateWorkflowControllerArgs> = {},
): UseElecCalcCandidateWorkflowControllerArgs {
  return {
    projectId: 'p-1',
    electricalVariantId: 'ev-1',
    canMutate: true,
    variant: 1,
    effectiveSource: 'builtin',
    setElectricalQueryCalculation: vi.fn(),
    cableSizingModal: {
      objectId: 'o-1',
      effectiveCableType: 'self_regulating',
      candidateParams: {},
      candidatesQueryKey: ['candidates'],
      candidateFoldersQueryKey: ['folders'],
    } as unknown as UseElecCalcCandidateWorkflowControllerArgs['cableSizingModal'],
    candidateTableViewState: {
      filters: {},
      sort: undefined,
    },
    visibleCandidateColumnMetas: [
      {
        key: 'marked',
        title: '✓',
        label: 'marked',
        width: 40,
        minWidthPx: 32,
        align: 'center',
      },
      {
        key: 'cable_mark',
        title: 'Марка',
        label: 'cable_mark',
        width: 120,
        minWidthPx: 80,
        align: 'left',
      },
      {
        key: 'actions',
        title: '',
        label: 'actions',
        width: 96,
        minWidthPx: 72,
        align: 'center',
      },
    ] as unknown as UseElecCalcCandidateWorkflowControllerArgs['visibleCandidateColumnMetas'],
    ...overrides,
  };
}

describe('useElecCalcCandidateWorkflowController', () => {
  it('exposes a stable candidate-workflow return surface', () => {
    const { result } = renderHook(() => useElecCalcCandidateWorkflowController(baseArgs()));

    expect(Object.keys(result.current).sort()).toEqual(
      [...CANDIDATE_WORKFLOW_RETURN_KEYS].sort(),
    );
    expect(result.current.candidate).toBe(stableCandidateState);
    expect(typeof result.current.getElectricalCandidateGlideCellState).toBe('function');
    expect(typeof result.current.handleElectricalCandidateGlideCellAction).toBe('function');
    expect(typeof result.current.getElectricalCandidateGlideActionMenuItems).toBe('function');
    expect(Array.isArray(result.current.electricalCandidateGlideColumns)).toBe(true);
    expect(result.current.electricalCandidateGlideColumns.map((c) => c.key)).toEqual([
      'marked',
      'cable_mark',
      'actions',
    ]);
  });

  it('keeps identity-sensitive handlers stable when args identity is stable', () => {
    const args = baseArgs();
    const { result, rerender } = renderHook(
      (props: UseElecCalcCandidateWorkflowControllerArgs) => (
        useElecCalcCandidateWorkflowController(props)
      ),
      { initialProps: args },
    );

    const first = {
      cellState: result.current.getElectricalCandidateGlideCellState,
      cellAction: result.current.handleElectricalCandidateGlideCellAction,
      menuItems: result.current.getElectricalCandidateGlideActionMenuItems,
      candidate: result.current.candidate,
      columns: result.current.electricalCandidateGlideColumns,
    };

    rerender(args);

    expect(result.current.getElectricalCandidateGlideCellState).toBe(first.cellState);
    expect(result.current.handleElectricalCandidateGlideCellAction).toBe(first.cellAction);
    expect(result.current.getElectricalCandidateGlideActionMenuItems).toBe(first.menuItems);
    expect(result.current.candidate).toBe(first.candidate);
    expect(result.current.electricalCandidateGlideColumns).toBe(first.columns);
  });

  it('rebuilds candidate glide columns when visible metas change', () => {
    const args = baseArgs();
    const { result, rerender } = renderHook(
      (props: UseElecCalcCandidateWorkflowControllerArgs) => (
        useElecCalcCandidateWorkflowController(props)
      ),
      { initialProps: args },
    );

    const firstColumns = result.current.electricalCandidateGlideColumns;
    expect(firstColumns).toHaveLength(3);

    rerender({
      ...args,
      visibleCandidateColumnMetas: args.visibleCandidateColumnMetas.slice(0, 1),
    });

    expect(result.current.electricalCandidateGlideColumns).not.toBe(firstColumns);
    expect(result.current.electricalCandidateGlideColumns.map((c) => c.key)).toEqual(['marked']);
  });
});

import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useElecCalcPageScopeEffects } from '@/pages/electrical/useElecCalcPageScopeEffects';
import type { ElectricalBatchScope } from '@/pages/electrical/elecCalcPageModel';
import type { HeatCalcTableViewState } from '@/utils/heatCalcTableFindability';

type HookProps = {
  projectId?: string;
  variant: number;
  effectiveSource: 'builtin' | 'extended' | 'all';
  tablePageSize: number;
  tableViewState: HeatCalcTableViewState;
  navigationActiveJobId: string | null;
};

function setup(initialProps: HookProps) {
  const resetTablePage = vi.fn();
  const resetPaginationCache = vi.fn();
  const setActiveJobId = vi.fn();
  const setActiveBatchScope = vi.fn<(scope: ElectricalBatchScope | null) => void>();

  return {
    resetTablePage,
    resetPaginationCache,
    setActiveJobId,
    setActiveBatchScope,
    ...renderHook((props: HookProps) => useElecCalcPageScopeEffects({
      ...props,
      resetTablePage,
      resetPaginationCache,
      setActiveJobId,
      setActiveBatchScope,
    }), {
      initialProps,
    }),
  };
}

describe('useElecCalcPageScopeEffects', () => {
  it('resets table page and pagination cache on initial scope', () => {
    const { resetTablePage, resetPaginationCache, setActiveJobId } = setup({
      projectId: 'project-1',
      variant: 1,
      effectiveSource: 'builtin',
      tablePageSize: 50,
      tableViewState: { filters: {} },
      navigationActiveJobId: null,
    });

    expect(resetTablePage).toHaveBeenCalledTimes(1);
    expect(resetPaginationCache).toHaveBeenCalledTimes(1);
    expect(setActiveJobId).not.toHaveBeenCalled();
  });

  it('hydrates active job id from navigation state without clearing it on first scope pass', () => {
    const { setActiveJobId, setActiveBatchScope } = setup({
      projectId: 'project-1',
      variant: 1,
      effectiveSource: 'builtin',
      tablePageSize: 50,
      tableViewState: { filters: {} },
      navigationActiveJobId: 'job-1',
    });

    expect(setActiveJobId).toHaveBeenCalledTimes(1);
    expect(setActiveJobId).toHaveBeenCalledWith('job-1');
    expect(setActiveBatchScope).not.toHaveBeenCalled();
  });

  it('keeps active job while moving from empty initial project to loaded project', () => {
    const {
      rerender,
      resetTablePage,
      resetPaginationCache,
      setActiveJobId,
      setActiveBatchScope,
    } = setup({
      projectId: undefined,
      variant: 1,
      effectiveSource: 'builtin',
      tablePageSize: 50,
      tableViewState: { filters: {} },
      navigationActiveJobId: null,
    });

    rerender({
      projectId: 'project-1',
      variant: 1,
      effectiveSource: 'builtin',
      tablePageSize: 50,
      tableViewState: { filters: {} },
      navigationActiveJobId: null,
    });

    expect(resetTablePage).toHaveBeenCalledTimes(2);
    expect(resetPaginationCache).toHaveBeenCalledTimes(2);
    expect(setActiveJobId).not.toHaveBeenCalled();
    expect(setActiveBatchScope).not.toHaveBeenCalled();
  });

  it('clears active job and batch scope when project or variant changes after scope is established', () => {
    const { rerender, setActiveJobId, setActiveBatchScope } = setup({
      projectId: 'project-1',
      variant: 1,
      effectiveSource: 'builtin',
      tablePageSize: 50,
      tableViewState: { filters: {} },
      navigationActiveJobId: null,
    });

    rerender({
      projectId: 'project-1',
      variant: 2,
      effectiveSource: 'builtin',
      tablePageSize: 50,
      tableViewState: { filters: {} },
      navigationActiveJobId: null,
    });
    rerender({
      projectId: 'project-2',
      variant: 2,
      effectiveSource: 'builtin',
      tablePageSize: 50,
      tableViewState: { filters: {} },
      navigationActiveJobId: null,
    });

    expect(setActiveJobId).toHaveBeenCalledTimes(2);
    expect(setActiveJobId).toHaveBeenNthCalledWith(1, null);
    expect(setActiveJobId).toHaveBeenNthCalledWith(2, null);
    expect(setActiveBatchScope).toHaveBeenCalledTimes(2);
    expect(setActiveBatchScope).toHaveBeenNthCalledWith(1, null);
    expect(setActiveBatchScope).toHaveBeenNthCalledWith(2, null);
  });

  it('resets only pagination cache when source, page size or table view state changes', () => {
    const { rerender, resetTablePage, resetPaginationCache } = setup({
      projectId: 'project-1',
      variant: 1,
      effectiveSource: 'builtin',
      tablePageSize: 50,
      tableViewState: { filters: {} },
      navigationActiveJobId: null,
    });

    rerender({
      projectId: 'project-1',
      variant: 1,
      effectiveSource: 'extended',
      tablePageSize: 50,
      tableViewState: { filters: {} },
      navigationActiveJobId: null,
    });
    rerender({
      projectId: 'project-1',
      variant: 1,
      effectiveSource: 'extended',
      tablePageSize: 100,
      tableViewState: { filters: {} },
      navigationActiveJobId: null,
    });
    rerender({
      projectId: 'project-1',
      variant: 1,
      effectiveSource: 'extended',
      tablePageSize: 100,
      tableViewState: { filters: { object_name: { kind: 'text', value: 'Насос' } } },
      navigationActiveJobId: null,
    });

    expect(resetTablePage).toHaveBeenCalledTimes(1);
    expect(resetPaginationCache).toHaveBeenCalledTimes(4);
  });
});

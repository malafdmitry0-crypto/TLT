import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useElecCalcPageScopeEffects } from '@/pages/electrical/useElecCalcPageScopeEffects';
import type { HeatCalcTableViewState } from '@/utils/heatCalcTableFindability';

type HookProps = {
  projectId?: string;
  variant: number;
  effectiveSource: 'builtin' | 'extended' | 'all';
  tablePageSize: number;
  tableViewState: HeatCalcTableViewState;
};

function setup(initialProps: HookProps) {
  const resetTablePage = vi.fn();
  const resetPaginationCache = vi.fn();

  return {
    resetTablePage,
    resetPaginationCache,
    ...renderHook((props: HookProps) => useElecCalcPageScopeEffects({
      ...props,
      resetTablePage,
      resetPaginationCache,
    }), {
      initialProps,
    }),
  };
}

describe('useElecCalcPageScopeEffects', () => {
  it('resets table page and pagination cache on initial scope', () => {
    const { resetTablePage, resetPaginationCache } = setup({
      projectId: 'project-1',
      variant: 1,
      effectiveSource: 'builtin',
      tablePageSize: 50,
      tableViewState: { filters: {} },
    });

    expect(resetTablePage).toHaveBeenCalledTimes(1);
    expect(resetPaginationCache).toHaveBeenCalledTimes(1);
  });

  it('resets table state while moving from empty initial project to loaded project', () => {
    const {
      rerender,
      resetTablePage,
      resetPaginationCache,
    } = setup({
      projectId: undefined,
      variant: 1,
      effectiveSource: 'builtin',
      tablePageSize: 50,
      tableViewState: { filters: {} },
    });

    rerender({
      projectId: 'project-1',
      variant: 1,
      effectiveSource: 'builtin',
      tablePageSize: 50,
      tableViewState: { filters: {} },
    });

    expect(resetTablePage).toHaveBeenCalledTimes(2);
    expect(resetPaginationCache).toHaveBeenCalledTimes(2);
  });

  it('resets only pagination cache when source, page size or table view state changes', () => {
    const { rerender, resetTablePage, resetPaginationCache } = setup({
      projectId: 'project-1',
      variant: 1,
      effectiveSource: 'builtin',
      tablePageSize: 50,
      tableViewState: { filters: {} },
    });

    rerender({
      projectId: 'project-1',
      variant: 1,
      effectiveSource: 'extended',
      tablePageSize: 50,
      tableViewState: { filters: {} },
    });
    rerender({
      projectId: 'project-1',
      variant: 1,
      effectiveSource: 'extended',
      tablePageSize: 100,
      tableViewState: { filters: {} },
    });
    rerender({
      projectId: 'project-1',
      variant: 1,
      effectiveSource: 'extended',
      tablePageSize: 100,
      tableViewState: { filters: { object_name: { kind: 'text', value: 'Насос' } } },
    });

    expect(resetTablePage).toHaveBeenCalledTimes(1);
    expect(resetPaginationCache).toHaveBeenCalledTimes(4);
  });
});

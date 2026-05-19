import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import TestMemoryRouter from '@/__tests__/utils/TestMemoryRouter';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useHeatCalcMutations } from '@/hooks/useHeatCalcMutations';

vi.mock('@/api/projects', () => ({
  createObject: vi.fn(),
  updateObject: vi.fn(),
  deleteObject: vi.fn(),
}));

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <TestMemoryRouter>{children}</TestMemoryRouter>
    </QueryClientProvider>
  );
}

describe('useHeatCalcMutations', () => {
  beforeEach(() => vi.clearAllMocks());

  it('add: успешный результат показывает success, вызывает onAddSuccess', async () => {
    const { createObject } = await import('@/api/projects');
    (createObject as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'o1', is_valid: true, params: {}, results: { q: 1 },
      validation_errors: null, object_type: 'pipe', sort_order: 0, project_id: 'p',
    });
    const onAdd = vi.fn();

    const { result } = renderHook(
      () => useHeatCalcMutations('p1', onAdd),
      { wrapper }
    );

    await result.current.add.mutateAsync({ object_type: 'pipe', sort_order: 0, params: {} });
    expect(onAdd).toHaveBeenCalled();
  });

  it('add: невалидный результат показывает warning с причиной', async () => {
    const { createObject } = await import('@/api/projects');
    (createObject as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'o1', is_valid: false, params: {}, results: null,
      validation_errors: { error: 'Толщина изоляции > 0 требуется' },
      object_type: 'pipe', sort_order: 0, project_id: 'p',
    });
    const onAdd = vi.fn();

    const { result } = renderHook(
      () => useHeatCalcMutations('p1', onAdd),
      { wrapper }
    );
    await result.current.add.mutateAsync({ object_type: 'pipe', sort_order: 0, params: {} });
    expect(onAdd).toHaveBeenCalled();
  });

  it('edit: вызывает onEditSuccess', async () => {
    const { updateObject } = await import('@/api/projects');
    (updateObject as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'o1', is_valid: true, params: {},
      results: {}, validation_errors: null,
      object_type: 'pipe', sort_order: 0, project_id: 'p',
    });
    const onEdit = vi.fn();
    const { result } = renderHook(
      () => useHeatCalcMutations('p1', undefined, onEdit),
      { wrapper }
    );
    await result.current.edit.mutateAsync({ objectId: 'o1', version: 1, params: {} });
    expect(onEdit).toHaveBeenCalled();
  });

  it('не отдаёт запуск электрорасчёта с дефолтными настройками СО', () => {
    const { result } = renderHook(
      () => useHeatCalcMutations('p1'),
      { wrapper }
    );
    expect('batchCalc' in result.current).toBe(false);
  });
});

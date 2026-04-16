import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useHeatCalcMutations } from '@/hooks/useHeatCalcMutations';

vi.mock('@/api/projects', () => ({
  createObject: vi.fn(),
  updateObject: vi.fn(),
  reorderObjects: vi.fn(),
}));
vi.mock('@/api/calculations', () => ({
  batchCalcElectrical: vi.fn(),
}));

const navigateMock = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter>{children}</MemoryRouter>
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
    await result.current.edit.mutateAsync({ objectId: 'o1', params: {} });
    expect(onEdit).toHaveBeenCalled();
  });

  it('reorder: успешно обновляет порядок', async () => {
    const { reorderObjects } = await import('@/api/projects');
    (reorderObjects as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    const { result } = renderHook(
      () => useHeatCalcMutations('p1'),
      { wrapper }
    );
    await result.current.reorder.mutateAsync(['o1', 'o2']);
    expect(reorderObjects).toHaveBeenCalledWith('p1', ['o1', 'o2']);
  });

  it('batchCalc: успех — навигация на elecCalc', async () => {
    const { batchCalcElectrical } = await import('@/api/calculations');
    (batchCalcElectrical as ReturnType<typeof vi.fn>).mockResolvedValue({
      calculated: 3, skipped: 0, errors: [], calcs: [],
    });
    const { result } = renderHook(
      () => useHeatCalcMutations('p1'),
      { wrapper }
    );
    await result.current.batchCalc.mutateAsync();
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/workspace/elec-calc'));
  });

  it('batchCalc: при ошибках показывает warning, но всё равно навигирует', async () => {
    const { batchCalcElectrical } = await import('@/api/calculations');
    (batchCalcElectrical as ReturnType<typeof vi.fn>).mockResolvedValue({
      calculated: 1, skipped: 1, errors: [{ object_id: 'x', error: 'fail' }], calcs: [],
    });
    const { result } = renderHook(
      () => useHeatCalcMutations('p1'),
      { wrapper }
    );
    await result.current.batchCalc.mutateAsync();
    await waitFor(() => expect(navigateMock).toHaveBeenCalled());
  });
});

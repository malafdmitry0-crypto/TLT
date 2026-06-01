import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { message } from 'antd';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  addElectricalCandidateToFolder,
  applyElectricalCandidate,
  createElectricalCandidate,
  createElectricalCandidateFolder,
  deleteElectricalCandidateFolder,
  removeElectricalCandidateFromFolder,
  updateElectricalCandidate,
  updateElectricalCandidateFolder,
} from '@/api/calculations';
import { useElecCalcCandidateMutationFlow } from '@/pages/electrical/useElecCalcCandidateMutationFlow';
import type {
  ElectricalCalcSummary,
  ElectricalCandidate,
  ElectricalCandidateFolder,
} from '@/types/calculation';

vi.mock('antd', () => ({
  message: {
    success: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@/api/calculations', () => ({
  addElectricalCandidateToFolder: vi.fn(),
  applyElectricalCandidate: vi.fn(),
  createElectricalCandidate: vi.fn(),
  createElectricalCandidateFolder: vi.fn(),
  deleteElectricalCandidateFolder: vi.fn(),
  removeElectricalCandidateFromFolder: vi.fn(),
  updateElectricalCandidate: vi.fn(),
  updateElectricalCandidateFolder: vi.fn(),
}));

const candidatesQueryKey = [
  'project',
  'project-1',
  'electrical-candidates',
  'object-1',
  2,
] as const;
const candidateFoldersQueryKey = [
  'project',
  'project-1',
  'electrical-candidate-folders',
  'object-1',
  2,
] as const;

function candidate(overrides: Partial<ElectricalCandidate> = {}): ElectricalCandidate {
  return {
    id: 'candidate-1',
    project_id: 'project-1',
    object_id: 'object-1',
    variant_number: 2,
    cable_type: 'self_regulating',
    cable_source: 'builtin',
    cable_mark: 'ТЛТ-25',
    dedupe_key: 'candidate-key',
    mode: 'auto',
    status: 'applicable',
    priority: 0,
    is_recommended: false,
    is_pinned: false,
    is_applied: false,
    params: {},
    results: {},
    warnings: [],
    risk_flags: [],
    candidate_meta: {},
    created_at: '2026-06-01T00:00:00Z',
    updated_at: '2026-06-01T00:00:00Z',
    ...overrides,
  };
}

function folder(overrides: Partial<ElectricalCandidateFolder> = {}): ElectricalCandidateFolder {
  return {
    id: 'folder-1',
    project_id: 'project-1',
    object_id: 'object-1',
    variant_number: 2,
    name: 'Избранное',
    color: null,
    sort_order: 0,
    candidate_ids: [],
    created_at: '2026-06-01T00:00:00Z',
    updated_at: '2026-06-01T00:00:00Z',
    ...overrides,
  };
}

function calculation(overrides: Partial<ElectricalCalcSummary> = {}): ElectricalCalcSummary {
  return {
    id: 'calc-1',
    project_id: 'project-1',
    object_id: 'object-1',
    cable_type: 'self_regulating',
    cable_mark: 'ТЛТ-25',
    variant_number: 2,
    params: {},
    results: {},
    ...overrides,
  };
}

function createWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

function setup(
  overrides: Partial<Parameters<typeof useElecCalcCandidateMutationFlow>[0]> = {},
) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  const setActiveCandidateFolderKey = vi.fn();
  const closeCandidateFolderModal = vi.fn();
  const setElectricalQueryCalculation = vi.fn();
  const options = {
    projectId: 'project-1',
    variant: 2 as const,
    effectiveSource: 'all' as const,
    cableSizingModalObjectId: 'object-1',
    cableSizingEffectiveCableType: 'self_regulating_tt' as const,
    cableSizingCandidateParams: {
      supply_voltage: 220,
      selection_policy: 'technical_minimum',
      laying_step: 0.1,
    },
    cableSizingCandidatesQueryKey: candidatesQueryKey,
    cableSizingCandidateFoldersQueryKey: candidateFoldersQueryKey,
    candidateFolderName: '  Новый набор  ',
    candidateFolderModalMode: 'create' as const,
    editingCandidateFolder: null,
    activeCandidateFolderKey: 'all' as const,
    setActiveCandidateFolderKey,
    closeCandidateFolderModal,
    setElectricalQueryCalculation,
    ...overrides,
  };
  return {
    queryClient,
    setActiveCandidateFolderKey,
    closeCandidateFolderModal,
    setElectricalQueryCalculation,
    ...renderHook(() => useElecCalcCandidateMutationFlow(options), {
      wrapper: createWrapper(queryClient),
    }),
  };
}

describe('useElecCalcCandidateMutationFlow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createElectricalCandidate).mockResolvedValue({
      candidate: candidate({ id: 'candidate-new' }),
      action: 'created',
    });
    vi.mocked(updateElectricalCandidate).mockImplementation(async (candidateId, patch) =>
      candidate({ id: candidateId, ...patch }));
    vi.mocked(applyElectricalCandidate).mockResolvedValue({
      candidate: candidate({ id: 'candidate-2', is_applied: true }),
      calculation: calculation({ id: 'calc-applied', cable_mark: 'ТЛТ-30' }),
    });
    vi.mocked(createElectricalCandidateFolder).mockResolvedValue(folder());
    vi.mocked(updateElectricalCandidateFolder).mockImplementation(async (_folderId, patch) =>
      folder({ name: patch.name ?? 'Избранное' }));
    vi.mocked(deleteElectricalCandidateFolder).mockResolvedValue(undefined);
    vi.mocked(addElectricalCandidateToFolder).mockResolvedValue(folder({
      candidate_ids: ['candidate-1'],
    }));
    vi.mocked(removeElectricalCandidateFromFolder).mockResolvedValue(folder());
  });

  it('creates a manual candidate with unchanged candidate payload', async () => {
    const { result } = setup();

    await act(async () => {
      await result.current.createCandidateMut.mutateAsync({
        mode: 'manual',
        mark: '30ТТВ2',
      });
    });

    expect(createElectricalCandidate).toHaveBeenCalledWith({
      project_id: 'project-1',
      object_id: 'object-1',
      variant_number: 2,
      cable_type: 'self_regulating_tt',
      cable_source: 'all',
      mode: 'manual',
      cable_mark: '30ТТВ2',
      electrical_params: {
        supply_voltage: 220,
        selection_policy: 'technical_minimum',
        laying_step: 0.1,
      },
    });
    expect(message.success).toHaveBeenCalledWith('Вариант добавлен');
  });

  it('applies candidate with optimistic cache update and calculation callback', async () => {
    const { result, queryClient, setElectricalQueryCalculation } = setup();
    queryClient.setQueryData<ElectricalCandidate[]>(candidatesQueryKey, [
      candidate({ id: 'candidate-1', is_applied: true }),
      candidate({ id: 'candidate-2', is_applied: false, cable_mark: 'ТЛТ-30' }),
    ]);

    await act(async () => {
      await result.current.applyCandidateMut.mutateAsync('candidate-2');
    });

    expect(applyElectricalCandidate).toHaveBeenCalledWith('candidate-2');
    expect(queryClient.getQueryData<ElectricalCandidate[]>(candidatesQueryKey))
      .toEqual([
        expect.objectContaining({ id: 'candidate-1', is_applied: false }),
        expect.objectContaining({ id: 'candidate-2', is_applied: true }),
      ]);
    expect(setElectricalQueryCalculation).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'calc-applied', cable_mark: 'ТЛТ-30' }),
    );
    expect(message.success).toHaveBeenCalledWith('Кандидат применён в электрорасчёт');
  });

  it('rolls back candidate apply cache when backend apply fails', async () => {
    vi.mocked(applyElectricalCandidate).mockRejectedValueOnce(new Error('apply failed'));
    const { result, queryClient } = setup();
    const previous = [
      candidate({ id: 'candidate-1', is_applied: true }),
      candidate({ id: 'candidate-2', is_applied: false }),
    ];
    queryClient.setQueryData<ElectricalCandidate[]>(candidatesQueryKey, previous);

    await act(async () => {
      await expect(result.current.applyCandidateMut.mutateAsync('candidate-2'))
        .rejects.toThrow('apply failed');
    });

    expect(queryClient.getQueryData<ElectricalCandidate[]>(candidatesQueryKey)).toEqual(previous);
    expect(message.error).toHaveBeenCalledWith('apply failed');
  });

  it('creates, renames and deletes custom candidate folders without touching candidates', async () => {
    const {
      result,
      rerender,
      setActiveCandidateFolderKey,
      closeCandidateFolderModal,
    } = setup();

    await act(async () => {
      await result.current.createCandidateFolderMut.mutateAsync();
    });

    expect(createElectricalCandidateFolder).toHaveBeenCalledWith({
      project_id: 'project-1',
      object_id: 'object-1',
      variant_number: 2,
      name: 'Новый набор',
    });
    expect(setActiveCandidateFolderKey).toHaveBeenCalledWith('custom:folder-1');
    expect(closeCandidateFolderModal).toHaveBeenCalledTimes(1);

    rerender();
    await act(async () => {
      await result.current.updateCandidateFolderMut.mutateAsync({
        folderId: 'folder-1',
        name: 'Переименовано',
      });
    });

    expect(updateElectricalCandidateFolder).toHaveBeenCalledWith('folder-1', {
      name: 'Переименовано',
    });

    const activeSetup = setup({ activeCandidateFolderKey: 'custom:folder-1' });
    await act(async () => {
      await activeSetup.result.current.deleteCandidateFolderMut.mutateAsync('folder-1');
    });

    expect(vi.mocked(deleteElectricalCandidateFolder).mock.calls[0]?.[0]).toBe('folder-1');
    expect(activeSetup.setActiveCandidateFolderKey).toHaveBeenCalledWith('all');
    expect(message.success).toHaveBeenCalledWith('Папка удалена');
  });

  it('submits folder modal and toggles folder membership through folder endpoints', async () => {
    const { result } = setup({
      candidateFolderModalMode: 'rename',
      editingCandidateFolder: folder(),
      candidateFolderName: '  Новое имя  ',
    });

    await act(async () => {
      result.current.submitCandidateFolderModal();
    });

    await waitFor(() => {
      expect(updateElectricalCandidateFolder).toHaveBeenCalledWith('folder-1', {
        name: 'Новое имя',
      });
    });

    await act(async () => {
      await result.current.toggleCandidateFolderItemMut.mutateAsync({
        folderId: 'folder-1',
        candidateId: 'candidate-1',
        checked: true,
      });
      await result.current.toggleCandidateFolderItemMut.mutateAsync({
        folderId: 'folder-1',
        candidateId: 'candidate-1',
        checked: false,
      });
    });

    expect(addElectricalCandidateToFolder).toHaveBeenCalledWith('folder-1', 'candidate-1');
    expect(removeElectricalCandidateFromFolder).toHaveBeenCalledWith('folder-1', 'candidate-1');
  });
});

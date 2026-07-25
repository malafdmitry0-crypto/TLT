/* eslint-disable @typescript-eslint/no-unused-vars -- scenario split keeps shared preamble */
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
import { electricalDataQueryKeys } from '@/api/electricalQueryKeys';
import { electricalAssignmentQueryKeys } from '@/api/electricalVariants';
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
  const options: Parameters<typeof useElecCalcCandidateMutationFlow>[0] = {
    projectId: 'project-1',
    electricalVariantId: '22222222-2222-4222-8222-222222222222',
    canMutate: true,
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

describe('useElecCalcCandidateMutationFlow — read-only gates', () => {
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

  it('rejects direct candidate and folder mutations when the project is read-only', async () => {
    const { result } = setup({ canMutate: false });
    const denied = 'Недостаточно прав для изменения вариантов подбора';

    await act(async () => {
      await expect(result.current.createCandidateMut.mutateAsync({ mode: 'auto' }))
        .rejects.toThrow(denied);
      await expect(result.current.updateCandidateMut.mutateAsync({
        candidateId: 'candidate-1',
        patch: { is_pinned: true },
      })).rejects.toThrow(denied);
      await expect(result.current.applyCandidateMut.mutateAsync('candidate-1'))
        .rejects.toThrow(denied);
      await expect(result.current.createCandidateFolderMut.mutateAsync())
        .rejects.toThrow(denied);
      await expect(result.current.updateCandidateFolderMut.mutateAsync({
        folderId: 'folder-1',
        name: 'Новое имя',
      })).rejects.toThrow(denied);
      await expect(result.current.deleteCandidateFolderMut.mutateAsync('folder-1'))
        .rejects.toThrow(denied);
      await expect(result.current.toggleCandidateFolderItemMut.mutateAsync({
        folderId: 'folder-1',
        candidateId: 'candidate-1',
        checked: true,
      })).rejects.toThrow(denied);
    });

    act(() => result.current.submitCandidateFolderModal());

    expect(createElectricalCandidate).not.toHaveBeenCalled();
    expect(updateElectricalCandidate).not.toHaveBeenCalled();
    expect(applyElectricalCandidate).not.toHaveBeenCalled();
    expect(createElectricalCandidateFolder).not.toHaveBeenCalled();
    expect(updateElectricalCandidateFolder).not.toHaveBeenCalled();
    expect(deleteElectricalCandidateFolder).not.toHaveBeenCalled();
    expect(addElectricalCandidateToFolder).not.toHaveBeenCalled();
    expect(removeElectricalCandidateFromFolder).not.toHaveBeenCalled();
    expect(message.warning).toHaveBeenCalledWith(expect.stringContaining(denied));
  });

});

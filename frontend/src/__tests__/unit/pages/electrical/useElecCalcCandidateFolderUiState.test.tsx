import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useElecCalcCandidateFolderUiState } from '@/pages/electrical/useElecCalcCandidateFolderUiState';
import type { ElectricalCandidateFolder } from '@/types/calculation';

const folder: ElectricalCandidateFolder = {
  id: 'folder-1',
  project_id: 'project-1',
  object_id: 'object-1',
  variant_number: 1,
  name: 'Проектные',
  candidate_ids: ['candidate-1'],
  sort_order: 0,
  created_at: '',
  updated_at: '',
};

describe('useElecCalcCandidateFolderUiState', () => {
  it('opens create and rename modal states and resets on close', () => {
    const { result } = renderHook(() => useElecCalcCandidateFolderUiState());

    expect(result.current.activeCandidateFolderKey).toBe('all');
    expect(result.current.candidateFolderModalOpen).toBe(false);
    expect(result.current.candidateFolderModalMode).toBe('create');
    expect(result.current.candidateFolderName).toBe('');
    expect(result.current.editingCandidateFolder).toBeNull();

    act(() => {
      result.current.openCreateCandidateFolderModal();
    });

    expect(result.current.candidateFolderModalOpen).toBe(true);
    expect(result.current.candidateFolderModalMode).toBe('create');
    expect(result.current.candidateFolderName).toBe('');
    expect(result.current.editingCandidateFolder).toBeNull();

    act(() => {
      result.current.openRenameCandidateFolderModal(folder);
    });

    expect(result.current.candidateFolderModalOpen).toBe(true);
    expect(result.current.candidateFolderModalMode).toBe('rename');
    expect(result.current.candidateFolderName).toBe(folder.name);
    expect(result.current.editingCandidateFolder).toEqual(folder);

    act(() => {
      result.current.closeCandidateFolderModal();
    });

    expect(result.current.candidateFolderModalOpen).toBe(false);
    expect(result.current.candidateFolderName).toBe('');
    expect(result.current.editingCandidateFolder).toBeNull();
  });

  it('tracks active folder key', () => {
    const { result } = renderHook(() => useElecCalcCandidateFolderUiState());

    act(() => {
      result.current.setActiveCandidateFolderKey('favorite');
    });

    expect(result.current.activeCandidateFolderKey).toBe('favorite');
  });
});

import { act, renderHook } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import type { CandidateFolderKey } from '@/pages/electrical/elecCalcCandidateFolderModel';
import { useElecCalcCandidateFolderViewModel } from '@/pages/electrical/useElecCalcCandidateFolderViewModel';
import type { ElectricalCandidate, ElectricalCandidateFolder } from '@/types/calculation';

function candidate(id: string, pinned = false): ElectricalCandidate {
  return {
    id,
    project_id: 'project-1',
    object_id: 'object-1',
    variant_number: 1,
    cable_type: 'self_regulating',
    cable_source: 'builtin',
    cable_mark: `ТЛТ-${id}`,
    dedupe_key: id,
    mode: 'auto',
    status: 'applicable',
    priority: 0,
    is_recommended: false,
    is_pinned: pinned,
    is_applied: false,
    params: {},
    results: {},
    warnings: [],
    risk_flags: [],
    candidate_meta: {},
    created_at: '',
    updated_at: '',
  };
}

function folder(id: string, candidateIds: string[]): ElectricalCandidateFolder {
  return {
    id,
    project_id: 'project-1',
    object_id: 'object-1',
    variant_number: 1,
    name: `Папка ${id}`,
    sort_order: 0,
    candidate_ids: candidateIds,
    created_at: '',
    updated_at: '',
  };
}

function renderCandidateFolderViewModel(options: {
  initialKey?: CandidateFolderKey;
  candidates?: ElectricalCandidate[];
  candidateFolders?: ElectricalCandidateFolder[];
  onActiveFolderChange?: () => void;
} = {}) {
  return renderHook((props: Required<typeof options>) => {
    const [activeCandidateFolderKey, setActiveCandidateFolderKey] =
      useState<CandidateFolderKey>(props.initialKey);
    const model = useElecCalcCandidateFolderViewModel({
      activeCandidateFolderKey,
      setActiveCandidateFolderKey,
      candidates: props.candidates,
      candidateFolders: props.candidateFolders,
      onActiveFolderChange: props.onActiveFolderChange,
    });
    return { activeCandidateFolderKey, setActiveCandidateFolderKey, ...model };
  }, {
    initialProps: {
      initialKey: 'all',
      candidates: [candidate('1'), candidate('2', true)],
      candidateFolders: [folder('folder-1', ['1'])],
      onActiveFolderChange: vi.fn(),
      ...options,
    },
  });
}

describe('useElecCalcCandidateFolderViewModel', () => {
  it('builds counts and filters candidates by active folder', () => {
    const { result } = renderCandidateFolderViewModel();

    expect(result.current.candidateFolderCounts.all).toBe(2);
    expect(result.current.candidateFolderCounts.favorite).toBe(1);
    expect(result.current.candidateFolderCounts.custom.get('folder-1')).toBe(1);

    act(() => {
      result.current.setActiveCandidateFolderKey('favorite');
    });
    expect(result.current.candidatesByActiveFolder.map((item) => item.id)).toEqual(['2']);

    act(() => {
      result.current.setActiveCandidateFolderKey('custom:folder-1');
    });
    expect(result.current.activeCustomCandidateFolder?.id).toBe('folder-1');
    expect(result.current.candidatesByActiveFolder.map((item) => item.id)).toEqual(['1']);
  });

  it('resets missing custom folder and notifies when active folder changes', () => {
    const onActiveFolderChange = vi.fn();
    const { result } = renderCandidateFolderViewModel({
      initialKey: 'custom:missing',
      onActiveFolderChange,
    });

    expect(result.current.activeCandidateFolderKey).toBe('all');
    expect(onActiveFolderChange).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.setActiveCandidateFolderKey('favorite');
    });

    expect(result.current.activeCandidateFolderKey).toBe('favorite');
    expect(onActiveFolderChange).toHaveBeenCalledTimes(2);
  });
});

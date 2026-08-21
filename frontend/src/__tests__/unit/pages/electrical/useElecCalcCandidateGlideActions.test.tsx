import { renderHook } from '@testing-library/react';
import type { MenuProps } from 'antd';
import { describe, expect, it, vi } from 'vitest';

import type {
  ElectricalCandidate,
  ElectricalCandidateFolder,
} from '@/types/calculation';
import { useElecCalcCandidateGlideActions } from '@/pages/electrical/useElecCalcCandidateGlideActions';

function candidate(overrides: Partial<ElectricalCandidate> = {}): ElectricalCandidate {
  return {
    id: 'candidate-1',
    project_id: 'project-1',
    object_id: 'object-1',
    variant_number: 1,
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
    reason_code: null,
    reason_message: null,
    engineer_comment: null,
    params: {},
    results: {},
    cable_snapshot: null,
    warnings: [],
    risk_flags: [],
    candidate_meta: {},
    created_at: '2026-06-01T00:00:00.000Z',
    updated_at: '2026-06-01T00:00:00.000Z',
    ...overrides,
  };
}

function folder(overrides: Partial<ElectricalCandidateFolder> = {}): ElectricalCandidateFolder {
  return {
    id: 'folder-1',
    project_id: 'project-1',
    object_id: 'object-1',
    variant_number: 1,
    name: 'Рабочие',
    sort_order: 0,
    candidate_ids: ['candidate-1'],
    created_at: '2026-06-01T00:00:00.000Z',
    updated_at: '2026-06-01T00:00:00.000Z',
    ...overrides,
  };
}

function setup(
  options: Partial<Parameters<typeof useElecCalcCandidateGlideActions>[0]> = {},
) {
  const onApplyCandidate = vi.fn();
  const onUpdateCandidate = vi.fn();
  const onToggleCandidateFolderItem = vi.fn();

  return {
    onApplyCandidate,
    onUpdateCandidate,
    onToggleCandidateFolderItem,
    ...renderHook(() => useElecCalcCandidateGlideActions({
      candidateFolders: [folder()],
      canMutate: true,
      applyCandidatePending: false,
      updateCandidatePending: false,
      toggleCandidateFolderItemPending: false,
      onApplyCandidate,
      onUpdateCandidate,
      onToggleCandidateFolderItem,
      ...options,
    })),
  };
}

function menuItem(items: MenuProps['items'] | null | undefined, key: string) {
  const item = items?.find((entry) => entry && 'key' in entry && entry.key === key);
  if (!item || !('label' in item)) throw new Error(`Menu item ${key} not found`);
  return item;
}

describe('useElecCalcCandidateGlideActions', () => {
  it('builds the actions column state from candidate status and pending flags', () => {
    const { result } = setup({
      applyCandidatePending: true,
      updateCandidatePending: true,
      toggleCandidateFolderItemPending: true,
    });

    expect(result.current.getElectricalCandidateGlideCellActions(candidate(), 'cable_mark')).toBeUndefined();
    expect(result.current.getElectricalCandidateGlideCellActions(candidate(), 'actions')).toEqual([
      { key: 'apply', label: 'Выбрать', disabled: true },
      { key: 'folder', label: 'Папка', disabled: true },
      { key: 'exclude', label: 'Искл.', disabled: true },
    ]);
    expect(result.current.getElectricalCandidateGlideCellActions(candidate({
      status: 'excluded',
      is_applied: true,
    }), 'actions')).toEqual([
      { key: 'apply', label: 'Выбран', disabled: true },
      { key: 'folder', label: 'Папка', disabled: true },
      { key: 'exclude', label: 'Вернуть', disabled: true },
    ]);
  });

  it('routes apply and exclude action clicks to existing page callbacks', () => {
    const { result, onApplyCandidate, onUpdateCandidate } = setup();
    const row = candidate();

    result.current.handleElectricalCandidateGlideCellAction(row, 'actions', 'apply');
    expect(onApplyCandidate).toHaveBeenCalledWith('candidate-1');

    result.current.handleElectricalCandidateGlideCellAction(row, 'actions', 'exclude');
    expect(onUpdateCandidate).toHaveBeenCalledWith({
      candidateId: 'candidate-1',
      patch: { status: 'excluded' },
    });

    result.current.handleElectricalCandidateGlideCellAction(candidate({
      status: 'excluded',
    }), 'actions', 'exclude');
    expect(onUpdateCandidate).toHaveBeenLastCalledWith({
      candidateId: 'candidate-1',
      patch: { status: 'applicable' },
    });
  });

  it('does not apply candidates that are already applied or not applicable', () => {
    const { result, onApplyCandidate } = setup();

    result.current.handleElectricalCandidateGlideCellAction(candidate({
      is_applied: true,
    }), 'actions', 'apply');
    result.current.handleElectricalCandidateGlideCellAction(candidate({
      status: 'excluded',
    }), 'actions', 'apply');
    result.current.handleElectricalCandidateGlideCellAction(candidate(), 'cable_mark', 'apply');

    expect(onApplyCandidate).not.toHaveBeenCalled();
  });

  it('builds folder menu items and keeps favorite/folder payloads unchanged', () => {
    const { result, onUpdateCandidate, onToggleCandidateFolderItem } = setup();

    const items = result.current.getElectricalCandidateGlideActionMenuItems(
      candidate({ is_pinned: true }),
      'actions',
      'folder',
    );

    expect(menuItem(items, 'favorite')).toMatchObject({
      label: '✓ Избранное',
      disabled: false,
    });
    expect(menuItem(items, 'folder-1')).toMatchObject({
      label: '✓ Рабочие',
    });

    const favorite = menuItem(items, 'favorite');
    if ('onClick' in favorite) favorite.onClick?.({} as Parameters<NonNullable<typeof favorite.onClick>>[0]);
    expect(onUpdateCandidate).toHaveBeenCalledWith({
      candidateId: 'candidate-1',
      patch: { is_pinned: false },
    });

    const folderItem = menuItem(items, 'folder-1');
    if ('onClick' in folderItem) folderItem.onClick?.({} as Parameters<NonNullable<typeof folderItem.onClick>>[0]);
    expect(onToggleCandidateFolderItem).toHaveBeenCalledWith({
      folderId: 'folder-1',
      candidateId: 'candidate-1',
      checked: false,
    });
  });

  it('returns an empty-folder placeholder and no menu outside the folder action', () => {
    const { result } = setup({
      candidateFolders: [],
    });

    expect(result.current.getElectricalCandidateGlideActionMenuItems(candidate(), 'cable_mark', 'folder'))
      .toBeNull();
    expect(result.current.getElectricalCandidateGlideActionMenuItems(candidate(), 'actions', 'apply'))
      .toBeNull();

    const items = result.current.getElectricalCandidateGlideActionMenuItems(candidate(), 'actions', 'folder');
    expect(menuItem(items, 'empty')).toMatchObject({
      label: 'Создайте папку',
      disabled: true,
    });
  });

  it('disables and guards every candidate write in read-only mode', () => {
    const {
      result,
      onApplyCandidate,
      onUpdateCandidate,
      onToggleCandidateFolderItem,
    } = setup({ canMutate: false });
    const row = candidate();

    expect(result.current.getElectricalCandidateGlideCellActions(row, 'actions')).toEqual([
      { key: 'apply', label: 'Выбрать', disabled: true },
      { key: 'folder', label: 'Папка', disabled: true },
      { key: 'exclude', label: 'Искл.', disabled: true },
    ]);

    result.current.handleElectricalCandidateGlideCellAction(row, 'actions', 'apply');
    result.current.handleElectricalCandidateGlideCellAction(row, 'actions', 'exclude');

    const items = result.current.getElectricalCandidateGlideActionMenuItems(
      row,
      'actions',
      'folder',
    );
    const favorite = menuItem(items, 'favorite');
    const customFolder = menuItem(items, 'folder-1');
    expect(favorite).toMatchObject({ disabled: true });
    expect(customFolder).toMatchObject({ disabled: true });
    if ('onClick' in favorite) favorite.onClick?.({} as Parameters<NonNullable<typeof favorite.onClick>>[0]);
    if ('onClick' in customFolder) customFolder.onClick?.({} as Parameters<NonNullable<typeof customFolder.onClick>>[0]);

    expect(onApplyCandidate).not.toHaveBeenCalled();
    expect(onUpdateCandidate).not.toHaveBeenCalled();
    expect(onToggleCandidateFolderItem).not.toHaveBeenCalled();
  });
});

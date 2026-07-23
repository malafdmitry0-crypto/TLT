import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const warning = vi.hoisted(() => vi.fn());

vi.mock('antd', async () => {
  const actual = await vi.importActual<typeof import('antd')>('antd');
  return {
    ...actual,
    message: {
      ...actual.message,
      warning,
    },
  };
});

import { useElecCalcObjectActionModals } from '@/pages/electrical/useElecCalcObjectActionModals';
import type { ProjectObject } from '@/types/project';

const obj = (id: string): ProjectObject => ({ id } as ProjectObject);

describe('useElecCalcObjectActionModals', () => {
  const openCableMarkModalState = vi.fn();
  const changeCableMarkModalCableType = vi.fn();
  const activateRowId = vi.fn();
  const openCableSizingModalState = vi.fn();
  const setCableSizingCableType = vi.fn();
  const resetConnectionTypeOnPreferredChange = vi.fn();
  const resetMarkedCableSizingCandidates = vi.fn();
  const setActiveCandidateFolderKey = vi.fn();
  const resetCableSizingModalState = vi.fn();
  const closeCandidateFolderModal = vi.fn();
  const setCandidateColumnSettingsOpen = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  function render(options?: {
    disabledReason?: string | null;
    preferred?: 'self_regulating' | 'single_core' | null;
    current?: 'self_regulating' | 'single_core' | null;
  }) {
    return renderHook(() => useElecCalcObjectActionModals({
      getObjectActionDisabledReason: () => options?.disabledReason ?? null,
      preferredObjectActionCableType: () => options?.preferred ?? null,
      objectActionCableType: () => options?.current ?? null,
      openCableMarkModalState,
      changeCableMarkModalCableType,
      activateRowId,
      openCableSizingModalState,
      setCableSizingCableType,
      resetConnectionTypeOnPreferredChange,
      resetMarkedCableSizingCandidates,
      setActiveCandidateFolderKey,
      resetCableSizingModalState,
      closeCandidateFolderModal,
      setCandidateColumnSettingsOpen,
    }));
  }

  it('blocks mark modal when assignment disabled', () => {
    const { result } = render({ disabledReason: 'назначьте' });
    act(() => {
      result.current.openCableMarkModal(obj('a'));
    });
    expect(warning).toHaveBeenCalledWith('назначьте');
    expect(openCableMarkModalState).not.toHaveBeenCalled();
  });

  it('opens mark modal and switches preferred type', () => {
    const { result } = render({
      preferred: 'single_core',
      current: 'self_regulating',
    });
    act(() => {
      result.current.openCableMarkModal(obj('a'));
    });
    expect(openCableMarkModalState).toHaveBeenCalledWith(obj('a'));
    expect(changeCableMarkModalCableType).toHaveBeenCalledWith('single_core');
  });

  it('opens sizing modal with preferred type and resets candidates', () => {
    const { result } = render({
      preferred: 'single_core',
      current: 'self_regulating',
    });
    act(() => {
      result.current.openCableSizingModal(obj('a'));
    });
    expect(activateRowId).toHaveBeenCalledWith('a');
    expect(openCableSizingModalState).toHaveBeenCalled();
    expect(setCableSizingCableType).toHaveBeenCalledWith('single_core');
    expect(resetConnectionTypeOnPreferredChange).toHaveBeenCalled();
    expect(resetMarkedCableSizingCandidates).toHaveBeenCalled();
    expect(setActiveCandidateFolderKey).toHaveBeenCalledWith('all');
  });

  it('closes sizing modal and related UI state', () => {
    const { result } = render();
    act(() => {
      result.current.closeCableSizingModal();
    });
    expect(resetCableSizingModalState).toHaveBeenCalled();
    expect(resetMarkedCableSizingCandidates).toHaveBeenCalled();
    expect(setActiveCandidateFolderKey).toHaveBeenCalledWith('all');
    expect(closeCandidateFolderModal).toHaveBeenCalled();
    expect(setCandidateColumnSettingsOpen).toHaveBeenCalledWith(false);
  });
});

import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { ElectricalQueryResponse } from '@/types/calculation';
import type { ProjectObjectsPageCursor } from '@/types/project';
import type { CableTypeKey } from '@/pages/electrical/elecCalcMainTableModel';
import { useElecCalcDataLifecycleEffects } from '@/pages/electrical/useElecCalcDataLifecycleEffects';

type HookProps = {
  electricalGlideEnabled: boolean;
  electricalPage?: ElectricalQueryResponse;
  isElectricalPageFetching: boolean;
  isElectricalPagePlaceholderData: boolean;
  cableSizingModalObjectId: string | null;
  normalizeAvailableCableType: (type: CableTypeKey) => CableTypeKey;
  nextElectricalPageCursor?: ProjectObjectsPageCursor | null;
};

const electricalPage = { summary: { total_objects: 1 } } as ElectricalQueryResponse;
const nextCursor = { sort_order: 10, id: 'object-10' } as ProjectObjectsPageCursor;

function setup(initialProps: HookProps) {
  const rememberElectricalPage = vi.fn();
  const rememberNextCursor = vi.fn();
  const resetCandidateTableViewState = vi.fn();
  const setCableSizingCableType = vi.fn();

  return {
    rememberElectricalPage,
    rememberNextCursor,
    resetCandidateTableViewState,
    setCableSizingCableType,
    ...renderHook((props: HookProps) => useElecCalcDataLifecycleEffects({
      ...props,
      rememberElectricalPage,
      rememberNextCursor,
      resetCandidateTableViewState,
      setCableSizingCableType,
    }), {
      initialProps,
    }),
  };
}

describe('useElecCalcDataLifecycleEffects', () => {
  it('forwards electrical page and next cursor lifecycle flags', () => {
    const { rememberElectricalPage, rememberNextCursor } = setup({
      electricalGlideEnabled: true,
      electricalPage,
      isElectricalPageFetching: false,
      isElectricalPagePlaceholderData: false,
      cableSizingModalObjectId: null,
      normalizeAvailableCableType: (type) => type,
      nextElectricalPageCursor: nextCursor,
    });

    expect(rememberElectricalPage).toHaveBeenCalledWith({
      electricalGlideEnabled: true,
      electricalPage,
      isFetching: false,
      isPlaceholderData: false,
    });
    expect(rememberNextCursor).toHaveBeenCalledWith({
      nextCursor,
      isFetching: false,
      isPlaceholderData: false,
    });
  });

  it('resets candidate table view when the sizing object changes', () => {
    const { rerender, resetCandidateTableViewState } = setup({
      electricalGlideEnabled: false,
      isElectricalPageFetching: false,
      isElectricalPagePlaceholderData: false,
      cableSizingModalObjectId: null,
      normalizeAvailableCableType: (type) => type,
      nextElectricalPageCursor: null,
    });

    rerender({
      electricalGlideEnabled: false,
      isElectricalPageFetching: false,
      isElectricalPagePlaceholderData: false,
      cableSizingModalObjectId: 'object-1',
      normalizeAvailableCableType: (type) => type,
      nextElectricalPageCursor: null,
    });

    expect(resetCandidateTableViewState).toHaveBeenCalledTimes(2);
  });

  it('normalizes current cable sizing type through state updater', () => {
    const normalizeAvailableCableType = vi.fn(() => 'self_regulating' as CableTypeKey);
    const { setCableSizingCableType } = setup({
      electricalGlideEnabled: false,
      isElectricalPageFetching: false,
      isElectricalPagePlaceholderData: false,
      cableSizingModalObjectId: null,
      normalizeAvailableCableType,
      nextElectricalPageCursor: null,
    });

    expect(setCableSizingCableType).toHaveBeenCalledTimes(1);
    const updater = setCableSizingCableType.mock.calls[0][0] as (
      current: CableTypeKey,
    ) => CableTypeKey;
    expect(updater('single_core')).toBe('self_regulating');
    expect(normalizeAvailableCableType).toHaveBeenCalledWith('single_core');
  });
});

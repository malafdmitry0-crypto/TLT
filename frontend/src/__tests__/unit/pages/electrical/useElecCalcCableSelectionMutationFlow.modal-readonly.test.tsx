import type { ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

import { selectElectricalAssignmentCable } from '@/api/electricalVariants';
import { useElecCalcCableSelectionMutationFlow } from '@/pages/electrical/useElecCalcCableSelectionMutationFlow';

vi.mock('@/feedback/appFeedback', () => ({
  appMessage: { success: vi.fn(), warning: vi.fn(), error: vi.fn() },
}));
vi.mock('@/api/electricalVariants', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/api/electricalVariants')>(),
  selectElectricalAssignmentCable: vi.fn(),
}));

describe('useElecCalcCableSelectionMutationFlow — read only', () => {
  it('rejects direct writes before any API request', async () => {
    const queryClient = new QueryClient();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useElecCalcCableSelectionMutationFlow({
      projectId: 'project-1',
      electricalVariantId: 'er-1',
      electricalVariantName: 'ЭР1',
      canMutate: false,
      effectiveSource: 'builtin',
      setElectricalQueryCalculation: vi.fn(),
      assignmentByObjectId: new Map([['object-1', {
        object_id: 'object-1', system_type: 'self_regulating', assignment_state: 'ready', version: 1,
      }]]),
      cableMarkModalObjectId: 'object-1',
      cableMarkModalCableType: 'self_regulating_tt',
      cableMarkModalValue: null,
      cableMarkModalThreadCountValue: 'auto',
      cableMarkModalOptionByValue: new Map(),
      closeCableMarkModal: vi.fn(),
    }), { wrapper });

    await act(async () => {
      await expect(result.current.autoCableMut.mutateAsync({
        objectId: 'object-1', cableType: 'self_regulating_tt',
      })).rejects.toThrow('Недостаточно прав');
    });
    expect(selectElectricalAssignmentCable).not.toHaveBeenCalled();
  });
});

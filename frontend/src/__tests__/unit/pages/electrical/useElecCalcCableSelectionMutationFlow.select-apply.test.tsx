import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { selectElectricalAssignmentCable } from '@/api/electricalVariants';
import {
  AUTO_CABLE_MARK_VALUE,
  cableMarkOptionValue,
} from '@/pages/electrical/elecCalcCableOptionModel';
import { useElecCalcCableSelectionMutationFlow } from '@/pages/electrical/useElecCalcCableSelectionMutationFlow';
import type { ElectricalCalcSummary } from '@/types/calculation';
import type { ElectricalAssignment } from '@/types/electricalVariant';
import type { ProjectObject } from '@/types/project';

vi.mock('@/feedback/appFeedback', () => ({
  appMessage: { success: vi.fn(), warning: vi.fn(), error: vi.fn() },
}));
vi.mock('@/api/electricalVariants', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/api/electricalVariants')>(),
  selectElectricalAssignmentCable: vi.fn(),
}));

const ER_ID = '22222222-2222-4222-8222-222222222222';
const object: ProjectObject = {
  id: 'object-1', project_id: 'project-1', object_type: 'pipe', sort_order: 1, version: 1,
  params: { name: 'Труба-1' }, results: {}, is_valid: true, validation_errors: null,
  created_at: '', updated_at: '',
};
const calculation: ElectricalCalcSummary = {
  id: 'calc-1', project_id: 'project-1', object_id: object.id,
  cable_type: 'self_regulating_tt', cable_mark: '30ТТВ2-СР', variant_number: 2,
  params: {}, results: {},
};
const assignment: ElectricalAssignment = {
  id: 'assignment-1', project_id: 'project-1', electrical_variant_id: ER_ID,
  object_id: object.id, system_type: 'self_regulating', assignment_state: 'ready',
  requested_cable_type: 'self_regulating_tt', electrical_overrides: {},
  object_version_snapshot: 1, version: 8, diagnostics: {}, object,
  created_at: '', updated_at: '',
};

function setup(value = cableMarkOptionValue('extended', '30ТТВ2-СР')) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const closeCableMarkModal = vi.fn();
  const setElectricalQueryCalculation = vi.fn();
  const options = new Map([[value, {
    value,
    label: '30ТТВ2-СР',
    searchLabel: '30ТТВ2-СР',
    mark: '30ТТВ2-СР',
    optionSource: 'extended' as const,
    cableSource: 'extended' as const,
  }]]);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return {
    closeCableMarkModal,
    setElectricalQueryCalculation,
    ...renderHook(() => useElecCalcCableSelectionMutationFlow({
      projectId: 'project-1',
      electricalVariantId: ER_ID,
      electricalVariantName: 'Летний ЭР',
      canMutate: true,
      effectiveSource: 'all',
      setElectricalQueryCalculation,
      assignmentByObjectId: new Map([[object.id, {
        object_id: object.id,
        system_type: 'self_regulating',
        assignment_state: 'ready',
        version: 7,
      }]]),
      cableMarkModalObjectId: object.id,
      cableMarkModalCableType: 'self_regulating_tt',
      cableMarkModalValue: value,
      cableMarkModalThreadCountValue: value === AUTO_CABLE_MARK_VALUE ? 'auto' : '2',
      cableMarkModalOptionByValue: options,
      closeCableMarkModal,
    }), { wrapper }),
  };
}

describe('useElecCalcCableSelectionMutationFlow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(selectElectricalAssignmentCable).mockResolvedValue({ assignment, calculation });
  });

  it('sends one atomic manual command for only the current ER', async () => {
    const { result, closeCableMarkModal, setElectricalQueryCalculation } = setup();
    act(() => result.current.applyCableMarkModal());
    await waitFor(() => expect(closeCableMarkModal).toHaveBeenCalledOnce());
    expect(selectElectricalAssignmentCable).toHaveBeenCalledOnce();
    expect(selectElectricalAssignmentCable).toHaveBeenCalledWith(
      'project-1', ER_ID, object.id,
      {
        expected_assignment_version: 7,
        mode: 'manual',
        cable_mark: '30ТТВ2-СР',
        cable_source: 'extended',
        thread_count: 2,
      },
    );
    expect(setElectricalQueryCalculation).toHaveBeenCalledWith(calculation);
  });

  it('Auto clears both manual mark and manual thread count in the same command', async () => {
    const { result } = setup(AUTO_CABLE_MARK_VALUE);
    act(() => result.current.applyCableMarkModal());
    await waitFor(() => expect(selectElectricalAssignmentCable).toHaveBeenCalledOnce());
    expect(selectElectricalAssignmentCable).toHaveBeenCalledWith(
      'project-1', ER_ID, object.id,
      expect.objectContaining({
        expected_assignment_version: 7,
        mode: 'auto',
        cable_mark: null,
        thread_count: null,
      }),
    );
  });

  it('uses the returned assignment version for the next command', async () => {
    const { result } = setup();
    await act(async () => {
      await result.current.manualCableMut.mutateAsync({
        objectId: object.id,
        mark: '30ТТВ2-СР',
        cableType: 'self_regulating_tt',
        cableSource: 'extended',
        threadCount: 2,
      });
      await result.current.manualCableMut.mutateAsync({
        objectId: object.id,
        mark: '30ТТВ2-СР',
        cableType: 'self_regulating_tt',
        cableSource: 'extended',
        threadCount: 2,
      });
    });
    expect(vi.mocked(selectElectricalAssignmentCable).mock.calls[1]?.[3])
      .toMatchObject({ expected_assignment_version: 8 });
  });
});

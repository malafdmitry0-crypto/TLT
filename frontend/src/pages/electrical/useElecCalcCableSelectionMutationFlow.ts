import { useCallback, useEffect, useRef } from 'react';
import { appMessage as message } from '@/feedback/appFeedback';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { CableSource } from '@/api/calculations';
import { electricalDataQueryKeys } from '@/api/electricalQueryKeys';
import {
  electricalAssignmentQueryKeys,
  selectElectricalAssignmentCable,
} from '@/api/electricalVariants';
import type {
  ElectricalCalcSummary,
  ElectricalQueryAssignment,
  ElectricalQueryResponse,
} from '@/types/calculation';
import {
  AUTO_CABLE_MARK_VALUE,
  type CableMarkSelectOption,
} from '@/pages/electrical/elecCalcCableOptionModel';
import type { CableTypeKey } from '@/domain/electrical/elecCalcMainTableModel';
import { updateElectricalQueryPageAssignment } from '@/pages/electrical/elecCalcAssignmentOverrideModel';
import {
  electricalAssignmentOverrideErrorMessage,
  isAssignmentVersionConflict,
} from '@/pages/electrical/useElecCalcAssignmentOverridePersistence';

type ManualCableMutationArgs = {
  objectId: string;
  mark: string;
  cableType: CableTypeKey;
  cableSource?: CableSource;
  threadCount: 1 | 2 | 3;
};

type AutoCableMutationArgs = {
  objectId: string;
  cableType: CableTypeKey;
};

type ElectricalLayoutMutationArgs = {
  objectId: string;
  cableMark: string | null;
  cableSource: CableSource;
  cableType: CableTypeKey;
  windingPitchMm: number | null;
  numberOfThreads: number | null;
};

type UseElecCalcCableSelectionMutationFlowOptions = {
  projectId?: string;
  electricalVariantId: string;
  electricalVariantName: string;
  canMutate: boolean;
  effectiveSource: CableSource;
  setElectricalQueryCalculation: (calculation: ElectricalCalcSummary) => void;
  assignmentByObjectId: ReadonlyMap<string, ElectricalQueryAssignment>;
  cableMarkModalObjectId: string | null;
  cableMarkModalCableType: CableTypeKey | null;
  cableMarkModalValue: string | null;
  cableMarkModalThreadCountValue: 'auto' | '1' | '2' | '3';
  cableMarkModalOptionByValue: Map<string, CableMarkSelectOption>;
  closeCableMarkModal: () => void;
};

const CABLE_SELECTION_READ_ONLY_ERROR =
  'Недостаточно прав для изменения электрорасчёта в этом проекте';
const ASSIGNMENT_CONTEXT_REQUIRED =
  'Назначение объекта в текущем ЭР не загружено. Обновите страницу.';

function requireCableMutation(canMutate: boolean) {
  if (!canMutate) throw new Error(CABLE_SELECTION_READ_ONLY_ERROR);
}

function requireTtCableType(cableType: CableTypeKey) {
  if (cableType !== 'self_regulating_tt') {
    throw new Error('Выбор марки доступен только для саморегулирующегося TT-кабеля');
  }
}

export function useElecCalcCableSelectionMutationFlow({
  projectId,
  electricalVariantId,
  electricalVariantName,
  canMutate,
  effectiveSource,
  setElectricalQueryCalculation,
  assignmentByObjectId,
  cableMarkModalObjectId,
  cableMarkModalCableType,
  cableMarkModalValue,
  cableMarkModalThreadCountValue,
  cableMarkModalOptionByValue,
  closeCableMarkModal,
}: UseElecCalcCableSelectionMutationFlowOptions) {
  const qc = useQueryClient();
  const versionByObjectIdRef = useRef(new Map(
    [...assignmentByObjectId].map(([objectId, assignment]) => [objectId, assignment.version]),
  ));

  useEffect(() => {
    assignmentByObjectId.forEach((assignment, objectId) => {
      versionByObjectIdRef.current.set(objectId, assignment.version);
    });
  }, [assignmentByObjectId]);

  const invalidateCurrentElectricalSidecars = useCallback((objectId: string) => {
    if (projectId) {
      qc.invalidateQueries({
        queryKey: electricalDataQueryKeys.variant(projectId, electricalVariantId),
      });
      qc.invalidateQueries({
        queryKey: electricalAssignmentQueryKeys.root(projectId, electricalVariantId),
      });
    }
    qc.invalidateQueries({ queryKey: ['project', projectId, 'objects', 'summary'] });
    qc.invalidateQueries({
      queryKey: electricalDataQueryKeys.candidates(projectId ?? '', electricalVariantId, objectId),
    });
  }, [electricalVariantId, projectId, qc]);

  const applyResponse = useCallback((response: Awaited<ReturnType<
    typeof selectElectricalAssignmentCable
  >>) => {
    versionByObjectIdRef.current.set(response.assignment.object_id, response.assignment.version);
    setElectricalQueryCalculation(response.calculation);
    if (projectId) {
      qc.setQueriesData<ElectricalQueryResponse>(
        { queryKey: electricalDataQueryKeys.queries(projectId, electricalVariantId) },
        (current) => current
          ? updateElectricalQueryPageAssignment(current, response.assignment)
          : current,
      );
    }
    invalidateCurrentElectricalSidecars(response.assignment.object_id);
  }, [electricalVariantId, invalidateCurrentElectricalSidecars, projectId, qc, setElectricalQueryCalculation]);

  const runSelection = useCallback(async ({
    objectId,
    cableType,
    cableSource,
    cableMark,
    threadCount,
    windingPitchMm,
  }: {
    objectId: string;
    cableType: CableTypeKey;
    cableSource: CableSource;
    cableMark: string | null;
    threadCount?: number | null;
    windingPitchMm?: number | null;
  }) => {
    requireCableMutation(canMutate);
    requireTtCableType(cableType);
    if (!projectId) throw new Error(ASSIGNMENT_CONTEXT_REQUIRED);
    const assignment = assignmentByObjectId.get(objectId);
    const expectedVersion = versionByObjectIdRef.current.get(objectId) ?? assignment?.version;
    if (!assignment || assignment.system_type !== 'self_regulating' || expectedVersion == null) {
      throw new Error(ASSIGNMENT_CONTEXT_REQUIRED);
    }
    return selectElectricalAssignmentCable(
      projectId,
      electricalVariantId,
      objectId,
      {
        expected_assignment_version: expectedVersion,
        mode: cableMark == null ? 'auto' : 'manual',
        cable_mark: cableMark,
        cable_source: cableSource,
        ...(threadCount !== undefined ? { thread_count: threadCount } : {}),
        ...(windingPitchMm !== undefined ? { winding_pitch_mm: windingPitchMm } : {}),
      },
    );
  }, [assignmentByObjectId, canMutate, electricalVariantId, projectId]);

  const handleError = useCallback(async (error: unknown) => {
    if (isAssignmentVersionConflict(error) && projectId) {
      await Promise.all([
        qc.invalidateQueries({
          queryKey: electricalDataQueryKeys.queries(projectId, electricalVariantId),
        }),
        qc.invalidateQueries({
          queryKey: electricalAssignmentQueryKeys.root(projectId, electricalVariantId),
        }),
      ]);
    }
    message.error(electricalAssignmentOverrideErrorMessage(error));
  }, [electricalVariantId, projectId, qc]);

  const manualCableMut = useMutation({
    mutationFn: ({ objectId, mark, cableType, cableSource, threadCount }: ManualCableMutationArgs) =>
      runSelection({
        objectId,
        cableType,
        cableSource: cableSource ?? effectiveSource,
        cableMark: mark.trim(),
        threadCount,
      }),
    onSuccess: (response) => {
      applyResponse(response);
      message.success(`Кабель выбран для текущего ЭР «${electricalVariantName}»`);
    },
    onError: handleError,
  });

  const autoCableMut = useMutation({
    mutationFn: ({ objectId, cableType }: AutoCableMutationArgs) =>
      runSelection({
        objectId,
        cableType,
        cableSource: effectiveSource,
        cableMark: null,
        threadCount: null,
      }),
    onSuccess: (response) => {
      applyResponse(response);
      message.success(`Автоподбор выполнен для текущего ЭР «${electricalVariantName}»`);
    },
    onError: handleError,
  });

  const electricalLayoutMut = useMutation({
    mutationFn: ({
      objectId,
      cableMark,
      cableSource,
      cableType,
      windingPitchMm,
      numberOfThreads,
    }: ElectricalLayoutMutationArgs) => runSelection({
      objectId,
      cableType,
      cableSource,
      cableMark,
      threadCount: numberOfThreads,
      windingPitchMm,
    }),
    onSuccess: (response) => {
      applyResponse(response);
      message.success('Параметры укладки сохранены, расчёт обновлён');
    },
    onError: handleError,
  });

  const applyCableMarkModal = useCallback(() => {
    if (!canMutate) {
      message.warning(CABLE_SELECTION_READ_ONLY_ERROR);
      return;
    }
    if (!cableMarkModalObjectId || !cableMarkModalCableType) return;
    const selectedMark = cableMarkModalValue ?? AUTO_CABLE_MARK_VALUE;
    if (selectedMark === AUTO_CABLE_MARK_VALUE) {
      autoCableMut.mutate({
        objectId: cableMarkModalObjectId,
        cableType: cableMarkModalCableType,
      }, { onSuccess: closeCableMarkModal });
      return;
    }
    const selectedOption = cableMarkModalOptionByValue.get(selectedMark);
    if (!selectedOption?.mark) return;
    const threadCount = Number(cableMarkModalThreadCountValue);
    if (threadCount !== 1 && threadCount !== 2 && threadCount !== 3) {
      message.error('Для ручной марки выберите количество ниток от 1 до 3');
      return;
    }
    manualCableMut.mutate({
      objectId: cableMarkModalObjectId,
      mark: selectedOption.mark,
      cableType: cableMarkModalCableType,
      cableSource: selectedOption.cableSource,
      threadCount,
    }, { onSuccess: closeCableMarkModal });
  }, [
    autoCableMut,
    cableMarkModalCableType,
    cableMarkModalObjectId,
    cableMarkModalOptionByValue,
    cableMarkModalValue,
    cableMarkModalThreadCountValue,
    canMutate,
    closeCableMarkModal,
    manualCableMut,
  ]);

  return {
    manualCableMut,
    autoCableMut,
    electricalLayoutMut,
    electricalLayoutMutate: electricalLayoutMut.mutate,
    isCableMarkPending:
      manualCableMut.isPending || autoCableMut.isPending || electricalLayoutMut.isPending,
    applyCableMarkModal,
  };
}

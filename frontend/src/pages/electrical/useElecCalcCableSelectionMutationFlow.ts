import { useCallback, useMemo } from 'react';
import { message } from 'antd';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import {
  selectCableForVariants,
  type CableSource,
} from '@/api/calculations';
import { electricalDataQueryKeys } from '@/api/electricalQueryKeys';
import type { CalculationVariant } from '@/store/calculationVariantStore';
import type { ElectricalCalcSummary } from '@/types/calculation';
import type { ProjectObject } from '@/types/project';
import {
  AUTO_CABLE_MARK_VALUE,
  type CableMarkSelectOption,
} from '@/pages/electrical/elecCalcCableOptionModel';
import { isResistiveCableType } from '@/pages/electrical/elecCalcCableTypeModel';
import type { CableTypeKey } from '@/domain/electrical/elecCalcMainTableModel';
import {
  electricalVariantNamesLabel,
  type LegacyElectricalVariantTarget,
} from '@/pages/electrical/elecCalcVariantModel';
import type { ElecCalcCableSizingParams } from '@/pages/electrical/useElecCalcCableSizingModalState';

type ManualCableMutationArgs = {
  objectId: string;
  mark: string;
  cableType: CableTypeKey;
  cableSource?: CableSource;
  targetVariants: LegacyElectricalVariantTarget[];
};

type AutoCableMutationArgs = {
  objectId: string;
  cableType: CableTypeKey;
  targetVariants: LegacyElectricalVariantTarget[];
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
  variant: CalculationVariant;
  effectiveSource: CableSource;
  recalc: ElecCalcCableSizingParams;
  normalizeAvailableCableType: (type: CableTypeKey) => CableTypeKey;
  setElectricalQueryCalculation: (
    calculation: ElectricalCalcSummary,
    target?: LegacyElectricalVariantTarget,
  ) => void;
  cableMarkModalObject: ProjectObject | null;
  cableMarkModalCableType: CableTypeKey | null;
  cableMarkModalValue: string | null;
  cableMarkModalTargetVariantsForSubmit: LegacyElectricalVariantTarget[];
  cableMarkModalOptionByValue: Map<string, CableMarkSelectOption>;
  closeCableMarkModal: () => void;
};

const CABLE_SELECTION_READ_ONLY_ERROR =
  'Недостаточно прав для изменения электрорасчёта в этом проекте';

function requireCableMutation(canMutate: boolean) {
  if (!canMutate) throw new Error(CABLE_SELECTION_READ_ONLY_ERROR);
}

export function useElecCalcCableSelectionMutationFlow({
  projectId,
  electricalVariantId,
  electricalVariantName,
  canMutate,
  variant,
  effectiveSource,
  recalc,
  normalizeAvailableCableType,
  setElectricalQueryCalculation,
  cableMarkModalObject,
  cableMarkModalCableType,
  cableMarkModalValue,
  cableMarkModalTargetVariantsForSubmit,
  cableMarkModalOptionByValue,
  closeCableMarkModal,
}: UseElecCalcCableSelectionMutationFlowOptions) {
  const qc = useQueryClient();

  const currentTarget = useMemo<LegacyElectricalVariantTarget>(() => ({
    id: electricalVariantId,
    name: electricalVariantName,
    legacyVariantNumber: variant,
  }), [electricalVariantId, electricalVariantName, variant]);

  const invalidateElectricalSidecars = useCallback((
    targets: readonly LegacyElectricalVariantTarget[],
  ) => {
    if (projectId) {
      for (const target of targets) {
        qc.invalidateQueries({
          queryKey: electricalDataQueryKeys.variant(projectId, target.id),
        });
      }
    }
    qc.invalidateQueries({ queryKey: ['project', projectId, 'objects', 'summary'] });
  }, [projectId, qc]);

  const applyReturnedCalculations = useCallback((
    calculations: ElectricalCalcSummary[],
    targets: readonly LegacyElectricalVariantTarget[],
  ) => {
    const targetByLegacyNumber = new Map(
      targets.map((target) => [target.legacyVariantNumber, target]),
    );
    calculations.forEach((calculation) => {
      const target = targetByLegacyNumber.get(calculation.variant_number as CalculationVariant);
      if (target) setElectricalQueryCalculation(calculation, target);
    });
  }, [setElectricalQueryCalculation]);

  const buildSelectionOptions = useCallback((
    cableType: CableTypeKey,
    overrides: {
      windingPitchMm?: number | null;
      numberOfThreads?: number | null;
    } = {},
  ) => {
    const effectiveCableType = normalizeAvailableCableType(cableType);
    return {
      effectiveCableType,
      options: {
        supplyVoltage: recalc.supplyVoltage,
        selectionMode: isResistiveCableType(effectiveCableType) ? 'auto' as const : undefined,
        selectionPolicy: recalc.selectionPolicy,
        connectionType: recalc.connectionType,
        windingCoefficient: recalc.windingCoefficient,
        ...overrides,
        heatingHeight: recalc.heatingHeight,
        layingStep: recalc.layingStep,
        maintainTemperature: recalc.maintainTemperature,
        vaporTemperature: recalc.vaporTemperature,
        aggressiveProduct: recalc.aggressiveProduct,
      },
    };
  }, [
    normalizeAvailableCableType,
    recalc.aggressiveProduct,
    recalc.connectionType,
    recalc.heatingHeight,
    recalc.layingStep,
    recalc.maintainTemperature,
    recalc.selectionPolicy,
    recalc.supplyVoltage,
    recalc.vaporTemperature,
    recalc.windingCoefficient,
  ]);

  const manualCableMut = useMutation({
    mutationFn: async ({
      objectId,
      mark,
      cableType,
      cableSource,
      targetVariants,
    }: ManualCableMutationArgs) => {
      requireCableMutation(canMutate);
      const targetsToUpdate = targetVariants.length > 0 ? targetVariants : [currentTarget];
      const variantsToUpdate = targetsToUpdate.map((target) => target.legacyVariantNumber);
      const expectedVariantIds = Object.fromEntries(
        targetsToUpdate.map((target) => [target.legacyVariantNumber, target.id]),
      );
      const { effectiveCableType, options } = buildSelectionOptions(cableType);
      const calculations = await selectCableForVariants(
        objectId,
        mark,
        cableSource ?? effectiveSource,
        variantsToUpdate,
        effectiveCableType,
        options,
        expectedVariantIds,
      );
      return { calculations, targets: targetsToUpdate };
    },
    onSuccess: ({ calculations, targets }, variables) => {
      applyReturnedCalculations(calculations, targets);
      invalidateElectricalSidecars(targets);
      const targetLabel = electricalVariantNamesLabel(variables.targetVariants);
      message.success(`Кабель выбран, расчёт обновлён${targetLabel ? `: ${targetLabel}` : ''}`);
    },
    onError: (e: Error) => message.error(e.message),
  });

  const autoCableMut = useMutation({
    mutationFn: async ({
      objectId,
      cableType,
      targetVariants,
    }: AutoCableMutationArgs) => {
      requireCableMutation(canMutate);
      const targetsToUpdate = targetVariants.length > 0 ? targetVariants : [currentTarget];
      const variantsToUpdate = targetsToUpdate.map((target) => target.legacyVariantNumber);
      const expectedVariantIds = Object.fromEntries(
        targetsToUpdate.map((target) => [target.legacyVariantNumber, target.id]),
      );
      const { effectiveCableType, options } = buildSelectionOptions(cableType);
      const calculations = await selectCableForVariants(
        objectId,
        null,
        effectiveSource,
        variantsToUpdate,
        effectiveCableType,
        options,
        expectedVariantIds,
      );
      return { calculations, targets: targetsToUpdate };
    },
    onSuccess: ({ calculations, targets }, variables) => {
      applyReturnedCalculations(calculations, targets);
      invalidateElectricalSidecars(targets);
      const targetLabel = electricalVariantNamesLabel(variables.targetVariants);
      message.success(`Автоподбор выполнен${targetLabel ? `: ${targetLabel}` : ''}`);
    },
    onError: (e: Error) => message.error(e.message),
  });

  const electricalLayoutMut = useMutation({
    mutationFn: async ({
      objectId,
      cableMark,
      cableSource,
      cableType,
      windingPitchMm,
      numberOfThreads,
    }: ElectricalLayoutMutationArgs) => {
      requireCableMutation(canMutate);
      const { effectiveCableType, options } = buildSelectionOptions(cableType, {
        windingPitchMm,
        numberOfThreads,
      });
      return selectCableForVariants(
        objectId,
        cableMark,
        cableSource,
        [variant],
        effectiveCableType,
        options,
        { [variant]: electricalVariantId },
      );
    },
    onSuccess: (calculations) => {
      applyReturnedCalculations(calculations, [currentTarget]);
      invalidateElectricalSidecars([currentTarget]);
      message.success('Параметры укладки сохранены, расчёт обновлён');
    },
    onError: (e: Error) => message.error(e.message),
  });

  const applyCableMarkModal = useCallback(() => {
    if (!canMutate) {
      message.warning(CABLE_SELECTION_READ_ONLY_ERROR);
      return;
    }
    if (!cableMarkModalObject || !cableMarkModalCableType) return;
    const targetVariants = cableMarkModalTargetVariantsForSubmit;
    const selectedMark = cableMarkModalValue ?? AUTO_CABLE_MARK_VALUE;
    if (selectedMark === AUTO_CABLE_MARK_VALUE) {
      autoCableMut.mutate({
        objectId: cableMarkModalObject.id,
        cableType: cableMarkModalCableType,
        targetVariants,
      }, {
        onSuccess: closeCableMarkModal,
      });
      return;
    }
    const selectedOption = cableMarkModalOptionByValue.get(selectedMark);
    if (!selectedOption?.mark) return;
    manualCableMut.mutate({
      objectId: cableMarkModalObject.id,
      mark: selectedOption.mark,
      cableType: cableMarkModalCableType,
      cableSource: selectedOption.cableSource,
      targetVariants,
    }, {
      onSuccess: closeCableMarkModal,
    });
  }, [
    autoCableMut,
    canMutate,
    cableMarkModalCableType,
    cableMarkModalObject,
    cableMarkModalOptionByValue,
    cableMarkModalTargetVariantsForSubmit,
    cableMarkModalValue,
    closeCableMarkModal,
    manualCableMut,
  ]);

  const electricalLayoutMutate = electricalLayoutMut.mutate;
  const isCableMarkPending =
    manualCableMut.isPending || autoCableMut.isPending || electricalLayoutMut.isPending;

  return {
    manualCableMut,
    autoCableMut,
    electricalLayoutMut,
    electricalLayoutMutate,
    isCableMarkPending,
    applyCableMarkModal,
  };
}

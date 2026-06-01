import { useCallback } from 'react';
import { message } from 'antd';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import {
  selectCableForVariants,
  type CableSource,
} from '@/api/calculations';
import type { CalculationVariant } from '@/store/calculationVariantStore';
import type { ElectricalCalcSummary } from '@/types/calculation';
import type { ProjectObject } from '@/types/project';
import {
  AUTO_CABLE_MARK_VALUE,
  type CableMarkSelectOption,
} from '@/pages/electrical/elecCalcCableOptionModel';
import { isResistiveCableType } from '@/pages/electrical/elecCalcCableTypeModel';
import type { CableTypeKey } from '@/pages/electrical/elecCalcMainTableModel';
import { calculationVariantLabel } from '@/pages/electrical/elecCalcVariantModel';
import type { ElecCalcCableSizingParams } from '@/pages/electrical/useElecCalcCableSizingModalState';

type ManualCableMutationArgs = {
  objectId: string;
  mark: string;
  cableType: CableTypeKey;
  cableSource?: CableSource;
  targetVariants: CalculationVariant[];
};

type AutoCableMutationArgs = {
  objectId: string;
  cableType: CableTypeKey;
  targetVariants: CalculationVariant[];
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
  variant: CalculationVariant;
  effectiveSource: CableSource;
  recalc: ElecCalcCableSizingParams;
  normalizeAvailableCableType: (type: CableTypeKey) => CableTypeKey;
  setElectricalQueryCalculation: (calculation: ElectricalCalcSummary) => void;
  cableMarkModalObject: ProjectObject | null;
  cableMarkModalCableType: CableTypeKey | null;
  cableMarkModalValue: string | null;
  cableMarkModalTargetVariantsForSubmit: CalculationVariant[];
  cableMarkModalOptionByValue: Map<string, CableMarkSelectOption>;
  closeCableMarkModal: () => void;
};

export function useElecCalcCableSelectionMutationFlow({
  projectId,
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

  const invalidateElectricalSidecars = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['project', projectId, 'electrical-query-capabilities'] });
    qc.invalidateQueries({ queryKey: ['project', projectId, 'objects', 'summary'] });
  }, [projectId, qc]);

  const applyReturnedCalculations = useCallback((calculations: ElectricalCalcSummary[]) => {
    calculations.forEach((calculation) => setElectricalQueryCalculation(calculation));
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
      const variantsToUpdate = targetVariants.length > 0 ? targetVariants : [variant];
      const { effectiveCableType, options } = buildSelectionOptions(cableType);
      return selectCableForVariants(
        objectId,
        mark,
        cableSource ?? effectiveSource,
        variantsToUpdate,
        effectiveCableType,
        options,
      );
    },
    onSuccess: (calculations, variables) => {
      applyReturnedCalculations(calculations);
      invalidateElectricalSidecars();
      const targetLabel = calculationVariantLabel(variables.targetVariants);
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
      const variantsToUpdate = targetVariants.length > 0 ? targetVariants : [variant];
      const { effectiveCableType, options } = buildSelectionOptions(cableType);
      return selectCableForVariants(
        objectId,
        null,
        effectiveSource,
        variantsToUpdate,
        effectiveCableType,
        options,
      );
    },
    onSuccess: (calculations, variables) => {
      applyReturnedCalculations(calculations);
      invalidateElectricalSidecars();
      const targetLabel = calculationVariantLabel(variables.targetVariants);
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
      );
    },
    onSuccess: (calculations) => {
      applyReturnedCalculations(calculations);
      invalidateElectricalSidecars();
      message.success('Параметры укладки сохранены, расчёт обновлён');
    },
    onError: (e: Error) => message.error(e.message),
  });

  const applyCableMarkModal = useCallback(() => {
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

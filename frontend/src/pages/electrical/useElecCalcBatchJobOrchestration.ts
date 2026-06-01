import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import { Modal, message } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  cancelCalcTask,
  copyElectricalVariant,
  enqueueElectricalBatchJob,
  getCalcTask,
  type CableSource,
  type CopyElectricalVariantResponse,
} from '@/api/calculations';
import { getCalcJobRefetchInterval } from '@/utils/calcJobPolling';
import type { CalculationVariant } from '@/store/calculationVariantStore';
import type { ElecCalcCableSizingParams } from '@/pages/electrical/useElecCalcCableSizingModalState';
import {
  isBatchElectricalResponse,
  isTargetVariantNotEmptyError,
} from '@/pages/electrical/elecCalcApiResponseGuards';
import { isResistiveCableType } from '@/pages/electrical/elecCalcCableTypeModel';
import type { CableTypeKey } from '@/pages/electrical/elecCalcMainTableModel';
import type {
  CopyElectricalVariantMutationArgs,
  ElectricalBatchMutationArgs,
  ElectricalBatchScope,
} from '@/pages/electrical/elecCalcPageModel';

type ObjectOverride = {
  object_id: string;
  cable_type?: CableTypeKey | null;
};

type UseElecCalcBatchJobOrchestrationOptions = {
  initialActiveJobId: string | null;
  projectId?: string;
  variant: CalculationVariant;
  effectiveSource: CableSource;
  recalc: ElecCalcCableSizingParams;
  selectedCableType: CableTypeKey | null;
  defaultCableType: CableTypeKey;
  cableTypeForRecalculation: CableTypeKey;
  normalizeAvailableCableType: (type: CableTypeKey | null | undefined) => CableTypeKey;
  objectOverridesForIds: (objectIds: string[]) => ObjectOverride[];
  setCableTypeDraftByObjectId: Dispatch<SetStateAction<Record<string, CableTypeKey>>>;
  resetTablePageAndCursors: () => void;
  setSelectedRowKeys: Dispatch<SetStateAction<string[]>>;
  setVariant: (variant: number) => void;
};

export function useElecCalcBatchJobOrchestration({
  initialActiveJobId,
  projectId,
  variant,
  effectiveSource,
  recalc,
  selectedCableType,
  defaultCableType,
  cableTypeForRecalculation,
  normalizeAvailableCableType,
  objectOverridesForIds,
  setCableTypeDraftByObjectId,
  resetTablePageAndCursors,
  setSelectedRowKeys,
  setVariant,
}: UseElecCalcBatchJobOrchestrationOptions) {
  const qc = useQueryClient();
  const [activeJobId, setActiveJobId] = useState<string | null>(() => initialActiveJobId);
  const [activeBatchScope, setActiveBatchScope] = useState<ElectricalBatchScope | null>(null);
  const activeBatchObjectIdsRef = useRef<string[] | null>(null);

  const { data: activeJob } = useQuery({
    queryKey: ['calc-job', activeJobId],
    queryFn: () => getCalcTask(activeJobId!),
    enabled: !!activeJobId,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return getCalcJobRefetchInterval(status);
    },
    refetchIntervalInBackground: true,
  });

  const batchMut = useMutation({
    mutationFn: ({ scope, objectIds, skipManual = true }: ElectricalBatchMutationArgs) => {
      const selectedObjectIds = objectIds ?? [];
      const objectOverrides = scope === 'selected'
        ? objectOverridesForIds(selectedObjectIds)
        : [];
      const fallbackCableType = scope === 'selected'
        ? selectedCableType ?? defaultCableType
        : cableTypeForRecalculation;
      const effectiveCableType = normalizeAvailableCableType(fallbackCableType);
      const selectionMode = isResistiveCableType(effectiveCableType) ? 'auto' : undefined;
      return enqueueElectricalBatchJob(
        projectId!,
        effectiveSource,
        variant,
        effectiveCableType,
        {
          supplyVoltage: recalc.supplyVoltage,
          selectionMode,
          selectionPolicy: recalc.selectionPolicy,
          connectionType: recalc.connectionType,
          windingCoefficient: recalc.windingCoefficient,
          heatingHeight: recalc.heatingHeight,
          layingStep: recalc.layingStep,
          maintainTemperature: recalc.maintainTemperature,
          vaporTemperature: recalc.vaporTemperature,
          aggressiveProduct: recalc.aggressiveProduct,
          skipManual,
          objectIds: scope === 'selected' ? selectedObjectIds : undefined,
          forceCableType: scope === 'all',
          objectOverrides: objectOverrides.length > 0 ? objectOverrides : undefined,
        },
      );
    },
    onSuccess: (task, variables) => {
      setActiveJobId(task.id);
      setActiveBatchScope(variables.scope);
      activeBatchObjectIdsRef.current = variables.scope === 'selected'
        ? variables.objectIds ?? []
        : null;
      message.info(
        variables.scope === 'selected'
          ? `СО${variant} · электрорасчёт выбранных объектов поставлен в очередь`
          : `СО${variant} · электрорасчёт всех объектов поставлен в очередь`,
      );
    },
    onError: (e: Error) => message.error(e.message),
  });

  const copyVariantMut = useMutation({
    mutationFn: ({ targetVariant, overwrite = false }: CopyElectricalVariantMutationArgs) =>
      copyElectricalVariant({
        project_id: projectId!,
        source_variant_number: variant,
        target_variant_number: targetVariant,
        overwrite,
        regenerate_specification: true,
      }),
    onSuccess: (res: CopyElectricalVariantResponse) => {
      resetTablePageAndCursors();
      setSelectedRowKeys([]);
      setCableTypeDraftByObjectId({});
      setVariant(res.target_variant_number);
      qc.invalidateQueries({ queryKey: ['project', projectId, 'electrical-query'] });
      qc.invalidateQueries({ queryKey: ['project', projectId, 'electrical-query-capabilities'] });
      qc.invalidateQueries({ queryKey: ['spec', projectId, res.target_variant_number] });
      qc.invalidateQueries({ queryKey: ['report-preview', projectId, res.target_variant_number] });
      message.success(
        `СО${res.target_variant_number} создан на основании СО${res.source_variant_number}: ` +
        `скопировано ${res.copied_count}, успешно проверено ${res.validated_count ?? 0}`,
      );
      if ((res.validation_failed_count ?? 0) > 0) {
        message.warning(
          `В СО${res.target_variant_number} есть ошибки проверки скопированного выбора: ` +
          `${res.validation_failed_count}. Новый кабель автоматически не подбирался.`,
        );
      }
      if (res.copied_count < res.project_objects_count) {
        message.info(
          `В проекте объектов: ${res.project_objects_count}, скопировано расчётов: ${res.copied_count}. ` +
          `Остальные в СО${res.target_variant_number} не рассчитаны.`,
        );
      }
    },
    onError: (error: Error, variables) => {
      if (isTargetVariantNotEmptyError(error) && !variables.overwrite) {
        Modal.confirm({
          title: `СО${variables.targetVariant} уже содержит расчёты`,
          content: `Заменить СО${variables.targetVariant} копией СО${variant}? ` +
            `Все текущие расчёты СО${variables.targetVariant} будут удалены.`,
          okText: 'Заменить',
          okButtonProps: { danger: true },
          cancelText: 'Отмена',
          onOk: () => copyVariantMut.mutate({ ...variables, overwrite: true }),
        });
        return;
      }
      message.error(error.message);
    },
  });

  const cancelJobMut = useMutation({
    mutationFn: () => cancelCalcTask(activeJobId!),
    onSuccess: (task) => {
      setActiveJobId(task.id);
      setActiveBatchScope(null);
      activeBatchObjectIdsRef.current = null;
      message.warning('Электрорасчёт остановлен');
    },
    onError: (e: Error) => message.error(e.message),
  });

  useEffect(() => {
    if (!activeJob) return;
    if (activeJob.status === 'succeeded') {
      const res = isBatchElectricalResponse(activeJob.result) ? activeJob.result : null;
      const resultScope = res?.scope ?? activeBatchScope ?? 'all';
      const scopeLabel = resultScope === 'selected' ? 'выбранных объектов' : 'всех объектов';
      qc.invalidateQueries({ queryKey: ['project', projectId, 'electrical-query'] });
      qc.invalidateQueries({ queryKey: ['project', projectId, 'electrical-query-capabilities'] });
      qc.invalidateQueries({ queryKey: ['project', projectId, 'objects', 'summary'] });
      if (res && res.calculated === 0 && res.heat_loss_failed > 0) {
        message.warning(
          `СО${variant} · электрорасчёт не выполнен: у выбранных объектов не рассчитаны теплопотери (${res.heat_loss_failed}).`,
        );
      } else if (res && (res.skipped > 0 || res.heat_loss_failed > 0)) {
        message.warning(
          `СО${variant} · рассчитано для ${scopeLabel}: ${res.calculated}, пропущено: ${res.skipped}` +
          `${res.heat_loss_failed > 0 ? `, ошибок теплопотерь: ${res.heat_loss_failed}` : ''}.`,
        );
      } else if (res) {
        message.success(
          `СО${variant} — расчёт выполнен для ${scopeLabel}: ${res.calculated}` +
          `${res.heat_loss_failed > 0 ? ` (ещё ${res.heat_loss_failed} с ошибками теплопотерь)` : ''}`,
        );
      } else {
        message.success(`СО${variant} — расчёт выполнен`);
      }
      setCableTypeDraftByObjectId((prev) => {
        if (resultScope === 'all') return {};
        const affectedIds = activeBatchObjectIdsRef.current;
        if (!affectedIds || affectedIds.length === 0) return prev;
        const next = { ...prev };
        for (const objectId of affectedIds) {
          delete next[objectId];
        }
        return next;
      });
      activeBatchObjectIdsRef.current = null;
      setActiveJobId(null);
      setActiveBatchScope(null);
    }
    if (activeJob.status === 'failed') {
      message.error(activeJob.error_message || 'Электрорасчёт завершился ошибкой');
      setActiveJobId(null);
      setActiveBatchScope(null);
      activeBatchObjectIdsRef.current = null;
    }
    if (activeJob.status === 'cancelled') {
      setActiveJobId(null);
      setActiveBatchScope(null);
      activeBatchObjectIdsRef.current = null;
    }
  }, [
    activeBatchScope,
    activeJob,
    projectId,
    qc,
    setCableTypeDraftByObjectId,
    variant,
  ]);

  return {
    activeJob,
    activeJobId,
    setActiveJobId,
    setActiveBatchScope,
    batchMut,
    copyVariantMut,
    cancelJobMut,
  };
}

import { appModal } from '@/feedback/appFeedback';
/**
 * @module electrical/workspace-ui-helpers
 * @owner electrical
 * @depends presentation panels only
 * @does-not heat
 */
import { useCallback, useMemo, type ReactNode } from 'react';

import type { SelectionPolicy } from '@/api/calculations';
import type { NormalGlideRowDragEvent } from '@/components/shared/NormalGlideGrid';
import type { ElectricalCandidateFolder } from '@/types/calculation';
import type { CableTypeKey } from '@/domain/electrical/elecCalcMainTableModel';
import { ASSIGNMENT_DND_MIME } from '@/pages/electrical/ElectricalAssignmentPanel';
import ElecCalcElectricalTypeControls from '@/pages/electrical/ElecCalcElectricalTypeControls';
import ElecCalcRecalculationSettings from '@/pages/electrical/ElecCalcRecalculationSettings';
import type { CatalogStatus } from '@/pages/electrical/elecCalcCableCatalogModel';
import type { CableSourceSelectOption } from '@/pages/electrical/elecCalcCableTypeOptionsModel';
import type {
  ElecCalcTypeControlSetters,
  ElecCalcTypeControlValues,
} from '@/pages/electrical/elecCalcTypeControlModel';
import type {
  ElectricalCalculationCableSource,
} from '@/utils/electricalTableViewSettings';

export function candidateFolderEmptyText(
  activeCandidateFolderKey: string,
  hasActiveCustomFolder: boolean,
): string {
  if (activeCandidateFolderKey === 'favorite') return 'В избранном пока нет вариантов';
  if (hasActiveCustomFolder) return 'В этой папке пока нет вариантов';
  return 'Вариантов пока нет. Запустите авторасчёт или ручной расчёт.';
}

export type UseElecCalcWorkspaceUiHelpersArgs = {
  canMutate: boolean;
  visibleCableTypeControl: CableTypeKey | null;
  recalc: ElecCalcTypeControlValues & { selectionPolicy: SelectionPolicy };
  setRecalc: ElecCalcTypeControlSetters & {
    selectionPolicy: (value: SelectionPolicy) => void;
  };
  commercialFeaturesAvailable: boolean;
  isEmployee: boolean;
  calculationCableSource: ElectricalCalculationCableSource;
  cableSourceOptions: CableSourceSelectOption[];
  commercialDataStatus: CatalogStatus;
  technicalDataStatus: CatalogStatus;
  updateDraftCalculationCableSource: (value: ElectricalCalculationCableSource) => void;
  deleteCandidateFolder: (id: string) => void;
  activeCandidateFolderKey: string;
  hasActiveCustomFolder: boolean;
  selectedRowKeys: string[];
  setTableDragging: (v: boolean) => void;
};

export function useElecCalcWorkspaceUiHelpers({
  canMutate,
  visibleCableTypeControl,
  recalc,
  setRecalc,
  commercialFeaturesAvailable,
  isEmployee,
  calculationCableSource,
  cableSourceOptions,
  commercialDataStatus,
  technicalDataStatus,
  updateDraftCalculationCableSource,
  deleteCandidateFolder,
  activeCandidateFolderKey,
  hasActiveCustomFolder,
  selectedRowKeys,
  setTableDragging,
}: UseElecCalcWorkspaceUiHelpersArgs) {
  const defaultElectricalTypeControls = useMemo(() => (
    <ElecCalcElectricalTypeControls
      disabled={!canMutate}
      cableType={visibleCableTypeControl}
      recalc={recalc}
      setRecalc={setRecalc}
    />
  ), [visibleCableTypeControl, canMutate, recalc, setRecalc]);

  const renderElectricalTypeControls = useCallback((
    cableType: CableTypeKey | null = visibleCableTypeControl,
    options: { block?: boolean } = {},
  ): ReactNode => (
    <ElecCalcElectricalTypeControls
      cableType={cableType}
      block={options.block}
      recalc={recalc}
      setRecalc={setRecalc}
    />
  ), [visibleCableTypeControl, recalc, setRecalc]);

  const renderRecalculationSettings = useCallback((): ReactNode => (
    <ElecCalcRecalculationSettings
      commercialFeaturesAvailable={commercialFeaturesAvailable}
      isEmployee={isEmployee}
      calculationCableSource={calculationCableSource}
      cableSourceOptions={cableSourceOptions}
      selectionPolicy={recalc.selectionPolicy}
      commercialDataStatus={commercialDataStatus}
      technicalDataStatus={technicalDataStatus}
      onCalculationCableSourceChange={updateDraftCalculationCableSource}
      onSelectionPolicyChange={setRecalc.selectionPolicy}
    />
  ), [
    calculationCableSource,
    cableSourceOptions,
    commercialDataStatus,
    commercialFeaturesAvailable,
    isEmployee,
    recalc.selectionPolicy,
    setRecalc.selectionPolicy,
    technicalDataStatus,
    updateDraftCalculationCableSource,
  ]);

  const showDeleteCandidateFolderConfirm = useCallback((folder: ElectricalCandidateFolder) => {
    if (!canMutate) return;
    appModal.confirm({
      title: `Удалить папку «${folder.name}»?`,
      content: 'Варианты останутся в списке. Удалится только фильтр-папка.',
      okText: 'Удалить',
      okType: 'danger',
      cancelText: 'Отмена',
      onOk: () => deleteCandidateFolder(folder.id),
    });
  }, [canMutate, deleteCandidateFolder]);

  const getCandidateFolderEmptyText = useCallback(
    () => candidateFolderEmptyText(activeCandidateFolderKey, hasActiveCustomFolder),
    [activeCandidateFolderKey, hasActiveCustomFolder],
  );

  const handleTableRowDragStart = useCallback((
    event: NormalGlideRowDragEvent,
    objectId: string,
  ) => {
    if (!canMutate) {
      event.preventDefault();
      return;
    }
    const ids = selectedRowKeys.includes(objectId) && selectedRowKeys.length > 0
      ? selectedRowKeys
      : [objectId];
    const payload = JSON.stringify(ids);
    event.setData(ASSIGNMENT_DND_MIME, payload);
    event.setData('text/plain', payload);
    event.setMoveEffect?.();
    setTableDragging(true);
  }, [canMutate, selectedRowKeys, setTableDragging]);

  const handleTableRowDragEnd = useCallback(() => {
    setTableDragging(false);
  }, [setTableDragging]);

  return {
    defaultElectricalTypeControls,
    renderElectricalTypeControls,
    renderRecalculationSettings,
    showDeleteCandidateFolderConfirm,
    candidateFolderEmptyText: getCandidateFolderEmptyText,
    handleTableRowDragStart,
    handleTableRowDragEnd,
  };
}

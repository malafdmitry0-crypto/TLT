/**
 * @module electrical/workspace-ui-helpers
 * @owner electrical
 * @depends presentation panels only
 * @does-not heat
 */
import { useCallback, useMemo, type ReactNode } from 'react';
import { Modal } from 'antd';

import type { ElectricalCandidateFolder } from '@/types/calculation';
import type { CableTypeKey } from '@/domain/electrical/elecCalcMainTableModel';
import { ASSIGNMENT_DND_MIME } from '@/pages/electrical/ElectricalAssignmentPanel';
import ElecCalcElectricalTypeControls from '@/pages/electrical/ElecCalcElectricalTypeControls';
import ElecCalcRecalculationSettings from '@/pages/electrical/ElecCalcRecalculationSettings';
import type { CableSourceSelectOption } from '@/pages/electrical/elecCalcCableTypeOptionsModel';

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
  recalc: {
    selectionPolicy: string;
    [key: string]: unknown;
  };
  setRecalc: {
    connectionType: (v: string) => void;
    selectionPolicy: (v: string) => void;
    [key: string]: unknown;
  };
  commercialFeaturesAvailable: boolean;
  isEmployee: boolean;
  calculationCableSource: unknown;
  cableSourceOptions: CableSourceSelectOption[];
  commercialDataStatus: unknown;
  technicalDataStatus: unknown;
  updateDraftCalculationCableSource: (...args: never[]) => void;
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
      recalc={recalc as never}
      setRecalc={setRecalc as never}
    />
  ), [visibleCableTypeControl, canMutate, recalc, setRecalc]);

  const renderElectricalTypeControls = useCallback((
    cableType: CableTypeKey | null = visibleCableTypeControl,
    options: { block?: boolean } = {},
  ): ReactNode => (
    <ElecCalcElectricalTypeControls
      cableType={cableType}
      block={options.block}
      recalc={recalc as never}
      setRecalc={setRecalc as never}
    />
  ), [visibleCableTypeControl, recalc, setRecalc]);

  const renderRecalculationSettings = useCallback((): ReactNode => (
    <ElecCalcRecalculationSettings
      commercialFeaturesAvailable={commercialFeaturesAvailable}
      isEmployee={isEmployee}
      calculationCableSource={calculationCableSource as never}
      cableSourceOptions={cableSourceOptions}
      selectionPolicy={recalc.selectionPolicy as never}
      commercialDataStatus={commercialDataStatus as never}
      technicalDataStatus={technicalDataStatus as never}
      onCalculationCableSourceChange={updateDraftCalculationCableSource as never}
      onSelectionPolicyChange={setRecalc.selectionPolicy as never}
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
    Modal.confirm({
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
    event: React.DragEvent,
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
    event.dataTransfer.setData(ASSIGNMENT_DND_MIME, payload);
    event.dataTransfer.setData('text/plain', payload);
    event.dataTransfer.effectAllowed = 'move';
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

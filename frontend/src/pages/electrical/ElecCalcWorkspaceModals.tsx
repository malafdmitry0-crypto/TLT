/**
 * @module electrical/workspace-modals
 * @owner electrical
 */
import { lazy, Suspense, type ComponentProps, type ReactNode } from 'react';
import { Modal } from 'antd';

import ElecCalcCableMarkModal from '@/pages/electrical/ElecCalcCableMarkModal';
import ElecCalcCableSizingModal from '@/pages/electrical/ElecCalcCableSizingModal';
import type { ProjectObject } from '@/types/project';
import type { CableTypeKey } from '@/domain/electrical/elecCalcMainTableModel';
import type { CableMarkSelectOption } from '@/pages/electrical/elecCalcCableOptionModel';
import type { CableStatusRow } from '@/pages/electrical/elecCalcCableCatalogModel';
import type { CableTypeSelectOption } from '@/pages/electrical/elecCalcCableTypeOptionsModel';
import type { ElectricalVariantTargetOption } from '@/pages/electrical/elecCalcVariantModel';
import type {
  ElectricalCandidateColumnKey,
  ElectricalCandidateTableColumnSettings,
} from '@/utils/electricalCandidateTableColumns';
import type {
  ElectricalColumnKey,
  ElectricalTableColumnSettings,
} from '@/utils/electricalTableColumns';
import {  TltTextField  } from '@/components/ui-kit';
import type {
  ElectricalTableFontSize,
  ElectricalTableLabelFormat,
  ElectricalTableViewSettings,
} from '@/utils/electricalTableViewSettings';

const ElectricalCandidateColumnSettingsModal = lazy(
  () => import('@/components/electrical/ElectricalCandidateColumnSettingsModal'),
);
const ElectricalColumnSettingsModal = lazy(
  () => import('@/components/electrical/ElectricalColumnSettingsModal'),
);

type PendingMutation = {
  isPending: boolean;
};

type CableSizingModalProps = ComponentProps<typeof ElecCalcCableSizingModal>;

/**
 * Explicit modal lifecycle + selection contract (AF9-TYPE-ELEC-MODALS-01).
 * Props-in / events-out; no Record&lt;string, any&gt; shell.
 */
export type ElecCalcWorkspaceModalsProps = {
  cableMarkModalObject: ProjectObject | null;
  cableMarkModalSelectedCable: CableStatusRow | null;
  cableMarkModalCableType: CableTypeKey | null;
  cableMarkModalCableTypeOptions: CableTypeSelectOption[];
  commercialFeaturesAvailable: boolean;
  project: { id: string } | null | undefined;
  canMutate: boolean;
  cableMarkModalAssignmentReason: string | null;
  isCableMarkPending: boolean;
  cableMarkModalValue: string | null;
  cableMarkModalOptions: CableMarkSelectOption[];
  cableMarkModalTargetVariants: string[];
  cableMarkModalTargetVariantOptions: ElectricalVariantTargetOption[];
  renderElectricalTypeControls: (
    cableType: CableTypeKey | null,
    options?: { block?: boolean },
  ) => ReactNode;
  changeCableMarkModalCableType: (nextType: CableTypeKey) => void;
  setCableMarkModalValue: (nextValue: string) => void;
  setCableMarkModalTargetVariantsFromValues: (values: readonly unknown[]) => void;
  applyCableMarkModal: () => void;
  closeCableMarkModal: () => void;
  cableSizingModalAssignmentReason: string | null;
  cableSizingModal: CableSizingModalProps['cableSizingModal'];
  candidate: CableSizingModalProps['candidate'];
  cableSizingModalSelectedCable: CableStatusRow | null;
  cableSizingModalCableTypeOptions: CableTypeSelectOption[];
  cableSizingManualOptions: CableSizingModalProps['cableSizingManualOptions'];
  cableSizingCandidateTableScrollX: number;
  resolvedTableFontSize: { key: string };
  electricalCandidateGlideColumns: CableSizingModalProps['electricalCandidateGlideColumns'];
  candidateTableViewState: CableSizingModalProps['candidateTableViewState'];
  candidateTableViewActive: boolean;
  cableTypes: {
    normalizeAvailableCableType: (type: CableTypeKey) => CableTypeKey;
  };
  closeCableSizingModal: () => void;
  setRecalc: {
    connectionType: (value: string) => void;
  };
  openCandidateColumnSettings: () => void;
  resetCandidateTableViewState: () => void;
  candidateFolderEmptyText: CableSizingModalProps['candidateFolderEmptyText'];
  showDeleteCandidateFolderConfirm: CableSizingModalProps['onDeleteCandidateFolder'];
  getElectricalCandidateGlideCellState: CableSizingModalProps['getCandidateCellState'];
  handleElectricalCandidateGlideCellAction: CableSizingModalProps['onCandidateCellAction'];
  getElectricalCandidateGlideActionMenuItems: CableSizingModalProps['getCandidateActionMenuItems'];
  setCandidateColumnFilter: CableSizingModalProps['onSetCandidateColumnFilter'];
  resetCandidateColumnFilter: CableSizingModalProps['onResetCandidateColumnFilter'];
  setCandidateTableSort: CableSizingModalProps['onSetCandidateSort'];
  applyElectricalCandidateGlideColumnDraftWidth: CableSizingModalProps['onCandidateColumnResize'];
  commitElectricalCandidateGlideColumnWidth: CableSizingModalProps['onCandidateColumnResizeEnd'];
  candidateFolderModalOpen: boolean;
  candidateFolderModalMode: 'create' | 'rename' | string;
  createCandidateFolderMut: PendingMutation;
  updateCandidateFolderMut: PendingMutation;
  candidateFolderName: string;
  submitCandidateFolderModal: () => void;
  closeCandidateFolderModal: () => void;
  setCandidateFolderName: (name: string) => void;
  candidateColumnSettingsOpen: boolean;
  setCandidateColumnSettingsOpen: (open: boolean) => void;
  draftCandidateTableColumnSettings: ElectricalCandidateTableColumnSettings;
  normalizedTableViewSettings: { settingsLabelFormat: ElectricalTableLabelFormat };
  updateCandidateTableColumnPreference: PendingMutation;
  applyCandidateColumnSettings: () => void;
  selectAllDraftCandidateColumns: () => void;
  resetDraftCandidateColumns: () => void;
  updateDraftCandidateColumn: (
    key: ElectricalCandidateColumnKey,
    checked: boolean,
  ) => void;
  updateDraftCandidateColumnOrder: (
    key: ElectricalCandidateColumnKey,
    order: number,
  ) => void;
  reorderDraftCandidateColumn: (
    activeKey: ElectricalCandidateColumnKey,
    overKey: ElectricalCandidateColumnKey,
  ) => void;
  updateDraftCandidateColumnWidth: (
    key: ElectricalCandidateColumnKey,
    widthPct: number,
  ) => void;
  resetDraftCandidateColumnWidth: (key: ElectricalCandidateColumnKey) => void;
  columnSettingsOpen: boolean;
  setColumnSettingsOpen: (open: boolean) => void;
  draftTableColumnSettings: ElectricalTableColumnSettings;
  draftTableViewSettings: ElectricalTableViewSettings;
  updateTableColumnPreference: PendingMutation;
  updateTableSettingsPreference: PendingMutation;
  applyColumnSettings: () => void;
  selectAllDraftColumns: () => void;
  resetDraftColumns: () => void;
  updateDraftColumn: (key: ElectricalColumnKey, checked: boolean) => void;
  updateDraftColumnOrder: (key: ElectricalColumnKey, order: number) => void;
  reorderDraftColumn: (
    activeKey: ElectricalColumnKey,
    overKey: ElectricalColumnKey,
  ) => void;
  updateDraftColumnWidth: (key: ElectricalColumnKey, widthPct: number) => void;
  resetDraftColumnWidth: (key: ElectricalColumnKey) => void;
  updateDraftTableFontSize: (size: ElectricalTableFontSize) => void;
  updateDraftTableLabelFormat: (format: ElectricalTableLabelFormat) => void;
  updateDraftSettingsLabelFormat: (format: ElectricalTableLabelFormat) => void;
  resetDraftTableFontSize: () => void;
  resetDraftLabelFormats: () => void;
  renderRecalculationSettings: () => ReactNode;
};

export function ElecCalcWorkspaceModals(p: ElecCalcWorkspaceModalsProps): ReactNode {
  const {
    cableMarkModalObject,
    cableMarkModalSelectedCable,
    cableMarkModalCableType,
    cableMarkModalCableTypeOptions,
    commercialFeaturesAvailable,
    project,
    canMutate,
    cableMarkModalAssignmentReason,
    isCableMarkPending,
    cableMarkModalValue,
    cableMarkModalOptions,
    cableMarkModalTargetVariants,
    cableMarkModalTargetVariantOptions,
    renderElectricalTypeControls,
    changeCableMarkModalCableType,
    setCableMarkModalValue,
    setCableMarkModalTargetVariantsFromValues,
    applyCableMarkModal,
    closeCableMarkModal,
    cableSizingModalAssignmentReason,
    cableSizingModal,
    candidate,
    cableSizingModalSelectedCable,
    cableSizingModalCableTypeOptions,
    cableSizingManualOptions,
    cableSizingCandidateTableScrollX,
    resolvedTableFontSize,
    electricalCandidateGlideColumns,
    candidateTableViewState,
    candidateTableViewActive,
    cableTypes,
    closeCableSizingModal,
    setRecalc,
    openCandidateColumnSettings,
    resetCandidateTableViewState,
    candidateFolderEmptyText,
    showDeleteCandidateFolderConfirm,
    getElectricalCandidateGlideCellState,
    handleElectricalCandidateGlideCellAction,
    getElectricalCandidateGlideActionMenuItems,
    setCandidateColumnFilter,
    resetCandidateColumnFilter,
    setCandidateTableSort,
    applyElectricalCandidateGlideColumnDraftWidth,
    commitElectricalCandidateGlideColumnWidth,
    candidateFolderModalOpen,
    candidateFolderModalMode,
    createCandidateFolderMut,
    updateCandidateFolderMut,
    candidateFolderName,
    submitCandidateFolderModal,
    closeCandidateFolderModal,
    setCandidateFolderName,
    candidateColumnSettingsOpen,
    setCandidateColumnSettingsOpen,
    draftCandidateTableColumnSettings,
    normalizedTableViewSettings,
    updateCandidateTableColumnPreference,
    applyCandidateColumnSettings,
    selectAllDraftCandidateColumns,
    resetDraftCandidateColumns,
    updateDraftCandidateColumn,
    updateDraftCandidateColumnOrder,
    reorderDraftCandidateColumn,
    updateDraftCandidateColumnWidth,
    resetDraftCandidateColumnWidth,
    columnSettingsOpen,
    setColumnSettingsOpen,
    draftTableColumnSettings,
    draftTableViewSettings,
    updateTableColumnPreference,
    updateTableSettingsPreference,
    applyColumnSettings,
    selectAllDraftColumns,
    resetDraftColumns,
    updateDraftColumn,
    updateDraftColumnOrder,
    reorderDraftColumn,
    updateDraftColumnWidth,
    resetDraftColumnWidth,
    updateDraftTableFontSize,
    updateDraftTableLabelFormat,
    updateDraftSettingsLabelFormat,
    resetDraftTableFontSize,
    resetDraftLabelFormats,
    renderRecalculationSettings,
  } = p;

  return (
    <>
      <ElecCalcCableMarkModal
        object={cableMarkModalObject}
        selectedCable={cableMarkModalSelectedCable}
        cableType={cableMarkModalCableType}
        cableTypeOptions={cableMarkModalCableTypeOptions}
        commercialFeaturesAvailable={commercialFeaturesAvailable}
        projectSelected={
          Boolean(project)
          && canMutate
          && cableMarkModalAssignmentReason == null
        }
        pending={isCableMarkPending}
        value={cableMarkModalValue}
        markOptions={cableMarkModalOptions}
        targetVariants={cableMarkModalTargetVariants}
        targetVariantOptions={cableMarkModalTargetVariantOptions}
        renderTypeControls={(nextCableType) =>
          renderElectricalTypeControls(nextCableType, { block: true })}
        onCableTypeChange={changeCableMarkModalCableType}
        onMarkChange={setCableMarkModalValue}
        onTargetVariantsChange={setCableMarkModalTargetVariantsFromValues}
        onApply={applyCableMarkModal}
        onCancel={closeCableMarkModal}
      />
      <ElecCalcCableSizingModal
        canMutate={canMutate && cableSizingModalAssignmentReason == null}
        cableSizingModal={cableSizingModal}
        candidate={candidate}
        selectedCable={cableSizingModalSelectedCable}
        commercialFeaturesAvailable={commercialFeaturesAvailable}
        cableTypeOptions={cableSizingModalCableTypeOptions}
        cableSizingManualOptions={cableSizingManualOptions}
        candidateTableScrollX={cableSizingCandidateTableScrollX}
        candidateFontSizeKey={resolvedTableFontSize.key}
        electricalCandidateGlideColumns={electricalCandidateGlideColumns}
        candidateTableViewState={candidateTableViewState}
        candidateTableViewActive={candidateTableViewActive}
        normalizeAvailableCableType={cableTypes.normalizeAvailableCableType}
        onClose={closeCableSizingModal}
        onResetConnectionType={() => setRecalc.connectionType('line_1ph')}
        onOpenCandidateColumnSettings={openCandidateColumnSettings}
        onResetCandidateTableViewState={resetCandidateTableViewState}
        renderTypeControls={renderElectricalTypeControls}
        candidateFolderEmptyText={candidateFolderEmptyText}
        onDeleteCandidateFolder={showDeleteCandidateFolderConfirm}
        getCandidateCellState={getElectricalCandidateGlideCellState}
        onCandidateCellAction={handleElectricalCandidateGlideCellAction}
        getCandidateActionMenuItems={getElectricalCandidateGlideActionMenuItems}
        onSetCandidateColumnFilter={setCandidateColumnFilter}
        onResetCandidateColumnFilter={resetCandidateColumnFilter}
        onSetCandidateSort={setCandidateTableSort}
        onCandidateColumnResize={applyElectricalCandidateGlideColumnDraftWidth}
        onCandidateColumnResizeEnd={commitElectricalCandidateGlideColumnWidth}
      />
      <Modal
        open={candidateFolderModalOpen}
        title={candidateFolderModalMode === 'rename' ? 'Переименовать папку' : 'Новая папка'}
        okText={candidateFolderModalMode === 'rename' ? 'Сохранить' : 'Создать'}
        cancelText="Отмена"
        confirmLoading={createCandidateFolderMut.isPending || updateCandidateFolderMut.isPending}
        okButtonProps={{ disabled: !canMutate || candidateFolderName.trim().length === 0 }}
        onOk={submitCandidateFolderModal}
        onCancel={closeCandidateFolderModal}
      >
        <TltTextField
          autoFocus
          maxLength={64}
          value={candidateFolderName}
          placeholder="Название папки"
          aria-label="Название папки вариантов"
          disabled={!canMutate}
          onChange={setCandidateFolderName}
          onKeyDown={(event) => {
            if (event.key === 'Enter') submitCandidateFolderModal();
          }}
        />
      </Modal>
      {candidateColumnSettingsOpen && (
        <Suspense fallback={null}>
          <ElectricalCandidateColumnSettingsModal
            open={candidateColumnSettingsOpen}
            settings={draftCandidateTableColumnSettings}
            settingsLabelFormat={normalizedTableViewSettings.settingsLabelFormat}
            confirmLoading={updateCandidateTableColumnPreference.isPending}
            onOk={applyCandidateColumnSettings}
            onCancel={() => setCandidateColumnSettingsOpen(false)}
            onSelectAllColumns={selectAllDraftCandidateColumns}
            onResetColumns={resetDraftCandidateColumns}
            onVisibleChange={updateDraftCandidateColumn}
            onOrderChange={updateDraftCandidateColumnOrder}
            onColumnReorder={reorderDraftCandidateColumn}
            onWidthChange={updateDraftCandidateColumnWidth}
            onResetWidth={resetDraftCandidateColumnWidth}
          />
        </Suspense>
      )}
      {columnSettingsOpen && (
        <Suspense fallback={null}>
          <ElectricalColumnSettingsModal
            open={columnSettingsOpen}
            settings={draftTableColumnSettings}
            viewSettings={draftTableViewSettings}
            confirmLoading={
              updateTableColumnPreference.isPending || updateTableSettingsPreference.isPending
            }
            onOk={applyColumnSettings}
            onCancel={() => setColumnSettingsOpen(false)}
            onSelectAllColumns={selectAllDraftColumns}
            onResetColumns={resetDraftColumns}
            onVisibleChange={updateDraftColumn}
            onOrderChange={updateDraftColumnOrder}
            onColumnReorder={reorderDraftColumn}
            onWidthChange={updateDraftColumnWidth}
            onResetWidth={resetDraftColumnWidth}
            onFontSizeChange={updateDraftTableFontSize}
            onTableLabelFormatChange={updateDraftTableLabelFormat}
            onSettingsLabelFormatChange={updateDraftSettingsLabelFormat}
            onResetFontSize={resetDraftTableFontSize}
            onResetLabelFormats={resetDraftLabelFormats}
            recalculationSettings={renderRecalculationSettings()}
          />
        </Suspense>
      )}
    </>
  );
}

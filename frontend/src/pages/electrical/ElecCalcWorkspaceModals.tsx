/**
 * @module electrical/workspace-modals
 * @owner electrical
 */
import { lazy, Suspense, type ReactNode } from 'react';
import { Input, Modal } from 'antd';

import ElecCalcCableMarkModal from '@/pages/electrical/ElecCalcCableMarkModal';
import ElecCalcCableSizingModal from '@/pages/electrical/ElecCalcCableSizingModal';

const ElectricalCandidateColumnSettingsModal = lazy(
  () => import('@/components/electrical/ElectricalCandidateColumnSettingsModal'),
);
const ElectricalColumnSettingsModal = lazy(
  () => import('@/components/electrical/ElectricalColumnSettingsModal'),
);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ElecCalcWorkspaceModalsProps = Record<string, any>;

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
        <Input
          autoFocus
          maxLength={64}
          value={candidateFolderName}
          placeholder="Название папки"
          aria-label="Название папки вариантов"
          disabled={!canMutate}
          onChange={(event) => setCandidateFolderName(event.target.value)}
          onPressEnter={submitCandidateFolderModal}
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

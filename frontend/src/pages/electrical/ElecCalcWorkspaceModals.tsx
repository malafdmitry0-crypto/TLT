/**
 * @module electrical/workspace-modals
 * @owner electrical
 */
import { lazy, Suspense, type ReactNode } from 'react';

import ElecCalcCableMarkModal from '@/pages/electrical/ElecCalcCableMarkModal';
import type { ProjectObject } from '@/types/project';
import type { CableTypeKey } from '@/domain/electrical/elecCalcMainTableModel';
import type { CableMarkSelectOption } from '@/pages/electrical/elecCalcCableOptionModel';
import type { CableStatusRow } from '@/pages/electrical/elecCalcCableCatalogModel';
import type { ElecCalcAutoAvailability } from '@/pages/electrical/elecCalcAutoAvailabilityModel';
import type { CableTypeSelectOption } from '@/pages/electrical/elecCalcCableTypeOptionsModel';
import type {
  ElectricalColumnKey,
  ElectricalTableColumnSettings,
} from '@/utils/electricalTableColumns';
import type {
  ElectricalTableFontSize,
  ElectricalTableLabelFormat,
  ElectricalTableViewSettings,
} from '@/utils/electricalTableViewSettings';

const ElectricalColumnSettingsModal = lazy(
  () => import('@/components/electrical/ElectricalColumnSettingsModal'),
);

type PendingMutation = {
  isPending: boolean;
};

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
  cableMarkModalThreadCountValue: 'auto' | '1' | '2' | '3';
  cableMarkModalOptions: CableMarkSelectOption[];
  cableMarkModalAutoAvailability: ElecCalcAutoAvailability;
  retryCableMarkModalAutoAvailability: () => void;
  electricalVariantName: string;
  renderElectricalTypeControls: (
    cableType: CableTypeKey | null,
    options?: { block?: boolean },
  ) => ReactNode;
  changeCableMarkModalCableType: (nextType: CableTypeKey) => void;
  setCableMarkModalValue: (nextValue: string) => void;
  setCableMarkModalThreadCountValue: (nextValue: 'auto' | '1' | '2' | '3') => void;
  applyCableMarkModal: () => void;
  closeCableMarkModal: () => void;
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
    cableMarkModalThreadCountValue,
    cableMarkModalOptions,
    cableMarkModalAutoAvailability,
    retryCableMarkModalAutoAvailability,
    electricalVariantName,
    renderElectricalTypeControls,
    changeCableMarkModalCableType,
    setCableMarkModalValue,
    setCableMarkModalThreadCountValue,
    applyCableMarkModal,
    closeCableMarkModal,
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
        threadCountValue={cableMarkModalThreadCountValue}
        markOptions={cableMarkModalOptions}
        electricalVariantName={electricalVariantName}
        autoAvailability={cableMarkModalAutoAvailability}
        renderTypeControls={(nextCableType) =>
          renderElectricalTypeControls(nextCableType, { block: true })}
        onCableTypeChange={changeCableMarkModalCableType}
        onMarkChange={setCableMarkModalValue}
        onThreadCountChange={setCableMarkModalThreadCountValue}
        onApply={applyCableMarkModal}
        onRetryAutoAvailability={retryCableMarkModalAutoAvailability}
        onCancel={closeCableMarkModal}
      />
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

import { type ComponentProps, type ReactNode } from 'react';
import { Modal, Segmented } from 'antd';
import { CloseCircleOutlined, TableOutlined } from '@ant-design/icons';

import CablePickerCharacteristics from '@/components/electrical/CablePickerCharacteristics';
import ElecCalcCandidateCompareBar from '@/pages/electrical/ElecCalcCandidateCompareBar';
import ElecCalcCandidateFolderTabs from '@/pages/electrical/ElecCalcCandidateFolderTabs';
import ElecCalcCandidateTablePanel from '@/pages/electrical/ElecCalcCandidateTablePanel';
import ElecCalcSelectedCableSummary from '@/pages/electrical/ElecCalcSelectedCableSummary';
import { objectDisplayName, type CableTypeKey } from '@/domain/electrical/elecCalcMainTableModel';
import type { CableStatusRow } from '@/pages/electrical/elecCalcCableCatalogModel';
import type { useElecCalcCableReferenceData } from '@/pages/electrical/useElecCalcCableReferenceData';
import type { useElecCalcCableSizingModalState } from '@/pages/electrical/useElecCalcCableSizingModalState';
import type { useElecCalcCandidateState } from '@/pages/electrical/useElecCalcCandidateState';
import type { ElectricalCandidateFolder } from '@/types/calculation';
import { TltButton, TltSelect } from '@/components/ui-kit';

type CandidateTablePanelProps = ComponentProps<typeof ElecCalcCandidateTablePanel>;

type ElecCalcCableSizingModalProps = {
  canMutate: boolean;
  cableSizingModal: ReturnType<typeof useElecCalcCableSizingModalState>;
  candidate: ReturnType<typeof useElecCalcCandidateState>;
  selectedCable: CableStatusRow | null;
  commercialFeaturesAvailable: boolean;
  cableTypeOptions: { label: ReactNode; value: CableTypeKey }[];
  cableSizingManualOptions: ReturnType<typeof useElecCalcCableReferenceData>['cableSizingManualOptions'];
  candidateTableScrollX: number;
  candidateFontSizeKey: string;
  electricalCandidateGlideColumns: CandidateTablePanelProps['glideColumns'];
  candidateTableViewState: CandidateTablePanelProps['tableViewState'];
  candidateTableViewActive: boolean;
  normalizeAvailableCableType: (type: CableTypeKey) => CableTypeKey;
  onClose: () => void;
  onResetConnectionType: () => void;
  onOpenCandidateColumnSettings: () => void;
  onResetCandidateTableViewState: () => void;
  renderTypeControls: (cableType: CableTypeKey | null, options?: { block?: boolean }) => ReactNode;
  candidateFolderEmptyText: () => ReactNode;
  onDeleteCandidateFolder: (folder: ElectricalCandidateFolder) => void;
  getCandidateCellState: CandidateTablePanelProps['getCellState'];
  onCandidateCellAction: CandidateTablePanelProps['onCellAction'];
  getCandidateActionMenuItems: CandidateTablePanelProps['getActionMenuItems'];
  onSetCandidateColumnFilter: CandidateTablePanelProps['onSetColumnFilter'];
  onResetCandidateColumnFilter: CandidateTablePanelProps['onResetColumnFilter'];
  onSetCandidateSort: CandidateTablePanelProps['onSetSort'];
  onCandidateColumnResize: CandidateTablePanelProps['onColumnResize'];
  onCandidateColumnResizeEnd: CandidateTablePanelProps['onColumnResizeEnd'];
};

/** Модалка подбора кабеля (cable sizing) с таблицей кандидатов, папками и compare. */
export default function ElecCalcCableSizingModal({
  canMutate,
  cableSizingModal,
  candidate,
  selectedCable,
  commercialFeaturesAvailable,
  cableTypeOptions,
  cableSizingManualOptions,
  candidateTableScrollX,
  candidateFontSizeKey,
  electricalCandidateGlideColumns,
  candidateTableViewState,
  candidateTableViewActive,
  normalizeAvailableCableType,
  onClose,
  onResetConnectionType,
  onOpenCandidateColumnSettings,
  onResetCandidateTableViewState,
  renderTypeControls,
  candidateFolderEmptyText,
  onDeleteCandidateFolder,
  getCandidateCellState,
  onCandidateCellAction,
  getCandidateActionMenuItems,
  onSetCandidateColumnFilter,
  onResetCandidateColumnFilter,
  onSetCandidateSort,
  onCandidateColumnResize,
  onCandidateColumnResizeEnd,
}: ElecCalcCableSizingModalProps) {
  const {
    object,
    calc,
    mode,
    setMode,
    cableType,
    setCableType,
    manualMark,
    setManualMark,
    effectiveCableType,
  } = cableSizingModal;

  return (
    <Modal
      open={!!object}
      width="100vw"
      style={{ top: 0, maxWidth: 'none', paddingBottom: 0 }}
      className="electrical-cable-picker-dialog electrical-cable-sizing-dialog"
      title={object ? `Подбор кабеля для ${objectDisplayName(object)}` : 'Подбор'}
      footer={null}
      onCancel={onClose}
    >
      <div className="electrical-cable-sizing-body">
        {object && (
          <CablePickerCharacteristics
            object={object}
            cable={selectedCable}
            cableType={effectiveCableType}
            showCable={false}
            objectColumnCount={4}
          />
        )}
        <div className="electrical-cable-sizing-controls">
          <Segmented<'auto' | 'manual'>
            aria-label="Режим подбора кабеля"
            size="small"
            value={mode}
            disabled={!canMutate}
            onChange={setMode}
            options={[
              { label: 'Авторасчёт', value: 'auto' },
              { label: 'Ручной расчёт', value: 'manual' },
            ]}
          />
          <TltSelect
            aria-label="Тип кабеля для подбора"
            value={effectiveCableType}
            disabled={!canMutate || !commercialFeaturesAvailable}
            onChange={(nextType) => {
              if (nextType == null) return;
              setCableType(normalizeAvailableCableType(String(nextType) as CableTypeKey));
              setManualMark(null);
              onResetConnectionType();
            }}
            options={cableTypeOptions} className="tlt-field--min-w220"
          />
          {mode === 'manual' && (
            <TltSelect
              aria-label="Марка ручного кандидата"
              value={manualMark ?? undefined}
              placeholder="Марка"
              disabled={!canMutate}
              options={cableSizingManualOptions
                .filter((option) => option.mark)
                .map((option) => ({
                  ...option,
                  value: option.mark!,
                }))} className="tlt-field--min-w280"
              onChange={(value) => setManualMark(value == null ? null : String(value))}
            />
          )}
          <TltButton
            size="compact"
            variant="primary"
            disabled={
              !canMutate ||
              !object ||
              (mode === 'manual' && !manualMark)
            }
            onClick={() => candidate.createCandidateMut.mutate({
              mode,
              mark: manualMark,
            })}
          >
            {mode === 'auto' ? 'Запустить авторасчёт' : 'Рассчитать вариант'}
          </TltButton>
          <TltButton
            size="compact"
            icon={<TableOutlined />}
            aria-label="Настройки таблицы"
            onClick={() => onOpenCandidateColumnSettings()}
          >
            Настройки таблицы
          </TltButton>
          <TltButton
            size="compact"
            icon={<CloseCircleOutlined />}
            aria-label="Сбросить фильтры таблицы кандидатов"
            disabled={!candidateTableViewActive}
            onClick={onResetCandidateTableViewState}
          >
            Сбросить фильтры
          </TltButton>
        </div>
        {canMutate ? (
          renderTypeControls(effectiveCableType, { block: true })
        ) : (
          <fieldset disabled className="electrical-fieldset-reset">
            {renderTypeControls(effectiveCableType, { block: true })}
          </fieldset>
        )}
        <ElecCalcSelectedCableSummary
          appliedCandidate={candidate.appliedCableSizingCandidate}
          calc={calc}
          fallbackCableType={cableType}
        />
        <ElecCalcCandidateFolderTabs
          canMutate={canMutate}
          activeKey={candidate.activeCandidateFolderKey}
          counts={candidate.candidateFolderCounts}
          folders={candidate.cableSizingCandidateFolders}
          onSelectFolder={candidate.setActiveCandidateFolderKey}
          onCreateFolder={candidate.openCreateCandidateFolderModal}
          onRenameFolder={candidate.openRenameCandidateFolderModal}
          onDeleteFolder={onDeleteCandidateFolder}
        />
        <ElecCalcCandidateCompareBar
          active={candidate.cableSizingCandidateCompareActive}
          markedCount={candidate.displayedMarkedCableSizingCandidates.length}
          diffCount={candidate.candidateCompareDiffColumnKeys.size}
          onReset={candidate.resetMarkedCableSizingCandidates}
        />
        <ElecCalcCandidateTablePanel
          canMutate={canMutate}
          loading={false}
          rows={candidate.displayedCableSizingCandidates}
          glideColumns={electricalCandidateGlideColumns}
          tableScrollX={candidateTableScrollX}
          fontSizeKey={candidateFontSizeKey}
          tableViewState={candidateTableViewState}
          emptyContent={candidateFolderEmptyText()}
          rowClassName={candidate.cableSizingCandidateRowClassName}
          getCellState={getCandidateCellState}
          onToggleMarked={candidate.toggleElectricalCandidateGlideMarked}
          onCellAction={onCandidateCellAction}
          getActionMenuItems={getCandidateActionMenuItems}
          onSetColumnFilter={onSetCandidateColumnFilter}
          onResetColumnFilter={onResetCandidateColumnFilter}
          onSetSort={onSetCandidateSort}
          onColumnResize={onCandidateColumnResize}
          onColumnResizeEnd={onCandidateColumnResizeEnd}
          appliedCandidate={candidate.appliedCableSizingCandidate}
          onAppliedCandidateCommentBlur={(appliedCandidate, nextComment) => {
            if ((appliedCandidate.engineer_comment ?? '') === nextComment) return;
            candidate.updateCandidateMut.mutate({
              candidateId: appliedCandidate.id,
              patch: { engineer_comment: nextComment },
            });
          }}
        />
      </div>
    </Modal>
  );
}

import type { ReactNode } from 'react';
import {
  Checkbox,
  Popconfirm,
  Segmented,
  Tooltip,
} from 'antd';
import {
  AppstoreOutlined,
  CloseCircleOutlined,
  CopyOutlined,
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  ReloadOutlined,
  SaveOutlined,
  StopOutlined,
  TableOutlined,
} from '@ant-design/icons';

import ImportExcelButton from '@/components/ImportExcelButton';
import ExportObjectsButton from '@/components/ExportObjectsButton';
import type { ActiveObjectScope } from '@/pages/heatcalc/useHeatCalcTableState';
import { TltBadge, TltButton } from '@/components/ui-kit';

export type HeatCalcToolbarEditingMode = 'normal' | 'excel';

export type HeatCalcTypeToolbarProps = {
  activeObjectScope: ActiveObjectScope;
  pipeButtonCountText: string;
  tankButtonCountText: string;
  allButtonCountText: string;
  pipeIcon: ReactNode;
  tankIcon: ReactNode;
  formBlockVisible: boolean;
  formCaptionMode: string;
  formCaptionModeLabel: string;
  onObjectScopeChange: (scope: ActiveObjectScope) => void;
  onFormBlockVisibilityChange: (checked: boolean) => void;
  /** PDF UI-PDF-01: primary CTA to electrical with readiness gate. */
  onContinueToElectrical?: () => void;
  continueToElectricalDisabled?: boolean;
  continueToElectricalTooltip?: string;
};

export type HeatCalcActionsToolbarProps = {
  formActions: {
    visible: boolean;
    saveTooltip: string;
    saveDisabled: boolean;
    saveLoading: boolean;
    deleteTargetCount: number;
    deleteLoading: boolean;
    onAdd: () => void;
    onSave: () => void;
    onDeleteSelected: () => void;
  };
  tableActions: {
    editingMode: HeatCalcToolbarEditingMode;
    commercialFeaturesAvailable: boolean;
    tableFindabilityAvailable: boolean;
    recalcTooltip: string;
    recalcAriaLabel: string;
    recalcLoading: boolean;
    recalcDisabled: boolean;
    recalcAllTooltip: string;
    recalcAllDisabled: boolean;
    jobActive: boolean;
    jobId: string | null;
    cancelJobLoading: boolean;
    currentTableViewActive: boolean;
    draftControlsVisible: boolean;
    dirtyDraftRowCount: number;
    saveTargetCount: number;
    inlineDraftSaving: boolean;
    draftDiscardLabel: string;
    selectedObjectCount: number;
    duplicateLoading: boolean;
    onEditingModeChange: (value: string | number) => void;
    onRecalcScoped: () => void;
    onRecalcAll: () => void;
    onCancelJob: () => void;
    onOpenSettings: () => void;
    onResetCurrentTableView: () => void;
    onDiscardDrafts: () => void;
    onDuplicateSelected: () => void;
    onOpenGroupUpdate: () => void;
  };
  importExport: {
    projectId: string;
    projectName: string;
    existingObjectCount: number;
    canExport: boolean;
  };
};

export function HeatCalcTypeToolbar({
  activeObjectScope,
  pipeButtonCountText,
  tankButtonCountText,
  allButtonCountText,
  pipeIcon,
  tankIcon,
  formBlockVisible,
  formCaptionMode,
  formCaptionModeLabel,
  onObjectScopeChange,
  onFormBlockVisibilityChange,
  onContinueToElectrical,
  continueToElectricalDisabled = false,
  continueToElectricalTooltip = 'Перейти к электротехническому расчёту',
}: HeatCalcTypeToolbarProps) {
  return (
    <div className="actionbar-srs actionbar-type-row" role="toolbar" aria-label="Тип объекта и блок параметров">
      <div className="actionbar-group actionbar-type-group" aria-label="Тип объекта">
        <TltButton
          className="action-type-button"
          variant={activeObjectScope === 'pipe' ? 'primary' : 'secondary'}
          icon={pipeIcon}
          aria-label={`Трубопровод: ${pipeButtonCountText}`}
          aria-pressed={activeObjectScope === 'pipe'}
          onClick={() => onObjectScopeChange('pipe')}
        >
          Трубопровод: <strong className="action-type-count">{pipeButtonCountText}</strong>
        </TltButton>
        <TltButton
          className="action-type-button"
          variant={activeObjectScope === 'tank' ? 'primary' : 'secondary'}
          icon={tankIcon}
          aria-label={`Резервуар: ${tankButtonCountText}`}
          aria-pressed={activeObjectScope === 'tank'}
          onClick={() => onObjectScopeChange('tank')}
        >
          Резервуар: <strong className="action-type-count">{tankButtonCountText}</strong>
        </TltButton>
        <TltButton
          className="action-type-button"
          variant={activeObjectScope === 'all' ? 'primary' : 'secondary'}
          icon={<AppstoreOutlined />}
          aria-label={`Все: ${allButtonCountText}`}
          aria-pressed={activeObjectScope === 'all'}
          onClick={() => onObjectScopeChange('all')}
        >
          Все: <strong className="action-type-count">{allButtonCountText}</strong>
        </TltButton>
        <Tooltip title="Пол — будущее расширение PDF; расчёт не входит в MVP">
          <TltButton
            className="action-type-button"
            disabled
            aria-label="Пол (недоступно)"
            aria-disabled
          >
            Пол
          </TltButton>
        </Tooltip>
      </div>

      <div className="actionbar-group actionbar-form-state-group">
        {formBlockVisible && (
          <TltBadge className={`actionbar-mode-tag ${formCaptionMode}`}>
            {formCaptionModeLabel}
          </TltBadge>
        )}
        <Checkbox
          className="actionbar-form-toggle"
          checked={formBlockVisible}
          onChange={(event) => onFormBlockVisibilityChange(event.target.checked)}
        >
          Показать блок заполнения параметров
        </Checkbox>
        {onContinueToElectrical && (
          <Tooltip title={continueToElectricalTooltip}>
            <span className="action-tooltip-wrap">
              <TltButton
                variant="primary"
                data-testid="heat-continue-to-electrical"
                disabled={continueToElectricalDisabled}
                onClick={onContinueToElectrical}
                aria-label="Далее. Электротехнический расчёт"
              >
                Далее → Электротехнический расчёт
              </TltButton>
            </span>
          </Tooltip>
        )}
      </div>
    </div>
  );
}

export function HeatCalcActionsToolbar({
  formActions,
  tableActions,
  importExport,
}: HeatCalcActionsToolbarProps) {
  return (
    <div className="actionbar-srs actionbar-actions-row">
      {formActions.visible && (
        <div className="actionbar-form-actions-row" role="toolbar" aria-label="Действия блока заполнения">
          <div className="actionbar-group actionbar-form-actions-group">
            <Tooltip title="Добавить">
              <TltButton
                variant="primary"
                className="action-add-button add"
                icon={<PlusOutlined />}
                aria-label="Добавить"
                onClick={() => formActions.onAdd()}
              >
                Добавить
              </TltButton>
            </Tooltip>

            <Tooltip title={formActions.saveTooltip}>
              <span className="action-tooltip-wrap">
                <TltButton
                  className="action-save-button save"
                  icon={<SaveOutlined />}
                  aria-label="Сохранить"
                  disabled={formActions.saveDisabled}
                  loading={formActions.saveLoading}
                  onClick={formActions.onSave}
                >
                  Сохранить
                </TltButton>
              </span>
            </Tooltip>
            <Tooltip title={formActions.deleteTargetCount === 0 ? 'Выберите строки для удаления' : 'Удалить выбранные'}>
              <span className="action-tooltip-wrap">
                <Popconfirm
                  title={formActions.deleteTargetCount > 1
                    ? `Удалить выбранные строки: ${formActions.deleteTargetCount}?`
                    : 'Удалить выбранную строку?'}
                  okText="Удалить"
                  cancelText="Отмена"
                  disabled={formActions.deleteTargetCount === 0}
                  onConfirm={formActions.onDeleteSelected}
                >
                  <TltButton variant="danger"
                    className="action-secondary-button"
                    icon={<DeleteOutlined />}
                    aria-label="Удалить выбранные"
                    loading={formActions.deleteLoading}
                    disabled={formActions.deleteTargetCount === 0}
                  >
                    Удалить
                  </TltButton>
                </Popconfirm>
              </span>
            </Tooltip>
          </div>
        </div>
      )}

      <div className="actionbar-table-actions-row" role="toolbar" aria-label="Действия таблицы объектов">
        <div className="actionbar-group actionbar-table-actions-group">
          <Segmented size="small"
            value={tableActions.editingMode}
            options={[
              { label: 'Обычный режим', value: 'normal' },
              { label: 'Excel-режим', value: 'excel' },
            ]}
            onChange={tableActions.onEditingModeChange}
          />
          <Tooltip title={tableActions.recalcTooltip}>
            <span className="action-tooltip-wrap">
              <TltButton
                className="action-secondary-button"
                icon={<ReloadOutlined />}
                aria-label={tableActions.recalcAriaLabel}
                loading={tableActions.recalcLoading}
                disabled={tableActions.recalcDisabled}
                onClick={tableActions.onRecalcScoped}
              >
                Пересчитать
              </TltButton>
            </span>
          </Tooltip>
          <Tooltip title={tableActions.recalcAllTooltip}>
            <span className="action-tooltip-wrap">
              <TltButton
                className="action-secondary-button action-recalc-all-button"
                icon={<ReloadOutlined />}
                aria-label="Пересчитать все"
                loading={tableActions.recalcLoading}
                disabled={tableActions.recalcAllDisabled}
                onClick={tableActions.onRecalcAll}
              >
                Пересчитать все
              </TltButton>
            </span>
          </Tooltip>
          {tableActions.jobActive && tableActions.jobId && (
            <Tooltip title="Отменить пересчёт теплопотерь">
              <TltButton variant="danger"
                className="action-secondary-button"
                icon={<StopOutlined />}
                aria-label="Отменить пересчёт теплопотерь"
                loading={tableActions.cancelJobLoading}
                onClick={tableActions.onCancelJob}
              >
                Отменить пересчёт
              </TltButton>
            </Tooltip>
          )}
          <Tooltip title="Настройки отображения">
            <span className="action-tooltip-wrap">
              <TltButton
                className="action-secondary-button"
                icon={<TableOutlined />}
                aria-label="Настройки отображения"
                onClick={tableActions.onOpenSettings}
              >
                Настройки
              </TltButton>
            </span>
          </Tooltip>
          {tableActions.tableFindabilityAvailable && (
            <Tooltip title={tableActions.currentTableViewActive ? 'Сбросить фильтры и сортировку' : 'Фильтры не активны'}>
              <span className="action-tooltip-wrap">
                <TltButton
                  className="action-secondary-button"
                  icon={<CloseCircleOutlined />}
                  aria-label="Сбросить фильтры таблицы"
                  disabled={!tableActions.currentTableViewActive}
                  onClick={tableActions.onResetCurrentTableView}
                >
                  Сбросить фильтры
                </TltButton>
              </span>
            </Tooltip>
          )}
          {tableActions.draftControlsVisible && (
            <>
              <TltBadge tone={tableActions.dirtyDraftRowCount > 0 ? 'warning' : 'neutral'} className="inline-draft-status-tag">
                Несохранено: {tableActions.dirtyDraftRowCount}
              </TltBadge>
              <TltButton
                size="compact"
                disabled={tableActions.saveTargetCount === 0 || tableActions.inlineDraftSaving}
                onClick={tableActions.onDiscardDrafts}
              >
                {tableActions.draftDiscardLabel}
              </TltButton>
            </>
          )}
          <Tooltip
            title={
              tableActions.selectedObjectCount > 0
                ? `Добавить копии выбранных объектов: ${tableActions.selectedObjectCount}`
                : 'Выберите галочками один или несколько объектов для копирования'
            }
          >
            <span className="action-tooltip-wrap">
              <TltButton
                className="action-secondary-button"
                icon={<CopyOutlined />}
                aria-label="Добавить на основании"
                disabled={tableActions.selectedObjectCount === 0 || tableActions.duplicateLoading}
                loading={tableActions.duplicateLoading}
                onClick={tableActions.onDuplicateSelected}
              >
                Добавить на основании
              </TltButton>
            </span>
          </Tooltip>
          <Tooltip
            title={
              tableActions.selectedObjectCount > 0
                ? 'Изменить один параметр у выбранных объектов'
                : 'Выберите галочками объекты для групповой корректировки'
            }
          >
            <span className="action-tooltip-wrap">
              <TltButton
                className="action-secondary-button"
                icon={<EditOutlined />}
                aria-label="Групповая корректировка"
                disabled={tableActions.selectedObjectCount === 0}
                onClick={tableActions.onOpenGroupUpdate}
              >
                Групповая корректировка
              </TltButton>
            </span>
          </Tooltip>
          <ImportExcelButton
            projectId={importExport.projectId}
            existingObjectCount={importExport.existingObjectCount}
          />
          {importExport.canExport && (
            <ExportObjectsButton
              projectId={importExport.projectId}
              projectName={importExport.projectName}
              disabled={importExport.existingObjectCount === 0}
            />
          )}
        </div>
      </div>
    </div>
  );
}

import type { ReactNode } from 'react';
import {
  Button,
  Checkbox,
  Popconfirm,
  Segmented,
  Tag,
  Tooltip,
} from 'antd';
import {
  AppstoreOutlined,
  CloseCircleOutlined,
  CopyOutlined,
  DeleteOutlined,
  PlusOutlined,
  ReloadOutlined,
  SaveOutlined,
  StopOutlined,
  TableOutlined,
} from '@ant-design/icons';

import ImportExcelButton from '@/components/ImportExcelButton';
import ExportObjectsButton from '@/components/ExportObjectsButton';
import type { ActiveObjectScope } from '@/pages/heatcalc/useHeatCalcTableState';

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
}: HeatCalcTypeToolbarProps) {
  return (
    <div className="actionbar-srs actionbar-type-row" role="toolbar" aria-label="Тип объекта и блок параметров">
      <div className="actionbar-group actionbar-type-group" aria-label="Тип объекта">
        <Button
          className="action-type-button"
          type={activeObjectScope === 'pipe' ? 'primary' : 'default'}
          icon={pipeIcon}
          aria-label={`Трубопровод: ${pipeButtonCountText}`}
          aria-pressed={activeObjectScope === 'pipe'}
          onClick={() => onObjectScopeChange('pipe')}
        >
          Трубопровод: <strong className="action-type-count">{pipeButtonCountText}</strong>
        </Button>
        <Button
          className="action-type-button"
          type={activeObjectScope === 'tank' ? 'primary' : 'default'}
          icon={tankIcon}
          aria-label={`Резервуар: ${tankButtonCountText}`}
          aria-pressed={activeObjectScope === 'tank'}
          onClick={() => onObjectScopeChange('tank')}
        >
          Резервуар: <strong className="action-type-count">{tankButtonCountText}</strong>
        </Button>
        <Button
          className="action-type-button"
          type={activeObjectScope === 'all' ? 'primary' : 'default'}
          icon={<AppstoreOutlined />}
          aria-label={`Все: ${allButtonCountText}`}
          aria-pressed={activeObjectScope === 'all'}
          onClick={() => onObjectScopeChange('all')}
        >
          Все: <strong className="action-type-count">{allButtonCountText}</strong>
        </Button>
      </div>

      <div className="actionbar-group actionbar-form-state-group">
        {formBlockVisible && (
          <Tag className={`actionbar-mode-tag ${formCaptionMode}`}>
            {formCaptionModeLabel}
          </Tag>
        )}
        <Checkbox
          className="actionbar-form-toggle"
          checked={formBlockVisible}
          onChange={(event) => onFormBlockVisibilityChange(event.target.checked)}
        >
          Показать блок заполнения параметров
        </Checkbox>
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
              <Button
                type="primary"
                className="action-icon-button action-add-button add"
                icon={<PlusOutlined />}
                aria-label="Добавить"
                onClick={() => formActions.onAdd()}
              />
            </Tooltip>

            <Tooltip title={formActions.saveTooltip}>
              <span className="action-tooltip-wrap">
                <Button
                  className="action-icon-button action-save-button save"
                  icon={<SaveOutlined />}
                  aria-label="Сохранить"
                  disabled={formActions.saveDisabled}
                  loading={formActions.saveLoading}
                  onClick={formActions.onSave}
                />
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
                  <Button
                    danger
                    className="action-icon-button action-secondary-button"
                    icon={<DeleteOutlined />}
                    aria-label="Удалить выбранные"
                    loading={formActions.deleteLoading}
                    disabled={formActions.deleteTargetCount === 0}
                  />
                </Popconfirm>
              </span>
            </Tooltip>
          </div>
        </div>
      )}

      <div className="actionbar-table-actions-row" role="toolbar" aria-label="Действия таблицы объектов">
        <div className="actionbar-group actionbar-table-actions-group">
          <Segmented
            size="small"
            value={tableActions.editingMode}
            options={[
              { label: 'Обычный режим', value: 'normal' },
              { label: 'Excel-режим', value: 'excel' },
            ]}
            onChange={tableActions.onEditingModeChange}
          />
          <Tooltip title={tableActions.recalcTooltip}>
            <span className="action-tooltip-wrap">
              <Button
                className="action-icon-button action-secondary-button"
                icon={<ReloadOutlined />}
                aria-label={tableActions.recalcAriaLabel}
                loading={tableActions.recalcLoading}
                disabled={tableActions.recalcDisabled}
                onClick={tableActions.onRecalcScoped}
              />
            </span>
          </Tooltip>
          <Tooltip title={tableActions.recalcAllTooltip}>
            <span className="action-tooltip-wrap">
              <Button
                className="action-secondary-button action-recalc-all-button"
                icon={<ReloadOutlined />}
                aria-label="Пересчитать все"
                loading={tableActions.recalcLoading}
                disabled={tableActions.recalcAllDisabled}
                onClick={tableActions.onRecalcAll}
              >
                Пересчитать все
              </Button>
            </span>
          </Tooltip>
          {tableActions.jobActive && tableActions.jobId && (
            <Tooltip title="Отменить пересчёт теплопотерь">
              <Button
                danger
                className="action-icon-button action-secondary-button"
                icon={<StopOutlined />}
                aria-label="Отменить пересчёт теплопотерь"
                loading={tableActions.cancelJobLoading}
                onClick={tableActions.onCancelJob}
              />
            </Tooltip>
          )}
          <Tooltip title="Настройки отображения">
            <span className="action-tooltip-wrap">
              <Button
                className="action-icon-button action-secondary-button"
                icon={<TableOutlined />}
                aria-label="Настройки отображения"
                onClick={tableActions.onOpenSettings}
              />
            </span>
          </Tooltip>
          <Tooltip title={tableActions.currentTableViewActive ? 'Сбросить фильтры и сортировку' : 'Фильтры не активны'}>
            <span className="action-tooltip-wrap">
              <Button
                className="action-icon-button action-secondary-button"
                icon={<CloseCircleOutlined />}
                aria-label="Сбросить фильтры таблицы"
                disabled={!tableActions.currentTableViewActive}
                onClick={tableActions.onResetCurrentTableView}
              />
            </span>
          </Tooltip>
          {tableActions.draftControlsVisible && (
            <>
              <Tag color={tableActions.dirtyDraftRowCount > 0 ? 'gold' : 'default'} className="inline-draft-status-tag">
                Несохранено: {tableActions.dirtyDraftRowCount}
              </Tag>
              <Button
                size="small"
                disabled={tableActions.saveTargetCount === 0 || tableActions.inlineDraftSaving}
                onClick={tableActions.onDiscardDrafts}
              >
                {tableActions.draftDiscardLabel}
              </Button>
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
              <Button
                className="action-icon-button action-secondary-button"
                icon={<CopyOutlined />}
                aria-label="Добавить копии выбранных"
                disabled={tableActions.selectedObjectCount === 0 || tableActions.duplicateLoading}
                loading={tableActions.duplicateLoading}
                onClick={tableActions.onDuplicateSelected}
              />
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

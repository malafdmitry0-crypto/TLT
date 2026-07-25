import { memo, type ReactNode } from 'react';
import {
  Popconfirm,
  Space,
  Tooltip,
  Typography,
  type SelectProps,
} from 'antd';
import { TltButton, TltSelect } from '@/components/ui-kit';
import {
  CloseCircleOutlined,
  ReloadOutlined,
  StopOutlined,
  TableOutlined,
} from '@ant-design/icons';

import {
  CABLE_TYPE_LABEL,
  type CableTypeKey,
} from '@/domain/electrical/elecCalcMainTableModel';

const { Text } = Typography;

interface ElectricalBatchActionBarProps {
  canMutate: boolean;
  variantName: string;
  cableTypeControlLabel: string;
  cableTypeOptions: SelectProps<CableTypeKey>['options'];
  visibleCableTypeControl?: CableTypeKey | null;
  typeControls: ReactNode;
  isJobActive: boolean;
  selectedManualCableCount: number;
  selectedValidObjectsCount: number;
  selectedHeatLossFailedCount: number;
  manualCableCount: number;
  overwriteManualChoices: boolean;
  selectedRecalcDisabled: boolean;
  selectedRecalcTooltip: ReactNode;
  selectedRecalcCountLabel: ReactNode;
  batchPending: boolean;
  validObjectsCount: number;
  cableTypeForRecalculation: CableTypeKey;
  activeJobId: string | null;
  cancelJobPending: boolean;
  currentTableViewActive: boolean;
  renderManualOverwriteControl: (manualCount: number) => ReactNode;
  onCableTypeChange: (nextType: CableTypeKey) => void;
  onManualOverwritePromptOpen: () => void;
  onRecalculateSelected: (skipManual: boolean) => void;
  onRecalculateAll: (skipManual: boolean) => void;
  onCancelJob: () => void;
  onOpenColumnSettings: () => void;
  onResetFilters: () => void;
}

function ElectricalBatchActionBar({
  canMutate,
  variantName,
  cableTypeControlLabel,
  cableTypeOptions,
  visibleCableTypeControl,
  typeControls,
  isJobActive,
  selectedManualCableCount,
  selectedValidObjectsCount,
  selectedHeatLossFailedCount,
  manualCableCount,
  overwriteManualChoices,
  selectedRecalcDisabled,
  selectedRecalcTooltip,
  selectedRecalcCountLabel,
  batchPending,
  validObjectsCount,
  cableTypeForRecalculation,
  activeJobId,
  cancelJobPending,
  currentTableViewActive,
  renderManualOverwriteControl,
  onCableTypeChange,
  onManualOverwritePromptOpen,
  onRecalculateSelected,
  onRecalculateAll,
  onCancelJob,
  onOpenColumnSettings,
  onResetFilters,
}: ElectricalBatchActionBarProps) {
  const resetManualOverwriteWhenOpen = (open: boolean) => {
    if (open) onManualOverwritePromptOpen();
  };

  return (
    <div className="actionbar-srs electrical-actionbar">
      <div className="electrical-actionbar-row electrical-actionbar-row--setup">
        <Text className="electrical-params-label">
          {cableTypeControlLabel}
        </Text>
        <TltSelect
          aria-label="Тип кабеля для пересчёта"
          value={visibleCableTypeControl ?? undefined}
          placeholder="Несколько типов"
          disabled={!canMutate || isJobActive}
          onChange={(value) => {
            if (value != null) onCableTypeChange(value as CableTypeKey);
          }}
          options={(cableTypeOptions ?? []).map((option) => ({
            value: option.value as string,
            label: option.label ?? String(option.value),
            disabled: option.disabled,
          }))} className="tlt-field--w210"
        />
        {typeControls}
      </div>
      <div className="electrical-actionbar-row electrical-actionbar-row--actions">
        {selectedManualCableCount > 0 ? (
          <Popconfirm
            title="Пересчитать выбранные объекты?"
            description={(
              <Space direction="vertical" size={8}>
                <Text>
                  Будет обработано выбранных объектов с рассчитанными теплопотерями: {selectedValidObjectsCount}.
                </Text>
                {selectedHeatLossFailedCount > 0 && (
                  <Text type="secondary">
                    Без рассчитанных теплопотерь будет пропущено: {selectedHeatLossFailedCount}.
                  </Text>
                )}
                {renderManualOverwriteControl(selectedManualCableCount)}
              </Space>
            )}
            okText="Пересчитать"
            okButtonProps={{ danger: overwriteManualChoices }}
            cancelText="Отмена"
            onOpenChange={resetManualOverwriteWhenOpen}
            onConfirm={() => onRecalculateSelected(!overwriteManualChoices)}
            disabled={!canMutate || selectedRecalcDisabled}
          >
            <Tooltip title={canMutate ? selectedRecalcTooltip : 'Только владелец проекта или администратор может пересчитывать ЭР'}>
              <span>
                <TltButton
                  size="compact"
                  variant="primary"
                  icon={<ReloadOutlined />}
                  loading={batchPending || isJobActive}
                  disabled={!canMutate || selectedRecalcDisabled}
                >
                  Пересчитать выбранные ({selectedRecalcCountLabel})
                </TltButton>
              </span>
            </Tooltip>
          </Popconfirm>
        ) : (
          <Tooltip title={canMutate ? selectedRecalcTooltip : 'Только владелец проекта или администратор может пересчитывать ЭР'}>
            <span>
              <TltButton
                size="compact"
                variant="primary"
                icon={<ReloadOutlined />}
                loading={batchPending || isJobActive}
                disabled={!canMutate || selectedRecalcDisabled}
                onClick={() => onRecalculateSelected(true)}
              >
                Пересчитать выбранные ({selectedRecalcCountLabel})
              </TltButton>
            </span>
          </Tooltip>
        )}
        <Popconfirm
          title={`Пересчитать все объекты «${variantName}»?`}
          description={(
            <Space direction="vertical" size={8}>
              <Text>
                {manualCableCount > 0
                  ? `Назначенные строки без ручной марки в «${variantName}» будут пересчитаны с типом `
                  : `Назначенные объекты в «${variantName}» будут пересчитаны с типом `}
                «{CABLE_TYPE_LABEL[cableTypeForRecalculation]}». Backend ограничит операцию
                точным UUID ЭР и совместимой системой; нераспределённые и другие системы
                останутся без изменений.
              </Text>
              {renderManualOverwriteControl(manualCableCount)}
            </Space>
          )}
          okText="Да, пересчитать все"
          okButtonProps={{ danger: true }}
          cancelText="Отмена"
          onOpenChange={resetManualOverwriteWhenOpen}
          onConfirm={() => onRecalculateAll(!overwriteManualChoices)}
          disabled={!canMutate || validObjectsCount === 0 || isJobActive}
        >
          <TltButton
            size="compact"
            variant="danger"
            icon={<ReloadOutlined />}
            loading={batchPending || isJobActive}
            disabled={!canMutate || validObjectsCount === 0 || isJobActive}
          >
            Пересчитать все · {variantName}
          </TltButton>
        </Popconfirm>
        {isJobActive && activeJobId && (
          <TltButton
            size="compact"
            variant="danger"
            icon={<StopOutlined />}
            loading={cancelJobPending}
            disabled={!canMutate}
            onClick={onCancelJob}
          >
            Отменить
          </TltButton>
        )}
        <TltButton
          size="compact"
          icon={<TableOutlined />}
          aria-label="Настройки"
          onClick={onOpenColumnSettings}
        >
          Настройки
        </TltButton>
        <Tooltip title={currentTableViewActive ? 'Сбросить фильтры и сортировку' : 'Фильтры не активны'}>
          <span className="action-tooltip-wrap">
            <TltButton
              size="compact"
              icon={<CloseCircleOutlined />}
              aria-label="Сбросить фильтры таблицы"
              disabled={!currentTableViewActive}
              onClick={onResetFilters}
            >
              Сбросить фильтры
            </TltButton>
          </span>
        </Tooltip>
      </div>
    </div>
  );
}

export default memo(ElectricalBatchActionBar);

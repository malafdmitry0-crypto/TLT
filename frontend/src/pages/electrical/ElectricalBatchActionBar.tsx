import { memo, type ReactNode } from 'react';
import {
  Popconfirm,
  Space,
  Tooltip,
  Typography,
} from 'antd';
import { TltButton } from '@/components/ui-kit';
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

export { ElectricalVariantSetAction } from '@/pages/electrical/ElectricalVariantSetAction';

const { Text } = Typography;

interface ElectricalBatchActionBarProps {
  canMutate: boolean;
  variantName: string;
  typeControls: ReactNode;
  multiVariantAction?: ReactNode;
  isJobActive: boolean;
  selectedManualCableCount: number;
  selectedValidObjectsCount: number;
  selectedHeatLossFailedCount: number;
  manualCableCount: number;
  overwriteManualChoices: boolean;
  selectedRecalcDisabled: boolean;
  selectedRecalcTooltip: ReactNode;
  calculationBlockedReason: string | null;
  selectedRecalcCountLabel: ReactNode;
  batchPending: boolean;
  validObjectsCount: number;
  cableTypeForRecalculation: CableTypeKey;
  activeJobId: string | null;
  cancelJobPending: boolean;
  currentTableViewActive: boolean;
  renderManualOverwriteControl: (manualCount: number) => ReactNode;
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
  typeControls,
  multiVariantAction,
  isJobActive,
  selectedManualCableCount,
  selectedValidObjectsCount,
  selectedHeatLossFailedCount,
  manualCableCount,
  overwriteManualChoices,
  selectedRecalcDisabled,
  selectedRecalcTooltip,
  calculationBlockedReason,
  selectedRecalcCountLabel,
  batchPending,
  validObjectsCount,
  cableTypeForRecalculation,
  activeJobId,
  cancelJobPending,
  currentTableViewActive,
  renderManualOverwriteControl,
  onManualOverwritePromptOpen,
  onRecalculateSelected,
  onRecalculateAll,
  onCancelJob,
  onOpenColumnSettings,
  onResetFilters,
}: ElectricalBatchActionBarProps) {
  const recalculationBlocked = Boolean(calculationBlockedReason);
  const selectedDisabled = selectedRecalcDisabled || recalculationBlocked;
  const selectedTooltip = calculationBlockedReason ?? selectedRecalcTooltip;
  const resetManualOverwriteWhenOpen = (open: boolean) => {
    if (open) onManualOverwritePromptOpen();
  };

  return (
    <div className="actionbar-srs electrical-actionbar">
      {/* Тип кабеля выбирается вкладками распределения, не селектом. */}
      <div className="electrical-actionbar-row electrical-actionbar-row--setup">
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
            disabled={!canMutate || selectedDisabled}
          >
            <Tooltip title={canMutate ? selectedTooltip : 'Только владелец проекта или администратор может пересчитывать ЭР'}>
              <span>
                <TltButton
                  size="compact"
                  variant="primary"
                  icon={<ReloadOutlined />}
                  loading={batchPending || isJobActive}
                  disabled={!canMutate || selectedDisabled}
                  title={calculationBlockedReason ?? undefined}
                >
                  Пересчитать выбранные ({selectedRecalcCountLabel})
                </TltButton>
              </span>
            </Tooltip>
          </Popconfirm>
        ) : (
          <Tooltip title={canMutate ? selectedTooltip : 'Только владелец проекта или администратор может пересчитывать ЭР'}>
            <span>
              <TltButton
                size="compact"
                variant="primary"
                icon={<ReloadOutlined />}
                loading={batchPending || isJobActive}
                disabled={!canMutate || selectedDisabled}
                title={calculationBlockedReason ?? undefined}
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
          disabled={!canMutate || validObjectsCount === 0 || isJobActive || recalculationBlocked}
        >
          <TltButton
            size="compact"
            variant="danger"
            icon={<ReloadOutlined />}
            loading={batchPending || isJobActive}
            disabled={!canMutate || validObjectsCount === 0 || isJobActive || recalculationBlocked}
            title={calculationBlockedReason ?? undefined}
          >
            Пересчитать все · {variantName}
          </TltButton>
        </Popconfirm>
        {multiVariantAction}
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

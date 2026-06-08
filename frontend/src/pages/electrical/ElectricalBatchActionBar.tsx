import { memo, type ReactNode } from 'react';
import {
  Button,
  Dropdown,
  Popconfirm,
  Select,
  Space,
  Tooltip,
  Typography,
  type MenuProps,
  type SelectProps,
} from 'antd';
import {
  CloseCircleOutlined,
  CopyOutlined,
  ReloadOutlined,
  StopOutlined,
  TableOutlined,
} from '@ant-design/icons';

import {
  CABLE_TYPE_LABEL,
  type CableTypeKey,
} from '@/pages/electrical/elecCalcMainTableModel';

const { Text } = Typography;

interface ElectricalBatchActionBarProps {
  variant: number;
  cableTypeControlLabel: string;
  cableTypeOptions: SelectProps<CableTypeKey>['options'];
  visibleCableTypeControl?: CableTypeKey | null;
  typeControls: ReactNode;
  commercialFeaturesAvailable: boolean;
  copyVariantMenuItems: MenuProps['items'];
  copyVariantPending: boolean;
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
  onVariantChange: (variant: number) => void;
  onCopyVariant: (targetVariant: number) => void;
  onCableTypeChange: (nextType: CableTypeKey) => void;
  onManualOverwritePromptOpen: () => void;
  onRecalculateSelected: (skipManual: boolean) => void;
  onRecalculateAll: (skipManual: boolean) => void;
  onCancelJob: () => void;
  onOpenColumnSettings: () => void;
  onResetFilters: () => void;
}

function ElectricalBatchActionBar({
  variant,
  cableTypeControlLabel,
  cableTypeOptions,
  visibleCableTypeControl,
  typeControls,
  copyVariantMenuItems,
  copyVariantPending,
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
  onVariantChange,
  onCopyVariant,
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
        {[1, 2, 3, 4].map((n) => (
          <Button
            key={n}
            size="small"
            type={variant === n ? 'primary' : 'default'}
            onClick={() => onVariantChange(n)}
          >
            СО{n}
          </Button>
        ))}
        <Dropdown
          trigger={['click']}
          disabled={copyVariantPending || isJobActive}
          menu={{
            items: copyVariantMenuItems,
            onClick: ({ key }) => onCopyVariant(Number(key)),
          }}
        >
          <Button
            size="small"
            icon={<CopyOutlined />}
            loading={copyVariantPending}
            disabled={copyVariantPending || isJobActive}
          >
            Создать на основании
          </Button>
        </Dropdown>
        <span className="sep" />
        <Text style={{ fontSize: 11, color: '#607080', alignSelf: 'center' }}>
          {cableTypeControlLabel}
        </Text>
        <Select<CableTypeKey>
          aria-label="Тип кабеля для пересчёта"
          size="small"
          value={visibleCableTypeControl ?? undefined}
          placeholder="Несколько типов"
          disabled={isJobActive}
          onChange={onCableTypeChange}
          options={cableTypeOptions}
          style={{ width: 210 }}
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
            disabled={selectedRecalcDisabled}
          >
            <Tooltip title={selectedRecalcTooltip}>
              <span>
                <Button
                  size="small"
                  type="primary"
                  icon={<ReloadOutlined />}
                  loading={batchPending || isJobActive}
                  disabled={selectedRecalcDisabled}
                >
                  Пересчитать выбранные ({selectedRecalcCountLabel})
                </Button>
              </span>
            </Tooltip>
          </Popconfirm>
        ) : (
          <Tooltip title={selectedRecalcTooltip}>
            <span>
              <Button
                size="small"
                type="primary"
                icon={<ReloadOutlined />}
                loading={batchPending || isJobActive}
                disabled={selectedRecalcDisabled}
                onClick={() => onRecalculateSelected(true)}
              >
                Пересчитать выбранные ({selectedRecalcCountLabel})
              </Button>
            </span>
          </Tooltip>
        )}
        <Popconfirm
          title={`Пересчитать все объекты СО${variant}?`}
          description={(
            <Space direction="vertical" size={8}>
              <Text>
                {manualCableCount > 0
                  ? `Строки без ручной марки в СО${variant} будут пересчитаны с типом `
                  : `Все объекты СО${variant} будут пересчитаны с типом `}
                «{CABLE_TYPE_LABEL[cableTypeForRecalculation]}». Тип кабеля у пересчитываемых
                строк будет заменён.
              </Text>
              {renderManualOverwriteControl(manualCableCount)}
            </Space>
          )}
          okText="Да, пересчитать все"
          okButtonProps={{ danger: true }}
          cancelText="Отмена"
          onOpenChange={resetManualOverwriteWhenOpen}
          onConfirm={() => onRecalculateAll(!overwriteManualChoices)}
          disabled={validObjectsCount === 0 || isJobActive}
        >
          <Button
            size="small"
            danger
            icon={<ReloadOutlined />}
            loading={batchPending || isJobActive}
            disabled={validObjectsCount === 0 || isJobActive}
          >
            Пересчитать все СО{variant}
          </Button>
        </Popconfirm>
        {isJobActive && activeJobId && (
          <Button
            size="small"
            danger
            icon={<StopOutlined />}
            loading={cancelJobPending}
            onClick={onCancelJob}
          >
            Отменить
          </Button>
        )}
        <Button
          size="small"
          icon={<TableOutlined />}
          aria-label="Настройки"
          onClick={onOpenColumnSettings}
        >
          Настройки
        </Button>
        <Tooltip title={currentTableViewActive ? 'Сбросить фильтры и сортировку' : 'Фильтры не активны'}>
          <span className="action-tooltip-wrap">
            <Button
              size="small"
              icon={<CloseCircleOutlined />}
              aria-label="Сбросить фильтры таблицы"
              disabled={!currentTableViewActive}
              onClick={onResetFilters}
            >
              Сбросить фильтры
            </Button>
          </span>
        </Tooltip>
      </div>
    </div>
  );
}

export default memo(ElectricalBatchActionBar);

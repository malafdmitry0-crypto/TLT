import { useSensors, useSensor, PointerSensor, KeyboardSensor, DndContext, closestCenter } from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { Modal, Segmented, Space, Tabs, Typography, Checkbox } from 'antd';

import {
  getAllTableColumnMetas,
  type HeatCalcColumnKey,
  type HeatCalcTableColumnSettings,
  type HeatCalcTableColumnScope,
} from '@/utils/heatCalcTableColumns';
import {
  HEATCALC_FORM_PLACEMENT_OPTIONS,
  HEATCALC_TABLE_LABEL_FORMAT_OPTIONS,
  type HeatCalcFormPlacement,
  type HeatCalcTableLabelFormat,
  type HeatCalcTableViewSettings,
} from '@/utils/heatCalcTableViewSettings';
import {
  HEATCALC_CALCULATION_DETAIL_METRIC_OPTIONS,
  HEATCALC_CALCULATION_DETAIL_PRESETS,
  type HeatCalcCalculationDetailMetric,
  type HeatCalcCalculationDetailPreset,
  type HeatCalcCalculationDetailsSettings,
} from '@/utils/heatCalcCalculationDetailsSettings';
import { TltButton } from '@/components/ui-kit';
import {
  ColumnSettingsRow,
  SortableColumnSettingsRow,
} from './ColumnSettingsModalRows';

const { Text } = Typography;

const TABLE_SETTINGS_TYPE_LABELS: Record<HeatCalcTableColumnScope, string> = {
  pipe: 'Труба',
  tank: 'Резервуар',
  all: 'Все',
};

const SETTINGS_HIDDEN_COLUMN_KEYS = new Set<HeatCalcColumnKey>([
  'index',
]);

interface ColumnSettingsModalProps {
  open: boolean;
  activeType: HeatCalcTableColumnScope;
  draftColumnSettings: HeatCalcTableColumnSettings;
  draftViewSettings: HeatCalcTableViewSettings;
  draftCalculationDetailsSettings: HeatCalcCalculationDetailsSettings;
  confirmLoading?: boolean;
  onTypeChange: (type: HeatCalcTableColumnScope) => void;
  onOk: () => void;
  onCancel: () => void;
  onSelectAllColumns: (type: HeatCalcTableColumnScope) => void;
  onResetColumns: (type: HeatCalcTableColumnScope) => void;
  onVisibleChange: (type: HeatCalcTableColumnScope, key: HeatCalcColumnKey, visible: boolean) => void;
  onOrderChange: (type: HeatCalcTableColumnScope, key: HeatCalcColumnKey, order: number) => void;
  onWidthChange: (type: HeatCalcTableColumnScope, key: HeatCalcColumnKey, widthPct: number) => void;
  onResetWidth: (type: HeatCalcTableColumnScope, key: HeatCalcColumnKey) => void;
  onColumnReorder: (type: HeatCalcTableColumnScope, activeKey: HeatCalcColumnKey, overKey: HeatCalcColumnKey) => void;
  onTableLabelFormatChange: (format: HeatCalcTableLabelFormat) => void;
  onSettingsLabelFormatChange: (format: HeatCalcTableLabelFormat) => void;
  onFormPlacementChange: (placement: HeatCalcFormPlacement) => void;
  onResetLabelFormats: () => void;
  onCalculationDetailsPresetChange: (preset: HeatCalcCalculationDetailPreset) => void;
  onCalculationDetailMetricsChange: (metrics: HeatCalcCalculationDetailMetric[]) => void;
  onResetCalculationDetails: () => void;
}

export default function ColumnSettingsModal({
  open,
  activeType,
  draftColumnSettings,
  draftViewSettings,
  draftCalculationDetailsSettings,
  confirmLoading,
  onTypeChange,
  onOk,
  onCancel,
  onSelectAllColumns,
  onResetColumns,
  onVisibleChange,
  onOrderChange,
  onWidthChange,
  onResetWidth,
  onColumnReorder,
  onTableLabelFormatChange,
  onSettingsLabelFormatChange,
  onFormPlacementChange,
  onResetLabelFormats,
  onCalculationDetailsPresetChange,
  onCalculationDetailMetricsChange,
  onResetCalculationDetails,
}: ColumnSettingsModalProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const columns = getAllTableColumnMetas(
    activeType,
    draftColumnSettings,
    draftViewSettings.settingsLabelFormat,
  );
  const settingsColumns = columns.filter((column) => !SETTINGS_HIDDEN_COLUMN_KEYS.has(column.key));
  const visibleSourceColumns = settingsColumns.filter((column) => column.visible);
  const visibleColumns = visibleSourceColumns.map((column, index) => ({
    ...column,
    order: index + 1,
  }));
  const hiddenColumns = settingsColumns.filter((column) => !column.visible);
  const visibleRowCount = visibleColumns.length;
  const handleOrderChange = (key: HeatCalcColumnKey, order: number) => {
    const currentIndex = visibleSourceColumns.findIndex((column) => column.key === key);
    if (currentIndex < 0) return;
    const boundedOrder = Math.min(Math.max(1, Math.round(order)), Math.max(1, visibleSourceColumns.length));
    if (boundedOrder === currentIndex + 1) return;
    const targetColumn = visibleSourceColumns[boundedOrder - 1];
    if (!targetColumn?.order) return;
    onOrderChange(activeType, key, targetColumn.order);
  };

  return (
    <Modal
      title="Настройки таблицы"
      open={open}
      width={980}
      okText="Применить"
      cancelText="Отмена"
      confirmLoading={confirmLoading}
      onOk={onOk}
      onCancel={onCancel}
    >
      <Tabs
        className="column-settings-tabs"
        defaultActiveKey="columns"
        items={[
          {
            key: 'columns',
            label: 'Настройки колонок',
            children: (
              <div className="column-settings-modal">
                <div className="column-settings-toolbar">
                  <Segmented<HeatCalcTableColumnScope>
                    value={activeType}
                    onChange={onTypeChange}
                    options={[
                      { label: TABLE_SETTINGS_TYPE_LABELS.pipe, value: 'pipe' },
                      { label: TABLE_SETTINGS_TYPE_LABELS.tank, value: 'tank' },
                      { label: TABLE_SETTINGS_TYPE_LABELS.all, value: 'all' },
                    ]}
                  />
                  <Space size={6}>
                    <TltButton size="compact" onClick={() => onSelectAllColumns(activeType)}>
                      Все поля
                    </TltButton>
                    <TltButton size="compact" onClick={() => onResetColumns(activeType)}>
                      Сбросить текущий тип
                    </TltButton>
                  </Space>
                </div>
                <div className="column-settings-list">
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={(event) => {
                      const activeKey = String(event.active.id);
                      const overKey = event.over?.id == null ? null : String(event.over.id);
                      if (!overKey || activeKey === overKey) return;
                      onColumnReorder(activeType, activeKey, overKey);
                    }}
                  >
                    <div className="column-layout-list column-layout-list--heatcalc" role="list" aria-label={`Настройки таблицы: ${TABLE_SETTINGS_TYPE_LABELS[activeType]}`}>
                      <div className="column-layout-header column-layout-header--heatcalc" aria-hidden="true">
                        <span />
                        <span>Вид</span>
                        <span>№</span>
                        <span>Поле</span>
                        <span>Ширина</span>
                        <span />
                        <span />
                      </div>
                      <SortableContext items={visibleColumns.map((column) => column.key)} strategy={verticalListSortingStrategy}>
                        {visibleColumns.map((column) => (
                          <SortableColumnSettingsRow
                            key={column.key}
                            type={activeType}
                            column={column}
                            rowCount={visibleRowCount}
                            onVisibleChange={(key, visible) => onVisibleChange(activeType, key, visible)}
                            onOrderChange={handleOrderChange}
                            onWidthChange={(key, widthPct) => onWidthChange(activeType, key, widthPct)}
                            onResetWidth={(key) => onResetWidth(activeType, key)}
                          />
                        ))}
                      </SortableContext>
                      {hiddenColumns.length > 0 && (
                        <div className="column-layout-section" aria-hidden="true">
                          Скрытые поля
                        </div>
                      )}
                      {hiddenColumns.map((column) => (
                        <ColumnSettingsRow
                          key={column.key}
                          type={activeType}
                          column={column}
                          rowCount={visibleRowCount}
                          onVisibleChange={(key, visible) => onVisibleChange(activeType, key, visible)}
                          onOrderChange={handleOrderChange}
                          onWidthChange={(key, widthPct) => onWidthChange(activeType, key, widthPct)}
                          onResetWidth={(key) => onResetWidth(activeType, key)}
                        />
                      ))}
                    </div>
                  </DndContext>
                </div>
              </div>
            ),
          },
          {
            key: 'other',
            label: 'Остальное',
            children: (
              <div className="column-settings-modal column-settings-modal--other">
                <div className="table-view-settings-panel table-label-format-settings-panel">
                  <Text className="table-view-settings-label">Формат названий</Text>
                  <Space size={8} wrap>
                    <Text type="secondary">Таблица</Text>
                    <Segmented<HeatCalcTableLabelFormat>
                      aria-label="Формат названий в таблице"
                      value={draftViewSettings.tableLabelFormat}
                      onChange={onTableLabelFormatChange}
                      options={HEATCALC_TABLE_LABEL_FORMAT_OPTIONS.map((option) => ({
                        value: option.key,
                        label: option.label,
                      }))}
                    />
                    <Text type="secondary">Настройки</Text>
                    <Segmented<HeatCalcTableLabelFormat>
                      aria-label="Формат названий в настройках"
                      value={draftViewSettings.settingsLabelFormat}
                      onChange={onSettingsLabelFormatChange}
                      options={HEATCALC_TABLE_LABEL_FORMAT_OPTIONS.map((option) => ({
                        value: option.key,
                        label: option.label,
                      }))}
                    />
                    <TltButton size="compact" onClick={onResetLabelFormats}>
                      Сбросить названия
                    </TltButton>
                  </Space>
                </div>
                <div className="table-view-settings-panel">
                  <Text className="table-view-settings-label">Положение блока параметров</Text>
                  <Segmented<HeatCalcFormPlacement>
                    aria-label="Положение блока параметров"
                    value={draftViewSettings.formPlacement}
                    onChange={onFormPlacementChange}
                    options={HEATCALC_FORM_PLACEMENT_OPTIONS.map((option) => ({
                      value: option.key,
                      label: option.label,
                    }))}
                  />
                </div>
                <div className="table-view-settings-panel calculation-details-settings-panel">
                  <div className="calculation-details-settings-header">
                    <Text className="table-view-settings-label">Расшифровка расчёта</Text>
                    <Segmented<HeatCalcCalculationDetailPreset>
                      aria-label="Пресет расшифровки расчёта"
                      value={draftCalculationDetailsSettings.preset}
                      onChange={onCalculationDetailsPresetChange}
                      options={HEATCALC_CALCULATION_DETAIL_PRESETS.map((preset) => ({
                        value: preset.key,
                        label: preset.label,
                      }))}
                    />
                    <TltButton size="compact" onClick={onResetCalculationDetails}>
                      Сбросить расшифровку
                    </TltButton>
                  </div>
                  <Checkbox.Group
                    className="calculation-details-metrics"
                    value={draftCalculationDetailsSettings.visibleMetrics}
                    onChange={(values) =>
                      onCalculationDetailMetricsChange(values as HeatCalcCalculationDetailMetric[])}
                  >
                    {HEATCALC_CALCULATION_DETAIL_METRIC_OPTIONS.map((option) => (
                      <Checkbox key={option.key} value={option.key}>
                        {option.label}
                      </Checkbox>
                    ))}
                  </Checkbox.Group>
                </div>
              </div>
            ),
          },
        ]}
      />
    </Modal>
  );
}

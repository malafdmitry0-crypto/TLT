import { type CSSProperties, type ReactNode } from 'react';
import { Button, Checkbox, InputNumber, Modal, Segmented, Space, Tabs, Tag, Tooltip, Typography } from 'antd';
import { HolderOutlined, ReloadOutlined } from '@ant-design/icons';
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import {
  ELECTRICAL_TABLE_COLUMN_MAX_WIDTH_PCT,
  ELECTRICAL_TABLE_COLUMN_MIN_WIDTH_PCT,
  getAllElectricalTableColumnMetas,
  type ElectricalColumnKey,
  type ElectricalResolvedColumnMeta,
  type ElectricalTableColumnSettings,
} from '@/utils/electricalTableColumns';
import {
  ELECTRICAL_TABLE_FONT_SIZE_OPTIONS,
  ELECTRICAL_TABLE_LABEL_FORMAT_OPTIONS,
  type ElectricalTableFontSize,
  type ElectricalTableLabelFormat,
  type ElectricalTableViewSettings,
} from '@/utils/electricalTableViewSettings';

const { Text } = Typography;

interface ColumnNatureBadge {
  label: string;
  tooltip: string;
  tone: 'input' | 'computed';
}

interface ColumnDetailBadge {
  label: string;
  tooltip: string;
  tone: 'result' | 'specific' | 'applied' | 'geometry' | 'derived';
}

const SERVICE_COLUMN_KEYS = new Set<ElectricalColumnKey>([
  'index',
  'electrical_status',
  'message',
]);

const INPUT_COLUMN_BADGE: ColumnNatureBadge = {
  label: 'Вводится',
  tooltip: 'Входной параметр. Значение задаётся пользователем, берётся из объекта или из параметров электрорасчёта.',
  tone: 'input',
};

const COMPUTED_COLUMN_BADGE: ColumnNatureBadge = {
  label: 'Вычисляется',
  tooltip: 'Значение формируется расчётом и не заполняется вручную как поле таблицы.',
  tone: 'computed',
};

const COLUMN_DETAIL_BADGES: Record<ElectricalColumnKey, ColumnDetailBadge> = {
  cable_mark: {
    label: 'Кабель',
    tooltip: 'Марка может быть подобрана автоматически или выбрана вручную по строке',
    tone: 'applied',
  },
  cable_length: {
    label: 'Итог',
    tooltip: 'Итоговая длина кабеля из результата электрорасчёта',
    tone: 'result',
  },
  total_power: {
    label: 'Итог',
    tooltip: 'Итоговая мощность объекта из результата электрорасчёта',
    tone: 'result',
  },
  current: {
    label: 'Итог',
    tooltip: 'Итоговый ток объекта из результата электрорасчёта',
    tone: 'result',
  },
  voltage: {
    label: 'Применено',
    tooltip: 'Напряжение, применённое электрорасчётом',
    tone: 'applied',
  },
  winding_pitch_mm: {
    label: 'Укладка',
    tooltip: 'Параметр укладки кабеля, который влияет на пересчёт объекта',
    tone: 'geometry',
  },
  number_of_threads: {
    label: 'Укладка',
    tooltip: 'Количество ниток кабеля, которое влияет на пересчёт объекта',
    tone: 'geometry',
  },
  laying_step: {
    label: 'Укладка',
    tooltip: 'Параметр укладки кабеля на резервуаре',
    tone: 'geometry',
  },
  heating_height: {
    label: 'Укладка',
    tooltip: 'Геометрический параметр обогрева резервуара',
    tone: 'geometry',
  },
  heat_loss_per_meter: {
    label: 'Теплопотери',
    tooltip: 'Значение приходит из результата расчёта теплопотерь трубы',
    tone: 'specific',
  },
  heat_loss_per_m2: {
    label: 'Теплопотери',
    tooltip: 'Значение приходит из результата расчёта теплопотерь резервуара',
    tone: 'specific',
  },
  total_heat_loss: {
    label: 'Теплопотери',
    tooltip: 'Суммарные теплопотери из результата теплового расчёта',
    tone: 'specific',
  },
  heat_loss_status: {
    label: 'Диагностика',
    tooltip: 'Статус предыдущего расчёта теплопотерь',
    tone: 'derived',
  },
};

interface ElectricalColumnSettingsModalProps {
  open: boolean;
  settings: ElectricalTableColumnSettings;
  viewSettings: ElectricalTableViewSettings;
  confirmLoading?: boolean;
  onOk: () => void;
  onCancel: () => void;
  onSelectAllColumns: () => void;
  onResetColumns: () => void;
  onVisibleChange: (key: ElectricalColumnKey, checked: boolean) => void;
  onOrderChange: (key: ElectricalColumnKey, order: number) => void;
  onColumnReorder: (activeKey: ElectricalColumnKey, overKey: ElectricalColumnKey) => void;
  onWidthChange: (key: ElectricalColumnKey, widthPct: number) => void;
  onResetWidth: (key: ElectricalColumnKey) => void;
  onFontSizeChange: (fontSize: ElectricalTableFontSize) => void;
  onTableLabelFormatChange: (format: ElectricalTableLabelFormat) => void;
  onSettingsLabelFormatChange: (format: ElectricalTableLabelFormat) => void;
  onResetFontSize: () => void;
  onResetLabelFormats: () => void;
}

function columnNatureBadge(column: ElectricalResolvedColumnMeta) {
  if (SERVICE_COLUMN_KEYS.has(column.key) || column.valueType === 'service') return null;
  if (column.valueType === 'computed') return COMPUTED_COLUMN_BADGE;
  if (column.valueType === 'input') return INPUT_COLUMN_BADGE;
  return null;
}

function columnDetailBadge(column: ElectricalResolvedColumnMeta) {
  return COLUMN_DETAIL_BADGES[column.key] ?? null;
}

function renderColumnLabel(column: ElectricalResolvedColumnMeta) {
  const natureBadge = columnNatureBadge(column);
  const detailBadge = columnDetailBadge(column);
  const helpTitle = column.helpText || column.label;
  const metaLabel = column.labels.compact && column.labels.compact !== column.title
    ? `${column.labels.compact} · ${column.group}`
    : column.group;

  return (
    <div className="column-layout-label">
      <span className="column-layout-title-row">
        <Tooltip title={helpTitle} placement="top" zIndex={3000}>
          <span className="column-layout-title">{column.title}</span>
        </Tooltip>
        {natureBadge && (
          <Tooltip title={natureBadge.tooltip} placement="top" zIndex={3000}>
            <Tag className={`column-layout-nature-tag column-layout-nature-tag--${natureBadge.tone}`}>
              {natureBadge.label}
            </Tag>
          </Tooltip>
        )}
        {detailBadge && (
          <Tooltip title={detailBadge.tooltip} placement="top" zIndex={3000}>
            <Tag className={`column-layout-computed-tag column-layout-computed-tag--${detailBadge.tone}`}>
              {detailBadge.label}
            </Tag>
          </Tooltip>
        )}
      </span>
      <span className="column-layout-meta">{metaLabel}</span>
    </div>
  );
}

function ColumnSettingsRowContent({
  column,
  rowCount,
  dragHandle,
  onVisibleChange,
  onOrderChange,
  onWidthChange,
  onResetWidth,
}: {
  column: ElectricalResolvedColumnMeta;
  rowCount: number;
  dragHandle: ReactNode;
  onVisibleChange: (key: ElectricalColumnKey, checked: boolean) => void;
  onOrderChange: (key: ElectricalColumnKey, order: number) => void;
  onWidthChange: (key: ElectricalColumnKey, widthPct: number) => void;
  onResetWidth: (key: ElectricalColumnKey) => void;
}) {
  return (
    <>
      {dragHandle}
      <Checkbox
        checked={column.visible}
        disabled={column.required}
        aria-label={`Показать ${column.label}`}
        onChange={(event) => onVisibleChange(column.key, event.target.checked)}
      />
      {column.visible ? (
        <InputNumber
          min={1}
          max={Math.max(1, rowCount)}
          precision={0}
          value={column.order}
          aria-label={`Порядок ${column.label}`}
          onChange={(value) => {
            if (value != null) onOrderChange(column.key, Number(value));
          }}
        />
      ) : (
        <span className="column-layout-empty">—</span>
      )}
      {renderColumnLabel(column)}
      <span className="column-layout-empty">—</span>
      <span className="column-layout-unit" />
      <span />
      <InputNumber
        min={ELECTRICAL_TABLE_COLUMN_MIN_WIDTH_PCT}
        max={ELECTRICAL_TABLE_COLUMN_MAX_WIDTH_PCT}
        step={0.2}
        value={column.widthPct}
        aria-label={`Ширина ${column.label}`}
        onChange={(value) => {
          if (value != null) onWidthChange(column.key, Number(value));
        }}
      />
      <span className="column-layout-unit">%</span>
      <Tooltip title="Сбросить ширину" placement="top" zIndex={3000}>
        <Button
          size="small"
          aria-label={`Сбросить ширину ${column.label}`}
          icon={<ReloadOutlined />}
          onClick={() => onResetWidth(column.key)}
        />
      </Tooltip>
    </>
  );
}

function ColumnSettingsRow({
  column,
  rowCount,
  onVisibleChange,
  onOrderChange,
  onWidthChange,
  onResetWidth,
}: {
  column: ElectricalResolvedColumnMeta;
  rowCount: number;
  onVisibleChange: (key: ElectricalColumnKey, checked: boolean) => void;
  onOrderChange: (key: ElectricalColumnKey, order: number) => void;
  onWidthChange: (key: ElectricalColumnKey, widthPct: number) => void;
  onResetWidth: (key: ElectricalColumnKey) => void;
}) {
  return (
    <div className="column-layout-row hidden" data-column-key={column.key}>
      <ColumnSettingsRowContent
        column={column}
        rowCount={rowCount}
        dragHandle={(
          <button
            type="button"
            className="column-layout-drag"
            aria-label={`Поле скрыто: ${column.label}`}
            disabled
          >
            <HolderOutlined />
          </button>
        )}
        onVisibleChange={onVisibleChange}
        onOrderChange={onOrderChange}
        onWidthChange={onWidthChange}
        onResetWidth={onResetWidth}
      />
    </div>
  );
}

function SortableColumnSettingsRow({
  column,
  rowCount,
  onVisibleChange,
  onOrderChange,
  onWidthChange,
  onResetWidth,
}: {
  column: ElectricalResolvedColumnMeta;
  rowCount: number;
  onVisibleChange: (key: ElectricalColumnKey, checked: boolean) => void;
  onOrderChange: (key: ElectricalColumnKey, order: number) => void;
  onWidthChange: (key: ElectricalColumnKey, widthPct: number) => void;
  onResetWidth: (key: ElectricalColumnKey) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: column.key });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={isDragging ? 'column-layout-row dragging' : 'column-layout-row'}
      data-column-key={column.key}
    >
      <ColumnSettingsRowContent
        column={column}
        rowCount={rowCount}
        dragHandle={(
          <button
            type="button"
            className="column-layout-drag"
            aria-label={`Переместить поле: ${column.label}`}
            {...attributes}
            {...listeners}
          >
            <HolderOutlined />
          </button>
        )}
        onVisibleChange={onVisibleChange}
        onOrderChange={onOrderChange}
        onWidthChange={onWidthChange}
        onResetWidth={onResetWidth}
      />
    </div>
  );
}

export default function ElectricalColumnSettingsModal({
  open,
  settings,
  viewSettings,
  confirmLoading,
  onOk,
  onCancel,
  onSelectAllColumns,
  onResetColumns,
  onVisibleChange,
  onOrderChange,
  onColumnReorder,
  onWidthChange,
  onResetWidth,
  onFontSizeChange,
  onTableLabelFormatChange,
  onSettingsLabelFormatChange,
  onResetFontSize,
  onResetLabelFormats,
}: ElectricalColumnSettingsModalProps) {
  const columns = getAllElectricalTableColumnMetas(settings, viewSettings.settingsLabelFormat);
  const visibleColumns = columns.filter((column) => column.visible);
  const hiddenColumns = columns.filter((column) => !column.visible);
  const visibleCount = visibleColumns.length;
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const activeKey = String(event.active.id);
    const overKey = event.over?.id ? String(event.over.id) : null;
    if (overKey && activeKey !== overKey) onColumnReorder(activeKey, overKey);
  }

  return (
    <Modal
      open={open}
      width={1040}
      title="Настройки таблицы электрорасчёта"
      okText="Сохранить"
      cancelText="Отмена"
      confirmLoading={confirmLoading}
      onOk={onOk}
      onCancel={onCancel}
      destroyOnHidden
    >
      <Tabs
        defaultActiveKey="columns"
        items={[
          {
            key: 'columns',
            label: 'Настройки колонок',
            children: (
              <Space direction="vertical" size={10} style={{ width: '100%' }}>
                <Space wrap style={{ width: '100%', justifyContent: 'space-between' }}>
                  <Text type="secondary">
                    Показано колонок: {visibleCount}/{columns.length}
                  </Text>
                  <Space>
                    <Button size="small" onClick={onSelectAllColumns}>Все поля</Button>
                    <Button size="small" onClick={onResetColumns}>Сбросить</Button>
                  </Space>
                </Space>
                <div className="column-layout-list" role="list" aria-label="Настройки таблицы электрорасчёта">
                  <div className="column-layout-header" aria-hidden="true">
                    <span />
                    <span>Вид</span>
                    <span>№</span>
                    <span>Поле</span>
                    <span>Шаг</span>
                    <span />
                    <span />
                    <span>Ширина</span>
                    <span />
                    <span />
                  </div>
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                  >
                    <SortableContext
                      items={visibleColumns.map((column) => column.key)}
                      strategy={verticalListSortingStrategy}
                    >
                      {visibleColumns.map((column) => (
                        <SortableColumnSettingsRow
                          key={column.key}
                          column={column}
                          rowCount={visibleColumns.length}
                          onVisibleChange={onVisibleChange}
                          onOrderChange={onOrderChange}
                          onWidthChange={onWidthChange}
                          onResetWidth={onResetWidth}
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
                        column={column}
                        rowCount={visibleColumns.length}
                        onVisibleChange={onVisibleChange}
                        onOrderChange={onOrderChange}
                        onWidthChange={onWidthChange}
                        onResetWidth={onResetWidth}
                      />
                    ))}
                  </DndContext>
                </div>
              </Space>
            ),
          },
          {
            key: 'other',
            label: 'Остальное',
            children: (
              <div className="column-settings-modal column-settings-modal--other">
                <div className="table-view-settings-panel">
                  <Text className="table-view-settings-label">Размер текста таблицы</Text>
                  <Segmented<ElectricalTableFontSize>
                    aria-label="Размер текста таблицы"
                    value={viewSettings.fontSize}
                    onChange={onFontSizeChange}
                    options={ELECTRICAL_TABLE_FONT_SIZE_OPTIONS.map((option) => ({
                      value: option.key,
                      label: (
                        <Tooltip title={`${option.fontSizePx}px`}>
                          <span>{option.label}</span>
                        </Tooltip>
                      ),
                    }))}
                  />
                  <Button size="small" onClick={onResetFontSize}>
                    Сбросить размер
                  </Button>
                </div>
                <div className="table-view-settings-panel table-label-format-settings-panel">
                  <Text className="table-view-settings-label">Формат названий</Text>
                  <Space size={8} wrap>
                    <Text type="secondary">Таблица</Text>
                    <Segmented<ElectricalTableLabelFormat>
                      aria-label="Формат названий в таблице"
                      value={viewSettings.tableLabelFormat}
                      onChange={onTableLabelFormatChange}
                      options={ELECTRICAL_TABLE_LABEL_FORMAT_OPTIONS.map((option) => ({
                        value: option.key,
                        label: option.label,
                      }))}
                    />
                    <Text type="secondary">Настройки</Text>
                    <Segmented<ElectricalTableLabelFormat>
                      aria-label="Формат названий в настройках"
                      value={viewSettings.settingsLabelFormat}
                      onChange={onSettingsLabelFormatChange}
                      options={ELECTRICAL_TABLE_LABEL_FORMAT_OPTIONS.map((option) => ({
                        value: option.key,
                        label: option.label,
                      }))}
                    />
                    <Button size="small" onClick={onResetLabelFormats}>
                      Сбросить названия
                    </Button>
                  </Space>
                </div>
              </div>
            ),
          },
        ]}
      />
    </Modal>
  );
}

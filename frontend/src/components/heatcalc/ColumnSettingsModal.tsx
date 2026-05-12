import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { Button, Checkbox, InputNumber, Modal, Segmented, Space, Tooltip, Typography } from 'antd';
import { HolderOutlined, ReloadOutlined } from '@ant-design/icons';
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import {
  getAllTableColumnMetas,
  type HeatCalcColumnKey,
  type HeatCalcObjectType,
  type HeatCalcResolvedColumnMeta,
  type HeatCalcTableColumnSettings,
} from '@/utils/heatCalcTableColumns';
import {
  HEATCALC_TABLE_FONT_SIZE_OPTIONS,
  type HeatCalcTableFontSize,
  type HeatCalcTableViewSettings,
} from '@/utils/heatCalcTableViewSettings';

const { Text } = Typography;

const TABLE_SETTINGS_TYPE_LABELS: Record<HeatCalcObjectType, string> = {
  pipe: 'Труба',
  tank: 'Резервуар',
};

function ColumnSettingsRowContent({
  column,
  rowCount,
  dragHandle,
  onVisibleChange,
  onOrderChange,
  onWidthChange,
  onResetWidth,
}: {
  column: HeatCalcResolvedColumnMeta;
  rowCount: number;
  dragHandle: ReactNode;
  onVisibleChange: (key: HeatCalcColumnKey, visible: boolean) => void;
  onOrderChange: (key: HeatCalcColumnKey, order: number) => void;
  onWidthChange: (key: HeatCalcColumnKey, widthPct: number) => void;
  onResetWidth: (key: HeatCalcColumnKey) => void;
}) {
  const orderValue = column.visible && column.order != null ? column.order : null;
  const [draftOrder, setDraftOrder] = useState<number | null>(orderValue);
  const [orderEditing, setOrderEditing] = useState(false);

  useEffect(() => {
    if (!orderEditing) setDraftOrder(orderValue);
  }, [orderEditing, orderValue]);

  function commitOrderChange() {
    setOrderEditing(false);
    if (!column.visible) {
      setDraftOrder(null);
      return;
    }
    const nextOrder = Number(draftOrder);
    if (!Number.isFinite(nextOrder)) {
      setDraftOrder(orderValue);
      return;
    }
    const boundedOrder = Math.min(Math.max(1, Math.round(nextOrder)), Math.max(1, rowCount));
    setDraftOrder(boundedOrder);
    if (boundedOrder !== orderValue) onOrderChange(column.key, boundedOrder);
  }

  return (
    <>
      {dragHandle}
      <Checkbox
        checked={column.visible}
        disabled={column.required}
        aria-label={column.label}
        onChange={(event) => onVisibleChange(column.key, event.target.checked)}
      />
      <InputNumber
        size="small"
        min={1}
        max={Math.max(1, rowCount)}
        precision={0}
        value={orderEditing ? draftOrder : orderValue}
        disabled={!column.visible}
        placeholder="—"
        aria-label={`Порядок: ${column.label}`}
        onFocus={() => setOrderEditing(true)}
        onChange={(value) => {
          const nextOrder = Number(value);
          setOrderEditing(true);
          setDraftOrder(Number.isFinite(nextOrder) ? nextOrder : null);
        }}
        onBlur={commitOrderChange}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.currentTarget.blur();
          }
          if (event.key === 'Escape') {
            setDraftOrder(orderValue);
            setOrderEditing(false);
            event.currentTarget.blur();
          }
        }}
      />
      <div className="column-layout-label">
        <span className="column-layout-title">{column.label}</span>
        <span className="column-layout-meta">{column.title} · {column.group}</span>
      </div>
      <InputNumber
        size="small"
        min={3}
        max={60}
        step={0.5}
        value={column.widthPct}
        aria-label={`Ширина: ${column.label}`}
        onChange={(value) => {
          const nextWidth = Number(value);
          if (Number.isFinite(nextWidth)) onWidthChange(column.key, nextWidth);
        }}
      />
      <span className="column-layout-unit">%</span>
      <Tooltip title="Сбросить ширину">
        <Button
          size="small"
          icon={<ReloadOutlined />}
          aria-label={`Сбросить ширину: ${column.label}`}
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
  column: HeatCalcResolvedColumnMeta;
  rowCount: number;
  onVisibleChange: (key: HeatCalcColumnKey, visible: boolean) => void;
  onOrderChange: (key: HeatCalcColumnKey, order: number) => void;
  onWidthChange: (key: HeatCalcColumnKey, widthPct: number) => void;
  onResetWidth: (key: HeatCalcColumnKey) => void;
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
  column: HeatCalcResolvedColumnMeta;
  rowCount: number;
  onVisibleChange: (key: HeatCalcColumnKey, visible: boolean) => void;
  onOrderChange: (key: HeatCalcColumnKey, order: number) => void;
  onWidthChange: (key: HeatCalcColumnKey, widthPct: number) => void;
  onResetWidth: (key: HeatCalcColumnKey) => void;
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

interface ColumnSettingsModalProps {
  open: boolean;
  activeType: HeatCalcObjectType;
  draftColumnSettings: HeatCalcTableColumnSettings;
  draftViewSettings: HeatCalcTableViewSettings;
  confirmLoading?: boolean;
  onTypeChange: (type: HeatCalcObjectType) => void;
  onOk: () => void;
  onCancel: () => void;
  onSelectAllColumns: (type: HeatCalcObjectType) => void;
  onResetColumns: (type: HeatCalcObjectType) => void;
  onVisibleChange: (type: HeatCalcObjectType, key: HeatCalcColumnKey, visible: boolean) => void;
  onOrderChange: (type: HeatCalcObjectType, key: HeatCalcColumnKey, order: number) => void;
  onWidthChange: (type: HeatCalcObjectType, key: HeatCalcColumnKey, widthPct: number) => void;
  onResetWidth: (type: HeatCalcObjectType, key: HeatCalcColumnKey) => void;
  onColumnReorder: (type: HeatCalcObjectType, activeKey: HeatCalcColumnKey, overKey: HeatCalcColumnKey) => void;
  onFontSizeChange: (fontSize: HeatCalcTableFontSize) => void;
  onInlineEditingEnabledChange: (enabled: boolean) => void;
  onResetFontSize: () => void;
}

export default function ColumnSettingsModal({
  open,
  activeType,
  draftColumnSettings,
  draftViewSettings,
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
  onFontSizeChange,
  onInlineEditingEnabledChange,
  onResetFontSize,
}: ColumnSettingsModalProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const columns = getAllTableColumnMetas(activeType, draftColumnSettings);
  const visibleColumns = columns.filter((column) => column.visible);
  const hiddenColumns = columns.filter((column) => !column.visible);
  const visibleRowCount = visibleColumns.length;

  return (
    <Modal
      title="Настройки таблицы"
      open={open}
      width={860}
      okText="Применить"
      cancelText="Отмена"
      confirmLoading={confirmLoading}
      onOk={onOk}
      onCancel={onCancel}
    >
      <div className="column-settings-modal">
        <div className="column-settings-toolbar">
          <Segmented<HeatCalcObjectType>
            value={activeType}
            onChange={onTypeChange}
            options={[
              { label: TABLE_SETTINGS_TYPE_LABELS.pipe, value: 'pipe' },
              { label: TABLE_SETTINGS_TYPE_LABELS.tank, value: 'tank' },
            ]}
          />
          <Space size={6}>
            <Button size="small" onClick={() => onSelectAllColumns(activeType)}>
              Все поля
            </Button>
            <Button size="small" onClick={() => onResetColumns(activeType)}>
              Сбросить текущий тип
            </Button>
          </Space>
        </div>
        <div className="table-view-settings-panel">
          <Text className="table-view-settings-label">Размер текста таблицы</Text>
          <Segmented<HeatCalcTableFontSize>
            aria-label="Размер текста таблицы"
            value={draftViewSettings.fontSize}
            onChange={onFontSizeChange}
            options={HEATCALC_TABLE_FONT_SIZE_OPTIONS.map((option) => ({
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
        <div className="table-view-settings-panel">
          <Checkbox
            checked={draftViewSettings.inlineEditingEnabled}
            onChange={(event) => onInlineEditingEnabledChange(event.target.checked)}
          >
            Редактировать ячейки в таблице
          </Checkbox>
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
            <div className="column-layout-list" role="list" aria-label={`Настройки таблицы: ${TABLE_SETTINGS_TYPE_LABELS[activeType]}`}>
              <div className="column-layout-header" aria-hidden="true">
                <span />
                <span>Вид</span>
                <span>№</span>
                <span>Поле</span>
                <span>Ширина</span>
                <span />
              </div>
              <SortableContext items={visibleColumns.map((column) => column.key)} strategy={verticalListSortingStrategy}>
                {visibleColumns.map((column) => (
                  <SortableColumnSettingsRow
                    key={column.key}
                    column={column}
                    rowCount={visibleRowCount}
                    onVisibleChange={(key, visible) => onVisibleChange(activeType, key, visible)}
                    onOrderChange={(key, order) => onOrderChange(activeType, key, order)}
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
                  column={column}
                  rowCount={visibleRowCount}
                  onVisibleChange={(key, visible) => onVisibleChange(activeType, key, visible)}
                  onOrderChange={(key, order) => onOrderChange(activeType, key, order)}
                  onWidthChange={(key, widthPct) => onWidthChange(activeType, key, widthPct)}
                  onResetWidth={(key) => onResetWidth(activeType, key)}
                />
              ))}
            </div>
          </DndContext>
        </div>
      </div>
    </Modal>
  );
}

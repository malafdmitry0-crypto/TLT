import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { Button, Checkbox, InputNumber, Modal, Segmented, Space, Tabs, Tag, Tooltip, Typography } from 'antd';
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
  type HeatCalcResolvedColumnMeta,
  type HeatCalcTableColumnSettings,
  type HeatCalcTableColumnScope,
} from '@/utils/heatCalcTableColumns';
import {
  HEATCALC_FORM_PLACEMENT_OPTIONS,
  HEATCALC_TABLE_FONT_SIZE_OPTIONS,
  HEATCALC_TABLE_LABEL_FORMAT_OPTIONS,
  type HeatCalcFormPlacement,
  type HeatCalcTableFontSize,
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
import {
  resolveHeatCalcFieldStep,
  type HeatCalcFieldInputSettings,
} from '@/utils/heatCalcFieldInputSettings';
import type { HeatCalcObjectType } from '@/types/project';
import {
  getHeatCalcFieldConfig,
  getHeatCalcFieldByColumn,
  getHeatCalcFieldInputConfig,
  isHeatCalcFieldStepConfigurable,
  type HeatCalcFieldDefinition,
} from '@/domain/heatCalcFields';

const { Text } = Typography;

const TABLE_SETTINGS_TYPE_LABELS: Record<HeatCalcTableColumnScope, string> = {
  pipe: 'Труба',
  tank: 'Резервуар',
  all: 'Все',
};

interface ComputedColumnBadge {
  label: string;
  tooltip: string;
  tone: 'result' | 'specific' | 'applied' | 'geometry' | 'resistance' | 'derived';
}

interface ColumnNatureBadge {
  label: string;
  tooltip: string;
  tone: 'input' | 'computed';
}

const SERVICE_COLUMN_KEYS = new Set<HeatCalcColumnKey>([
  'index',
  'heat_loss_status',
  'type',
]);

const SETTINGS_HIDDEN_COLUMN_KEYS = new Set<HeatCalcColumnKey>([
  'index',
]);

const INPUT_COLUMN_BADGE: ColumnNatureBadge = {
  label: 'Вводится',
  tooltip: 'Входной параметр объекта. Значение хранится в project_objects.params и может вводиться вручную, через форму или импорт.',
  tone: 'input',
};

const COMPUTED_COLUMN_BADGE: ColumnNatureBadge = {
  label: 'Вычисляется',
  tooltip: 'Значение вычисляется системой из входных параметров или результата расчёта. Не заполняется вручную.',
  tone: 'computed',
};

const COMPUTED_COLUMN_BADGES: Record<HeatCalcColumnKey, ComputedColumnBadge> = {
  total_heat_loss: {
    label: 'Итог',
    tooltip: 'Главный итог расчёта: суммарные теплопотери объекта',
    tone: 'result',
  },
  heat_loss_per_meter: {
    label: 'Удельное',
    tooltip: 'Теплопотери на метр трубы из результата расчёта',
    tone: 'specific',
  },
  heat_loss_per_m2: {
    label: 'Удельное',
    tooltip: 'Теплопотери на м² поверхности резервуара из результата расчёта',
    tone: 'specific',
  },
  applied_alpha_vnesh: {
    label: 'Применено',
    tooltip: 'Фактически применённое расчётом значение',
    tone: 'applied',
  },
  applied_safety_factor: {
    label: 'Применено',
    tooltip: 'Фактически применённое расчётом значение',
    tone: 'applied',
  },
  effective_length: {
    label: 'Геометрия',
    tooltip: 'Расчётная геометрия, полученная для тепловой модели',
    tone: 'geometry',
  },
  surface_area: {
    label: 'Геометрия',
    tooltip: 'Расчётная геометрия, полученная для тепловой модели',
    tone: 'geometry',
  },
  air_surface_area: {
    label: 'Геометрия',
    tooltip: 'Расчётная геометрия, полученная для тепловой модели',
    tone: 'geometry',
  },
  ground_surface_area: {
    label: 'Геометрия',
    tooltip: 'Расчётная геометрия, полученная для тепловой модели',
    tone: 'geometry',
  },
  thermal_resistance: {
    label: 'R',
    tooltip: 'Термосопротивление в тепловой модели',
    tone: 'resistance',
  },
  wall_resistance: {
    label: 'R',
    tooltip: 'Термосопротивление в тепловой модели',
    tone: 'resistance',
  },
  insulation_resistance: {
    label: 'R',
    tooltip: 'Термосопротивление в тепловой модели',
    tone: 'resistance',
  },
  external_resistance: {
    label: 'R',
    tooltip: 'Термосопротивление в тепловой модели',
    tone: 'resistance',
  },
  ground_resistance: {
    label: 'R',
    tooltip: 'Термосопротивление в тепловой модели',
    tone: 'resistance',
  },
  delta_t: {
    label: 'Производное',
    tooltip: 'Значение получено из других входных параметров',
    tone: 'derived',
  },
};

interface ColumnStepTarget {
  objectType: HeatCalcObjectType;
  fieldId: string;
}

interface ColumnStepSettings {
  targets: ColumnStepTarget[];
  step: number;
  defaultStep: number;
  unit?: string;
  overridden: boolean;
}

function isNumberFieldWithStep(
  objectType: HeatCalcObjectType,
  field: HeatCalcFieldDefinition | null,
): field is HeatCalcFieldDefinition & { step: number } {
  return !!field
    && field.editor === 'number'
    && Number.isFinite(Number(field.step))
    && Number(field.step) > 0
    && isHeatCalcFieldStepConfigurable(objectType, field.id);
}

function sameNumber(left: number, right: number) {
  return Math.abs(left - right) < 1e-9;
}

function computedColumnBadge(column: HeatCalcResolvedColumnMeta) {
  return COMPUTED_COLUMN_BADGES[column.key] ?? null;
}

function fieldInputTypeForColumn(
  type: HeatCalcTableColumnScope,
  column: HeatCalcResolvedColumnMeta,
) {
  if (!column.field) return null;
  const field = getHeatCalcFieldConfig(column.field);
  if (!field) return null;
  const objectTypes: HeatCalcObjectType[] = type === 'all' ? ['pipe', 'tank'] : [type];
  for (const objectType of objectTypes) {
    if (!field.object_types.includes(objectType)) continue;
    const input = getHeatCalcFieldInputConfig(column.field, objectType);
    if (input?.type) return input.type;
  }
  return null;
}

function isEditableColumn(type: HeatCalcTableColumnScope, column: HeatCalcResolvedColumnMeta) {
  const inputType = fieldInputTypeForColumn(type, column);
  return inputType === 'text'
    || inputType === 'number'
    || inputType === 'select'
    || inputType === 'reference';
}

function columnNatureBadge(
  type: HeatCalcTableColumnScope,
  column: HeatCalcResolvedColumnMeta,
  detailsBadge: ComputedColumnBadge | null,
) {
  if (SERVICE_COLUMN_KEYS.has(column.key)) return null;
  if (detailsBadge) return COMPUTED_COLUMN_BADGE;
  if (fieldInputTypeForColumn(type, column) === 'computed') return COMPUTED_COLUMN_BADGE;
  return isEditableColumn(type, column) ? INPUT_COLUMN_BADGE : null;
}

function getColumnStepSettings(
  type: HeatCalcTableColumnScope,
  columnKey: HeatCalcColumnKey,
  settings: HeatCalcFieldInputSettings,
): ColumnStepSettings | null {
  const objectTypes: HeatCalcObjectType[] = type === 'all' ? ['pipe', 'tank'] : [type];
  const items = objectTypes
    .map((objectType) => {
      const field = getHeatCalcFieldByColumn(objectType, columnKey);
      if (!isNumberFieldWithStep(objectType, field)) return null;
      const step = resolveHeatCalcFieldStep(objectType, field.id, settings) ?? field.step;
      return {
        objectType,
        fieldId: field.id,
        field,
        step,
      };
    })
    .filter((item): item is {
      objectType: HeatCalcObjectType;
      fieldId: string;
      field: HeatCalcFieldDefinition & { step: number };
      step: number;
    } => item != null);
  if (items.length === 0) return null;

  const first = items[0];
  const unit = items.every((item) => item.field.unit === first.field.unit) ? first.field.unit : undefined;
  const defaultStep = first.field.step;
  const step = first.step;
  const overridden = items.some((item) => !sameNumber(item.step, item.field.step));
  return {
    targets: items.map((item) => ({
      objectType: item.objectType,
      fieldId: item.fieldId,
    })),
    step,
    defaultStep,
    unit,
    overridden,
  };
}

function ColumnSettingsRowContent({
  type,
  column,
  stepSettings,
  rowCount,
  dragHandle,
  onVisibleChange,
  onOrderChange,
  onWidthChange,
  onStepChange,
  onResetStep,
  onResetWidth,
}: {
  type: HeatCalcTableColumnScope;
  column: HeatCalcResolvedColumnMeta;
  stepSettings: ColumnStepSettings | null;
  rowCount: number;
  dragHandle: ReactNode;
  onVisibleChange: (key: HeatCalcColumnKey, visible: boolean) => void;
  onOrderChange: (key: HeatCalcColumnKey, order: number) => void;
  onWidthChange: (key: HeatCalcColumnKey, widthPct: number) => void;
  onStepChange: (targets: ColumnStepTarget[], step: number | null) => void;
  onResetStep: (targets: ColumnStepTarget[]) => void;
  onResetWidth: (key: HeatCalcColumnKey) => void;
}) {
  const orderValue = column.visible && column.order != null ? column.order : null;
  const [draftOrder, setDraftOrder] = useState<number | null>(orderValue);
  const [orderEditing, setOrderEditing] = useState(false);
  const metaLabel = column.title !== column.labels.full ? column.labels.full : column.labels.short;
  const computedBadge = computedColumnBadge(column);
  const natureBadge = columnNatureBadge(type, column, computedBadge);

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
        <span className="column-layout-title-row">
          <span className="column-layout-title">{column.title}</span>
          {natureBadge && (
            <Tooltip title={natureBadge.tooltip}>
              <Tag className={`column-layout-nature-tag column-layout-nature-tag--${natureBadge.tone}`}>
                {natureBadge.label}
              </Tag>
            </Tooltip>
          )}
          {computedBadge && (
            <Tooltip title={computedBadge.tooltip}>
              <Tag className={`column-layout-computed-tag column-layout-computed-tag--${computedBadge.tone}`}>
                {computedBadge.label}
              </Tag>
            </Tooltip>
          )}
        </span>
        <span className="column-layout-meta">{metaLabel} · {column.group}</span>
      </div>
      {stepSettings ? (
        <InputNumber
          size="small"
          min={0.000001}
          max={1000000}
          step={stepSettings.defaultStep}
          value={stepSettings.step}
          aria-label={`Шаг: ${column.label}`}
          onChange={(value) => {
            const nextStep = Number(value);
            onStepChange(stepSettings.targets, Number.isFinite(nextStep) ? nextStep : null);
          }}
        />
      ) : (
        <span className="column-layout-empty">—</span>
      )}
      <span className="column-layout-unit">{stepSettings?.unit ?? ''}</span>
      <Tooltip title={stepSettings ? 'Сбросить шаг поля' : 'У поля нет настройки шага'}>
        <Button
          size="small"
          icon={<ReloadOutlined />}
          disabled={!stepSettings || !stepSettings.overridden}
          aria-label={`Сбросить шаг: ${column.label}`}
          onClick={() => {
            if (stepSettings) onResetStep(stepSettings.targets);
          }}
        />
      </Tooltip>
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
  type,
  column,
  stepSettings,
  rowCount,
  onVisibleChange,
  onOrderChange,
  onWidthChange,
  onStepChange,
  onResetStep,
  onResetWidth,
}: {
  type: HeatCalcTableColumnScope;
  column: HeatCalcResolvedColumnMeta;
  stepSettings: ColumnStepSettings | null;
  rowCount: number;
  onVisibleChange: (key: HeatCalcColumnKey, visible: boolean) => void;
  onOrderChange: (key: HeatCalcColumnKey, order: number) => void;
  onWidthChange: (key: HeatCalcColumnKey, widthPct: number) => void;
  onStepChange: (targets: ColumnStepTarget[], step: number | null) => void;
  onResetStep: (targets: ColumnStepTarget[]) => void;
  onResetWidth: (key: HeatCalcColumnKey) => void;
}) {
  return (
    <div className="column-layout-row hidden" data-column-key={column.key}>
      <ColumnSettingsRowContent
        type={type}
        column={column}
        stepSettings={stepSettings}
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
        onStepChange={onStepChange}
        onResetStep={onResetStep}
        onResetWidth={onResetWidth}
      />
    </div>
  );
}

function SortableColumnSettingsRow({
  type,
  column,
  stepSettings,
  rowCount,
  onVisibleChange,
  onOrderChange,
  onWidthChange,
  onStepChange,
  onResetStep,
  onResetWidth,
}: {
  type: HeatCalcTableColumnScope;
  column: HeatCalcResolvedColumnMeta;
  stepSettings: ColumnStepSettings | null;
  rowCount: number;
  onVisibleChange: (key: HeatCalcColumnKey, visible: boolean) => void;
  onOrderChange: (key: HeatCalcColumnKey, order: number) => void;
  onWidthChange: (key: HeatCalcColumnKey, widthPct: number) => void;
  onStepChange: (targets: ColumnStepTarget[], step: number | null) => void;
  onResetStep: (targets: ColumnStepTarget[]) => void;
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
        type={type}
        column={column}
        stepSettings={stepSettings}
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
        onStepChange={onStepChange}
        onResetStep={onResetStep}
        onResetWidth={onResetWidth}
      />
    </div>
  );
}

interface ColumnSettingsModalProps {
  open: boolean;
  activeType: HeatCalcTableColumnScope;
  draftColumnSettings: HeatCalcTableColumnSettings;
  draftViewSettings: HeatCalcTableViewSettings;
  draftCalculationDetailsSettings: HeatCalcCalculationDetailsSettings;
  draftFieldInputSettings: HeatCalcFieldInputSettings;
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
  onFontSizeChange: (fontSize: HeatCalcTableFontSize) => void;
  onTableLabelFormatChange: (format: HeatCalcTableLabelFormat) => void;
  onSettingsLabelFormatChange: (format: HeatCalcTableLabelFormat) => void;
  onFormPlacementChange: (placement: HeatCalcFormPlacement) => void;
  onResetFontSize: () => void;
  onResetLabelFormats: () => void;
  onCalculationDetailsPresetChange: (preset: HeatCalcCalculationDetailPreset) => void;
  onCalculationDetailMetricsChange: (metrics: HeatCalcCalculationDetailMetric[]) => void;
  onResetCalculationDetails: () => void;
  onFieldStepChange: (type: HeatCalcObjectType, fieldId: string, step: number | null) => void;
  onResetFieldStep: (type: HeatCalcObjectType, fieldId: string) => void;
}

export default function ColumnSettingsModal({
  open,
  activeType,
  draftColumnSettings,
  draftViewSettings,
  draftCalculationDetailsSettings,
  draftFieldInputSettings,
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
  onTableLabelFormatChange,
  onSettingsLabelFormatChange,
  onFormPlacementChange,
  onResetFontSize,
  onResetLabelFormats,
  onCalculationDetailsPresetChange,
  onCalculationDetailMetricsChange,
  onResetCalculationDetails,
  onFieldStepChange,
  onResetFieldStep,
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
                    <Button size="small" onClick={() => onSelectAllColumns(activeType)}>
                      Все поля
                    </Button>
                    <Button size="small" onClick={() => onResetColumns(activeType)}>
                      Сбросить текущий тип
                    </Button>
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
                    <div className="column-layout-list" role="list" aria-label={`Настройки таблицы: ${TABLE_SETTINGS_TYPE_LABELS[activeType]}`}>
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
                      <SortableContext items={visibleColumns.map((column) => column.key)} strategy={verticalListSortingStrategy}>
                        {visibleColumns.map((column) => (
                          <SortableColumnSettingsRow
                            key={column.key}
                            type={activeType}
                            column={column}
                            stepSettings={getColumnStepSettings(activeType, column.key, draftFieldInputSettings)}
                            rowCount={visibleRowCount}
                            onVisibleChange={(key, visible) => onVisibleChange(activeType, key, visible)}
                            onOrderChange={handleOrderChange}
                            onWidthChange={(key, widthPct) => onWidthChange(activeType, key, widthPct)}
                            onStepChange={(targets, step) => {
                              targets.forEach((target) => onFieldStepChange(target.objectType, target.fieldId, step));
                            }}
                            onResetStep={(targets) => {
                              targets.forEach((target) => onResetFieldStep(target.objectType, target.fieldId));
                            }}
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
                          stepSettings={getColumnStepSettings(activeType, column.key, draftFieldInputSettings)}
                          rowCount={visibleRowCount}
                          onVisibleChange={(key, visible) => onVisibleChange(activeType, key, visible)}
                          onOrderChange={handleOrderChange}
                          onWidthChange={(key, widthPct) => onWidthChange(activeType, key, widthPct)}
                          onStepChange={(targets, step) => {
                            targets.forEach((target) => onFieldStepChange(target.objectType, target.fieldId, step));
                          }}
                          onResetStep={(targets) => {
                            targets.forEach((target) => onResetFieldStep(target.objectType, target.fieldId));
                          }}
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
                    <Button size="small" onClick={onResetLabelFormats}>
                      Сбросить названия
                    </Button>
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
                    <Button size="small" onClick={onResetCalculationDetails}>
                      Сбросить расшифровку
                    </Button>
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

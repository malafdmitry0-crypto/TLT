import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { Checkbox, Tooltip } from 'antd';
import { HolderOutlined, ReloadOutlined } from '@ant-design/icons';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import {
  type HeatCalcColumnKey,
  type HeatCalcResolvedColumnMeta,
  type HeatCalcTableColumnScope,
} from '@/utils/heatCalcTableColumns';
import {
  getHeatCalcFieldConfig,
  getHeatCalcFieldInputConfig,
} from '@/domain/heatCalcFields';
import type { HeatCalcObjectType } from '@/types/project';
import { TltBadge, TltButton, TltNumberField } from '@/components/ui-kit';

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

export interface ColumnSettingsRowHandlers {
  type: HeatCalcTableColumnScope;
  column: HeatCalcResolvedColumnMeta;
  rowCount: number;
  onVisibleChange: (key: HeatCalcColumnKey, visible: boolean) => void;
  onOrderChange: (key: HeatCalcColumnKey, order: number) => void;
  onWidthChange: (key: HeatCalcColumnKey, widthPct: number) => void;
  onResetWidth: (key: HeatCalcColumnKey) => void;
}

function ColumnSettingsRowContent({
  type,
  column,
  rowCount,
  dragHandle,
  onVisibleChange,
  onOrderChange,
  onWidthChange,
  onResetWidth,
}: ColumnSettingsRowHandlers & {
  dragHandle: ReactNode;
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
      <TltNumberField
        min={1}
        max={Math.max(1, rowCount)}
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
              <TltBadge className={`column-layout-nature-tag column-layout-nature-tag--${natureBadge.tone}`}>
                {natureBadge.label}
              </TltBadge>
            </Tooltip>
          )}
          {computedBadge && (
            <Tooltip title={computedBadge.tooltip}>
              <TltBadge className={`column-layout-computed-tag column-layout-computed-tag--${computedBadge.tone}`}>
                {computedBadge.label}
              </TltBadge>
            </Tooltip>
          )}
        </span>
        <span className="column-layout-meta">{metaLabel} · {column.group}</span>
      </div>
      <TltNumberField
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
        <TltButton
          icon={<ReloadOutlined />}
          aria-label={`Сбросить ширину: ${column.label}`}
          onClick={() => onResetWidth(column.key)}
        />
      </Tooltip>
    </>
  );
}

export function ColumnSettingsRow(props: ColumnSettingsRowHandlers) {
  const { column } = props;
  return (
    <div className="column-layout-row column-layout-row--heatcalc hidden" data-column-key={column.key}>
      <ColumnSettingsRowContent
        {...props}
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
      />
    </div>
  );
}

export function SortableColumnSettingsRow(props: ColumnSettingsRowHandlers) {
  const { column } = props;
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
      className={isDragging
        ? 'column-layout-row column-layout-row--heatcalc dragging'
        : 'column-layout-row column-layout-row--heatcalc'}
      data-column-key={column.key}
    >
      <ColumnSettingsRowContent
        {...props}
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
      />
    </div>
  );
}

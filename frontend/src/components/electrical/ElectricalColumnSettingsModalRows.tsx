import {
  type CSSProperties,
  type ReactNode,
} from 'react';
import { Checkbox, Tooltip } from 'antd';
import { HolderOutlined, ReloadOutlined } from '@ant-design/icons';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import { TltBadge, TltButton, TltNumberField } from '@/components/ui-kit';
import {
  ELECTRICAL_TABLE_COLUMN_MAX_WIDTH_PCT,
  ELECTRICAL_TABLE_COLUMN_MIN_WIDTH_PCT,
  type ElectricalColumnKey,
  type ElectricalResolvedColumnMeta,
} from '@/utils/electricalTableColumns';

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
  installed_cable_length: {
    label: 'Укладка',
    tooltip: 'Уложенная длина кабеля для мощности и тока',
    tone: 'result',
  },
  order_cable_length: {
    label: 'Заказ',
    tooltip: 'Длина для спецификации и закупки с монтажным запасом 10%',
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
            <TltBadge className={`column-layout-nature-tag column-layout-nature-tag--${natureBadge.tone}`}>
              {natureBadge.label}
            </TltBadge>
          </Tooltip>
        )}
        {detailBadge && (
          <Tooltip title={detailBadge.tooltip} placement="top" zIndex={3000}>
            <TltBadge className={`column-layout-computed-tag column-layout-computed-tag--${detailBadge.tone}`}>
              {detailBadge.label}
            </TltBadge>
          </Tooltip>
        )}
      </span>
      <span className="column-layout-meta">{metaLabel}</span>
    </div>
  );
}

export interface ElectricalColumnSettingsRowHandlers {
  column: ElectricalResolvedColumnMeta;
  rowCount: number;
  onVisibleChange: (key: ElectricalColumnKey, checked: boolean) => void;
  onOrderChange: (key: ElectricalColumnKey, order: number) => void;
  onWidthChange: (key: ElectricalColumnKey, widthPct: number) => void;
  onResetWidth: (key: ElectricalColumnKey) => void;
}

function ColumnSettingsRowContent({
  column,
  rowCount,
  dragHandle,
  onVisibleChange,
  onOrderChange,
  onWidthChange,
  onResetWidth,
}: ElectricalColumnSettingsRowHandlers & {
  dragHandle: ReactNode;
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
        <TltNumberField
          min={1}
          max={Math.max(1, rowCount)}
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
      <TltNumberField
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
        <TltButton
          aria-label={`Сбросить ширину ${column.label}`}
          icon={<ReloadOutlined />}
          onClick={() => onResetWidth(column.key)}
        />
      </Tooltip>
    </>
  );
}

export function ColumnSettingsRow(props: ElectricalColumnSettingsRowHandlers) {
  const { column } = props;
  return (
    <div className="column-layout-row column-layout-row--electrical hidden" data-column-key={column.key}>
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

export function SortableColumnSettingsRow(props: ElectricalColumnSettingsRowHandlers) {
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
        ? 'column-layout-row column-layout-row--electrical dragging'
        : 'column-layout-row column-layout-row--electrical'}
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

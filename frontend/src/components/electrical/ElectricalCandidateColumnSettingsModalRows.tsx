/**
 * Sortable / hidden row components for ElectricalCandidateColumnSettingsModal.
 */
import {
  type CSSProperties,
  type ReactNode,
} from 'react';
import { Checkbox, Tooltip } from 'antd';
import { HolderOutlined, ReloadOutlined } from '@ant-design/icons';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import { TltButton, TltNumberField } from '@/components/ui-kit';
import {
  ELECTRICAL_TABLE_COLUMN_MAX_WIDTH_PCT,
  ELECTRICAL_TABLE_COLUMN_MIN_WIDTH_PCT,
  type ElectricalCandidateColumnKey,
  type ElectricalCandidateResolvedColumnMeta,
} from '@/utils/electricalCandidateTableColumns';
import {
  renderCandidateColumnLabel,
} from '@/components/electrical/electricalCandidateColumnSettingsLabels';

function CandidateColumnRowContent({
  column,
  rowCount,
  dragHandle,
  onVisibleChange,
  onOrderChange,
  onWidthChange,
  onResetWidth,
}: {
  column: ElectricalCandidateResolvedColumnMeta;
  rowCount: number;
  dragHandle: ReactNode;
  onVisibleChange: (key: ElectricalCandidateColumnKey, checked: boolean) => void;
  onOrderChange: (key: ElectricalCandidateColumnKey, order: number) => void;
  onWidthChange: (key: ElectricalCandidateColumnKey, widthPct: number) => void;
  onResetWidth: (key: ElectricalCandidateColumnKey) => void;
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
      {renderCandidateColumnLabel(column)}
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

export function CandidateColumnRow({
  column,
  rowCount,
  onVisibleChange,
  onOrderChange,
  onWidthChange,
  onResetWidth,
}: {
  column: ElectricalCandidateResolvedColumnMeta;
  rowCount: number;
  onVisibleChange: (key: ElectricalCandidateColumnKey, checked: boolean) => void;
  onOrderChange: (key: ElectricalCandidateColumnKey, order: number) => void;
  onWidthChange: (key: ElectricalCandidateColumnKey, widthPct: number) => void;
  onResetWidth: (key: ElectricalCandidateColumnKey) => void;
}) {
  return (
    <div className="column-layout-row column-layout-row--candidate hidden" data-column-key={column.key}>
      <CandidateColumnRowContent
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

export function SortableCandidateColumnRow({
  column,
  rowCount,
  onVisibleChange,
  onOrderChange,
  onWidthChange,
  onResetWidth,
}: {
  column: ElectricalCandidateResolvedColumnMeta;
  rowCount: number;
  onVisibleChange: (key: ElectricalCandidateColumnKey, checked: boolean) => void;
  onOrderChange: (key: ElectricalCandidateColumnKey, order: number) => void;
  onWidthChange: (key: ElectricalCandidateColumnKey, widthPct: number) => void;
  onResetWidth: (key: ElectricalCandidateColumnKey) => void;
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
      className={
        isDragging
          ? 'column-layout-row column-layout-row--candidate dragging'
          : 'column-layout-row column-layout-row--candidate'
      }
      data-column-key={column.key}
    >
      <CandidateColumnRowContent
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

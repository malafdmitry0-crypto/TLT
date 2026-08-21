import { Tooltip } from 'antd';
import { TltBadge } from '@/components/ui-kit';
import type {
  ElectricalCandidateColumnKey,
  ElectricalCandidateResolvedColumnMeta,
} from '@/utils/electricalCandidateTableColumns';

const SERVICE_COLUMN_KEYS = new Set<ElectricalCandidateColumnKey>(['marked', 'actions']);

function sourceTag(column: ElectricalCandidateResolvedColumnMeta) {
  if (SERVICE_COLUMN_KEYS.has(column.key) || column.valueType === 'service') {
    return {
      className: 'column-layout-nature-tag column-layout-nature-tag--computed',
      label: 'Действие',
      title: 'Служебная колонка модалки подбора кабеля.',
    };
  }
  if (column.valueType === 'input') {
    return {
      className: 'column-layout-nature-tag column-layout-nature-tag--input',
      label: 'Вводится',
      title: 'Входной параметр или параметр расчёта кандидата.',
    };
  }
  return {
    className: 'column-layout-nature-tag column-layout-nature-tag--computed',
    label: 'Вычисляется',
    title: 'Значение приходит из варианта подбора или результата расчёта.',
  };
}

function renderCandidateColumnLabel(column: ElectricalCandidateResolvedColumnMeta) {
  const tag = sourceTag(column);
  const metaLabel = column.labels.compact && column.labels.compact !== column.title
    ? `${column.labels.compact} · ${column.group}`
    : column.group;
  return (
    <div className="column-layout-label">
      <span className="column-layout-title-row">
        <Tooltip title={column.helpText || column.label} placement="top" zIndex={3000}>
          <span className="column-layout-title">{column.title}</span>
        </Tooltip>
        <Tooltip title={tag.title} placement="top" zIndex={3000}>
          <TltBadge className={tag.className}>{tag.label}</TltBadge>
        </Tooltip>
      </span>
      <span className="column-layout-meta">{metaLabel}</span>
    </div>
  );
}

export { renderCandidateColumnLabel };

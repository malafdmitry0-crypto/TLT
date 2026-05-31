import { useMemo, type HTMLAttributes, type PointerEvent as ReactPointerEvent } from 'react';
import { Button, Checkbox, Dropdown, Space, Tooltip } from 'antd';
import type { MenuProps } from 'antd';
import {
  CheckOutlined,
  FilterFilled,
  FolderOutlined,
  StopOutlined,
  UndoOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';

import ElectricalColumnFilterDropdown from '@/components/electrical/ElectricalColumnFilterDropdown';
import { renderCandidateElectricalField } from '@/components/electrical/ElectricalCandidateFieldRenderer';
import ResizableColumnTitle from '@/components/heatcalc/ResizableColumnTitle';
import {
  filterKindForCandidateColumn,
} from '@/pages/electrical/elecCalcTableFilterModel';
import type { ElectricalCandidate } from '@/types/calculation';
import type {
  ElectricalCandidateColumnKey,
  ElectricalCandidateResolvedColumnMeta,
} from '@/utils/electricalCandidateTableColumns';
import {
  isColumnFilterActive,
  type HeatCalcColumnFilter,
  type HeatCalcTableViewState,
} from '@/utils/heatCalcTableFindability';

type CandidateUpdatePatch = Partial<Pick<ElectricalCandidate, 'is_pinned' | 'status'>>;

type CandidateUpdateArgs = {
  candidateId: string;
  patch: CandidateUpdatePatch;
};

type UseElecCalcCandidateColumnsOptions = {
  visibleCandidateColumnMetas: readonly ElectricalCandidateResolvedColumnMeta[];
  candidateTableViewState: HeatCalcTableViewState;
  candidateEnumOptionsByColumn: Partial<Record<ElectricalCandidateColumnKey, Array<{ value: string; label: string }>>>;
  markedCandidateIds: readonly string[];
  applyCandidatePending: boolean;
  applyingCandidateId?: string | null;
  updateCandidatePending: boolean;
  toggleCandidateFolderItemPending: boolean;
  onCandidateColumnResizeStart: (
    column: ElectricalCandidateResolvedColumnMeta,
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => void;
  onSetCandidateColumnFilter: (
    columnKey: ElectricalCandidateColumnKey,
    filter?: HeatCalcColumnFilter,
  ) => void;
  onResetCandidateColumnFilter: (columnKey: ElectricalCandidateColumnKey) => void;
  isCandidateCompareDiffCell: (
    candidate: ElectricalCandidate,
    columnKey: ElectricalCandidateColumnKey,
  ) => boolean;
  onToggleCandidateMark: (candidateId: string, checked: boolean) => void;
  onApplyCandidate: (candidateId: string) => void;
  onUpdateCandidate: (args: CandidateUpdateArgs) => void;
  candidateFolderMenuItems: (candidate: ElectricalCandidate) => MenuProps['items'];
};

export function useElecCalcCandidateColumns({
  visibleCandidateColumnMetas,
  candidateTableViewState,
  candidateEnumOptionsByColumn,
  markedCandidateIds,
  applyCandidatePending,
  applyingCandidateId,
  updateCandidatePending,
  toggleCandidateFolderItemPending,
  onCandidateColumnResizeStart,
  onSetCandidateColumnFilter,
  onResetCandidateColumnFilter,
  isCandidateCompareDiffCell,
  onToggleCandidateMark,
  onApplyCandidate,
  onUpdateCandidate,
  candidateFolderMenuItems,
}: UseElecCalcCandidateColumnsOptions) {
  return useMemo<ColumnsType<ElectricalCandidate>>(() =>
    visibleCandidateColumnMetas.map((column) => {
      const filterEnabled = column.key !== 'actions';
      const sortEnabled = column.key !== 'actions';
      const activeFilter = candidateTableViewState.filters[column.key];
      const filterKind = filterKindForCandidateColumn(column.key);
      const columnTitle = (
        <ResizableColumnTitle
          title={column.title}
          label={column.label}
          onResizeStart={(event) => onCandidateColumnResizeStart(column, event)}
        />
      );
      const baseColumn = {
        title: columnTitle,
        key: column.key,
        columnKey: column.key,
        width: Math.max(column.width, column.minWidthPx),
        fixed: column.fixed,
        sorter: sortEnabled,
        sortOrder: sortEnabled && candidateTableViewState.sort?.columnKey === column.key
          ? candidateTableViewState.sort.direction === 'asc'
            ? 'ascend' as const
            : 'descend' as const
          : null,
        showSorterTooltip: false,
        filtered: isColumnFilterActive(activeFilter),
        filterIcon: filterEnabled ? () => (
          <span
            role="button"
            aria-label={`Фильтр ${column.label}`}
            className="table-filter-trigger"
            style={{ pointerEvents: 'auto' }}
          >
            <FilterFilled
              className={isColumnFilterActive(activeFilter) ? 'table-filter-icon active' : 'table-filter-icon'}
            />
          </span>
        ) : undefined,
        filterDropdown: filterEnabled ? ({ close }: { close: () => void }) => (
          <ElectricalColumnFilterDropdown
            title={column.label}
            kind={filterKind}
            filter={activeFilter}
            enumOptions={candidateEnumOptionsByColumn[column.key] ?? []}
            onApply={(filter) => onSetCandidateColumnFilter(column.key, filter)}
            onReset={() => onResetCandidateColumnFilter(column.key)}
            onClose={close}
          />
        ) : undefined,
        onCell: (candidate: ElectricalCandidate) => {
          const isDiff = isCandidateCompareDiffCell(candidate, column.key);
          return {
            className: isDiff ? 'electrical-candidate-cell--diff' : undefined,
            title: isDiff ? 'Отличается в выбранных вариантах' : undefined,
            'data-testid': isDiff ? `candidate-diff-${candidate.id}-${column.key}` : undefined,
          } as HTMLAttributes<HTMLElement>;
        },
      };
      if (column.key === 'marked') {
        return {
          ...baseColumn,
          align: 'center' as const,
          render: (_value, candidate) => (
            <Checkbox
              aria-label={`Пометить кандидат ${candidate.cable_mark ?? candidate.id}`}
              data-testid={`candidate-mark-${candidate.id}`}
              checked={markedCandidateIds.includes(candidate.id)}
              onChange={(event) => onToggleCandidateMark(candidate.id, event.target.checked)}
            />
          ),
        };
      }
      if (column.key === 'actions') {
        return {
          ...baseColumn,
          render: (_value, candidate) => {
            const candidateName = candidate.cable_mark ?? candidate.id;
            const applyTooltip = candidate.is_applied
              ? 'Уже выбран'
              : candidate.status !== 'applicable'
                ? candidate.reason_message ?? 'Недоступно для выбора'
                : 'Выбрать';
            const excluded = candidate.status === 'excluded';
            const exclusionTooltip = excluded ? 'Вернуть вариант' : 'Исключить вариант';

            return (
              <Space size={2} wrap={false} className="electrical-candidate-actions">
                <Tooltip title={applyTooltip}>
                  <Button
                    aria-label={`${applyTooltip} кандидат ${candidateName}`}
                    aria-pressed={candidate.is_applied}
                    data-testid={`candidate-apply-${candidate.id}`}
                    className="electrical-candidate-action-button"
                    size="small"
                    type={candidate.is_applied ? 'primary' : 'default'}
                    icon={<CheckOutlined />}
                    disabled={
                      candidate.status !== 'applicable' ||
                      applyCandidatePending
                    }
                    loading={applyCandidatePending && applyingCandidateId === candidate.id}
                    onClick={() => {
                      if (!candidate.is_applied) {
                        onApplyCandidate(candidate.id);
                      }
                    }}
                  />
                </Tooltip>
                <Dropdown
                  trigger={['click']}
                  menu={{ items: candidateFolderMenuItems(candidate) }}
                >
                  <Button
                    aria-label={`Добавить кандидат ${candidateName} в папку`}
                    data-testid={`candidate-folder-${candidate.id}`}
                    className="electrical-candidate-action-button"
                    size="small"
                    icon={<FolderOutlined />}
                    disabled={toggleCandidateFolderItemPending}
                  />
                </Dropdown>
                <Tooltip title={exclusionTooltip}>
                  <Button
                    aria-label={exclusionTooltip}
                    data-testid={`candidate-exclude-${candidate.id}`}
                    className="electrical-candidate-action-button"
                    size="small"
                    danger={!excluded}
                    icon={excluded ? <UndoOutlined /> : <StopOutlined />}
                    disabled={updateCandidatePending}
                    onClick={() => onUpdateCandidate({
                      candidateId: candidate.id,
                      patch: {
                        status: excluded ? 'applicable' : 'excluded',
                      },
                    })}
                  />
                </Tooltip>
              </Space>
            );
          },
        };
      }
      if (column.key === 'mode') {
        return {
          ...baseColumn,
          dataIndex: 'mode',
          render: (value) => (value === 'auto' ? 'Авто' : 'Ручной'),
        };
      }
      return {
        ...baseColumn,
        dataIndex: column.key,
        ellipsis: column.key === 'selection_reason' ? false : column.ellipsis,
        align: column.align,
        render: (_value: unknown, candidate: ElectricalCandidate) =>
          renderCandidateElectricalField(column.key, candidate),
      };
    }), [
    applyCandidatePending,
    applyingCandidateId,
    candidateEnumOptionsByColumn,
    candidateFolderMenuItems,
    candidateTableViewState.filters,
    candidateTableViewState.sort,
    isCandidateCompareDiffCell,
    markedCandidateIds,
    onApplyCandidate,
    onCandidateColumnResizeStart,
    onResetCandidateColumnFilter,
    onSetCandidateColumnFilter,
    onToggleCandidateMark,
    onUpdateCandidate,
    toggleCandidateFolderItemPending,
    updateCandidatePending,
    visibleCandidateColumnMetas,
  ]);
}

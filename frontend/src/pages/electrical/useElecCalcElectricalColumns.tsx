import { useMemo, type PointerEvent as ReactPointerEvent } from 'react';
import { FilterFilled } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';

import ElectricalColumnFilterDropdown from '@/components/electrical/ElectricalColumnFilterDropdown';
import ResizableColumnTitle from '@/components/heatcalc/ResizableColumnTitle';
import type { ElectricalColumnRenderSpec } from '@/pages/electrical/elecCalcPageModel';
import {
  filterKindForElectricalColumn,
} from '@/pages/electrical/elecCalcTableFilterModel';
import type { ObjectQueryFieldCapability } from '@/types/project';
import type { ProjectObject } from '@/types/project';
import type {
  ElectricalColumnKey,
  ElectricalResolvedColumnMeta,
} from '@/utils/electricalTableColumns';
import {
  isColumnFilterActive,
  type HeatCalcColumnFilter,
  type HeatCalcTableViewState,
} from '@/utils/heatCalcTableFindability';

type UseElecCalcElectricalColumnsOptions = {
  visibleElectricalColumnMetas: readonly ElectricalResolvedColumnMeta[];
  electricalColumnRenderers: Record<ElectricalColumnKey, ElectricalColumnRenderSpec>;
  fieldCapabilityByKey: Map<string, ObjectQueryFieldCapability>;
  enumOptionsByColumn: Partial<Record<ElectricalColumnKey, Array<{ value: string; label: string }>>>;
  tableViewState: HeatCalcTableViewState;
  onColumnResizeStart: (
    column: ElectricalResolvedColumnMeta,
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => void;
  onSetColumnFilter: (
    columnKey: ElectricalColumnKey,
    filter?: HeatCalcColumnFilter,
  ) => void;
  onResetColumnFilter: (columnKey: ElectricalColumnKey) => void;
};

export function useElecCalcElectricalColumns({
  visibleElectricalColumnMetas,
  electricalColumnRenderers,
  fieldCapabilityByKey,
  enumOptionsByColumn,
  tableViewState,
  onColumnResizeStart,
  onSetColumnFilter,
  onResetColumnFilter,
}: UseElecCalcElectricalColumnsOptions) {
  return useMemo<ColumnsType<ProjectObject>>(() =>
    visibleElectricalColumnMetas.map((column) => {
      const renderer = electricalColumnRenderers[column.key];
      const capability = fieldCapabilityByKey.get(column.key);
      const filterEnabled = column.key !== 'index' && (capability?.filter.enabled ?? false);
      const sortEnabled = column.key !== 'index' && (capability?.sort.enabled ?? false);
      const filterKind = filterKindForElectricalColumn(column.key, capability);
      const activeFilter = tableViewState.filters[column.key];
      return {
        key: column.key,
        title: (
          <ResizableColumnTitle
            title={column.title}
            label={column.label}
            onResizeStart={(event) => onColumnResizeStart(column, event)}
          />
        ),
        columnKey: column.key,
        width: Math.max(column.width, column.minWidthPx),
        align: renderer?.align,
        ellipsis: column.key === 'selection_reason'
          ? false
          : column.ellipsis || renderer?.ellipsis,
        render: renderer?.render ?? (() => '—'),
        sorter: sortEnabled,
        sortOrder: sortEnabled && tableViewState.sort?.columnKey === column.key
          ? tableViewState.sort.direction === 'asc'
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
        filterDropdown: filterEnabled ? ({ close }) => (
          <ElectricalColumnFilterDropdown
            title={column.label}
            kind={filterKind}
            filter={activeFilter}
            enumOptions={enumOptionsByColumn[column.key] ?? []}
            onApply={(filter) => onSetColumnFilter(column.key, filter)}
            onReset={() => onResetColumnFilter(column.key)}
            onClose={close}
          />
        ) : undefined,
      };
    }), [
    electricalColumnRenderers,
    enumOptionsByColumn,
    fieldCapabilityByKey,
    onColumnResizeStart,
    onResetColumnFilter,
    onSetColumnFilter,
    tableViewState,
    visibleElectricalColumnMetas,
  ]);
}

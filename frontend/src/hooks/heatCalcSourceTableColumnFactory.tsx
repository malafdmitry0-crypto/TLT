/**
 * Factory for a single heatCalc AntD source column (normal + excel-capable cells).
 */
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import { Typography } from 'antd';
import { FilterFilled } from '@ant-design/icons';
import type { ColumnType } from 'antd/es/table';

import EditableTableCell from '@/components/heatcalc/EditableTableCell';
import ResizableColumnTitle from '@/components/shared/ResizableColumnTitle';
import type { ProjectObject, ObjectQueryFieldCapability } from '@/types/project';
import { heatCalcSelectOptions } from '@/utils/heatCalcWizardFieldRules';
import {
  buildDraftDisplayRecord,
  getInlineCellFormValue,
  getInlineEditFieldConfig,
  getInlineRowFormValues,
  type DraftRowsById,
  type DraftRowState,
} from '@/utils/heatCalcInlineEdit';
import {
  isExcelCellActive,
  type ExcelCellPosition,
} from '@/utils/heatCalcExcelMode';
import {
  type HeatCalcColumnKey,
  type HeatCalcObjectType,
  type HeatCalcResolvedColumnMeta,
  type HeatCalcTableColumnScope,
} from '@/utils/heatCalcTableColumns';
import {
  isColumnFilterActive,
  type HeatCalcColumnFilter,
  type HeatCalcTableViewState,
} from '@/utils/heatCalcTableFindability';
import {
  resolveHeatCalcFieldStep,
  type HeatCalcFieldInputSettings,
} from '@/utils/heatCalcFieldInputSettings';
import type {
  HeatCalcExcelCellCoordinates,
  HeatCalcExcelCellRef,
} from '@/hooks/useHeatCalcExcelSelection';
import ColumnFilterDropdown from '@/components/heatcalc/HeatCalcColumnFilterDropdown';
import {
  INAPPLICABLE_TABLE_VALUE,
  filterKindForColumn,
  isColumnApplicableToObjectType,
} from '@/utils/heatCalcPageUtils';
import {
  isExcelCellSelectedByLookup,
  type ExcelSelectionLookup,
} from '@/utils/heatCalcExcelSelectionLookupModel';

const { Text } = Typography;

type HeatCalcContextMenuTrigger = import('@/components/heatcalc/HeatCalcContextMenuTrigger').HeatCalcContextMenuTrigger;

export type HeatCalcTableColumnRenderSpec = Pick<ColumnType<ProjectObject>, 'render' | 'ellipsis' | 'align'> & {
  copyValue: (record: ProjectObject, index: number) => string;
};

export interface BuildHeatCalcSourceTableColumnArgs {
  meta: HeatCalcResolvedColumnMeta;
  columnIndex: number;
  activeTableColumnScope: HeatCalcTableColumnScope;
  activeTableObjectType: HeatCalcObjectType;
  activeTableViewState: HeatCalcTableViewState;
  activeInlineCell: HeatCalcExcelCellRef;
  activeExcelCellPosition: ExcelCellPosition | null;
  beginExcelCellSelection: (
    rowIndex: number,
    columnIndex: number,
    event: ReactPointerEvent<HTMLElement>,
  ) => void;
  beginExcelColumnSelection: (columnIndex: number, event: ReactPointerEvent<HTMLElement>) => void;
  columnRenderers: Record<HeatCalcColumnKey, HeatCalcTableColumnRenderSpec>;
  commitInlineCell: (record: ProjectObject, columnKey: string, value: unknown) => string | null;
  draftRowsById: DraftRowsById;
  enumOptionsByColumn: Record<HeatCalcColumnKey, { label: string; value: string }[]>;
  excelCellDisplayValue: (
    record: ProjectObject,
    columnKey: string,
    draftRow: DraftRowState | undefined,
  ) => string;
  excelModeEnabled: boolean;
  excelSelectionLookup: ExcelSelectionLookup;
  extendExcelCellSelection: (rowIndex: number, columnIndex: number) => void;
  extendExcelColumnSelection: (columnIndex: number) => void;
  fieldCapabilityByKey: Map<string, ObjectQueryFieldCapability>;
  fieldInputSettings: HeatCalcFieldInputSettings;
  isAllObjectScope: boolean;
  isSavableDraftRow: (draftRow: DraftRowState | undefined) => boolean;
  openExcelCellContextMenu(rowIndex: number, columnIndex: number, event: HeatCalcContextMenuTrigger): void;
  resetColumnFilter: (columnKey: string) => void;
  selectExcelCellByPosition: (rowIndex: number, editableColumnIndex: number, extend?: boolean) => void;
  selectedExcelPosition: HeatCalcExcelCellCoordinates | null;
  setActiveInlineCell: (cell: HeatCalcExcelCellRef) => void;
  setColumnFilter: (columnKey: string, filter?: HeatCalcColumnFilter) => void;
  startColumnResize: (
    type: HeatCalcTableColumnScope,
    meta: HeatCalcResolvedColumnMeta,
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => void;
  startInlineCellEdit: (record: ProjectObject, columnKey: string) => void;
  tableFindabilityEnabled: boolean;
  tableCellEditingEnabled: boolean;
  normalizedExcelRange: ExcelSelectionLookup['normalizedRange'];
}

export function buildHeatCalcSourceTableColumn(
  args: BuildHeatCalcSourceTableColumnArgs,
): ColumnType<ProjectObject> & { columnKey?: string } {
  const {
    meta,
    columnIndex,
    activeTableColumnScope,
    activeTableObjectType,
    activeTableViewState,
    activeInlineCell,
    activeExcelCellPosition,
    beginExcelCellSelection,
    beginExcelColumnSelection,
    columnRenderers,
    commitInlineCell,
    draftRowsById,
    enumOptionsByColumn,
    excelCellDisplayValue,
    excelModeEnabled,
    excelSelectionLookup,
    extendExcelCellSelection,
    extendExcelColumnSelection,
    fieldCapabilityByKey,
    fieldInputSettings,
    isAllObjectScope,
    isSavableDraftRow,
    openExcelCellContextMenu,
    resetColumnFilter,
    selectExcelCellByPosition,
    selectedExcelPosition,
    setActiveInlineCell,
    setColumnFilter,
    startColumnResize,
    startInlineCellEdit,
    tableFindabilityEnabled,
    tableCellEditingEnabled,
    normalizedExcelRange,
  } = args;

  const renderer = columnRenderers[meta.key];
  const capability = fieldCapabilityByKey.get(meta.key);
  const filterEnabled = tableFindabilityEnabled
    && !excelModeEnabled
    && meta.filterable !== false
    && (isAllObjectScope || (capability?.filter.enabled ?? true));
  const sortEnabled = tableFindabilityEnabled
    && !excelModeEnabled
    && meta.sortable !== false
    && (isAllObjectScope || (capability?.sort.enabled ?? true));
  const filterKind = filterKindForColumn(meta.key, capability);
  const activeFilter = activeTableViewState.filters[meta.key];
  const filterActive = isColumnFilterActive(activeFilter);
  const activeSort = sortEnabled && activeTableViewState.sort?.columnKey === meta.key
    ? activeTableViewState.sort
    : undefined;
  const sortActive = !!activeSort;
  const excelColumnIndex = excelSelectionLookup.columnKeyToIndex.get(meta.key);
  const columnSelected = !!normalizedExcelRange
    && excelColumnIndex != null
    && excelColumnIndex >= normalizedExcelRange.left
    && excelColumnIndex <= normalizedExcelRange.right;

  return {
    key: meta.key,
    title: (
      <ResizableColumnTitle
        title={meta.title}
        label={meta.label}
        onResizeStart={(event) => startColumnResize(activeTableColumnScope, meta, event)}
        selectable={excelModeEnabled}
        selected={columnSelected}
        selectionActive={selectedExcelPosition?.columnIndex === columnIndex}
        onSelectionPointerDown={(event) => beginExcelColumnSelection(columnIndex, event)}
        onSelectionPointerEnter={() => extendExcelColumnSelection(columnIndex)}
      />
    ),
    columnKey: meta.key,
    width: meta.width,
    ellipsis: meta.ellipsis ?? renderer.ellipsis,
    align: renderer.align,
    render: (value: unknown, record: ProjectObject, index: number) => {
      if (isAllObjectScope && !isColumnApplicableToObjectType(meta.key, record.object_type)) {
        return <Text type="secondary">{INAPPLICABLE_TABLE_VALUE}</Text>;
      }
      const draftRow = draftRowsById[record.id];
      const config = !isAllObjectScope && tableCellEditingEnabled && (record.object_type === 'pipe' || record.object_type === 'tank')
        ? getInlineEditFieldConfig(record.object_type, meta.key)
        : null;
      const content = config && excelModeEnabled
        ? excelCellDisplayValue(record, meta.key, draftRow)
        : (() => {
          const displayRecord = buildDraftDisplayRecord(draftRow, record);
          return renderer.render?.(value, displayRecord, index) as ReactNode;
        })();
      if (!config) return content;
      const fieldOptions = config.field.editor === 'select'
        ? heatCalcSelectOptions(
          config.objectType,
          config.fieldId,
          getInlineRowFormValues(record, draftRow),
        )
        : undefined;
      return (
        <EditableTableCell
          rowId={record.id}
          columnKey={meta.key}
          rowIndex={index}
          columnIndex={columnIndex}
          active={activeInlineCell?.objectId === record.id && activeInlineCell.columnKey === meta.key}
          selected={isExcelCellSelectedByLookup(excelSelectionLookup, record.id, meta.key)}
          selectionActive={isExcelCellActive(activeExcelCellPosition, record.id, meta.key)}
          excelMode={excelModeEnabled}
          dirty={isSavableDraftRow(draftRow) && Object.prototype.hasOwnProperty.call(draftRow?.dirtyFields ?? {}, config.fieldId)}
          error={draftRow?.errors[config.fieldId]}
          field={config.field}
          options={fieldOptions}
          step={resolveHeatCalcFieldStep(config.objectType, config.fieldId, fieldInputSettings)}
          value={getInlineCellFormValue(record, meta.key, draftRow)}
          onSelect={() => selectExcelCellByPosition(index, columnIndex)}
          onSelectionPointerDown={(event) => beginExcelCellSelection(index, columnIndex, event)}
          onSelectionPointerEnter={() => extendExcelCellSelection(index, columnIndex)}
          onContextMenu={(event) => openExcelCellContextMenu(index, columnIndex, event)}
          onStartEdit={() => startInlineCellEdit(record, meta.key)}
          onCommit={(nextValue) => commitInlineCell(record, meta.key, nextValue)}
          onCancel={() => setActiveInlineCell(null)}
        >
          {content}
        </EditableTableCell>
      );
    },
    sorter: sortEnabled,
    sortOrder: sortActive
      ? activeSort.direction === 'asc'
        ? 'ascend'
        : 'descend'
      : null,
    showSorterTooltip: false,
    filtered: filterActive,
    filterIcon: filterEnabled ? () => (
      <span
        role="button"
        aria-label={`Фильтр ${meta.label}`}
        className="table-filter-trigger"
      >
        <FilterFilled
          className={filterActive ? 'table-filter-icon active' : 'table-filter-icon'}
        />
      </span>
    ) : undefined,
    filterDropdown: filterEnabled ? ({ close }) => (
      <ColumnFilterDropdown
        title={meta.label}
        kind={filterKind}
        filter={activeFilter}
        enumOptions={enumOptionsByColumn[meta.key] ?? []}
        onApply={(filter) => setColumnFilter(meta.key, filter)}
        onReset={() => resetColumnFilter(meta.key)}
        onClose={close}
      />
    ) : undefined,
    onHeaderCell: () => ({
      className: [
        sortEnabled || filterEnabled ? 'heatcalc-table-header-actions-cell' : null,
        sortActive ? 'heatcalc-table-header-actions-cell--sort-active' : null,
        filterActive ? 'heatcalc-table-header-actions-cell--filter-active' : null,
      ].filter(Boolean).join(' '),
    }),
    onCell: !isAllObjectScope && tableCellEditingEnabled && getInlineEditFieldConfig(activeTableObjectType, meta.key)
      ? (_record, rowIndex) => ({
        className: 'editable-cell-host editable-cell-enabled',
        onContextMenu: excelModeEnabled && rowIndex != null
          ? (event) => openExcelCellContextMenu(rowIndex, columnIndex, event)
          : undefined,
      })
      : undefined,
  };
}

export function resolveHeatCalcTableScrollY(formPlacement: string) {
  return formPlacement === 'left' || formPlacement === 'right'
    ? 'max(320px, calc(100vh - 190px))'
    : 'max(320px, calc(100vh - 430px))';
}

import {
  useMemo,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
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
  type NormalizedExcelSelectionRange,
  type ExcelSelectionRange,
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
  type HeatCalcIndexedTableRow,
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
  heatLossCalcStatus,
  isColumnApplicableToObjectType,
} from '@/utils/heatCalcPageUtils';

const { Text } = Typography;

/** Local alias keeps ImportDeclaration count flat while using the owner-neutral contract. */
type HeatCalcContextMenuTrigger = import('@/components/heatcalc/HeatCalcContextMenuTrigger').HeatCalcContextMenuTrigger;

export type HeatCalcTableColumnRenderSpec = Pick<ColumnType<ProjectObject>, 'render' | 'ellipsis' | 'align'> & {
  copyValue: (record: ProjectObject, index: number) => string;
};

export interface ExcelSelectionLookup {
  normalizedRange: NormalizedExcelSelectionRange | null;
  rowIdToIndex: Map<string, number>;
  columnKeyToIndex: Map<string, number>;
}

export function buildExcelSelectionLookup(
  range: ExcelSelectionRange | null,
  rowIds: readonly string[],
  columnKeys: readonly string[],
): ExcelSelectionLookup {
  const rowIdToIndex = new Map<string, number>();
  rowIds.forEach((rowId, index) => rowIdToIndex.set(rowId, index));

  const columnKeyToIndex = new Map<string, number>();
  columnKeys.forEach((columnKey, index) => columnKeyToIndex.set(columnKey, index));

  const anchorRowIndex = range ? rowIdToIndex.get(range.anchor.rowId) : undefined;
  const focusRowIndex = range ? rowIdToIndex.get(range.focus.rowId) : undefined;
  const anchorColumnIndex = range ? columnKeyToIndex.get(range.anchor.columnKey) : undefined;
  const focusColumnIndex = range ? columnKeyToIndex.get(range.focus.columnKey) : undefined;
  const normalizedRange = (
    anchorRowIndex != null
    && focusRowIndex != null
    && anchorColumnIndex != null
    && focusColumnIndex != null
  )
    ? {
      top: Math.min(anchorRowIndex, focusRowIndex),
      bottom: Math.max(anchorRowIndex, focusRowIndex),
      left: Math.min(anchorColumnIndex, focusColumnIndex),
      right: Math.max(anchorColumnIndex, focusColumnIndex),
    }
    : null;

  return {
    normalizedRange,
    rowIdToIndex,
    columnKeyToIndex,
  };
}

export function isExcelCellSelectedByLookup(
  lookup: ExcelSelectionLookup,
  rowId: string,
  columnKey: string,
) {
  const { normalizedRange } = lookup;
  if (!normalizedRange) return false;
  const rowIndex = lookup.rowIdToIndex.get(rowId);
  const columnIndex = lookup.columnKeyToIndex.get(columnKey);
  if (rowIndex == null || columnIndex == null) return false;
  return (
    rowIndex >= normalizedRange.top
    && rowIndex <= normalizedRange.bottom
    && columnIndex >= normalizedRange.left
    && columnIndex <= normalizedRange.right
  );
}

interface UseHeatCalcTableColumnsOptions {
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
  beginExcelRowSelection: (rowIndex: number, event: ReactPointerEvent<HTMLElement>) => void;
  buildTableColumns?: boolean;
  columnRenderers: Record<HeatCalcColumnKey, HeatCalcTableColumnRenderSpec>;
  commitInlineCell: (record: ProjectObject, columnKey: string, value: unknown) => string | null;
  draftRowsById: DraftRowsById;
  enumOptionsByColumn: Record<HeatCalcColumnKey, { label: string; value: string }[]>;
  excelCellDisplayValue: (
    record: ProjectObject,
    columnKey: string,
    draftRow: DraftRowState | undefined,
  ) => string;
  editableExcelColumnKeys: string[];
  excelModeEnabled: boolean;
  excelRowIds: string[];
  excelSelectionRange: ExcelSelectionRange | null;
  extendExcelCellSelection: (rowIndex: number, columnIndex: number) => void;
  extendExcelColumnSelection: (columnIndex: number) => void;
  extendExcelRowSelection: (rowIndex: number) => void;
  fieldCapabilityByKey: Map<string, ObjectQueryFieldCapability>;
  fieldInputSettings: HeatCalcFieldInputSettings;
  formPlacement: string;
  isAllObjectScope: boolean;
  isSavableDraftRow: (draftRow: DraftRowState | undefined) => boolean;
  // Method form: bivariant params — MouseEvent handlers assignable; PointerEvent opens without cast.
  openExcelCellContextMenu(rowIndex: number, columnIndex: number, event: HeatCalcContextMenuTrigger): void;
  openExcelRowContextMenu(rowIndex: number, event: HeatCalcContextMenuTrigger): void;
  resetColumnFilter: (columnKey: string) => void;
  selectAllExcelCells: () => void;
  selectExcelCellByPosition: (rowIndex: number, editableColumnIndex: number, extend?: boolean) => void;
  selectedExcelPosition: HeatCalcExcelCellCoordinates | null;
  setActiveInlineCell: (cell: HeatCalcExcelCellRef) => void;
  setColumnFilter: (columnKey: string, filter?: HeatCalcColumnFilter) => void;
  sourceColumnMetas: HeatCalcResolvedColumnMeta[];
  startColumnResize: (
    type: HeatCalcTableColumnScope,
    meta: HeatCalcResolvedColumnMeta,
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => void;
  startInlineCellEdit: (record: ProjectObject, columnKey: string) => void;
  tableFindabilityEnabled: boolean;
  tableCellEditingEnabled: boolean;
  visibleTableObjectsLength: number;
  visibleTableRows: HeatCalcIndexedTableRow<ProjectObject>[];
}

export function useHeatCalcTableColumns({
  activeTableColumnScope,
  activeTableObjectType,
  activeTableViewState,
  activeInlineCell,
  activeExcelCellPosition,
  beginExcelCellSelection,
  beginExcelColumnSelection,
  beginExcelRowSelection,
  buildTableColumns = true,
  columnRenderers,
  commitInlineCell,
  draftRowsById,
  enumOptionsByColumn,
  excelCellDisplayValue,
  editableExcelColumnKeys,
  excelModeEnabled,
  excelRowIds,
  excelSelectionRange,
  extendExcelCellSelection,
  extendExcelColumnSelection,
  extendExcelRowSelection,
  fieldCapabilityByKey,
  fieldInputSettings,
  formPlacement,
  isAllObjectScope,
  isSavableDraftRow,
  openExcelCellContextMenu,
  openExcelRowContextMenu,
  resetColumnFilter,
  selectAllExcelCells,
  selectExcelCellByPosition,
  selectedExcelPosition,
  setActiveInlineCell,
  setColumnFilter,
  sourceColumnMetas,
  startColumnResize,
  startInlineCellEdit,
  tableFindabilityEnabled,
  tableCellEditingEnabled,
  visibleTableObjectsLength,
  visibleTableRows,
}: UseHeatCalcTableColumnsOptions) {
  const excelSelectionLookup = useMemo(
    () => buildExcelSelectionLookup(excelSelectionRange, excelRowIds, editableExcelColumnKeys),
    [editableExcelColumnKeys, excelRowIds, excelSelectionRange],
  );
  const normalizedExcelRange = excelSelectionLookup.normalizedRange;

  const sourceColumns = useMemo<ColumnType<ProjectObject>[]>(
    () => (buildTableColumns ? sourceColumnMetas : []).map((meta, columnIndex) => {
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
            style={{ pointerEvents: 'auto' }}
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
    }),
    [
      activeExcelCellPosition,
      activeInlineCell,
      activeTableColumnScope,
      activeTableObjectType,
      activeTableViewState,
      beginExcelCellSelection,
      beginExcelColumnSelection,
      buildTableColumns,
      columnRenderers,
      commitInlineCell,
      draftRowsById,
      enumOptionsByColumn,
      excelSelectionLookup,
      excelCellDisplayValue,
      excelModeEnabled,
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
      sourceColumnMetas,
      startColumnResize,
      startInlineCellEdit,
      tableFindabilityEnabled,
      tableCellEditingEnabled,
      normalizedExcelRange,
    ],
  );

  const excelRowHeaderColumn = useMemo<ColumnType<ProjectObject> | null>(() => {
    if (!buildTableColumns || !excelModeEnabled) return null;
    return {
      key: '__excel_row_header__',
      title: (
        <button
          type="button"
          className={[
            'excel-row-header-button',
            normalizedExcelRange
              && normalizedExcelRange.top === 0
              && normalizedExcelRange.bottom === Math.max(visibleTableObjectsLength - 1, 0)
              ? 'selected'
              : null,
          ].filter(Boolean).join(' ')}
          aria-label="Выделить все заполняемые ячейки"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            selectAllExcelCells();
          }}
        >
          ↖
        </button>
      ),
      width: 42,
      className: 'excel-row-header-cell',
      render: (_: unknown, _record: ProjectObject, index: number) => {
        const sourceIndex = visibleTableRows[index]?.sourceIndex ?? index;
        const record = visibleTableRows[index]?.record;
        const draftRow = record ? draftRowsById[record.id] : undefined;
        const rowDirty = isSavableDraftRow(draftRow);
        const draftErrorCount = Object.keys(draftRow?.errors ?? {}).length;
        const rowHasError = draftErrorCount > 0 || (record ? heatLossCalcStatus(record) === 'error' : false);
        const rowSelected = !!normalizedExcelRange
          && index >= normalizedExcelRange.top
          && index <= normalizedExcelRange.bottom;
        const rowTitleParts = [`Строка ${sourceIndex + 1}`];
        if (rowHasError) rowTitleParts.push('есть ошибки');
        if (rowDirty) rowTitleParts.push('есть несохранённые изменения');
        return (
          <button
            type="button"
            className={[
              'excel-row-header-button',
              rowSelected ? 'selected' : null,
              selectedExcelPosition?.rowIndex === index ? 'active-selection' : null,
              rowDirty ? 'dirty' : null,
              rowHasError ? 'has-error' : null,
            ].filter(Boolean).join(' ')}
            aria-label={`Выделить строку ${sourceIndex + 1}`}
            title={rowTitleParts.join(' · ')}
            onPointerDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
              if (event.button === 2) {
                openExcelRowContextMenu(index, event);
                return;
              }
              beginExcelRowSelection(index, event);
            }}
            onMouseDown={(event) => {
              if (event.button !== 2) return;
              event.preventDefault();
              event.stopPropagation();
              openExcelRowContextMenu(index, event);
            }}
            onAuxClick={(event) => {
              if (event.button !== 2) return;
              event.preventDefault();
              event.stopPropagation();
              openExcelRowContextMenu(index, event);
            }}
            onPointerEnter={() => extendExcelRowSelection(index)}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
            onContextMenu={(event) => openExcelRowContextMenu(index, event)}
          >
            {sourceIndex + 1}
          </button>
        );
      },
    };
  }, [
    beginExcelRowSelection,
    buildTableColumns,
    draftRowsById,
    excelModeEnabled,
    extendExcelRowSelection,
    isSavableDraftRow,
    normalizedExcelRange,
    openExcelRowContextMenu,
    selectAllExcelCells,
    selectedExcelPosition,
    visibleTableObjectsLength,
    visibleTableRows,
  ]);

  const tableColumns = useMemo<ColumnType<ProjectObject>[]>(
    () => {
      if (!buildTableColumns) return [];
      return excelModeEnabled && excelRowHeaderColumn
        ? [excelRowHeaderColumn, ...sourceColumns]
        : sourceColumns;
    },
    [buildTableColumns, excelModeEnabled, excelRowHeaderColumn, sourceColumns],
  );

  const tableScrollX = useMemo(
    () => Math.max(640, sourceColumnMetas.reduce(
      (sum, column) => sum + column.width,
      excelModeEnabled ? 42 : 36,
    )),
    [excelModeEnabled, sourceColumnMetas],
  );
  const tableScrollY = formPlacement === 'left' || formPlacement === 'right'
    ? 'max(320px, calc(100vh - 190px))'
    : 'max(320px, calc(100vh - 430px))';

  return {
    tableColumns,
    tableScrollX,
    tableScrollY,
  };
}

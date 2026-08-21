/**
 * Excel mode row-header column assembly for HeatCalc table columns.
 */
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { ColumnType } from 'antd/es/table';
import type { ProjectObject } from '@/types/project';
import type { DraftRowsById, DraftRowState } from '@/utils/heatCalcInlineEdit';
import type { HeatCalcIndexedTableRow } from '@/utils/heatCalcTableFindability';
import type { NormalizedExcelSelectionRange } from '@/utils/heatCalcExcelMode';
import type { HeatCalcExcelCellCoordinates } from '@/hooks/useHeatCalcExcelSelection';
import { heatLossCalcStatus } from '@/utils/heatCalcPageUtils';

type HeatCalcContextMenuTrigger = import('@/components/heatcalc/HeatCalcContextMenuTrigger').HeatCalcContextMenuTrigger;

export function buildHeatCalcExcelRowHeaderColumn({
  beginExcelRowSelection,
  draftRowsById,
  extendExcelRowSelection,
  isSavableDraftRow,
  normalizedExcelRange,
  openExcelRowContextMenu,
  selectAllExcelCells,
  selectedExcelPosition,
  visibleTableObjectsLength,
  visibleTableRows,
}: {
  beginExcelRowSelection: (rowIndex: number, event: ReactPointerEvent<HTMLElement>) => void;
  draftRowsById: DraftRowsById;
  extendExcelRowSelection: (rowIndex: number) => void;
  isSavableDraftRow: (draftRow: DraftRowState | undefined) => boolean;
  normalizedExcelRange: NormalizedExcelSelectionRange | null;
  openExcelRowContextMenu(rowIndex: number, event: HeatCalcContextMenuTrigger): void;
  selectAllExcelCells: () => void;
  selectedExcelPosition: HeatCalcExcelCellCoordinates | null;
  visibleTableObjectsLength: number;
  visibleTableRows: HeatCalcIndexedTableRow<ProjectObject>[];
}): ColumnType<ProjectObject> {
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
}

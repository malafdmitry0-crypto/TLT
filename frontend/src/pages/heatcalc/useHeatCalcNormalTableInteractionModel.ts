import { useCallback, useEffect, useMemo } from 'react';
import { message as antdMessage, type TableProps } from 'antd';

import type { HeatCalcNormalInfiniteLoading } from '@/components/heatcalc/HeatCalcObjectsTableCard';
import type { HeatCalcTableColumnRenderSpec } from '@/hooks/useHeatCalcTableColumns';
import type { ProjectObject, ProjectObjectsQueryResponse } from '@/types/project';
import { buildTsv, copyToClipboard } from '@/utils/clipboard';
import {
  isExcelNewRowId,
} from '@/utils/heatCalcExcelMode';
import type {
  DraftRowsById,
  DraftRowState,
} from '@/utils/heatCalcInlineEdit';
import type {
  HeatCalcColumnKey,
  HeatCalcResolvedColumnMeta,
} from '@/utils/heatCalcTableColumns';
import type {
  HeatCalcIndexedTableRow,
} from '@/utils/heatCalcTableFindability';
import {
  DEFAULT_OBJECT_QUERY_PAGE_SIZE,
  INAPPLICABLE_TABLE_VALUE,
  heatLossCalcStatus,
  isColumnApplicableToObjectType,
} from '@/pages/heatcalc/heatCalcPageUtils';

interface UseHeatCalcNormalTableInteractionModelOptions {
  activeTablePage: number;
  changeNormalTablePage: (
    page: number,
    result: ProjectObjectsQueryResponse | undefined,
  ) => void;
  columnRenderers: Record<HeatCalcColumnKey, HeatCalcTableColumnRenderSpec>;
  draftRowsById: DraftRowsById;
  excelModeEnabled: boolean;
  filteredTableCount: number;
  isAllObjectScope: boolean;
  isSavableDraftRow: (draftRow: DraftRowState | undefined) => boolean;
  loadNextNormalPage: (
    result: ProjectObjectsQueryResponse | undefined,
    options: { excelModeEnabled: boolean; objectQueryFetching: boolean },
  ) => void;
  normalGlideEnabled: boolean;
  objectQueryFetching: boolean;
  objectQueryResult: ProjectObjectsQueryResponse | undefined;
  selectedRowId: string | null;
  selectedRowKeys: string[];
  sourceColumnMetas: HeatCalcResolvedColumnMeta[];
  visibleTableObjectsLength: number;
  visibleTableRows: HeatCalcIndexedTableRow<ProjectObject>[];
  notifySuccess?: (message: string) => void;
}

export function buildHeatCalcNormalTableRowClassName({
  draftRowsById,
  excelModeEnabled,
  isSavableDraftRow,
  record,
  selectedRowId,
}: Pick<
  UseHeatCalcNormalTableInteractionModelOptions,
  'draftRowsById' | 'excelModeEnabled' | 'isSavableDraftRow' | 'selectedRowId'
> & {
  record: ProjectObject;
}) {
  const classes = [];
  if (heatLossCalcStatus(record) === 'error') classes.push('row-invalid');
  if (record.id === selectedRowId) classes.push('row-selected');
  if (excelModeEnabled && Object.keys(draftRowsById[record.id]?.errors ?? {}).length > 0) {
    classes.push('row-excel-error');
  }
  if (isSavableDraftRow(draftRowsById[record.id])) {
    classes.push(excelModeEnabled ? 'row-excel-dirty' : 'row-dirty');
  }
  if (isExcelNewRowId(record.id)) classes.push('row-excel-new');
  return classes.join(' ');
}

export function useHeatCalcNormalTableInteractionModel({
  activeTablePage,
  changeNormalTablePage,
  columnRenderers,
  draftRowsById,
  excelModeEnabled,
  filteredTableCount,
  isAllObjectScope,
  isSavableDraftRow,
  loadNextNormalPage,
  normalGlideEnabled,
  objectQueryFetching,
  objectQueryResult,
  selectedRowId,
  selectedRowKeys,
  sourceColumnMetas,
  visibleTableObjectsLength,
  visibleTableRows,
  notifySuccess = (message) => {
    void antdMessage.success(message);
  },
}: UseHeatCalcNormalTableInteractionModelOptions) {
  const tableRowClassName = useCallback((record: ProjectObject) => (
    buildHeatCalcNormalTableRowClassName({
      draftRowsById,
      excelModeEnabled,
      isSavableDraftRow,
      record,
      selectedRowId,
    })
  ), [draftRowsById, excelModeEnabled, isSavableDraftRow, selectedRowId]);

  const normalTablePagination = useMemo<TableProps<ProjectObject>['pagination']>(() => ({
    current: activeTablePage,
    pageSize: isAllObjectScope
      ? DEFAULT_OBJECT_QUERY_PAGE_SIZE
      : objectQueryResult?.page_info.page_size ?? DEFAULT_OBJECT_QUERY_PAGE_SIZE,
    total: filteredTableCount,
    showSizeChanger: false,
    hideOnSinglePage: true,
    size: 'small',
  }), [
    activeTablePage,
    filteredTableCount,
    isAllObjectScope,
    objectQueryResult?.page_info.page_size,
  ]);

  const normalInfiniteLoading = useMemo<HeatCalcNormalInfiniteLoading | null>(
    () => (!normalGlideEnabled ? null : {
      loaded: visibleTableObjectsLength,
      total: filteredTableCount,
      hasNextPage: !isAllObjectScope && !!objectQueryResult?.page_info.has_next_page,
      loading: !isAllObjectScope && objectQueryFetching,
    }),
    [
      filteredTableCount,
      isAllObjectScope,
      normalGlideEnabled,
      objectQueryFetching,
      objectQueryResult?.page_info.has_next_page,
      visibleTableObjectsLength,
    ],
  );

  const handleNormalLoadMore = useCallback(() => {
    loadNextNormalPage(objectQueryResult, { excelModeEnabled, objectQueryFetching });
  }, [
    excelModeEnabled,
    loadNextNormalPage,
    objectQueryFetching,
    objectQueryResult,
  ]);

  const handleNormalTablePageChange = useCallback((page: number) => {
    changeNormalTablePage(page, objectQueryResult);
  }, [changeNormalTablePage, objectQueryResult]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey) || e.key !== 'c') return;
      if (excelModeEnabled) return;
      if (selectedRowKeys.length === 0) return;
      const active = document.activeElement;
      if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) return;

      const selected = visibleTableRows
        .map((row) => ({ object: row.record, index: row.sourceIndex }))
        .filter(({ object }) => selectedRowKeys.includes(object.id));
      const header = sourceColumnMetas.map((meta) => meta.copyTitle ?? meta.title);
      const rows = selected.map(({ object, index }) =>
        sourceColumnMetas.map((meta) => (
          isAllObjectScope && !isColumnApplicableToObjectType(meta.key, object.object_type)
            ? INAPPLICABLE_TABLE_VALUE
            : columnRenderers[meta.key].copyValue(object, index)
        )),
      );

      copyToClipboard(buildTsv([header, ...rows])).then(() => {
        notifySuccess(`Скопировано строк: ${selected.length}`);
      });
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [
    columnRenderers,
    excelModeEnabled,
    isAllObjectScope,
    notifySuccess,
    selectedRowKeys,
    sourceColumnMetas,
    visibleTableRows,
  ]);

  return {
    handleNormalLoadMore,
    handleNormalTablePageChange,
    normalInfiniteLoading,
    normalTablePagination,
    tableRowClassName,
  };
}

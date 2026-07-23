import { useCallback, useMemo } from 'react';
import type { TableProps } from 'antd';

import type { HeatCalcNormalInfiniteLoading } from '@/components/shared/normalGlideTypes';
import type { ProjectObject, ProjectObjectsPageCursor } from '@/types/project';

type LoadNextElectricalGlidePage = (options: {
  isFetching: boolean;
  hasNextPage: boolean;
  nextCursor?: ProjectObjectsPageCursor | null;
}) => void;

type UseElecCalcTableNavigationOptions = {
  tablePage: number;
  tablePageSize: number;
  totalObjects: number;
  filteredCount?: number;
  electricalGlideEnabled: boolean;
  loadedObjectsCount: number;
  hasNextPage: boolean;
  nextElectricalPageCursor?: ProjectObjectsPageCursor | null;
  isElectricalPageFetching: boolean;
  setTablePage: (page: number) => void;
  loadNextElectricalGlidePage: LoadNextElectricalGlidePage;
};

export function useElecCalcTableNavigation({
  tablePage,
  tablePageSize,
  totalObjects,
  filteredCount,
  electricalGlideEnabled,
  loadedObjectsCount,
  hasNextPage,
  nextElectricalPageCursor,
  isElectricalPageFetching,
  setTablePage,
  loadNextElectricalGlidePage,
}: UseElecCalcTableNavigationOptions) {
  const filteredTableCount = filteredCount ?? totalObjects;
  const electricalPagination = useMemo<TableProps<ProjectObject>['pagination']>(() => ({
    current: tablePage,
    pageSize: tablePageSize,
    total: filteredTableCount,
    pageSizeOptions: ['25', '50', '100'],
    showSizeChanger: true,
    hideOnSinglePage: filteredTableCount <= tablePageSize,
    showTotal: (total, range) => `${range[0]}-${range[1]} из ${total}`,
    size: 'small',
  }), [filteredTableCount, tablePage, tablePageSize]);

  const electricalInfiniteLoading = useMemo<HeatCalcNormalInfiniteLoading | null>(() => (
    electricalGlideEnabled
      ? {
          loaded: loadedObjectsCount,
          total: filteredTableCount,
          hasNextPage: Boolean(hasNextPage && nextElectricalPageCursor),
          loading: isElectricalPageFetching,
        }
      : null
  ), [
    electricalGlideEnabled,
    filteredTableCount,
    hasNextPage,
    isElectricalPageFetching,
    loadedObjectsCount,
    nextElectricalPageCursor,
  ]);

  const handleElectricalGlidePageChange = useCallback((page: number) => {
    setTablePage(page);
  }, [setTablePage]);

  const handleElectricalGlideLoadMore = useCallback(() => {
    loadNextElectricalGlidePage({
      isFetching: isElectricalPageFetching,
      hasNextPage,
      nextCursor: nextElectricalPageCursor,
    });
  }, [
    hasNextPage,
    isElectricalPageFetching,
    loadNextElectricalGlidePage,
    nextElectricalPageCursor,
  ]);

  return {
    filteredTableCount,
    electricalPagination,
    electricalInfiniteLoading,
    handleElectricalGlidePageChange,
    handleElectricalGlideLoadMore,
  };
}

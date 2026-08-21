import { useCallback, useMemo, useState } from 'react';

import {
  projectObjectsPageCursorsEqual,
} from '@/pages/electrical/elecCalcCursorModel';
import {
  ELECTRICAL_TABLE_PAGE_SIZE,
} from '@/pages/electrical/elecCalcPageModel';
import type { ElectricalQueryResponse } from '@/types/calculation';
import type { ProjectObjectsPageCursor } from '@/types/project';

type RememberElectricalPageOptions = {
  electricalGlideEnabled: boolean;
  electricalPage?: ElectricalQueryResponse;
  isFetching: boolean;
  isPlaceholderData: boolean;
};

type RememberNextCursorOptions = {
  nextCursor?: ProjectObjectsPageCursor | null;
  isFetching: boolean;
  isPlaceholderData: boolean;
};

type LoadMoreOptions = {
  isFetching: boolean;
  hasNextPage: boolean;
  nextCursor?: ProjectObjectsPageCursor | null;
};

export function useElecCalcPaginationState() {
  const [tablePage, setTablePage] = useState(1);
  const [tablePageSize, setTablePageSize] = useState(ELECTRICAL_TABLE_PAGE_SIZE);
  const [electricalPageCursors, setElectricalPageCursors] =
    useState<Record<number, ProjectObjectsPageCursor | null>>({ 1: null });
  const [electricalInfinitePages, setElectricalInfinitePages] =
    useState<Record<number, ElectricalQueryResponse>>({});

  const electricalPageCursor = useMemo(
    () => electricalPageCursors[tablePage] ?? null,
    [electricalPageCursors, tablePage],
  );

  const resetTablePage = useCallback(() => {
    setTablePage(1);
  }, []);

  const resetPaginationCache = useCallback(() => {
    setElectricalPageCursors({ 1: null });
    setElectricalInfinitePages({});
  }, []);

  const resetTablePageAndCursors = useCallback(() => {
    setTablePage(1);
    setElectricalPageCursors({ 1: null });
  }, []);

  const rememberElectricalPage = useCallback(({
    electricalGlideEnabled,
    electricalPage,
    isFetching,
    isPlaceholderData,
  }: RememberElectricalPageOptions) => {
    if (!electricalGlideEnabled || isFetching || isPlaceholderData || !electricalPage) return;
    setElectricalInfinitePages((current) => {
      if (current[tablePage] === electricalPage) return current;
      if (tablePage === 1) return { 1: electricalPage };
      return { ...current, [tablePage]: electricalPage };
    });
  }, [tablePage]);

  const rememberNextCursor = useCallback(({
    nextCursor,
    isFetching,
    isPlaceholderData,
  }: RememberNextCursorOptions) => {
    if (isFetching || isPlaceholderData || !nextCursor) return;
    setElectricalPageCursors((current) => {
      const nextPage = tablePage + 1;
      const existing = current[nextPage];
      if (projectObjectsPageCursorsEqual(existing, nextCursor)) {
        return current;
      }
      return { ...current, [nextPage]: nextCursor };
    });
  }, [tablePage]);

  const loadNextElectricalGlidePage = useCallback(({
    isFetching,
    hasNextPage,
    nextCursor,
  }: LoadMoreOptions) => {
    if (isFetching || !hasNextPage || !nextCursor) return;
    const nextPage = tablePage + 1;
    setElectricalPageCursors((current) => {
      if (projectObjectsPageCursorsEqual(current[nextPage], nextCursor)) {
        return current;
      }
      return { ...current, [nextPage]: nextCursor };
    });
    setTablePage(nextPage);
  }, [tablePage]);

  return {
    tablePage,
    tablePageSize,
    electricalPageCursor,
    electricalInfinitePages,
    setTablePage,
    setTablePageSize,
    resetTablePage,
    resetPaginationCache,
    resetTablePageAndCursors,
    rememberElectricalPage,
    rememberNextCursor,
    loadNextElectricalGlidePage,
  };
}

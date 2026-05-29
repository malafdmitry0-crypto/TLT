import { useCallback, useEffect, useRef, useState } from 'react';

import type {
  ProjectObject,
  ProjectObjectsPageCursor,
  ProjectObjectsQueryResponse,
} from '@/types/project';
import {
  getVisibleTableColumnMetas,
  type HeatCalcColumnKey,
  type HeatCalcObjectType,
  type HeatCalcTableColumnScope,
  type HeatCalcTableColumnSettings,
} from '@/utils/heatCalcTableColumns';
import {
  createEmptyTableViewState,
  isColumnFilterActive,
  removeHiddenTableViewState,
  type HeatCalcColumnFilter,
  type HeatCalcTableViewState,
} from '@/utils/heatCalcTableFindability';

export type ActiveObjectScope = HeatCalcObjectType | 'all';
type TableCursorByType = Record<HeatCalcObjectType, Record<number, ProjectObjectsPageCursor>>;
export type NormalLoadedRowsByType = Record<HeatCalcObjectType, ProjectObject[]>;

interface UseHeatCalcTableStateParams {
  projectId?: string | null;
}

function cursorsEqual(
  left: ProjectObjectsPageCursor | null | undefined,
  right: ProjectObjectsPageCursor | null | undefined,
) {
  if (left == null || right == null) return left == null && right == null;
  return left.sort_order === right.sort_order
    && left.id === right.id
    && (left.key ?? null) === (right.key ?? null)
    && (left.value_is_null ?? false) === (right.value_is_null ?? false)
    && JSON.stringify(left.value ?? null) === JSON.stringify(right.value ?? null);
}

function sameRows(left: ProjectObject[], right: ProjectObject[]) {
  return left.length === right.length && left.every((row, index) => row === right[index]);
}

export function useHeatCalcTableState({
  projectId,
}: UseHeatCalcTableStateParams) {
  const [activeObjectScope, setActiveObjectScope] = useState<ActiveObjectScope>('pipe');
  const [selectedRowKeys, setSelectedRowKeys] = useState<string[]>([]);
  const [tableViewStateByType, setTableViewStateByType] = useState<
    Record<HeatCalcObjectType, HeatCalcTableViewState>
  >(() => ({
    pipe: createEmptyTableViewState(),
    tank: createEmptyTableViewState(),
  }));
  const [allTableViewState, setAllTableViewState] = useState<HeatCalcTableViewState>(
    () => createEmptyTableViewState(),
  );
  const [tablePageByScope, setTablePageByScope] = useState<Record<ActiveObjectScope, number>>({
    pipe: 1,
    tank: 1,
    all: 1,
  });
  const [tableCursorByType, setTableCursorByType] = useState<TableCursorByType>({
    pipe: {},
    tank: {},
  });
  const [normalLoadedRowsByType, setNormalLoadedRowsByType] = useState<NormalLoadedRowsByType>({
    pipe: [],
    tank: [],
  });
  const normalLoadMoreRequestRef = useRef<string | null>(null);

  const isAllObjectScope = activeObjectScope === 'all';
  const activeTableObjectType: HeatCalcObjectType = activeObjectScope === 'tank' ? 'tank' : 'pipe';
  const activeTableColumnScope: HeatCalcTableColumnScope = isAllObjectScope ? 'all' : activeTableObjectType;
  const activeTableViewState = isAllObjectScope ? allTableViewState : tableViewStateByType[activeTableObjectType];
  const activeTablePage = tablePageByScope[activeObjectScope];
  const activeObjectQueryCursor = !isAllObjectScope
    ? tableCursorByType[activeTableObjectType]?.[activeTablePage] ?? null
    : null;

  useEffect(() => {
    setTableCursorByType((current) => ({ ...current, [activeTableObjectType]: {} }));
    setNormalLoadedRowsByType((current) => ({ ...current, [activeTableObjectType]: [] }));
    setTablePageByScope((current) => (
      current[activeObjectScope] === 1 ? current : { ...current, [activeObjectScope]: 1 }
    ));
    normalLoadMoreRequestRef.current = null;
  }, [activeObjectScope, activeTableObjectType, activeTableViewState, projectId]);

  const selectObjectScope = useCallback((scope: ActiveObjectScope) => {
    setActiveObjectScope(scope);
    setSelectedRowKeys([]);
    setTablePageByScope((current) => ({ ...current, [scope]: 1 }));
  }, []);

  const clearSelectedRows = useCallback(() => {
    setSelectedRowKeys([]);
  }, []);

  const setTablePage = useCallback((scope: ActiveObjectScope, page: number) => {
    setTablePageByScope((current) => ({ ...current, [scope]: page }));
  }, []);

  const rememberObjectQueryCursor = useCallback((result: ProjectObjectsQueryResponse | undefined) => {
    if (isAllObjectScope || !result) return;
    const page = result.page_info.page;
    const nextCursor = result.page_info.next_cursor;
    setTableCursorByType((current) => {
      const byPage = current[activeTableObjectType] ?? {};
      const nextPage = page + 1;
      if (!nextCursor) {
        if (!(nextPage in byPage)) return current;
        const nextByPage = { ...byPage };
        delete nextByPage[nextPage];
        return { ...current, [activeTableObjectType]: nextByPage };
      }
      if (cursorsEqual(byPage[nextPage], nextCursor)) return current;
      return {
        ...current,
        [activeTableObjectType]: {
          ...byPage,
          [nextPage]: nextCursor,
        },
      };
    });
  }, [activeTableObjectType, isAllObjectScope]);

  const mergeNormalLoadedRows = useCallback((
    result: ProjectObjectsQueryResponse | undefined,
    options: { excelModeEnabled: boolean },
  ) => {
    if (isAllObjectScope || options.excelModeEnabled || !result) return;
    const page = result.page_info.page;
    const offset = result.page_info.offset;
    const pageItems = result.items;

    setNormalLoadedRowsByType((current) => {
      const currentRows = current[activeTableObjectType] ?? [];
      const nextRows = page <= 1 || currentRows.length < offset ? pageItems : [...currentRows];
      if (page > 1 && currentRows.length >= offset) {
        nextRows.splice(offset, pageItems.length, ...pageItems);
      }
      if (sameRows(currentRows, nextRows)) return current;
      return { ...current, [activeTableObjectType]: nextRows };
    });
  }, [activeTableObjectType, isAllObjectScope]);

  const pruneSelectedRows = useCallback((visibleObjects: readonly ProjectObject[]) => {
    const visibleIds = new Set(visibleObjects.map((object) => object.id));
    setSelectedRowKeys((keys) => {
      const nextKeys = keys.filter((key) => visibleIds.has(key));
      return nextKeys.length === keys.length && nextKeys.every((key, index) => key === keys[index])
        ? keys
        : nextKeys;
    });
  }, []);

  const cleanHiddenColumnState = useCallback((visibleColumnKeys: readonly HeatCalcColumnKey[]) => {
    if (isAllObjectScope) {
      setAllTableViewState((current) => {
        const cleaned = removeHiddenTableViewState(current, [...visibleColumnKeys]);
        if (
          cleaned.sort === current.sort
          && Object.keys(cleaned.filters).length === Object.keys(current.filters).length
        ) {
          return current;
        }
        return cleaned;
      });
      return;
    }
    setTableViewStateByType((current) => {
      const cleaned = removeHiddenTableViewState(current[activeTableObjectType], [...visibleColumnKeys]);
      if (
        cleaned.sort === current[activeTableObjectType].sort
        && Object.keys(cleaned.filters).length === Object.keys(current[activeTableObjectType].filters).length
      ) {
        return current;
      }
      return { ...current, [activeTableObjectType]: cleaned };
    });
  }, [activeTableObjectType, isAllObjectScope]);

  const cleanHiddenColumnStateForSettings = useCallback((settings: HeatCalcTableColumnSettings) => {
    setTableViewStateByType((current) => {
      let changed = false;
      const next = { ...current };
      (['pipe', 'tank'] as const).forEach((type) => {
        const visibleKeys = getVisibleTableColumnMetas(type, settings).map((column) => column.key);
        const cleaned = removeHiddenTableViewState(current[type], visibleKeys);
        const currentFilterCount = Object.keys(current[type].filters).length;
        const cleanedFilterCount = Object.keys(cleaned.filters).length;
        if (cleaned.sort !== current[type].sort || cleanedFilterCount !== currentFilterCount) {
          next[type] = cleaned;
          changed = true;
        }
      });
      return changed ? next : current;
    });
    setAllTableViewState((current) => {
      const visibleKeys = getVisibleTableColumnMetas('all', settings).map((column) => column.key);
      const cleaned = removeHiddenTableViewState(current, visibleKeys);
      const currentFilterCount = Object.keys(current.filters).length;
      const cleanedFilterCount = Object.keys(cleaned.filters).length;
      return cleaned.sort !== current.sort || cleanedFilterCount !== currentFilterCount ? cleaned : current;
    });
  }, []);

  const setColumnFilter = useCallback((columnKey: HeatCalcColumnKey, filter?: HeatCalcColumnFilter) => {
    setTablePageByScope((current) => ({ ...current, [activeObjectScope]: 1 }));
    if (isAllObjectScope) {
      setAllTableViewState((current) => {
        const nextFilters = { ...current.filters };
        if (filter && isColumnFilterActive(filter)) {
          nextFilters[columnKey] = filter;
        } else {
          delete nextFilters[columnKey];
        }
        return {
          ...current,
          filters: nextFilters,
        };
      });
      return;
    }
    setTableViewStateByType((current) => {
      const nextFilters = { ...current[activeTableObjectType].filters };
      if (filter && isColumnFilterActive(filter)) {
        nextFilters[columnKey] = filter;
      } else {
        delete nextFilters[columnKey];
      }
      return {
        ...current,
        [activeTableObjectType]: {
          ...current[activeTableObjectType],
          filters: nextFilters,
        },
      };
    });
  }, [activeObjectScope, activeTableObjectType, isAllObjectScope]);

  const resetColumnFilter = useCallback((columnKey: HeatCalcColumnKey) => {
    setColumnFilter(columnKey, undefined);
  }, [setColumnFilter]);

  const resetCurrentTableViewState = useCallback(() => {
    setTablePageByScope((current) => ({ ...current, [activeObjectScope]: 1 }));
    if (isAllObjectScope) {
      setAllTableViewState(createEmptyTableViewState());
      return;
    }
    setTableViewStateByType((current) => ({
      ...current,
      [activeTableObjectType]: createEmptyTableViewState(),
    }));
  }, [activeObjectScope, activeTableObjectType, isAllObjectScope]);

  const handleNormalTableSortChange = useCallback((
    columnKey: HeatCalcColumnKey,
    direction?: 'asc' | 'desc',
  ) => {
    setTablePageByScope((current) => ({ ...current, [activeObjectScope]: 1 }));
    if (isAllObjectScope) {
      setAllTableViewState((current) => ({
        ...current,
        sort: direction ? { columnKey, direction } : undefined,
      }));
      return;
    }
    setTableViewStateByType((current) => ({
      ...current,
      [activeTableObjectType]: {
        ...current[activeTableObjectType],
        sort: direction ? { columnKey, direction } : undefined,
      },
    }));
  }, [activeObjectScope, activeTableObjectType, isAllObjectScope]);

  const removeNormalLoadedRows = useCallback((rowIds: Iterable<string>) => {
    const idSet = new Set(rowIds);
    if (idSet.size === 0) return;
    setNormalLoadedRowsByType((current) => ({
      pipe: current.pipe.filter((row) => !idSet.has(row.id)),
      tank: current.tank.filter((row) => !idSet.has(row.id)),
    }));
  }, []);

  const resetNormalLoadMoreRequest = useCallback(() => {
    normalLoadMoreRequestRef.current = null;
  }, []);

  const upsertNormalLoadedRow = useCallback((savedObject: ProjectObject) => {
    const savedObjectType: HeatCalcObjectType = savedObject.object_type === 'tank' ? 'tank' : 'pipe';
    setNormalLoadedRowsByType((current) => ({
      ...current,
      [savedObjectType]: current[savedObjectType].map((item) => (
        item.id === savedObject.id ? savedObject : item
      )),
    }));
  }, []);

  const loadNextNormalPage = useCallback((
    result: ProjectObjectsQueryResponse | undefined,
    options: { excelModeEnabled: boolean; objectQueryFetching: boolean },
  ) => {
    if (isAllObjectScope || options.excelModeEnabled || options.objectQueryFetching) return;
    const nextCursor = result?.page_info.next_cursor;
    if (!result?.page_info.has_next_page || !nextCursor) return;
    const nextPage = activeTablePage + 1;
    const requestKey = [
      activeObjectScope,
      nextPage,
      nextCursor.id,
      nextCursor.sort_order,
      nextCursor.key ?? '',
      JSON.stringify(nextCursor.value ?? null),
      nextCursor.value_is_null ? 'null' : 'value',
    ].join(':');
    if (normalLoadMoreRequestRef.current === requestKey) return;
    normalLoadMoreRequestRef.current = requestKey;

    setTableCursorByType((current) => {
      const byPage = current[activeTableObjectType] ?? {};
      if (cursorsEqual(byPage[nextPage], nextCursor)) return current;
      return {
        ...current,
        [activeTableObjectType]: {
          ...byPage,
          [nextPage]: nextCursor,
        },
      };
    });
    setTablePageByScope((current) => ({ ...current, [activeObjectScope]: nextPage }));
  }, [activeObjectScope, activeTableObjectType, activeTablePage, isAllObjectScope]);

  const changeNormalTablePage = useCallback((
    page: number,
    result: ProjectObjectsQueryResponse | undefined,
  ) => {
    if (!isAllObjectScope && page === activeTablePage + 1 && result?.page_info.next_cursor) {
      const nextCursor = result.page_info.next_cursor;
      setTableCursorByType((current) => {
        const byPage = current[activeTableObjectType] ?? {};
        if (cursorsEqual(byPage[page], nextCursor)) return current;
        return {
          ...current,
          [activeTableObjectType]: {
            ...byPage,
            [page]: nextCursor,
          },
        };
      });
    }
    setTablePageByScope((current) => ({ ...current, [activeObjectScope]: page }));
  }, [activeObjectScope, activeTableObjectType, activeTablePage, isAllObjectScope]);

  return {
    activeObjectScope,
    activeObjectQueryCursor,
    activeTableColumnScope,
    activeTableObjectType,
    activeTablePage,
    activeTableViewState,
    allTableViewState,
    clearSelectedRows,
    cleanHiddenColumnState,
    cleanHiddenColumnStateForSettings,
    changeNormalTablePage,
    handleNormalTableSortChange,
    isAllObjectScope,
    loadNextNormalPage,
    mergeNormalLoadedRows,
    normalLoadedRowsByType,
    pruneSelectedRows,
    rememberObjectQueryCursor,
    removeNormalLoadedRows,
    resetNormalLoadMoreRequest,
    resetColumnFilter,
    resetCurrentTableViewState,
    selectedRowKeys,
    selectObjectScope,
    setActiveObjectScope,
    setColumnFilter,
    setSelectedRowKeys,
    setTablePage,
    tableViewStateByType,
    upsertNormalLoadedRow,
  };
}

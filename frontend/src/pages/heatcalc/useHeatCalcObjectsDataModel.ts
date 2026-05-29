import {
  useCallback,
  useEffect,
  useMemo,
} from 'react';
import {
  useQuery,
  type QueryClient,
} from '@tanstack/react-query';

import { getObjectQueryCapabilities, getObjectsSummary, listObjects, queryObjects } from '@/api/projects';
import { referenceQueryKeys, referenceQueryOptions } from '@/api/referenceQueries';
import { getInsulation } from '@/api/references';
import { MATERIAL_LABELS } from '@/constants/materials';
import type {
  ObjectQueryFieldCapability,
  Project,
  ProjectObject,
  ProjectObjectsPageCursor,
  ProjectObjectsQueryResponse,
} from '@/types/project';
import {
  HEATCALC_TABLE_COLUMN_CATALOG,
  getAllTableColumnMetas,
  getVisibleTableColumnMetas,
  type HeatCalcColumnKey,
  type HeatCalcObjectType,
  type HeatCalcResolvedColumnMeta,
  type HeatCalcTableColumnScope,
  type HeatCalcTableColumnSettings,
} from '@/utils/heatCalcTableColumns';
import {
  applyColumnFilters,
  applyTableSort,
  createEmptyTableViewState,
  type HeatCalcColumnValueAccessors,
  type HeatCalcIndexedTableRow,
  type HeatCalcTableViewState,
} from '@/utils/heatCalcTableFindability';
import {
  normalizeTableViewSettings,
  resolveTableFontSize,
  type HeatCalcTableViewSettings,
} from '@/utils/heatCalcTableViewSettings';
import { getInlineEditFieldConfig } from '@/utils/heatCalcInlineEdit';
import { getExcelEditableColumnMetas } from '@/utils/heatCalcExcelMode';
import {
  DEFAULT_OBJECT_QUERY_PAGE_SIZE,
  INAPPLICABLE_TABLE_VALUE,
  buildObjectQueryRequest,
  filterKindForColumn,
  insulationEntryLabel,
  isColumnApplicableToObjectType,
} from '@/pages/heatcalc/heatCalcPageUtils';
import { buildHeatCalcColumnRenderers } from '@/pages/heatcalc/heatCalcColumnRenderers';
import type {
  ActiveObjectScope,
  NormalLoadedRowsByType,
} from '@/pages/heatcalc/useHeatCalcTableState';

interface UseHeatCalcObjectsDataModelOptions {
  activeObjectQueryCursor: ProjectObjectsPageCursor | null;
  activeObjectScope: ActiveObjectScope;
  activeTableColumnScope: HeatCalcTableColumnScope;
  activeTableObjectType: HeatCalcObjectType;
  activeTablePage: number;
  activeTableViewState: HeatCalcTableViewState;
  allTableViewState: HeatCalcTableViewState;
  excelModeEnabled: boolean;
  isAllObjectScope: boolean;
  project: Project | null | undefined;
  queryClient: QueryClient;
  tableColumnSettings: HeatCalcTableColumnSettings;
  tableViewSettings: HeatCalcTableViewSettings;
  tableFindabilityEnabled: boolean;
  mergeNormalLoadedRows: (
    result: ProjectObjectsQueryResponse | undefined,
    options: { excelModeEnabled: boolean },
  ) => void;
  rememberObjectQueryCursor: (result: ProjectObjectsQueryResponse | undefined) => void;
  resetNormalLoadMoreRequest: () => void;
}

const FINDABILITY_DISABLED_TABLE_VIEW_STATE = createEmptyTableViewState();

export interface HeatCalcVisibleRowsModelOptions {
  activeTableObjectType: HeatCalcObjectType;
  excelBaseRows: ProjectObject[];
  excelModeEnabled: boolean;
  excelRows: ProjectObject[];
  excelTableRows: HeatCalcIndexedTableRow<ProjectObject>[];
  isAllObjectScope: boolean;
  normalLoadedRowsByType: NormalLoadedRowsByType;
  objectQueryResult?: ProjectObjectsQueryResponse;
  visibleAllTableRows: HeatCalcIndexedTableRow<ProjectObject>[];
}

export function buildHeatCalcVisibleRowsModel({
  activeTableObjectType,
  excelBaseRows,
  excelModeEnabled,
  excelRows,
  excelTableRows,
  isAllObjectScope,
  normalLoadedRowsByType,
  objectQueryResult,
  visibleAllTableRows,
}: HeatCalcVisibleRowsModelOptions) {
  const baseVisibleTableObjects = (() => {
    if (excelModeEnabled) return excelBaseRows;
    if (isAllObjectScope) return visibleAllTableRows.map(({ record }) => record);
    const loadedRows = normalLoadedRowsByType[activeTableObjectType];
    if (loadedRows.length > 0) return loadedRows;
    return objectQueryResult?.page_info.page === 1 ? objectQueryResult.items : [];
  })();
  const visibleTableObjects = excelModeEnabled ? excelRows : baseVisibleTableObjects;
  const visibleTableRows = (() => {
    if (excelModeEnabled) return excelTableRows;
    if (isAllObjectScope) return visibleAllTableRows;
    return visibleTableObjects.map((record, index) => ({ record, sourceIndex: index }));
  })();
  return {
    baseVisibleTableObjects,
    visibleTableObjects,
    visibleTableRows,
    visibleSourceIndexById: new Map(visibleTableRows.map(({ record, sourceIndex }) => [record.id, sourceIndex])),
  };
}

export function buildHeatCalcEnumOptionsByColumn({
  allIndexedTableRows,
  fieldCapabilityByKey,
  isAllObjectScope,
  sourceColumnMetas,
  tableValueAccessors,
}: {
  allIndexedTableRows: HeatCalcIndexedTableRow<ProjectObject>[];
  fieldCapabilityByKey: Map<string, ObjectQueryFieldCapability>;
  isAllObjectScope: boolean;
  sourceColumnMetas: HeatCalcResolvedColumnMeta[];
  tableValueAccessors: HeatCalcColumnValueAccessors<ProjectObject>;
}) {
  const result: Record<HeatCalcColumnKey, { label: string; value: string }[]> = {};
  for (const meta of sourceColumnMetas) {
    const capability = fieldCapabilityByKey.get(meta.key);
    if (filterKindForColumn(meta.key, capability) !== 'enum') continue;
    if (isAllObjectScope) {
      const values = new Map<string, string>();
      for (const row of allIndexedTableRows) {
        const value = tableValueAccessors[meta.key]?.(row.record, row.sourceIndex);
        if (value == null || value === INAPPLICABLE_TABLE_VALUE) continue;
        const textValue = String(value).trim();
        if (!textValue) continue;
        values.set(textValue, textValue);
      }
      result[meta.key] = [...values.values()]
        .sort((left, right) => left.localeCompare(right, 'ru', { numeric: true, sensitivity: 'base' }))
        .map((value) => ({ label: value, value }));
      continue;
    }
    result[meta.key] = (capability?.options?.items ?? []).map((item) => ({
      label: item.label,
      value: String(item.value),
    }));
  }
  return result;
}

export function useHeatCalcObjectsDataModel({
  activeObjectQueryCursor,
  activeObjectScope,
  activeTableColumnScope,
  activeTableObjectType,
  activeTablePage,
  activeTableViewState,
  allTableViewState,
  excelModeEnabled,
  isAllObjectScope,
  project,
  queryClient,
  tableColumnSettings,
  tableViewSettings,
  tableFindabilityEnabled,
  mergeNormalLoadedRows,
  rememberObjectQueryCursor,
  resetNormalLoadMoreRequest,
}: UseHeatCalcObjectsDataModelOptions) {
  const { data: objectsSummary } = useQuery({
    queryKey: ['project', project?.id, 'objects', 'summary'],
    queryFn: () => getObjectsSummary(project!.id),
    enabled: !!project,
  });

  const { data: objectQueryCapabilities } = useQuery({
    queryKey: ['project', project?.id, 'objects', 'query-capabilities', activeTableObjectType],
    queryFn: () => getObjectQueryCapabilities(project!.id, activeTableObjectType),
    enabled: !!project && !isAllObjectScope,
    staleTime: 5 * 60_000,
  });

  const { data: insulationMaterials = [] } = useQuery({
    queryKey: referenceQueryKeys.insulation,
    queryFn: getInsulation,
    enabled: !!project,
    ...referenceQueryOptions,
  });
  const effectiveActiveTableViewState = tableFindabilityEnabled
    ? activeTableViewState
    : FINDABILITY_DISABLED_TABLE_VIEW_STATE;
  const effectiveAllTableViewState = tableFindabilityEnabled
    ? allTableViewState
    : FINDABILITY_DISABLED_TABLE_VIEW_STATE;

  const objectQueryRequest = useMemo(
    () => (isAllObjectScope
      ? null
      : buildObjectQueryRequest(
        activeTableObjectType,
        effectiveActiveTableViewState,
        activeTablePage,
        objectQueryCapabilities?.default_page_size ?? DEFAULT_OBJECT_QUERY_PAGE_SIZE,
        objectQueryCapabilities,
        activeObjectQueryCursor,
      )),
    [
      activeObjectQueryCursor,
      activeTableObjectType,
      activeTablePage,
      effectiveActiveTableViewState,
      isAllObjectScope,
      objectQueryCapabilities,
    ],
  );
  const objectQueryKey = useMemo(
    () => ['project', project?.id, 'objects', 'query', objectQueryRequest] as const,
    [objectQueryRequest, project?.id],
  );
  const allProjectObjectsQueryKey = useMemo(
    () => ['project', project?.id, 'objects', 'query', 'all'] as const,
    [project?.id],
  );
  const { data: objectQueryResult, isFetching: objectQueryFetching } = useQuery({
    queryKey: objectQueryKey,
    queryFn: () => queryObjects(project!.id, objectQueryRequest!),
    enabled: !!project && objectQueryRequest != null && !!objectQueryCapabilities,
    placeholderData: (previous) => previous,
  });

  useEffect(() => {
    rememberObjectQueryCursor(objectQueryResult);
  }, [objectQueryResult, rememberObjectQueryCursor]);
  useEffect(() => {
    mergeNormalLoadedRows(objectQueryResult, { excelModeEnabled });
  }, [excelModeEnabled, mergeNormalLoadedRows, objectQueryResult]);
  useEffect(() => {
    if (!objectQueryFetching) {
      resetNormalLoadMoreRequest();
    }
  }, [objectQueryFetching, objectQueryResult?.page_info.page, resetNormalLoadMoreRequest]);

  const currentPageObjectsForExcel = useMemo(
    () => (!isAllObjectScope ? objectQueryResult?.items ?? [] : []),
    [isAllObjectScope, objectQueryResult?.items],
  );
  const { data: allProjectObjectsData } = useQuery({
    queryKey: allProjectObjectsQueryKey,
    queryFn: () => listObjects(project!.id),
    enabled: !!project && (isAllObjectScope || excelModeEnabled),
    placeholderData: (previous) => previous ?? currentPageObjectsForExcel,
  });
  const allProjectObjects = allProjectObjectsData ?? currentPageObjectsForExcel;

  useEffect(() => {
    if (!project || isAllObjectScope) return undefined;
    const win = window as Window & {
      requestIdleCallback?: (callback: () => void, options?: { timeout?: number }) => number;
      cancelIdleCallback?: (handle: number) => void;
    };
    const prefetchObjects = () => {
      void queryClient.prefetchQuery({
        queryKey: allProjectObjectsQueryKey,
        queryFn: () => listObjects(project.id),
      });
    };
    if (win.requestIdleCallback) {
      const handle = win.requestIdleCallback(prefetchObjects, { timeout: 1_500 });
      return () => win.cancelIdleCallback?.(handle);
    }
    const handle = window.setTimeout(prefetchObjects, 0);
    return () => window.clearTimeout(handle);
  }, [allProjectObjectsQueryKey, isAllObjectScope, project, queryClient]);

  const insulationLabelByCode = useMemo(
    () => new Map(insulationMaterials.map((m) => [m.material, insulationEntryLabel(m)])),
    [insulationMaterials],
  );
  const insulationLabel = useCallback((material: unknown) => {
    const code = String(material ?? '');
    if (!code) return '—';
    return insulationLabelByCode.get(code) ?? MATERIAL_LABELS[code] ?? code;
  }, [insulationLabelByCode]);

  const pipeCount = objectsSummary?.by_type.pipe ?? 0;
  const tankCount = objectsSummary?.by_type.tank ?? 0;
  const projectObjectCount = objectsSummary?.total ?? pipeCount + tankCount;
  const totalCount = activeObjectScope === 'all'
    ? projectObjectCount
    : objectsSummary?.by_type[activeObjectScope] ?? 0;
  const columnRenderers = useMemo(
    () => buildHeatCalcColumnRenderers({ insulationLabel }),
    [insulationLabel],
  );

  const normalizedTableView = useMemo(
    () => normalizeTableViewSettings(tableViewSettings),
    [tableViewSettings],
  );
  const configuredColumnMetas = useMemo(
    () => getVisibleTableColumnMetas(
      activeTableColumnScope,
      tableColumnSettings,
      normalizedTableView.tableLabelFormat,
    ),
    [activeTableColumnScope, normalizedTableView.tableLabelFormat, tableColumnSettings],
  );
  const allConfiguredColumnMetas = useMemo(
    () => getAllTableColumnMetas(
      activeTableColumnScope,
      tableColumnSettings,
      normalizedTableView.tableLabelFormat,
    ),
    [activeTableColumnScope, normalizedTableView.tableLabelFormat, tableColumnSettings],
  );
  const sourceColumnMetas = useMemo(
    () => (excelModeEnabled
      ? getExcelEditableColumnMetas(activeTableObjectType, allConfiguredColumnMetas)
      : configuredColumnMetas),
    [activeTableObjectType, allConfiguredColumnMetas, configuredColumnMetas, excelModeEnabled],
  );
  const editableExcelColumnKeys = useMemo(
    () => (!isAllObjectScope
      ? sourceColumnMetas
        .filter((meta) => getInlineEditFieldConfig(activeTableObjectType, meta.key))
        .map((meta) => meta.key)
      : []),
    [activeTableObjectType, isAllObjectScope, sourceColumnMetas],
  );
  const resolvedTableFontSize = useMemo(
    () => resolveTableFontSize(normalizedTableView),
    [normalizedTableView],
  );
  const fieldCapabilityByKey = useMemo(
    () => new Map(objectQueryCapabilities?.fields.map((field) => [field.key, field]) ?? []),
    [objectQueryCapabilities],
  );
  const visibleTableColumnKeys = useMemo(
    () => configuredColumnMetas.map((meta) => meta.key),
    [configuredColumnMetas],
  );
  const tableValueAccessors = useMemo<HeatCalcColumnValueAccessors<ProjectObject>>(() => {
    const accessors: HeatCalcColumnValueAccessors<ProjectObject> = {};
    for (const meta of HEATCALC_TABLE_COLUMN_CATALOG.all) {
      accessors[meta.key] = (record, sourceIndex) => {
        if (!isColumnApplicableToObjectType(meta.key, record.object_type)) {
          return INAPPLICABLE_TABLE_VALUE;
        }
        return columnRenderers[meta.key].copyValue(record, sourceIndex);
      };
    }
    return accessors;
  }, [columnRenderers]);
  const allIndexedTableRows = useMemo<HeatCalcIndexedTableRow<ProjectObject>[]>(
    () => allProjectObjects
      .filter((object) => object.object_type === 'pipe' || object.object_type === 'tank')
      .sort((left, right) => {
        const bySortOrder = left.sort_order - right.sort_order;
        if (bySortOrder !== 0) return bySortOrder;
        return left.created_at.localeCompare(right.created_at);
      })
      .map((record, index) => ({ record, sourceIndex: index })),
    [allProjectObjects],
  );
  const allFilteredSortedTableRows = useMemo(
    () => applyTableSort(
      applyColumnFilters(allIndexedTableRows, effectiveAllTableViewState.filters, tableValueAccessors),
      effectiveAllTableViewState.sort,
      tableValueAccessors,
    ),
    [allIndexedTableRows, effectiveAllTableViewState, tableValueAccessors],
  );
  const visibleAllTableRows = useMemo(
    () => allFilteredSortedTableRows,
    [allFilteredSortedTableRows],
  );
  const enumOptionsByColumn = useMemo(
    () => buildHeatCalcEnumOptionsByColumn({
      allIndexedTableRows,
      fieldCapabilityByKey,
      isAllObjectScope,
      sourceColumnMetas,
      tableValueAccessors,
    }),
    [allIndexedTableRows, fieldCapabilityByKey, isAllObjectScope, sourceColumnMetas, tableValueAccessors],
  );

  return {
    allConfiguredColumnMetas,
    allFilteredSortedTableRows,
    allIndexedTableRows,
    allProjectObjects,
    allProjectObjectsQueryKey,
    columnRenderers,
    configuredColumnMetas,
    editableExcelColumnKeys,
    enumOptionsByColumn,
    fieldCapabilityByKey,
    objectQueryCapabilities,
    objectQueryFetching,
    objectQueryKey,
    objectQueryRequest,
    objectQueryResult,
    pipeCount,
    projectObjectCount,
    resolvedTableFontSize,
    sourceColumnMetas,
    tableValueAccessors,
    tankCount,
    totalCount,
    normalizedTableView,
    visibleAllTableRows,
    visibleTableColumnKeys,
  };
}

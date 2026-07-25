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
  Project,
  ProjectObject,
  ProjectObjectsPageCursor,
  ProjectObjectsQueryResponse,
} from '@/types/project';
import {
  HEATCALC_TABLE_COLUMN_CATALOG,
  getAllTableColumnMetas,
  getVisibleTableColumnMetas,
  type HeatCalcObjectType,
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
  insulationEntryLabel,
  isColumnApplicableToObjectType,
} from '@/utils/heatCalcPageUtils';
import { buildHeatCalcColumnRenderers } from '@/pages/heatcalc/heatCalcColumnRenderers';
import {
  buildHeatCalcWorkspaceLoadState,
  requiredQuerySlice,
} from '@/pages/heatcalc/heatCalcWorkspaceLoadStateModel';
import type { ActiveObjectScope } from '@/pages/heatcalc/useHeatCalcTableState';
import { buildHeatCalcEnumOptionsByColumn } from '@/pages/heatcalc/heatCalcVisibleRowsModel';

export type {
  HeatCalcRequiredQuerySlice,
  HeatCalcWorkspaceLoadState,
} from '@/pages/heatcalc/heatCalcWorkspaceLoadStateModel';
export { buildHeatCalcWorkspaceLoadState } from '@/pages/heatcalc/heatCalcWorkspaceLoadStateModel';
export type { HeatCalcVisibleRowsModelOptions } from '@/pages/heatcalc/heatCalcVisibleRowsModel';
export {
  buildHeatCalcEnumOptionsByColumn,
  buildHeatCalcVisibleRowsModel,
} from '@/pages/heatcalc/heatCalcVisibleRowsModel';

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
  const summaryQuery = useQuery({
    queryKey: ['project', project?.id, 'objects', 'summary'],
    queryFn: () => getObjectsSummary(project!.id),
    enabled: !!project,
  });
  const objectsSummary = summaryQuery.data;

  const capabilitiesQuery = useQuery({
    queryKey: ['project', project?.id, 'objects', 'query-capabilities', activeTableObjectType],
    queryFn: () => getObjectQueryCapabilities(project!.id, activeTableObjectType),
    enabled: !!project && !isAllObjectScope,
    staleTime: 5 * 60_000,
  });
  const objectQueryCapabilities = capabilitiesQuery.data;

  // Insulation reference is non-blocking for workspace load state (AF10-HEAT-LOAD-STATE-MODEL-01).
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
    () => (isAllObjectScope || excelModeEnabled
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
      excelModeEnabled,
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
  const objectQueryEnabled = !!project && objectQueryRequest != null && !!objectQueryCapabilities;
  const activeObjectsQuery = useQuery({
    queryKey: objectQueryKey,
    queryFn: () => queryObjects(project!.id, objectQueryRequest!),
    enabled: objectQueryEnabled,
    placeholderData: (previous) => previous,
  });
  const objectQueryResult = activeObjectsQuery.data;
  const objectQueryFetching = activeObjectsQuery.isFetching;

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
  const allObjectsQueryEnabled = !!project && (isAllObjectScope || excelModeEnabled);
  const allObjectsQuery = useQuery({
    queryKey: allProjectObjectsQueryKey,
    queryFn: () => listObjects(project!.id),
    enabled: allObjectsQueryEnabled,
    placeholderData: (previous) => previous ?? currentPageObjectsForExcel,
  });
  const allProjectObjectsData = allObjectsQuery.data;
  const allProjectObjects = allProjectObjectsData ?? currentPageObjectsForExcel;

  const workspaceLoadState = useMemo(
    () => buildHeatCalcWorkspaceLoadState([
      // Summary counts count as a workspace snapshot (avoids fake empty-project UX).
      requiredQuerySlice(!!project, summaryQuery),
      // Capabilities is required metadata but not a table/rows snapshot.
      requiredQuerySlice(!!project && !isAllObjectScope, capabilitiesQuery, false),
      // placeholderData keeps previous page on refetch; treat that as usable.
      requiredQuerySlice(objectQueryEnabled, activeObjectsQuery),
      requiredQuerySlice(
        allObjectsQueryEnabled,
        allObjectsQuery,
        allObjectsQuery.data != null
          || (allObjectsQueryEnabled && currentPageObjectsForExcel.length > 0),
      ),
    ]),
    [summaryQuery, capabilitiesQuery, activeObjectsQuery, allObjectsQuery,
      allObjectsQueryEnabled, currentPageObjectsForExcel.length, isAllObjectScope,
      objectQueryEnabled, project],
  );
  const allProjectObjectsPrefetchLimit =
    objectQueryCapabilities?.default_page_size ?? DEFAULT_OBJECT_QUERY_PAGE_SIZE;
  const projectObjectCountForPrefetch = objectsSummary?.total;

  useEffect(() => {
    if (
      !project ||
      isAllObjectScope ||
      excelModeEnabled ||
      projectObjectCountForPrefetch == null ||
      projectObjectCountForPrefetch > allProjectObjectsPrefetchLimit
    ) return undefined;
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
  }, [
    allProjectObjectsPrefetchLimit,
    allProjectObjectsQueryKey,
    excelModeEnabled,
    isAllObjectScope,
    project,
    projectObjectCountForPrefetch,
    queryClient,
  ]);

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
    workspaceLoadState,
  };
}

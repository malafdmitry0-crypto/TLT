import {
  useCallback,
  useMemo,
  type Dispatch,
  type SetStateAction,
} from 'react';

import { OBJECT_TYPE_LABELS } from '@/constants/objectTypes';
import type { HeatCalcExcelCellRef } from '@/hooks/useHeatCalcExcelSelection';
import type { ProjectObject } from '@/types/project';
import type { DraftRowsById } from '@/utils/heatCalcInlineEdit';
import type { ExcelSelectionRange } from '@/utils/heatCalcExcelMode';
import {
  removeExcelRowsFromModel,
  type ExcelLocalProjectObject,
} from '@/utils/heatCalcExcelRows';
import type { HeatCalcObjectType } from '@/utils/heatCalcTableColumns';
import type { HeatCalcIndexedTableRow } from '@/utils/heatCalcTableFindability';
import type { ActiveObjectScope } from '@/pages/heatcalc/useHeatCalcTableState';
import { DEFAULT_OBJECT_QUERY_PAGE_SIZE } from '@/pages/heatcalc/heatCalcPageUtils';

interface DuplicateObjectPayload {
  object_type: HeatCalcObjectType;
  params: Record<string, unknown>;
  sort_order: number;
}

interface UseHeatCalcBulkActionsOptions {
  activeObjectScope: ActiveObjectScope;
  activeTypeTotalCount: number;
  allFilteredSortedTableRowCount: number;
  clearSelectedRows: () => void;
  draftRowsById: DraftRowsById;
  excelLocalRows: ExcelLocalProjectObject[];
  excelModeEnabled: boolean;
  objectQueryFilteredCount?: number;
  objectQueryPageSize?: number;
  openEditWizard: (object: ProjectObject) => void;
  projectObjectCount: number;
  removeNormalLoadedRows: (ids: Set<string>) => void;
  selectedExcelRows: HeatCalcIndexedTableRow<ProjectObject>[];
  selectedVisibleRows: HeatCalcIndexedTableRow<ProjectObject>[];
  setActiveInlineCell: Dispatch<SetStateAction<HeatCalcExcelCellRef>>;
  setDraftRowsById: Dispatch<SetStateAction<DraftRowsById>>;
  setExcelLocalRows: Dispatch<SetStateAction<ExcelLocalProjectObject[]>>;
  setExcelSelectionRange: Dispatch<SetStateAction<ExcelSelectionRange | null>>;
  setPendingTableFocusObject: Dispatch<SetStateAction<ProjectObject | null>>;
  setSelectedExcelCell: Dispatch<SetStateAction<HeatCalcExcelCellRef>>;
  setTablePage: (scope: ActiveObjectScope, page: number) => void;
  addObject: (payload: DuplicateObjectPayload) => Promise<ProjectObject>;
  removeObject: (objectId: string) => void;
  notifySuccess: (message: string) => void;
}

export function useHeatCalcBulkActions({
  activeObjectScope,
  activeTypeTotalCount,
  allFilteredSortedTableRowCount,
  clearSelectedRows,
  draftRowsById,
  excelLocalRows,
  excelModeEnabled,
  objectQueryFilteredCount,
  objectQueryPageSize,
  openEditWizard,
  projectObjectCount,
  removeNormalLoadedRows,
  selectedExcelRows,
  selectedVisibleRows,
  setActiveInlineCell,
  setDraftRowsById,
  setExcelLocalRows,
  setExcelSelectionRange,
  setPendingTableFocusObject,
  setSelectedExcelCell,
  setTablePage,
  addObject,
  removeObject,
  notifySuccess,
}: UseHeatCalcBulkActionsOptions) {
  const tableDeleteRows = excelModeEnabled ? selectedExcelRows : selectedVisibleRows;
  const selectedObjectCount = selectedVisibleRows.length;
  const deleteTargetCount = tableDeleteRows.length;

  const duplicatePayloads = useMemo(
    () => selectedVisibleRows
      .filter(({ record }) => record.object_type === 'pipe' || record.object_type === 'tank')
      .map(({ record }, index): DuplicateObjectPayload => {
        const objectType = record.object_type === 'tank' ? 'tank' : 'pipe';
        const sourceName = String(record.params?.name ?? OBJECT_TYPE_LABELS[objectType]);
        return {
          object_type: objectType,
          params: {
            ...record.params,
            name: `${sourceName} (копия)`,
          },
          sort_order: projectObjectCount + index,
        };
      }),
    [projectObjectCount, selectedVisibleRows],
  );

  const duplicateSelectedObjects = useCallback(async () => {
    if (duplicatePayloads.length === 0) return;

    const createdObjects: ProjectObject[] = [];
    for (const payload of duplicatePayloads) {
      try {
        createdObjects.push(await addObject(payload));
      } catch {
        break;
      }
    }

    const lastCreatedObject = createdObjects[createdObjects.length - 1];
    if (!lastCreatedObject) return;

    const lastCreatedObjectType: HeatCalcObjectType = lastCreatedObject.object_type === 'tank' ? 'tank' : 'pipe';
    const targetScope: ActiveObjectScope = activeObjectScope === 'all' ? 'all' : lastCreatedObjectType;
    const createdInTargetScope = activeObjectScope === 'all'
      ? createdObjects.length
      : createdObjects.filter((object) => object.object_type === lastCreatedObjectType).length;
    const pageSize = activeObjectScope === 'all'
      ? DEFAULT_OBJECT_QUERY_PAGE_SIZE
      : objectQueryPageSize ?? DEFAULT_OBJECT_QUERY_PAGE_SIZE;
    const currentTargetCount = activeObjectScope === 'all'
      ? allFilteredSortedTableRowCount
      : objectQueryFilteredCount ?? activeTypeTotalCount;
    const targetPage = Math.max(1, Math.ceil((currentTargetCount + createdInTargetScope) / pageSize));

    clearSelectedRows();
    setTablePage(targetScope, targetPage);
    setPendingTableFocusObject(lastCreatedObject);
    openEditWizard(lastCreatedObject);
  }, [
    activeObjectScope,
    activeTypeTotalCount,
    addObject,
    allFilteredSortedTableRowCount,
    clearSelectedRows,
    duplicatePayloads,
    objectQueryFilteredCount,
    objectQueryPageSize,
    openEditWizard,
    setPendingTableFocusObject,
    setTablePage,
  ]);

  const removeSelectedObjects = useCallback(() => {
    const rowIds = tableDeleteRows.map(({ record }) => record.id);
    const nextModel = removeExcelRowsFromModel({
      localRows: excelLocalRows,
      draftRowsById,
      rowIds,
    });
    if (nextModel.localIds.length > 0) {
      setExcelLocalRows(nextModel.localRows);
      setDraftRowsById(nextModel.draftRowsById);
    }

    const persistedIdSet = new Set(nextModel.persistedIds);
    const persistedRows = tableDeleteRows.filter(({ record }) => persistedIdSet.has(record.id));
    persistedRows.forEach(({ record }) => {
      removeObject(record.id);
    });
    if (persistedIdSet.size > 0) {
      removeNormalLoadedRows(persistedIdSet);
    }

    if (excelModeEnabled) {
      setSelectedExcelCell(null);
      setExcelSelectionRange(null);
      setActiveInlineCell(null);
    }
    clearSelectedRows();
    if (nextModel.localIds.length > 0 && persistedRows.length === 0) {
      notifySuccess(nextModel.localIds.length > 1 ? 'Строки удалены' : 'Строка удалена');
    }
  }, [
    clearSelectedRows,
    draftRowsById,
    excelLocalRows,
    excelModeEnabled,
    notifySuccess,
    removeNormalLoadedRows,
    removeObject,
    setActiveInlineCell,
    setDraftRowsById,
    setExcelLocalRows,
    setExcelSelectionRange,
    setSelectedExcelCell,
    tableDeleteRows,
  ]);

  return {
    tableDeleteRows,
    selectedObjectCount,
    deleteTargetCount,
    duplicateSelectedObjects,
    removeSelectedObjects,
  };
}

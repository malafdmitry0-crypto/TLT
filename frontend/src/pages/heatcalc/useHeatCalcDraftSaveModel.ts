import {
  useCallback,
  useMemo,
  type Dispatch,
  type SetStateAction,
} from 'react';
import { appMessage as antdMessage } from '@/feedback/appFeedback';
import type { QueryClient, QueryKey } from '@tanstack/react-query';

import { createObject, updateObject } from '@/api/projects';
import type {
  CreateObjectRequest,
  ProjectObject,
  ProjectObjectsQueryResponse,
  UpdateObjectRequest,
} from '@/types/project';
import {
  buildDraftRowParams,
  DraftRowValidationError,
  getDraftRowValidationErrors,
  type DraftRowsById,
  type DraftRowState,
} from '@/utils/heatCalcInlineEdit';
import {
  isExcelNewRowId,
} from '@/utils/heatCalcExcelMode';
import {
  pruneExcelLocalRowsByIds,
  upsertSavedExcelObjectsInProjectList,
  type ExcelLocalProjectObject,
  type SavedExcelProjectObject,
} from '@/utils/heatCalcExcelRows';

type DraftSaveProject = {
  id: string;
} | null | undefined;

type SaveDraftRowsResult = {
  ok: boolean;
  saved: ProjectObject[];
};

interface UseHeatCalcDraftSaveModelOptions {
  allProjectObjects: ProjectObject[];
  allProjectObjectsQueryKey: QueryKey;
  createObjectRequest?: (projectId: string, payload: CreateObjectRequest) => Promise<ProjectObject>;
  draftRowsById: DraftRowsById;
  isSavableDraftRow: (row: DraftRowState | undefined) => boolean;
  notifyError?: (message: string) => void;
  notifySuccess?: (message: string) => void;
  objectQueryKey: QueryKey;
  project: DraftSaveProject;
  projectObjectCount: number;
  queryClient: QueryClient;
  selectedRowKeys: string[];
  setDraftRowsById: Dispatch<SetStateAction<DraftRowsById>>;
  setExcelLocalRows: Dispatch<SetStateAction<ExcelLocalProjectObject[]>>;
  tableCellEditingEnabled: boolean;
  updateObjectRequest?: (
    projectId: string,
    objectId: string,
    payload: UpdateObjectRequest,
  ) => Promise<ProjectObject>;
  upsertNormalLoadedRow: (savedObject: ProjectObject) => void;
  visibleTableObjects: ProjectObject[];
}

export function useHeatCalcDraftSaveModel({
  allProjectObjects,
  allProjectObjectsQueryKey,
  createObjectRequest = createObject,
  draftRowsById,
  isSavableDraftRow,
  notifyError = (message) => {
    void antdMessage.error(message);
  },
  notifySuccess = (message) => {
    void antdMessage.success(message);
  },
  objectQueryKey,
  project,
  projectObjectCount,
  queryClient,
  selectedRowKeys,
  setDraftRowsById,
  setExcelLocalRows,
  tableCellEditingEnabled,
  updateObjectRequest = updateObject,
  upsertNormalLoadedRow,
  visibleTableObjects,
}: UseHeatCalcDraftSaveModelOptions) {
  const dirtyDraftRows = useMemo(
    () => Object.values(draftRowsById).filter((row): row is DraftRowState => isSavableDraftRow(row)),
    [draftRowsById, isSavableDraftRow],
  );
  const dirtyDraftRowCount = dirtyDraftRows.length;
  const selectedDirtyRowIds = useMemo(
    () => selectedRowKeys.filter((key) => isSavableDraftRow(draftRowsById[key])),
    [draftRowsById, isSavableDraftRow, selectedRowKeys],
  );
  const saveTargetIds = selectedDirtyRowIds.length > 0
    ? selectedDirtyRowIds
    : dirtyDraftRows.map((row) => row.objectId);
  const saveTargetCount = saveTargetIds.length;
  const selectedDirtyTarget = selectedDirtyRowIds.length > 0;
  const draftControlsVisible = tableCellEditingEnabled || dirtyDraftRowCount > 0;
  const draftDiscardLabel = selectedDirtyTarget
    ? `Сбросить выбранные (${saveTargetCount})`
    : `Сбросить все (${saveTargetCount})`;
  const inlineDraftSaving = dirtyDraftRows.some((row) => row.saving);

  const updateObjectInCurrentQuery = useCallback((savedObject: ProjectObject) => {
    queryClient.setQueryData<ProjectObjectsQueryResponse | undefined>(objectQueryKey, (current) => {
      if (!current) return current;
      return {
        ...current,
        items: current.items.map((item) => (item.id === savedObject.id ? savedObject : item)),
      };
    });
    upsertNormalLoadedRow(savedObject);
  }, [objectQueryKey, queryClient, upsertNormalLoadedRow]);

  const updateSavedExcelObjectsInCaches = useCallback((savedRows: SavedExcelProjectObject[]) => {
    if (savedRows.length === 0) return;
    queryClient.setQueryData<ProjectObject[] | undefined>(allProjectObjectsQueryKey, (current) => (
      upsertSavedExcelObjectsInProjectList(current, savedRows, allProjectObjects)
    ));
    savedRows.forEach(({ draftRowId, savedObject }) => {
      if (!isExcelNewRowId(draftRowId)) updateObjectInCurrentQuery(savedObject);
    });
  }, [allProjectObjects, allProjectObjectsQueryKey, queryClient, updateObjectInCurrentQuery]);

  const saveDraftRows = useCallback(async (rowIds?: string[]): Promise<SaveDraftRowsResult> => {
    if (!project) return { ok: false, saved: [] };
    const targetRows = (rowIds ?? Object.keys(draftRowsById))
      .map((id) => draftRowsById[id])
      .filter((row): row is DraftRowState => isSavableDraftRow(row));

    if (targetRows.length === 0) return { ok: true, saved: [] };
    const validationByRowId = Object.fromEntries(
      targetRows.map((row) => [row.objectId, getDraftRowValidationErrors(row)]),
    ) as Record<string, Record<string, string>>;
    const invalidRows = targetRows.filter((row) => Object.keys(validationByRowId[row.objectId] ?? {}).length > 0);
    const validRows = targetRows.filter((row) => Object.keys(validationByRowId[row.objectId] ?? {}).length === 0);
    if (invalidRows.length > 0) {
      setDraftRowsById((current) => {
        const next = { ...current };
        invalidRows.forEach((row) => {
          if (next[row.objectId]) {
            next[row.objectId] = {
              ...next[row.objectId],
              saving: false,
              errors: validationByRowId[row.objectId] ?? {},
            };
          }
        });
        return next;
      });
    }
    if (validRows.length === 0) {
      notifyError('Исправьте ошибки в строках перед сохранением');
      return { ok: false, saved: [] };
    }

    const targetIds = new Set(validRows.map((row) => row.objectId));
    setDraftRowsById((current) => {
      const next = { ...current };
      targetIds.forEach((id) => {
        if (next[id]) next[id] = { ...next[id], saving: true };
      });
      return next;
    });

    const saved: ProjectObject[] = [];
    const savedExcelRows: SavedExcelProjectObject[] = [];
    const savedDraftIds = new Set<string>();
    const failed: Record<string, string> = {};
    const failedValidation: Record<string, Record<string, string>> = {};

    await Promise.all(validRows.map(async (row, index) => {
      try {
        const isNewRow = isExcelNewRowId(row.objectId);
        const params = buildDraftRowParams(row);
        const savedObject = isNewRow
          ? await createObjectRequest(project.id, {
            object_type: row.objectType,
            params,
            sort_order: (() => {
              const rowIndex = visibleTableObjects.findIndex((object) => object.id === row.objectId);
              return rowIndex >= 0 ? rowIndex : projectObjectCount + index;
            })(),
          })
          : await updateObjectRequest(project.id, row.objectId, {
            version: row.baseVersion,
            params,
          });
        saved.push(savedObject);
        savedExcelRows.push({ draftRowId: row.objectId, savedObject });
        savedDraftIds.add(row.objectId);
      } catch (error) {
        if (error instanceof DraftRowValidationError) {
          failedValidation[row.objectId] = error.errors;
        } else {
          failed[row.objectId] = error instanceof Error ? error.message : 'Не удалось сохранить строку';
        }
      }
    }));

    if (savedDraftIds.size > 0) {
      updateSavedExcelObjectsInCaches(savedExcelRows);
      setExcelLocalRows((current) => pruneExcelLocalRowsByIds(current, savedDraftIds));
    }
    setDraftRowsById((current) => {
      const next = { ...current };
      savedDraftIds.forEach((id) => {
        delete next[id];
      });
      Object.entries(failed).forEach(([id, message]) => {
        if (next[id]) {
          next[id] = {
            ...next[id],
            saving: false,
            errors: {
              ...next[id].errors,
              _row: message,
            },
          };
        }
      });
      Object.entries(failedValidation).forEach(([id, errors]) => {
        if (next[id]) {
          next[id] = {
            ...next[id],
            saving: false,
            errors,
          };
        }
      });
      return next;
    });

    queryClient.invalidateQueries({ queryKey: ['project', project.id, 'objects', 'query'] });
    queryClient.invalidateQueries({ queryKey: ['project', project.id, 'objects', 'summary'] });
    queryClient.invalidateQueries({ queryKey: ['spec', project.id] });

    if (Object.keys(failed).length > 0 || Object.keys(failedValidation).length > 0 || invalidRows.length > 0) {
      notifyError('Часть строк не сохранена');
      return { ok: false, saved };
    }
    notifySuccess(`Сохранено строк: ${saved.length}`);
    return { ok: true, saved };
  }, [
    createObjectRequest,
    draftRowsById,
    isSavableDraftRow,
    notifyError,
    notifySuccess,
    project,
    projectObjectCount,
    queryClient,
    setDraftRowsById,
    setExcelLocalRows,
    updateObjectRequest,
    updateSavedExcelObjectsInCaches,
    visibleTableObjects,
  ]);

  return {
    dirtyDraftRows,
    dirtyDraftRowCount,
    draftControlsVisible,
    draftDiscardLabel,
    inlineDraftSaving,
    saveDraftRows,
    saveTargetCount,
    saveTargetIds,
    selectedDirtyRowIds,
    selectedDirtyTarget,
  };
}

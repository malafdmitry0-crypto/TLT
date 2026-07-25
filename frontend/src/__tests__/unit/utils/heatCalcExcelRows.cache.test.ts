/* eslint-disable @typescript-eslint/no-unused-vars -- scenario split keeps shared preamble */
import { describe, expect, it } from 'vitest';

import type { ProjectObject } from '@/types/project';
import type { DraftRowState } from '@/utils/heatCalcInlineEdit';
import {
  applyExcelDraftRowPatch,
  buildExcelLocalRows,
  countTrailingBlankExcelInputRows,
  getActiveExcelLocalRows,
  isSavableExcelDraftRow,
  mergeExcelLocalRows,
  missingTrailingExcelInputRows,
  pruneExcelLocalRowsByIds,
  removeDraftRowsByIds,
  removeExcelRowsFromModel,
  resetExcelRowsInModel,
  upsertSavedExcelObjectsInProjectList,
} from '@/utils/heatCalcExcelRows';

function projectObject(id: string, sortOrder: number, objectType: 'pipe' | 'tank' = 'pipe'): ProjectObject {
  return {
    id,
    project_id: 'project-1',
    object_type: objectType,
    sort_order: sortOrder,
    version: 1,
    params: {},
    results: null,
    is_valid: true,
    validation_errors: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  };
}

function draftRow(overrides: Partial<DraftRowState>): DraftRowState {
  return {
    objectId: 'pipe-1',
    objectType: 'pipe',
    baseVersion: 1,
    baseFormValues: {},
    draftFormValues: {},
    dirtyFields: {},
    errors: {},
    saving: false,
    sourceParams: {},
    ...overrides,
  };
}

describe('heatCalcExcelRows — full-list cache replace', () => {
  it('заменяет временную Excel-строку сохраненным объектом в списке кеша', () => {
    const persistedA = projectObject('pipe-a', 1);
    const tempRow = projectObject('new:pipe:4', 2);
    const persistedB = projectObject('pipe-b', 3);
    const savedObject = projectObject('pipe-new', 2, 'pipe');

    const result = upsertSavedExcelObjectsInProjectList(
      [persistedA, tempRow, persistedB],
      [{ draftRowId: tempRow.id, savedObject }],
    );

    expect(result?.map((row) => row.id)).toEqual(['pipe-a', 'pipe-new', 'pipe-b']);
    expect(result?.find((row) => row.id === 'new:pipe:4')).toBeUndefined();
  });

  it('добавляет сохраненную Excel-строку в full-list cache, если временной строки там не было', () => {
    const persistedA = projectObject('pipe-a', 1);
    const persistedB = projectObject('pipe-b', 3);
    const savedObject = projectObject('pipe-new', 2);

    const result = upsertSavedExcelObjectsInProjectList(
      [persistedA, persistedB],
      [{ draftRowId: 'new:pipe:4', savedObject }],
    );

    expect(result?.map((row) => row.id)).toEqual(['pipe-a', 'pipe-new', 'pipe-b']);
  });

  it('обновляет persisted Excel-строку в full-list cache без дубликатов', () => {
    const persistedA = projectObject('pipe-a', 1);
    const persistedB = projectObject('pipe-b', 2);
    const savedObject = {
      ...persistedB,
      version: 2,
      params: { name: 'updated' },
    };

    const result = upsertSavedExcelObjectsInProjectList(
      [persistedA, persistedB],
      [{ draftRowId: persistedB.id, savedObject }],
    );

    expect(result?.map((row) => row.id)).toEqual(['pipe-a', 'pipe-b']);
    expect(result?.find((row) => row.id === 'pipe-b')?.version).toBe(2);
    expect(result?.find((row) => row.id === 'pipe-b')?.params).toEqual({ name: 'updated' });
  });

});

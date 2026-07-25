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

describe('heatCalcExcelRows — local row create / filter / embed', () => {
  it('создает локальные строки ниже persisted row с устойчивыми id и anchor', () => {
    const result = buildExcelLocalRows({
      count: 2,
      objectType: 'pipe',
      projectId: 'project-1',
      projectObjectCount: 10,
      startSeq: 4,
      insertAfterObjectId: 'pipe-5',
      nowIso: '2026-02-03T04:05:06.000Z',
    });

    expect(result.nextSeq).toBe(6);
    expect(result.rows.map((row) => row.id)).toEqual(['new:pipe:4', 'new:pipe:5']);
    expect(result.rows.map((row) => row.sort_order)).toEqual([14, 15]);
    expect(result.rows.every((row) => row.__excelInsertAfterObjectId === 'pipe-5')).toBe(true);
    expect(result.rows.every((row) => row.project_id === 'project-1')).toBe(true);
  });

  it('фильтрует локальные строки по активному типу объекта', () => {
    const pipeRows = buildExcelLocalRows({
      count: 1,
      objectType: 'pipe',
      projectId: 'project-1',
      projectObjectCount: 0,
      startSeq: 0,
    }).rows;
    const tankRows = buildExcelLocalRows({
      count: 1,
      objectType: 'tank',
      projectId: 'project-1',
      projectObjectCount: 0,
      startSeq: 1,
    }).rows;

    expect(getActiveExcelLocalRows([...pipeRows, ...tankRows], 'pipe')).toEqual(pipeRows);
  });

  it('встраивает локальные строки после persisted и local anchor', () => {
    const persistedA = projectObject('pipe-a', 1);
    const persistedB = projectObject('pipe-b', 2);
    const [localAfterA] = buildExcelLocalRows({
      count: 1,
      objectType: 'pipe',
      projectId: 'project-1',
      projectObjectCount: 2,
      startSeq: 0,
      insertAfterObjectId: 'pipe-a',
    }).rows;
    const [localAfterLocal] = buildExcelLocalRows({
      count: 1,
      objectType: 'pipe',
      projectId: 'project-1',
      projectObjectCount: 2,
      startSeq: 1,
      insertAfterObjectId: localAfterA.id,
    }).rows;
    const [templateAtEnd] = buildExcelLocalRows({
      count: 1,
      objectType: 'pipe',
      projectId: 'project-1',
      projectObjectCount: 2,
      startSeq: 2,
    }).rows;

    const merged = mergeExcelLocalRows(
      [persistedA, persistedB],
      [localAfterA, localAfterLocal, templateAtEnd],
    );

    expect(merged.map((row) => row.id)).toEqual([
      'pipe-a',
      localAfterA.id,
      localAfterLocal.id,
      'pipe-b',
      templateAtEnd.id,
    ]);
  });

});

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

describe('heatCalcExcelRows — delete / reset / saveability', () => {
  it('delete удаляет только local rows из модели и возвращает persisted ids для backend', () => {
    const persisted = projectObject('pipe-a', 1);
    const [local] = buildExcelLocalRows({
      count: 1,
      objectType: 'pipe',
      projectId: 'project-1',
      projectObjectCount: 1,
      startSeq: 0,
    }).rows;
    const draftRowsById = {
      [persisted.id]: draftRow({ objectId: persisted.id, dirtyFields: { name: 'P01' } }),
      [local.id]: draftRow({ objectId: local.id, dirtyFields: { name: 'new' } }),
    };

    const result = removeExcelRowsFromModel({
      localRows: [local],
      draftRowsById,
      rowIds: [persisted.id, local.id],
    });

    expect(result.localRows).toEqual([]);
    expect(result.draftRowsById).toEqual({
      [persisted.id]: draftRowsById[persisted.id],
    });
    expect(result.localIds).toEqual([local.id]);
    expect(result.persistedIds).toEqual([persisted.id]);
  });

  it('reset удаляет пустую local row, но сохраняет заполненную local row как шаблон без draft', () => {
    const [blankLocal, filledLocal] = buildExcelLocalRows({
      count: 2,
      objectType: 'pipe',
      projectId: 'project-1',
      projectObjectCount: 0,
      startSeq: 0,
    }).rows;
    const persisted = projectObject('pipe-a', 1);
    const draftRowsById = {
      [blankLocal.id]: draftRow({ objectId: blankLocal.id, dirtyFields: {} }),
      [filledLocal.id]: draftRow({ objectId: filledLocal.id, dirtyFields: { name: 'new' } }),
      [persisted.id]: draftRow({ objectId: persisted.id, dirtyFields: { name: 'P01' } }),
    };

    const result = resetExcelRowsInModel({
      localRows: [blankLocal, filledLocal],
      draftRowsById,
      rowIds: [blankLocal.id, filledLocal.id, persisted.id],
    });

    expect(result.localRows.map((row) => row.id)).toEqual([filledLocal.id]);
    expect(result.draftRowsById).toEqual({});
  });

  it('не считает пустую local row сохраняемой, а заполненную local и persisted rows сохраняет', () => {
    expect(isSavableExcelDraftRow(undefined)).toBe(false);
    expect(isSavableExcelDraftRow(draftRow({
      objectId: 'new:pipe:1',
      dirtyFields: {},
    }))).toBe(false);
    expect(isSavableExcelDraftRow(draftRow({
      objectId: 'new:pipe:1',
      dirtyFields: { name: 'new' },
    }))).toBe(true);
    expect(isSavableExcelDraftRow(draftRow({
      objectId: 'pipe-a',
      dirtyFields: { name: 'P01' },
    }))).toBe(true);
  });

  it('считает только пустой trailing-хвост строк ввода для Excel-подобного заполнения', () => {
    const persisted = projectObject('pipe-a', 1);
    const persistedAfterMiddle = projectObject('pipe-b', 2);
    const { rows: trailingRows } = buildExcelLocalRows({
      count: 3,
      objectType: 'pipe',
      projectId: 'project-1',
      projectObjectCount: 1,
      startSeq: 0,
    });
    const [middleLocal] = buildExcelLocalRows({
      count: 1,
      objectType: 'pipe',
      projectId: 'project-1',
      projectObjectCount: 1,
      startSeq: 10,
      insertAfterObjectId: persisted.id,
    }).rows;
    const rows = mergeExcelLocalRows([persisted, persistedAfterMiddle], [middleLocal, ...trailingRows]);

    expect(countTrailingBlankExcelInputRows(rows, {})).toBe(3);
    expect(missingTrailingExcelInputRows(rows, {}, 5)).toBe(2);
    expect(countTrailingBlankExcelInputRows(rows, {
      [trailingRows[1].id]: draftRow({
        objectId: trailingRows[1].id,
        dirtyFields: { name: 'new' },
      }),
    })).toBe(1);
  });

});

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

describe('heatCalcExcelRows — draft patch helpers', () => {
  it('patch draft удаляет пустые строки, но сохраняет draft с ошибкой', () => {
    const current = {
      'pipe-a': draftRow({ objectId: 'pipe-a', dirtyFields: { name: 'P01' } }),
      'new:pipe:1': draftRow({ objectId: 'new:pipe:1', dirtyFields: { name: 'new' } }),
    };

    expect(applyExcelDraftRowPatch(
      current,
      'pipe-a',
      draftRow({ objectId: 'pipe-a', dirtyFields: {}, errors: {} }),
    )).toEqual({
      'new:pipe:1': current['new:pipe:1'],
    });
    expect(applyExcelDraftRowPatch(
      current,
      'new:pipe:1',
      draftRow({ objectId: 'new:pipe:1', dirtyFields: {}, errors: {} }),
    )).toEqual({
      'pipe-a': current['pipe-a'],
    });
    expect(applyExcelDraftRowPatch(
      {},
      'new:pipe:1',
      draftRow({ objectId: 'new:pipe:1', dirtyFields: {}, errors: { name: 'Введите название' } }),
    )).toEqual({
      'new:pipe:1': draftRow({
        objectId: 'new:pipe:1',
        dirtyFields: {},
        errors: { name: 'Введите название' },
      }),
    });
  });

  it('helpers удаления не трогают unrelated local rows и draft errors', () => {
    const [left, right] = buildExcelLocalRows({
      count: 2,
      objectType: 'pipe',
      projectId: 'project-1',
      projectObjectCount: 0,
      startSeq: 0,
    }).rows;
    const draftRowsById = {
      [left.id]: draftRow({ objectId: left.id, errors: { name: 'Ошибка' } }),
      [right.id]: draftRow({ objectId: right.id, errors: { name: 'Оставить' } }),
    };

    expect(pruneExcelLocalRowsByIds([left, right], [left.id]).map((row) => row.id)).toEqual([right.id]);
    expect(removeDraftRowsByIds(draftRowsById, [left.id])).toEqual({
      [right.id]: draftRowsById[right.id],
    });
  });

  it('не создает строки для отрицательного count', () => {
    const result = buildExcelLocalRows({
      count: -3,
      objectType: 'pipe',
      projectId: 'project-1',
      projectObjectCount: 0,
      startSeq: 7,
    });

    expect(result.rows).toEqual([]);
    expect(result.nextSeq).toBe(7);
  });

});

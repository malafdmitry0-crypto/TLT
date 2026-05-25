import { describe, expect, it } from 'vitest';

import type { ProjectObject } from '@/types/project';
import type { DraftRowState } from '@/utils/heatCalcInlineEdit';
import {
  applyExcelDraftRowPatch,
  buildExcelLocalRows,
  getActiveExcelLocalRows,
  isSavableExcelDraftRow,
  mergeExcelLocalRows,
  pruneExcelLocalRowsByIds,
  removeDraftRowsByIds,
  removeExcelRowsFromModel,
  resetExcelRowsInModel,
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

describe('heatCalcExcelRows', () => {
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

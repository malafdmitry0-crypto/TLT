/* eslint-disable @typescript-eslint/no-unused-vars -- scenario split keeps shared preamble */
import { useState } from 'react';
import { act, renderHook } from '@testing-library/react';
import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

import { useHeatCalcDraftSaveModel } from '@/pages/heatcalc/useHeatCalcDraftSaveModel';
import type { ProjectObject, ProjectObjectsQueryResponse } from '@/types/project';
import {
  applyInlineCellDraft,
  type DraftRowsById,
  type DraftRowState,
} from '@/utils/heatCalcInlineEdit';
import { isSavableExcelDraftRow, type ExcelLocalProjectObject } from '@/utils/heatCalcExcelRows';

function makeObject(overrides: Partial<ProjectObject> = {}): ProjectObject {
  return {
    id: 'pipe-1',
    project_id: 'project-1',
    object_type: 'pipe',
    sort_order: 0,
    params: {
      name: 'Труба DN100',
      placement: 'outdoor',
      outer_diameter: 0.1143,
      wall_thickness: 0.004,
      pipe_material: 'carbon_steel',
      pipe_length: 25,
      insulation_thickness: 0.05,
      insulation_material: 'mineral_wool',
      process_temperature: 60,
      ambient_temperature: -20,
      max_ambient_temperature: 35,
      max_process_temperature: 110,
      environment: 'normal',
      zone_classification: 'safe',
      temperature_group: 'T3',
      min_switch_temperature: -20,
      supply_voltage: 220,
      safety_factor: 1.2,
      steam_tracing: 'no',
      valve_count: 1,
      flange_count: 2,
      support_count: 3,
      local_element_equiv_length: 1.5,
    },
    results: { heat_loss_per_meter: 50, total_heat_loss: 5000 },
    is_valid: true,
    validation_errors: null,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    version: 1,
    ...overrides,
  };
}

function queryResponse(items: ProjectObject[]): ProjectObjectsQueryResponse {
  return {
    items,
    page_info: {
      page: 1,
      page_size: 25,
      offset: 0,
      total_pages: 1,
      has_next_page: false,
      has_previous_page: false,
      next_cursor: null,
    },
    counts: {
      total: items.length,
      by_type: { pipe: items.length, tank: 0 },
      filtered: items.length,
    },
    query: {
      object_type: 'pipe',
      sort: null,
    },
  };
}

function draftFromInline(record: ProjectObject, columnKey = 'name', value: unknown = 'Труба draft') {
  const draft = applyInlineCellDraft(null, record, columnKey, value);
  if (!draft) throw new Error('Expected draft row');
  return draft;
}

function makeDraftRows(rows: DraftRowState[]): DraftRowsById {
  return Object.fromEntries(rows.map((row) => [row.objectId, row]));
}

function setupHook({
  allProjectObjects = [],
  draftRowsById,
  excelLocalRows = [],
  selectedRowKeys = [],
  visibleTableObjects = [],
  projectObjectCount = visibleTableObjects.length,
  tableCellEditingEnabled = true,
}: {
  allProjectObjects?: ProjectObject[];
  draftRowsById: DraftRowsById;
  excelLocalRows?: ExcelLocalProjectObject[];
  selectedRowKeys?: string[];
  visibleTableObjects?: ProjectObject[];
  projectObjectCount?: number;
  tableCellEditingEnabled?: boolean;
}) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  const objectQueryKey = ['project', 'project-1', 'objects', 'query'];
  const allProjectObjectsQueryKey = ['project', 'project-1', 'objects'];
  const createObjectRequest = vi.fn(async (_projectId, payload) => makeObject({
    id: 'created-1',
    object_type: payload.object_type,
    params: payload.params,
    sort_order: payload.sort_order ?? 0,
  }));
  const updateObjectRequest = vi.fn(async (_projectId, objectId, payload) => makeObject({
    id: objectId,
    params: payload.params ?? {},
    version: payload.version + 1,
  }));
  const notifyError = vi.fn();
  const notifySuccess = vi.fn();
  const upsertNormalLoadedRow = vi.fn();

  function useHarness() {
    const [draftRows, setDraftRows] = useState<DraftRowsById>(draftRowsById);
    const [localRows, setLocalRows] = useState<ExcelLocalProjectObject[]>(excelLocalRows);
    const model = useHeatCalcDraftSaveModel({
      allProjectObjects,
      allProjectObjectsQueryKey,
      createObjectRequest,
      draftRowsById: draftRows,
      isSavableDraftRow: isSavableExcelDraftRow,
      notifyError,
      notifySuccess,
      objectQueryKey,
      project: { id: 'project-1' },
      projectObjectCount,
      queryClient,
      selectedRowKeys,
      setDraftRowsById: setDraftRows,
      setExcelLocalRows: setLocalRows,
      tableCellEditingEnabled,
      updateObjectRequest,
      upsertNormalLoadedRow,
      visibleTableObjects,
    });
    return {
      ...model,
      draftRowsById: draftRows,
      excelLocalRows: localRows,
    };
  }

  return {
    ...renderHook(() => useHarness()),
    allProjectObjectsQueryKey,
    createObjectRequest,
    notifyError,
    notifySuccess,
    objectQueryKey,
    queryClient,
    updateObjectRequest,
    upsertNormalLoadedRow,
  };
}

describe('useHeatCalcDraftSaveModel — selected dirty rows', () => {
  it('targets only selected dirty rows when selectedRowKeys contain dirty rows', async () => {
    const first = makeObject({ id: 'pipe-1', sort_order: 0 });
    const second = makeObject({ id: 'pipe-2', sort_order: 1 });
    const firstDraft = draftFromInline(first, 'name', 'Первая draft');
    const secondDraft = draftFromInline(second, 'name', 'Вторая draft');
    const {
      result,
      updateObjectRequest,
    } = setupHook({
      draftRowsById: makeDraftRows([firstDraft, secondDraft]),
      selectedRowKeys: [second.id],
      visibleTableObjects: [first, second],
    });

    expect(result.current.saveTargetIds).toEqual([second.id]);
    expect(result.current.saveTargetCount).toBe(1);
    expect(result.current.selectedDirtyTarget).toBe(true);

    await act(async () => {
      await result.current.saveDraftRows(result.current.saveTargetIds);
    });

    expect(updateObjectRequest).toHaveBeenCalledTimes(1);
    expect(updateObjectRequest).toHaveBeenCalledWith('project-1', second.id, expect.any(Object));
    expect(result.current.draftRowsById[first.id]).toBeDefined();
    expect(result.current.draftRowsById[second.id]).toBeUndefined();
  });

});

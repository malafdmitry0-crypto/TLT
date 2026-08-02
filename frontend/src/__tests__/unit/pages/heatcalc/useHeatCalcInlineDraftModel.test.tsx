import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useHeatCalcInlineDraftModel } from '@/pages/heatcalc/useHeatCalcInlineDraftModel';
import type { ProjectObject } from '@/types/project';
import type {
  HeatCalcColumnValueAccessors,
  HeatCalcTableViewState,
} from '@/utils/heatCalcTableFindability';
import type { HeatCalcObjectType } from '@/utils/heatCalcTableColumns';

const emptyTableViewState: HeatCalcTableViewState = { filters: {} };
const tableValueAccessors: HeatCalcColumnValueAccessors<ProjectObject> = {};

function makeObject(overrides: Partial<ProjectObject> = {}): ProjectObject {
  return {
    id: 'obj-1',
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
    results: { heat_loss_per_meter_base: 50, total_heat_loss_design: 5000 },
    is_valid: true,
    validation_errors: null,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    version: 1,
    ...overrides,
  };
}

function makeOptions(overrides: Partial<Parameters<typeof useHeatCalcInlineDraftModel>[0]> = {}) {
  const activeObjectType: HeatCalcObjectType = overrides.activeObjectType ?? 'pipe';
  return {
    projectId: 'project-1',
    activeObjectType,
    projectObjectCount: 3,
    excelModeEnabled: false,
    allProjectObjects: [],
    tableViewState: emptyTableViewState,
    tableValueAccessors,
    selectedExcelCell: null,
    excelSelectionRange: null,
    editableExcelColumnKeys: ['name', 'process_temperature'],
    onProjectReset: vi.fn(),
    ...overrides,
  };
}

describe('useHeatCalcInlineDraftModel', () => {
  it('resets draft, local rows, active inline cell, and selection callback on project change', () => {
    const onProjectReset = vi.fn();
    const { result, rerender } = renderHook(
      (props: ReturnType<typeof makeOptions>) => useHeatCalcInlineDraftModel(props),
      { initialProps: makeOptions({ onProjectReset }) },
    );

    act(() => {
      result.current.appendExcelLocalRows(1);
      result.current.commitInlineCell(makeObject(), 'name', 'Труба draft');
      result.current.setActiveInlineCell({ objectId: 'obj-1', columnKey: 'name' });
    });

    expect(result.current.excelLocalRows).toHaveLength(1);
    expect(Object.keys(result.current.draftRowsById)).toEqual(['obj-1']);
    expect(result.current.activeInlineCell).toEqual({ objectId: 'obj-1', columnKey: 'name' });

    rerender(makeOptions({ projectId: 'project-2', onProjectReset }));

    expect(result.current.excelLocalRows).toEqual([]);
    expect(result.current.draftRowsById).toEqual({});
    expect(result.current.activeInlineCell).toBeNull();
    expect(onProjectReset).toHaveBeenCalled();
  });

  it('appends local Excel rows with stable seq, project id, object type, and anchor', () => {
    const { result } = renderHook(() => useHeatCalcInlineDraftModel(makeOptions({
      projectId: 'project-x',
      activeObjectType: 'tank',
      projectObjectCount: 7,
    })));

    let firstRows: ProjectObject[] = [];
    act(() => {
      firstRows = result.current.appendExcelLocalRows(2, 'tank-7');
    });
    act(() => {
      result.current.appendExcelLocalRows(1);
    });

    expect(firstRows.map((row) => row.id)).toEqual(['new:tank:0', 'new:tank:1']);
    expect(result.current.excelLocalRows.map((row) => row.id)).toEqual([
      'new:tank:0',
      'new:tank:1',
      'new:tank:2',
    ]);
    expect(result.current.excelLocalRows[0]).toMatchObject({
      project_id: 'project-x',
      object_type: 'tank',
      sort_order: 7,
      __excelInsertAfterObjectId: 'tank-7',
    });
  });

  it('adds trailing Excel input rows once for the same pending tuple', async () => {
    const options = makeOptions({
      excelModeEnabled: true,
      allProjectObjects: [],
    });
    const { result, rerender } = renderHook(
      (props: ReturnType<typeof makeOptions>) => useHeatCalcInlineDraftModel(props),
      { initialProps: options },
    );

    await waitFor(() => {
      expect(result.current.excelLocalRows).toHaveLength(20);
    });

    rerender(options);

    expect(result.current.excelLocalRows).toHaveLength(20);
    expect(result.current.excelLocalRows[0].id).toBe('new:pipe:0');
    expect(result.current.excelLocalRows[19].id).toBe('new:pipe:19');
  });

  it('discards all drafts or only selected draft rows', () => {
    const first = makeObject({ id: 'obj-1' });
    const second = makeObject({ id: 'obj-2', params: { ...makeObject().params, name: 'Труба 2' } });
    const { result } = renderHook(() => useHeatCalcInlineDraftModel(makeOptions()));

    act(() => {
      result.current.commitInlineCell(first, 'name', 'Труба 1 draft');
      result.current.commitInlineCell(second, 'name', 'Труба 2 draft');
    });
    expect(Object.keys(result.current.draftRowsById).sort()).toEqual(['obj-1', 'obj-2']);

    act(() => {
      result.current.discardDraftRows(['obj-1']);
    });
    expect(Object.keys(result.current.draftRowsById)).toEqual(['obj-2']);

    act(() => {
      result.current.discardDraftRows();
    });
    expect(result.current.draftRowsById).toEqual({});
  });

  it('keeps active cell open when inline commit returns validation error', () => {
    const { result } = renderHook(() => useHeatCalcInlineDraftModel(makeOptions()));

    act(() => {
      result.current.setActiveInlineCell({ objectId: 'obj-1', columnKey: 'pipe_outer_diameter' });
    });

    let error: string | null = null;
    act(() => {
      error = result.current.commitInlineCell(makeObject(), 'pipe_outer_diameter', 5);
    });

    expect(error).toEqual(expect.any(String));
    expect(result.current.activeInlineCell).toEqual({
      objectId: 'obj-1',
      columnKey: 'pipe_outer_diameter',
    });
    expect(result.current.draftRowsById['obj-1'].errors.outer_diameter_mm).toBe(error);
  });

  it('closes active cell when inline commit succeeds', () => {
    const { result } = renderHook(() => useHeatCalcInlineDraftModel(makeOptions()));

    act(() => {
      result.current.setActiveInlineCell({ objectId: 'obj-1', columnKey: 'name' });
    });

    let error: string | null = 'unexpected';
    act(() => {
      error = result.current.commitInlineCell(makeObject(), 'name', 'Труба inline');
    });

    expect(error).toBeNull();
    expect(result.current.activeInlineCell).toBeNull();
    expect(result.current.draftRowsById['obj-1'].dirtyFields.name).toBe('Труба inline');
  });

  it('keeps the inline commit callback stable across draft changes', () => {
    const { result } = renderHook(() => useHeatCalcInlineDraftModel(makeOptions()));
    const firstCommit = result.current.commitInlineCell;

    act(() => {
      result.current.commitInlineCell(makeObject(), 'name', 'Труба inline');
    });

    expect(result.current.commitInlineCell).toBe(firstCommit);
    expect(result.current.draftRowsById['obj-1'].dirtyFields.name).toBe('Труба inline');
  });

  it('updates wizard drafts only for real form changes', () => {
    const record = makeObject();
    const { result } = renderHook(() => useHeatCalcInlineDraftModel(makeOptions()));

    act(() => {
      result.current.handleWizardDraftValuesChange(record, {}, record.params);
    });
    expect(result.current.draftRowsById).toEqual({});

    act(() => {
      result.current.handleWizardDraftValuesChange(record, { name: 'Труба wizard' }, {
        ...record.params,
        name: 'Труба wizard',
      });
    });

    const draft = result.current.draftRowsById[record.id];
    expect(draft.dirtyFields.name).toBe('Труба wizard');

    act(() => {
      result.current.handleWizardDraftValuesChange(record, { name: 'Труба wizard' }, {
        ...record.params,
        name: 'Труба wizard',
      });
    });
    expect(result.current.draftRowsById[record.id]).toBe(draft);
  });
});

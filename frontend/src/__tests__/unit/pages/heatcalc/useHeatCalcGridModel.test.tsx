import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { HeatCalcTableColumnRenderSpec } from '@/hooks/useHeatCalcTableColumns';
import { useHeatCalcGridModel } from '@/pages/heatcalc/useHeatCalcGridModel';
import type {
  ObjectQueryFieldCapability,
  ProjectObject,
} from '@/types/project';
import { applyInlineCellDraft } from '@/utils/heatCalcInlineEdit';
import { getDefaultFieldInputSettings } from '@/utils/heatCalcFieldInputSettings';
import type {
  HeatCalcColumnKey,
  HeatCalcResolvedColumnMeta,
} from '@/utils/heatCalcTableColumns';
import { INAPPLICABLE_TABLE_VALUE } from '@/utils/heatCalcPageUtils';

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

function meta(overrides: Partial<HeatCalcResolvedColumnMeta>): HeatCalcResolvedColumnMeta {
  const key = overrides.key ?? 'name';
  return {
    key,
    labels: { short: key, compact: key, full: key },
    label: key,
    title: key,
    group: 'main',
    width: 120,
    defaultWidthPct: 10,
    minWidthPx: 80,
    widthPct: 10,
    visible: true,
    filterable: true,
    sortable: true,
    resizable: true,
    ...overrides,
  };
}

function capability(overrides: Partial<ObjectQueryFieldCapability>): ObjectQueryFieldCapability {
  return {
    key: 'name',
    label: 'name',
    title: 'name',
    data_type: 'text',
    unit: null,
    filter: { enabled: true, ops: ['contains'], include_empty: true },
    sort: { enabled: true },
    options: null,
    ...overrides,
  };
}

const columnRenderers = {
  name: {
    align: 'left',
    copyValue: (record: ProjectObject) => String(record.params?.name ?? ''),
  },
  pipe_outer_diameter: {
    align: 'right',
    copyValue: (record: ProjectObject) => String(record.params?.outer_diameter ?? ''),
  },
  tank_diameter: {
    align: 'right',
    copyValue: (record: ProjectObject) => String(record.params?.diameter ?? ''),
  },
} as Record<HeatCalcColumnKey, HeatCalcTableColumnRenderSpec>;

function makeOptions(overrides: Partial<Parameters<typeof useHeatCalcGridModel>[0]> = {}) {
  const record = makeObject();
  const sourceColumnMetas = [
    meta({ key: 'name', title: 'Наименование', label: 'Наименование' }),
    meta({ key: 'pipe_outer_diameter', title: 'Ø', label: 'Ø', valueType: 'number' }),
  ];
  return {
    activeTableObjectType: 'pipe',
    sourceColumnMetas,
    fieldCapabilityByKey: new Map<string, ObjectQueryFieldCapability>(),
    enumOptionsByColumn: {},
    columnRenderers,
    draftRowsById: {},
    editableExcelColumnKeys: ['name', 'pipe_outer_diameter'],
    excelModeEnabled: false,
    fieldInputSettings: getDefaultFieldInputSettings(),
    isAllObjectScope: false,
    isSavableDraftRow: (row) => !!row && Object.keys(row.dirtyFields).length > 0,
    tableFindabilityEnabled: true,
    tableCellEditingEnabled: true,
    visibleTableRows: [{ record, sourceIndex: 0 }],
    visibleSourceIndexById: new Map([[record.id, 0]]),
    wizardBaseObject: null,
    wizardFormObject: null,
    ...overrides,
  } satisfies Parameters<typeof useHeatCalcGridModel>[0];
}

describe('useHeatCalcGridModel', () => {
  it('maps column capabilities and disables grid filtering/sorting in Excel mode', () => {
    const fieldCapabilityByKey = new Map([
      ['name', capability({
        key: 'name',
        filter: { enabled: false, ops: [], include_empty: true },
        sort: { enabled: false },
      })],
    ]);
    const { result, rerender } = renderHook(
      (props: ReturnType<typeof makeOptions>) => useHeatCalcGridModel(props),
      { initialProps: makeOptions({ fieldCapabilityByKey }) },
    );

    expect(result.current.glideGridColumns[0]).toMatchObject({
      key: 'name',
      filterable: false,
      sortable: false,
      filterKind: 'text',
    });

    rerender(makeOptions({
      excelModeEnabled: true,
      fieldCapabilityByKey: new Map([
        ['name', capability({ key: 'name' })],
      ]),
    }));

    expect(result.current.glideGridColumns[0]).toMatchObject({
      key: 'name',
      filterable: false,
      sortable: false,
    });
  });

  it('hides grid filtering and sorting when table findability is feature-flagged off', () => {
    const { result } = renderHook(() => useHeatCalcGridModel(makeOptions({
      fieldCapabilityByKey: new Map([
        ['name', capability({ key: 'name' })],
      ]),
      tableFindabilityEnabled: false,
    })));

    expect(result.current.glideGridColumns[0]).toMatchObject({
      filterable: false,
      sortable: false,
    });
  });

  it('builds editable dirty/error cell state from draft rows and ignores legacy step overrides', () => {
    const record = makeObject();
    const draft = applyInlineCellDraft(null, record, 'pipe_outer_diameter', 5)!;
    const { result } = renderHook(() => useHeatCalcGridModel(makeOptions({
      draftRowsById: { [record.id]: draft },
      fieldInputSettings: {
        version: getDefaultFieldInputSettings().version,
        fields: { pipe: { outer_diameter_mm: { step: 2 } } },
      },
      visibleTableRows: [{ record, sourceIndex: 0 }],
      visibleSourceIndexById: new Map([[record.id, 0]]),
    })));

    expect(result.current.getGlideGridCellState(record, 'pipe_outer_diameter', 0)).toMatchObject({
      editable: true,
      dirty: true,
      error: 'Минимальное значение — 10.8',
      align: 'right',
      editor: 'number',
      step: 1,
    });
  });

  it('marks inapplicable all-scope cells as readonly placeholders', () => {
    const tank = makeObject({
      id: 'tank-1',
      object_type: 'tank',
      params: { name: 'Резервуар' },
    });
    const { result } = renderHook(() => useHeatCalcGridModel(makeOptions({
      isAllObjectScope: true,
      sourceColumnMetas: [meta({ key: 'pipe_outer_diameter' })],
      visibleTableRows: [{ record: tank, sourceIndex: 0 }],
      visibleSourceIndexById: new Map([[tank.id, 0]]),
    })));

    expect(result.current.getNormalGlideGridCellState(tank, 'pipe_outer_diameter', 0)).toEqual({
      displayValue: INAPPLICABLE_TABLE_VALUE,
      editable: false,
      align: 'right',
    });
  });

  it('keeps the normal Glide cell-state callback stable across draft row changes', () => {
    const record = makeObject();
    const options = makeOptions({
      visibleTableRows: [{ record, sourceIndex: 0 }],
      visibleSourceIndexById: new Map([[record.id, 0]]),
    });
    const { result, rerender } = renderHook(
      (props: ReturnType<typeof makeOptions>) => useHeatCalcGridModel(props),
      { initialProps: options },
    );
    const getNormalCellState = result.current.getNormalGlideGridCellState;
    const draft = applyInlineCellDraft(null, record, 'name', 'Труба draft')!;

    rerender({
      ...options,
      draftRowsById: { [record.id]: draft },
    });

    expect(result.current.getNormalGlideGridCellState).toBe(getNormalCellState);
    expect(getNormalCellState(record, 'name', 0)).toMatchObject({
      displayValue: 'Труба draft',
      dirty: true,
    });
  });

  it('deduplicates selected row draft validation messages', () => {
    const record = makeObject();
    const draft = applyInlineCellDraft(null, record, 'pipe_outer_diameter', 5)!;
    const { result } = renderHook(() => useHeatCalcGridModel(makeOptions({
      draftRowsById: { [record.id]: draft },
      wizardBaseObject: record,
      wizardFormObject: record,
    })));

    expect(result.current.selectedRowErrorMessages).toHaveLength(1);
    expect(result.current.selectedRowErrorMessages[0]).toContain('Минимальное значение');
  });
});

import {
  act,
  renderHook,
} from '@testing-library/react';
import {
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import {
  resolveWizardBaseObject,
  useHeatCalcWizardFormShellModel,
} from '@/pages/heatcalc/useHeatCalcWizardFormShellModel';
import type { ProjectObject } from '@/types/project';
import {
  applyFormFieldDraft,
  type DraftRowsById,
} from '@/utils/heatCalcInlineEdit';

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
    results: { heat_loss_per_meter_base: 50, total_heat_loss_design: 5000 },
    is_valid: true,
    validation_errors: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    version: 1,
    ...overrides,
  };
}

function makeOptions(overrides: Partial<Parameters<typeof useHeatCalcWizardFormShellModel>[0]> = {}) {
  const record = makeObject();
  return {
    allProjectObjects: [],
    draftRowsById: {},
    visibleTableObjects: [record],
    wizardState: { type: 'pipe', editingObject: record },
    applyWizardDraftValuesChange: vi.fn(),
    ...overrides,
  } satisfies Parameters<typeof useHeatCalcWizardFormShellModel>[0];
}

describe('useHeatCalcWizardFormShellModel', () => {
  it('resolves the freshest table object while keeping optimistic editing objects', () => {
    const editingObject = makeObject({ id: 'pipe-1', version: 1, params: { name: 'old' } });
    const visibleObject = makeObject({ id: 'pipe-1', version: 2, params: { name: 'visible' } });
    const fallbackObject = makeObject({ id: 'pipe-2', version: 2, params: { name: 'fallback' } });

    expect(resolveWizardBaseObject({
      allProjectObjects: [],
      visibleTableObjects: [visibleObject],
      wizardState: { type: 'pipe', editingObject },
    })).toBe(visibleObject);

    expect(resolveWizardBaseObject({
      allProjectObjects: [fallbackObject],
      visibleTableObjects: [],
      wizardState: { type: 'pipe', editingObject: makeObject({ id: 'pipe-2', version: 1 }) },
    })).toBe(fallbackObject);

    const optimisticObject = makeObject({ id: 'pipe-1', version: 3, params: { name: 'optimistic' } });
    expect(resolveWizardBaseObject({
      allProjectObjects: [],
      visibleTableObjects: [visibleObject],
      wizardState: { type: 'pipe', editingObject: optimisticObject },
    })).toBe(optimisticObject);
  });

  it('builds the wizard display object from draft values and exposes draft errors', () => {
    const record = makeObject();
    const nameDraft = applyFormFieldDraft(null, record, 'name', 'Черновик трубы')!;
    const invalidDraft = applyFormFieldDraft(nameDraft, record, 'outer_diameter_mm', 5)!;
    const draftRowsById: DraftRowsById = { [record.id]: invalidDraft };

    const { result } = renderHook(() => useHeatCalcWizardFormShellModel(makeOptions({
      draftRowsById,
      visibleTableObjects: [record],
      wizardState: { type: 'pipe', editingObject: record },
    })));

    expect(result.current.wizardBaseObject).toBe(record);
    expect(result.current.wizardFormObject?.params.name).toBe('Черновик трубы');
    expect(result.current.wizardDraftFieldErrors?.outer_diameter_mm).toContain('Минимальное значение');
  });

  it('delegates wizard draft changes with the current base object', () => {
    const record = makeObject();
    const applyWizardDraftValuesChange = vi.fn();
    const { result } = renderHook(() => useHeatCalcWizardFormShellModel(makeOptions({
      applyWizardDraftValuesChange,
      visibleTableObjects: [record],
      wizardState: { type: 'pipe', editingObject: record },
    })));

    act(() => {
      result.current.handleWizardDraftValuesChange({ name: 'Новое имя' }, { name: 'Новое имя' });
    });

    expect(applyWizardDraftValuesChange).toHaveBeenCalledWith(
      record,
      { name: 'Новое имя' },
      { name: 'Новое имя' },
    );
  });

  it('keeps null wizard object state inert for new empty forms', () => {
    const applyWizardDraftValuesChange = vi.fn();
    const { result } = renderHook(() => useHeatCalcWizardFormShellModel(makeOptions({
      applyWizardDraftValuesChange,
      visibleTableObjects: [],
      wizardState: { type: 'pipe' },
    })));

    expect(result.current.wizardBaseObject).toBeNull();
    expect(result.current.wizardFormObject).toBeNull();
    expect(result.current.wizardDraftFieldErrors).toBeUndefined();

    act(() => {
      result.current.handleWizardDraftValuesChange({ name: 'Без объекта' }, { name: 'Без объекта' });
    });

    expect(applyWizardDraftValuesChange).toHaveBeenCalledWith(
      null,
      { name: 'Без объекта' },
      { name: 'Без объекта' },
    );
  });
});

/**
 * AF9-TEST-HARNESS-01 — Electrical integration fixtures (test-only).
 */
import type { Project, ProjectObject } from '@/types/project';
import type {
  CalculationTaskResponse,
  CalculationTaskStatus,
  ElectricalCalcSummary,
  ElectricalPageResponse,
  ElectricalQueryAssignment,
} from '@/types/calculation';

export const mockProject: Project = {
  id: 'p-1',
  name: 'Электро',
  description: null,
  task_number: null,
  user_id: null,
  session_id: 'sid',
  status: 'draft',
  owner_email: null,
  object_types: [],
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

export function makeObject(over: Partial<ProjectObject> = {}): ProjectObject {
  return {
    id: 'o-1',
    project_id: 'p-1',
    object_type: 'pipe',
    sort_order: 0,
    params: { name: 'Труба-1' },
    results: { heat_loss_per_meter: 50, total_heat_loss: 5000 },
    is_valid: true,
    validation_errors: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...over,
    version: over.version ?? 1,
  };
}

export function makeElectricalPage(
  objects: ProjectObject[],
  calculations: ElectricalCalcSummary[] = [],
  summaryOverrides: Partial<ElectricalPageResponse['summary']> = {},
  pageInfoOverrides: Partial<ElectricalPageResponse['page_info']> = {},
  assignmentOverrides?: ElectricalQueryAssignment[],
): ElectricalPageResponse & { assignments: ElectricalQueryAssignment[] } {
  const totalObjects = summaryOverrides.total_objects ?? objects.length;
  const calculated = calculations.filter(
    (calc) =>
      calc.results &&
      !calc.results.error_code &&
      !calc.results.category &&
      (calc.cable_mark || calc.results.selected_cable),
  );
  const pageSize = pageInfoOverrides.page_size ?? 50;

  return {
    items: objects,
    calculations,
    assignments: assignmentOverrides ?? objects.map((obj) => {
      const cableType = calculations.find((calc) => calc.object_id === obj.id)?.cable_type;
      const systemType = cableType === 'single_core' || cableType === 'three_core'
        ? 'resistive' as const
        : cableType === 'skin' || cableType === 'mineral'
          ? cableType
          : 'self_regulating' as const;
      return {
        object_id: obj.id,
        system_type: systemType,
        assignment_state:
          systemType === 'skin' || systemType === 'mineral' ? 'unsupported' : 'ready',
        version: 1,
      };
    }),
    summary: {
      total_objects: totalObjects,
      valid_objects:
        summaryOverrides.valid_objects ?? objects.filter((obj) => obj.is_valid).length,
      invalid_objects:
        summaryOverrides.invalid_objects ?? totalObjects - objects.filter((obj) => obj.is_valid).length,
      electrical_calculations_total:
        summaryOverrides.electrical_calculations_total ?? calculations.length,
      calculated_count: summaryOverrides.calculated_count ?? calculated.length,
      failed_count:
        summaryOverrides.failed_count ??
        calculations.filter(
          (calc) =>
            typeof calc.results?.error_code === 'string' &&
            calc.results?.category !== 'unsupported',
        ).length,
      manual_cable_mark_count:
        summaryOverrides.manual_cable_mark_count ??
        calculations.filter((calc) => calc.cable_mark_source === 'manual').length,
      total_cable_length:
        summaryOverrides.total_cable_length ??
        calculated.reduce(
          (sum, calc) =>
            sum + Number(calc.results?.order_cable_length ?? 0),
          0,
        ),
      total_power:
        summaryOverrides.total_power ??
        calculated.reduce((sum, calc) => sum + Number(calc.results?.total_power ?? 0), 0),
      total_current:
        summaryOverrides.total_current ??
        calculated.reduce((sum, calc) => sum + Number(calc.results?.current ?? 0), 0),
      ...summaryOverrides,
    },
    page_info: {
      page: 1,
      page_size: pageSize,
      offset: 0,
      total_pages: totalObjects > 0 ? Math.ceil(totalObjects / pageSize) : 0,
      has_next_page: totalObjects > pageSize,
      has_previous_page: false,
      ...pageInfoOverrides,
    },
  };
}

export function makeCalcTask(
  id: string,
  electricalVariantId: string,
  status: CalculationTaskStatus,
  overrides: Partial<CalculationTaskResponse> = {},
): CalculationTaskResponse {
  return {
    id,
    type: 'electrical_batch',
    status,
    project_id: 'p-1',
    electrical_variant_id: electricalVariantId,
    progress: { current: 0, total: 1, phase: status, percent: 0 },
    result: null,
    error_message: null,
    cancel_requested: false,
    created_at: '2026-01-01T00:00:00Z',
    started_at: null,
    finished_at: null,
    links: { status: '', result: '', cancel: '' },
    ...overrides,
  };
}

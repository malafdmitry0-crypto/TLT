/**
 * Electrical integration — hoisted API mocks + vi.mock registrations.
 * Side-effect import only from elecCalcPageTestEnv barrel. 0 tests.
 */
import { vi } from 'vitest';

const apiMocks = vi.hoisted(() => {
  const field = (
    key: string,
    dataType: 'text' | 'number' | 'enum' | 'boolean' = 'text',
    ops: Array<'contains' | 'range' | 'in' | 'equals'> = ['contains'],
    options: Array<{ value: unknown; label: string }> = [],
  ) => ({
    key,
    label: key,
    title: key,
    data_type: dataType,
    unit: null,
    filter: { enabled: ops.length > 0, ops, include_empty: true },
    sort: { enabled: key !== 'index', type: dataType === 'number' ? 'number' : 'text', nulls: 'last' },
    options: options.length
      ? { mode: 'inline', items: options, include_empty: true }
      : null,
  });
  return {
    enqueueBatch: vi.fn(),
    enqueueVariantBatch: vi.fn(),
    electricalPage: vi.fn(),
    electricalCapabilities: vi.fn().mockResolvedValue({
      version: 1,
      default_page_size: 50,
      max_page_size: 200,
      default_sort: { key: 'sort_order', dir: 'asc' },
      search: { enabled: true, max_text_length: 120, default_columns: ['object_name'] },
      fields: [
        field('index', 'text', []),
        field('object_name'),
        field('electrical_status', 'enum', ['in'], [
          { value: 'calculated', label: 'Рассчитан' },
          { value: 'error', label: 'Ошибка' },
          { value: 'unsupported', label: 'Не применимо' },
          { value: 'not_calculated', label: 'Не рассчитан' },
        ]),
        field('cable_mark'),
        field('winding_pitch_mm', 'number', ['range']),
        field('number_of_threads', 'number', ['range']),
        field('installed_cable_length', 'number', ['range']),
        field('order_cable_length', 'number', ['range']),
        field('required_installed_length_m', 'number', ['range']),
        field('section_l_max_m', 'number', ['range']),
        field('section_l_tok_m', 'number', ['range']),
        field('section_l_ogr_m', 'number', ['range']),
        field('section_l_excess_m', 'number', ['range']),
        {
          ...field('provenance', 'text', []),
          sort: { enabled: false, type: null, nulls: null, reason: 'display_only' },
        },
        field('total_power', 'number', ['range']),
        field('power_per_meter', 'number', ['range']),
        field('installed_power_per_meter', 'number', ['range']),
        field('current', 'number', ['range']),
        field('message'),
      ],
    }),
  };
});

const electricalVariantApiMocks = vi.hoisted(() => ({
  list: vi.fn().mockResolvedValue([
    {
      id: '11111111-1111-4111-8111-111111111111',
      project_id: 'p-1',
      name: 'ЭР1',
      sort_order: 0,
      is_active: true,
      copied_from_id: null,
      legacy_variant_number: 1,
      specification_state: 'not_generated',
      created_at: '2026-07-18T10:00:00Z',
      updated_at: '2026-07-18T10:00:00Z',
    },
    {
      id: '22222222-2222-4222-8222-222222222222',
      project_id: 'p-1',
      name: 'ЭР2',
      sort_order: 1,
      is_active: false,
      copied_from_id: null,
      legacy_variant_number: 2,
      specification_state: 'not_generated',
      created_at: '2026-07-18T10:00:00Z',
      updated_at: '2026-07-18T10:00:00Z',
    },
    {
      id: '33333333-3333-4333-8333-333333333333',
      project_id: 'p-1',
      name: 'ЭР3',
      sort_order: 2,
      is_active: false,
      copied_from_id: null,
      legacy_variant_number: 3,
      specification_state: 'not_generated',
      created_at: '2026-07-18T10:00:00Z',
      updated_at: '2026-07-18T10:00:00Z',
    },
    {
      id: '44444444-4444-4444-8444-444444444444',
      project_id: 'p-1',
      name: 'ЭР4',
      sort_order: 3,
      is_active: false,
      copied_from_id: null,
      legacy_variant_number: 4,
      specification_state: 'not_generated',
      created_at: '2026-07-18T10:00:00Z',
      updated_at: '2026-07-18T10:00:00Z',
    },
  ]),
  readiness: vi.fn(),
  initialize: vi.fn(),
  create: vi.fn(),
  copy: vi.fn(),
  rename: vi.fn(),
  activate: vi.fn(),
  remove: vi.fn(),
  listAssignments: vi.fn().mockImplementation(async (
    projectId: string,
    electricalVariantId: string,
  ) => ({
    project_id: projectId,
    electrical_variant_id: electricalVariantId,
    items: [],
    counts: {
      total: 0,
      filtered: 0,
      by_system: {
        unassigned: 0,
        self_regulating: 0,
        resistive: 0,
        skin: 0,
        mineral: 0,
      },
      by_state: { unassigned: 0, ready: 0, unsupported: 0, stale: 0, error: 0 },
    },
    page_info: {
      page: 1,
      page_size: 50,
      offset: 0,
      total_pages: 0,
      has_next_page: false,
      has_previous_page: false,
    },
  })),
  assignObjects: vi.fn(),
  unassignObjects: vi.fn(),
}));

const defaultElectricalVariantListImplementation =
  electricalVariantApiMocks.list.getMockImplementation();

vi.mock('@/api/electricalVariants', () => ({
  electricalVariantQueryKeys: {
    list: (projectId: string) => ['project', projectId, 'electrical-variants'] as const,
    readiness: (projectId: string) => ['project', projectId, 'electrical-readiness'] as const,
    detail: (projectId: string, variantId: string) =>
      ['project', projectId, 'electrical-variant', variantId] as const,
  },
  electricalAssignmentQueryKeys: {
    root: (projectId: string, variantId: string) => [
      'project',
      projectId,
      'electrical-variant',
      variantId,
      'assignments',
    ] as const,
    list: (
      projectId: string,
      variantId: string,
      params: { view?: string; assignment_state?: string; page?: number; page_size?: number },
    ) => [
      'project',
      projectId,
      'electrical-variant',
      variantId,
      'assignments',
      params.view ?? 'all',
      params.assignment_state ?? 'all-states',
      params.page ?? 1,
      params.page_size ?? 50,
    ] as const,
  },
  listElectricalVariants: electricalVariantApiMocks.list,
  getElectricalVariantReadiness: electricalVariantApiMocks.readiness,
  initializeElectricalVariants: electricalVariantApiMocks.initialize,
  createEmptyElectricalVariant: electricalVariantApiMocks.create,
  createIdempotencyKey: vi.fn(() => 'test-idempotency-key'),
  copyElectricalVariant: electricalVariantApiMocks.copy,
  renameElectricalVariant: electricalVariantApiMocks.rename,
  activateElectricalVariant: electricalVariantApiMocks.activate,
  deleteElectricalVariant: electricalVariantApiMocks.remove,
  listElectricalVariantAssignments: electricalVariantApiMocks.listAssignments,
  assignElectricalVariantObjects: electricalVariantApiMocks.assignObjects,
  unassignElectricalVariantObjects: electricalVariantApiMocks.unassignObjects,
}));

vi.mock('@/api/projects', () => ({
  deleteObject: vi.fn(),
}));

vi.mock('@/api/calculations', () => ({
  addElectricalCandidateToFolder: vi.fn(),
  applyElectricalCandidate: vi.fn(),
  batchCalcElectrical: vi.fn(),
  cancelCalcTask: vi.fn(),
  copyElectricalVariant: vi.fn(),
  createElectricalCandidate: vi.fn(),
  createElectricalCandidateFolder: vi.fn(),
  deleteElectricalCandidateFolder: vi.fn(),
  enqueueElectricalBatchJob: apiMocks.enqueueBatch,
  enqueueElectricalVariantBatchJob: (
    projectId: string,
    electricalVariantId: string,
    cableSource: string,
    cableType: string,
    options: Record<string, unknown>,
  ) => {
    apiMocks.enqueueVariantBatch(
      projectId,
      electricalVariantId,
      cableSource,
      cableType,
      options,
    );
    // Existing calculation-detail assertions remain focused on their numeric
    // adapter payload while the raw UUID call is asserted separately below.
    return apiMocks.enqueueBatch(projectId, cableSource, 1, cableType, options);
  },
  listElectricalCandidateFolders: vi.fn().mockResolvedValue([]),
  listElectricalCandidates: vi.fn().mockResolvedValue([]),
  getCalcTask: vi.fn().mockResolvedValue({
    id: 'task-1',
    type: 'electrical_batch',
    status: 'running',
    project_id: 'p-1',
    electrical_variant_id: '11111111-1111-4111-8111-111111111111',
    progress: { current: 0, total: 1, phase: 'running', percent: 0 },
    result: null,
    error_message: null,
    cancel_requested: false,
    created_at: '2026-01-01T00:00:00Z',
    started_at: null,
    finished_at: null,
    links: {
      status: '/api/v1/calc/jobs/task-1',
      result: '/api/v1/calc/jobs/task-1/result',
      cancel: '/api/v1/calc/jobs/task-1/cancel',
    },
  }),
  getElectricalPage: apiMocks.electricalPage,
  getElectricalQueryCapabilities: apiMocks.electricalCapabilities,
  queryElectrical: apiMocks.electricalPage,
  listCables: vi.fn().mockResolvedValue([]),
  selectCableForVariants: vi.fn(),
  selectCableManual: vi.fn(),
  removeElectricalCandidateFromFolder: vi.fn(),
  unapplyElectricalCandidate: vi.fn(),
  updateElectricalCandidateFolder: vi.fn(),
  updateElectricalCandidate: vi.fn(),
}));

vi.mock('@/api/references', () => ({
  getCablesTt: vi.fn().mockResolvedValue([
    {
      model: '30ТТВ2',
      series: 'ТТВ',
      nominal_power: 30,
      q1: -0.141,
      q2: 32,
      max_product_temp: 120,
      max_vapor_temp: 210,
      voltage: 220,
    },
  ]),
  getResistiveCables: vi.fn().mockResolvedValue({ single_core: [], three_core: [], common: {} }),
}));

vi.mock('@/api/preferences', () => ({
  getUserPreference: vi.fn().mockResolvedValue({ key: 'test', value: null, user_id: 'u-1' }),
  updateUserPreference: vi.fn(async (key: string, value: unknown) => ({
    key,
    value,
    user_id: 'u-1',
  })),
}));

export {
  apiMocks,
  electricalVariantApiMocks,
  defaultElectricalVariantListImplementation,
};

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import TestMemoryRouter from '@/__tests__/utils/TestMemoryRouter';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import SpecificationPage from '@/pages/SpecificationPage';
import { useAuthStore } from '@/store/authStore';
import { useCalculationVariantStore } from '@/store/calculationVariantStore';
import { useProjectStore } from '@/store/projectStore';
import type { Project } from '@/types/project';
import type { ElectricalVariant } from '@/types/electricalVariant';
import type { CalculationWorkflow } from '@/api/calculationWorkflows';

const listElectricalVariantsMock = vi.hoisted(() => vi.fn());
const getActiveCalculationWorkflowMock = vi.hoisted(() => vi.fn());
const getCalculationWorkflowMock = vi.hoisted(() => vi.fn());
const startCalculationWorkflowMock = vi.hoisted(() => vi.fn());
const resumeCalculationWorkflowMock = vi.hoisted(() => vi.fn());

vi.mock('@/api/calculationWorkflows', () => ({
  cancelCalculationWorkflow: vi.fn(),
  getActiveCalculationWorkflow: getActiveCalculationWorkflowMock,
  getCalculationWorkflow: getCalculationWorkflowMock,
  startCalculationWorkflow: startCalculationWorkflowMock,
  resumeCalculationWorkflow: resumeCalculationWorkflowMock,
}));

vi.mock('@/api/electricalVariants', () => ({
  electricalVariantQueryKeys: {
    list: (projectId: string) => ['project', projectId, 'electrical-variants'],
    readiness: (projectId: string) => ['project', projectId, 'electrical-readiness'],
    detail: (projectId: string, variantId: string) =>
      ['project', projectId, 'electrical-variant', variantId],
  },
  listElectricalVariants: listElectricalVariantsMock,
  getElectricalVariantReadiness: vi.fn(),
  initializeElectricalVariants: vi.fn(),
  createEmptyElectricalVariant: vi.fn(),
  copyElectricalVariant: vi.fn(),
  renameElectricalVariant: vi.fn(),
  activateElectricalVariant: vi.fn(),
  deleteElectricalVariant: vi.fn(),
}));

vi.mock('@/api/specifications', () => ({
  specificationReadinessQueryKey: (projectId: string, variantIds: string[]) => (
    ['spec-readiness', projectId, ...variantIds]
  ),
  getSpecificationReadiness: vi.fn().mockImplementation(
    async (projectId: string, variantIds: string[]) => ({
      project_id: projectId,
      results: variantIds.map((id) => ({
        electrical_variant_id: id,
        status: 'ready',
        total_objects: 1,
        contributing_objects: 1,
        blockers: [],
      })),
    }),
  ),
  getSpecification: vi.fn(),
  getSpecificationErrorDetail: vi.fn((error: { detail?: unknown }) => error?.detail ?? null),
  generateSpecification: vi.fn(),
  saveSpecificationItems: vi.fn(),
  listAccessoriesExtended: vi.fn().mockResolvedValue([]),
  getCatalogSelections: vi.fn().mockResolvedValue({
    project_id: 'p-1',
    electrical_variant_id: 'er',
    collection_version: 1,
    selections: [],
  }),
  putCatalogSelections: vi.fn().mockImplementation(
    async (
      projectId: string,
      electricalVariantId: string,
      request: { expected_version: number; selections: unknown[] },
    ) => ({
      project_id: projectId,
      electrical_variant_id: electricalVariantId,
      collection_version: Math.max(1, request.expected_version) + 1,
      selections: request.selections,
    }),
  ),
  candidateGroupNeedsUserChoice: (
    group: {
      candidates: unknown[];
      selected_catalog_item_id?: string | null;
      selection_source?: string | null;
    },
  ) => {
    if (group.candidates.length <= 1) return false;
    if (group.selection_source === 'auto_single') return false;
    if (group.selection_source === 'explicit' && group.selected_catalog_item_id) return false;
    return !group.selected_catalog_item_id;
  },
  getSpecificationSettings: vi.fn().mockResolvedValue({
    version: 1,
    settings: {
      grouping_mode: 'separate_by_object_type',
      Ex: false,
      K1i: false,
      K2i: false,
      Kiu: false,
      L_K2i_m: '0',
      R_gr: '1',
    },
  }),
  updateSpecificationSettings: vi.fn(),
}));

const mockProject: Project = {
  id: 'p-1',
  name: 'Спецификация-проект',
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

const firstVariant: ElectricalVariant = {
  id: '11111111-1111-4111-8111-111111111111',
  project_id: mockProject.id,
  name: 'ЭР1',
  sort_order: 0,
  is_active: true,
  copied_from_id: null,
  legacy_variant_number: 1,
  specification_state: 'not_generated',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

const secondVariant: ElectricalVariant = {
  ...firstVariant,
  id: '22222222-2222-4222-8222-222222222222',
  name: 'ЭР2',
  sort_order: 1,
  is_active: false,
  legacy_variant_number: 2,
};

const fifthVariant: ElectricalVariant = {
  ...firstVariant,
  id: '55555555-5555-4555-8555-555555555555',
  name: 'ЭР5',
  sort_order: 4,
  is_active: false,
  legacy_variant_number: null,
};

function makeWorkflow(
  status: CalculationWorkflow['status'],
  overrides: Partial<CalculationWorkflow> = {},
): CalculationWorkflow {
  return {
    id: 'workflow-1',
    project_id: mockProject.id,
    status,
    stage: status === 'waiting_input' ? 'waiting_input' : 'specification',
    workflow_version: 1,
    variant_ids: [firstVariant.id],
    progress: { current: 1, total: 3, percent: 33.3 },
    queue_deadline_at: null,
    execution_deadline_at: null,
    interaction_deadline_at: status === 'waiting_input' ? '2026-08-07T10:05:00Z' : null,
    waiting_results: [],
    result: null,
    error_message: null,
    cancel_requested: false,
    created_at: '2026-08-07T10:00:00Z',
    started_at: '2026-08-07T10:00:01Z',
    finished_at: null,
    status_url: '/api/v1/calculation-workflows/workflow-1',
    cancel_url: '/api/v1/calculation-workflows/workflow-1/cancel',
    resume_url: '/api/v1/calculation-workflows/workflow-1/resume',
    retry_url: '/api/v1/calculation-workflows/workflow-1/retry',
    ...overrides,
  };
}

function renderPage(initialEntry = '/workspace/specification') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <TestMemoryRouter initialEntries={[initialEntry]}>
        <SpecificationPage />
      </TestMemoryRouter>
    </QueryClientProvider>
  );
}

describe('SpecificationPage (integration) — er-scope-write', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listElectricalVariantsMock.mockResolvedValue([firstVariant, fifthVariant]);
    getActiveCalculationWorkflowMock.mockResolvedValue(null);
    getCalculationWorkflowMock.mockResolvedValue(makeWorkflow('running'));
    useProjectStore.getState().setCurrentProject(null);
    useAuthStore.setState({
      role: 'guest',
      user: null,
      sessionId: 'sid',
      accessToken: null,
      refreshToken: null,
    });
    useCalculationVariantStore.setState({
      selectedVariantIdByProject: {},
      variantByProject: {},
    });
  });
  it('loads UUID-only ER5 without Phase 5 block and does not fall back to ER1', async () => {
    const { getSpecification } = await import('@/api/specifications');
    (getSpecification as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    useCalculationVariantStore.getState().setSelectedVariantId(
      mockProject.id,
      fifthVariant.id,
    );
    useProjectStore.getState().setCurrentProject(mockProject);

    renderPage();

    await waitFor(() => {
      expect(getSpecification).toHaveBeenCalledWith(mockProject.id, fifthVariant.id);
    });
    expect(screen.queryByText(/временно недоступна/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Phase 5/i)).not.toBeInTheDocument();
    expect(await screen.findByText(/Спецификация не сформирована/i)).toBeInTheDocument();
  });
  it('honors a direct fifth-ER deep link and never calls the ER1 specification endpoint', async () => {
    const { getSpecification } = await import('@/api/specifications');
    (getSpecification as ReturnType<typeof vi.fn>).mockImplementation(
      async (_projectId: string, electricalVariantId?: string) => (
        electricalVariantId === firstVariant.id
          ? { id: 'spec-er1', items: [{ category: 'cable', name: 'ER1', unit: 'м', quantity: 1 }] }
          : null
      ),
    );
    useProjectStore.getState().setCurrentProject(mockProject);
    useCalculationVariantStore.getState().setSelectedVariantId(mockProject.id, firstVariant.id);

    renderPage(`/workspace/specification?er=${fifthVariant.id}`);

    await waitFor(() => {
      expect(getSpecification).toHaveBeenCalledWith(mockProject.id, fifthVariant.id);
    });
    expect(getSpecification).not.toHaveBeenCalledWith(mockProject.id, firstVariant.id);
    expect(screen.queryByText('ER1')).not.toBeInTheDocument();
  });
  it('после ручного удаления инвалидирует exact cache выбранного UUID ЭР', async () => {
    const userEvent = (await import('@testing-library/user-event')).default;
    const { getSpecification, saveSpecificationItems } = await import('@/api/specifications');
    const populated = {
      id: 's-1',
      project_id: mockProject.id,
      electrical_variant_id: firstVariant.id,
      snapshot: null,
      items: [
        {
          category: 'Кабель',
          name: 'Автоматическая позиция',
          article: 'AUTO',
          unit: 'м',
          quantity: '10',
          params: {},
          source: 'auto',
        },
        {
          category: 'Кабель',
          name: 'Ручная позиция',
          article: 'MANUAL',
          unit: 'шт.',
          quantity: 1,
          params: {},
          source: 'manual',
        },
      ],
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    };
    (getSpecification as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(populated)
      .mockResolvedValueOnce({ ...populated, items: [] });
    (saveSpecificationItems as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    useAuthStore.setState({
      role: 'employee',
      user: {
        id: 'u-1',
        email: 'employee@example.test',
        full_name: null,
        role: 'employee',
        is_active: true,
      },
      sessionId: null,
      accessToken: 'token',
      refreshToken: 'refresh',
    });
    useProjectStore.getState().setCurrentProject({
      ...mockProject,
      user_id: 'u-1',
      session_id: null,
    });
    renderPage();

    await userEvent.click(
      await screen.findByRole('button', { name: 'Удалить Ручная позиция' }),
    );

    await waitFor(() => {
      expect(saveSpecificationItems).toHaveBeenCalledWith(
        mockProject.id,
        firstVariant.id,
        [],
      );
      expect(getSpecification).toHaveBeenCalledTimes(2);
    });
  });
  it('фиксирует UUID ЭР на время генерации и блокирует смену scope', async () => {
    const user = (await import('@testing-library/user-event')).default.setup();
    const { getSpecification } = await import('@/api/specifications');
    let resolveGeneration!: (value: CalculationWorkflow) => void;
    const pendingGeneration = new Promise<CalculationWorkflow>((resolve) => {
      resolveGeneration = resolve;
    });
    listElectricalVariantsMock.mockResolvedValue([firstVariant, secondVariant]);
    (getSpecification as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    startCalculationWorkflowMock.mockReturnValue(pendingGeneration);
    useProjectStore.getState().setCurrentProject(mockProject);
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Сформировать' }));
    const dialog = await screen.findByRole('dialog', { name: 'Настройки формирования спецификации' });
    await user.click(within(dialog).getByRole('checkbox', { name: 'ЭР2' }));
    await user.click(within(dialog).getByRole('button', { name: 'Сформировать' }));
    expect(startCalculationWorkflowMock).toHaveBeenCalledWith(
      mockProject.id,
      {
        variant_ids: [firstVariant.id, secondVariant.id],
        options: {
          grouping_mode: 'separate_by_object_type',
          Ex: false,
          K1i: false,
          K2i: false,
          Kiu: false,
          L_K2i_m: '0',
          R_gr: '1',
        },
      },
    );
    // ER tabs are disabled while generation is in flight
    const er1Tab = screen.getByRole('tab', { name: /Спецификация ЭР1/i });
    const er2Tab = screen.getByRole('tab', { name: /Спецификация ЭР2/i });
    expect(er1Tab).toHaveAttribute('aria-disabled', 'true');
    expect(er2Tab).toHaveAttribute('aria-disabled', 'true');

    resolveGeneration(makeWorkflow('succeeded', {
      variant_ids: [firstVariant.id, secondVariant.id],
      progress: { current: 4, total: 4, percent: 100 },
      result: { project_id: mockProject.id, settings_version: 1, results: [] },
    }));
    await waitFor(() => {
      expect(er1Tab).not.toHaveAttribute('aria-disabled', 'true');
    });
  });
  it('unlocks generation after a typed backend failure so the user can retry', async () => {
    const user = (await import('@testing-library/user-event')).default.setup();
    const { getSpecification } = await import('@/api/specifications');
    (getSpecification as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    startCalculationWorkflowMock.mockRejectedValue(
      new Error('Активный утверждённый каталог недоступен'),
    );
    useProjectStore.getState().setCurrentProject(mockProject);
    renderPage();

    await screen.findByText(/Спецификация не сформирована/i);
    await user.click(await screen.findByRole('button', { name: 'Сформировать' }));
    const settings = await screen.findByRole('dialog', { name: 'Настройки формирования спецификации' });
    const generate = within(settings).getByRole('button', { name: 'Сформировать' });
    await user.click(generate);

    await waitFor(() => expect(generate).not.toBeDisabled());
    expect(startCalculationWorkflowMock).toHaveBeenCalledTimes(1);
  });
  it('keeps multi-ER catalog choices opaque and asks for unassigned confirmation separately', async () => {
    const user = (await import('@testing-library/user-event')).default.setup();
    const { getSpecification } = await import('@/api/specifications');
    listElectricalVariantsMock.mockResolvedValue([firstVariant, secondVariant]);
    (getSpecification as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const fp = `sha256:${'a'.repeat(64)}`;
    const waitingResults = [
          {
            electrical_variant_id: firstVariant.id,
            status: 'selection_required',
            total_objects: 1,
            contributing_objects: 1,
            unassigned_object_ids: [],
            excluded_unassigned_object_ids: [],
            diagnostics: [],
            candidate_groups: [{
              group_key: 'opaque:er-1:connection',
              electrical_variant_id: firstVariant.id,
              category: 'connection_kit',
              conditions: {},
              selection_source: 'none',
              candidate_set_fingerprint: fp,
              candidates: [
                {
                  catalog_item_id: 'item-er1-a', catalog_id: 'catalog-1', catalog_version: 'v1',
                  category: 'connection_kit', name: 'Комплект ЭР1 A', mark: 'A',
                  nomenclature_code: '001', supply_unit: 'шт.',
                },
                {
                  catalog_item_id: 'item-er1-b', catalog_id: 'catalog-1', catalog_version: 'v1',
                  category: 'connection_kit', name: 'Комплект ЭР1 B', mark: 'B',
                  nomenclature_code: '002', supply_unit: 'шт.',
                },
              ],
              selected_catalog_item_id: null,
            }],
            catalog_selections: {},
          },
          {
            electrical_variant_id: secondVariant.id,
            status: 'confirmation_required',
            total_objects: 1,
            contributing_objects: 0,
            unassigned_object_ids: ['object-er2'],
            excluded_unassigned_object_ids: ['object-er2'],
            diagnostics: [{
              code: 'SPEC_UNASSIGNED_CONFIRMATION_REQUIRED',
              kind: 'confirmable',
              message: 'ЭР2 содержит неназначенный объект',
              issues: [],
              details: {},
            }],
            candidate_groups: [{
              group_key: 'opaque:er-2:repair',
              electrical_variant_id: secondVariant.id,
              category: 'repair_kit',
              conditions: {},
              selection_source: 'none',
              candidate_set_fingerprint: fp,
              candidates: [
                {
                  catalog_item_id: 'item-er2-a', catalog_id: 'catalog-1', catalog_version: 'v1',
                  category: 'repair_kit', name: 'Ремкомплект ЭР2 A', mark: 'RA',
                  nomenclature_code: '003', supply_unit: 'шт.',
                },
                {
                  catalog_item_id: 'item-er2-b', catalog_id: 'catalog-1', catalog_version: 'v1',
                  category: 'repair_kit', name: 'Ремкомплект ЭР2 B', mark: 'RB',
                  nomenclature_code: '004', supply_unit: 'шт.',
                },
              ],
              selected_catalog_item_id: null,
            }],
            catalog_selections: {},
          },
        ];
    startCalculationWorkflowMock.mockResolvedValue(makeWorkflow('waiting_input', {
      variant_ids: [firstVariant.id, secondVariant.id],
      waiting_results: waitingResults as CalculationWorkflow['waiting_results'],
    }));
    getCalculationWorkflowMock.mockResolvedValue(makeWorkflow('waiting_input', {
      variant_ids: [firstVariant.id, secondVariant.id],
      waiting_results: waitingResults as CalculationWorkflow['waiting_results'],
    }));
    resumeCalculationWorkflowMock
      .mockResolvedValueOnce(makeWorkflow('waiting_input', {
        workflow_version: 2,
        variant_ids: [firstVariant.id, secondVariant.id],
        waiting_results: [waitingResults[1]] as CalculationWorkflow['waiting_results'],
      }))
      .mockResolvedValueOnce(makeWorkflow('succeeded', {
        workflow_version: 3,
        variant_ids: [firstVariant.id, secondVariant.id],
        progress: { current: 4, total: 4, percent: 100 },
        result: { project_id: mockProject.id, settings_version: 1, results: [] },
      }));
    useProjectStore.getState().setCurrentProject(mockProject);
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Сформировать' }));
    const settings = await screen.findByRole('dialog', { name: 'Настройки формирования спецификации' });
    await user.click(within(settings).getByRole('checkbox', { name: 'ЭР2' }));
    await user.click(within(settings).getByRole('button', { name: 'Сформировать' }));

    await waitFor(() => {
      for (const button of screen.getAllByRole('button', { name: 'Сформировать' })) {
        expect(button).toBeDisabled();
      }
      expect(screen.getByRole('button', { name: 'Настройки' })).toBeDisabled();
    });

    // A selection_required response must keep every required choice inside the
    // active workflow dialog. Rendering the panel behind the modal makes the
    // backend's fail-closed response impossible to resolve from the UI.
    expect(within(settings).getByTestId('spec-candidate-selection')).toBeInTheDocument();
    expect(within(settings).getByRole('button', { name: /Комплект ЭР1 B/i })).toBeInTheDocument();
    expect(within(settings).getByRole('button', { name: /Ремкомплект ЭР2 A/i })).toBeInTheDocument();

    await user.click(await screen.findByRole('button', { name: /Комплект ЭР1 B/i }));
    await user.click(screen.getByRole('button', { name: /Ремкомплект ЭР2 A/i }));
    await user.click(screen.getByRole('button', { name: /Применить выбор и сформировать/i }));

    await waitFor(() => {
      expect(resumeCalculationWorkflowMock).toHaveBeenNthCalledWith(
        1,
        'workflow-1',
        expect.objectContaining({
          expected_workflow_version: 1,
          catalog_selections: {
            'opaque:er-1:connection': 'item-er1-b',
            'opaque:er-2:repair': 'item-er2-a',
          },
        }),
      );
    });
    expect(startCalculationWorkflowMock).toHaveBeenCalledTimes(1);

    await screen.findByText('Подтверждение исключения неназначенных объектов');
    await user.click(screen.getByRole('button', { name: 'Подтвердить и сформировать' }));
    expect(resumeCalculationWorkflowMock).toHaveBeenNthCalledWith(
      2,
      'workflow-1',
      expect.objectContaining({
        expected_workflow_version: 2,
        exclude_unassigned_confirmed: true,
        catalog_selections: {},
      }),
    );
  });
  it('не показывает write-actions сотруднику, который только читает чужой проект', async () => {
    const { getSpecification } = await import('@/api/specifications');
    (getSpecification as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 's-1',
      project_id: mockProject.id,
      electrical_variant_id: firstVariant.id,
      snapshot: null,
      items: [{
        category: 'Кабель',
        name: 'Чужая позиция',
        article: 'FOREIGN',
        unit: 'шт.',
        quantity: 1,
        params: {},
        source: 'manual',
      }],
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    });
    useAuthStore.setState({
      role: 'employee',
      user: {
        id: 'u-read-only',
        email: 'reader@example.test',
        full_name: null,
        role: 'employee',
        is_active: true,
      },
      sessionId: null,
      accessToken: 'token',
      refreshToken: 'refresh',
    });
    useProjectStore.getState().setCurrentProject({
      ...mockProject,
      user_id: 'u-owner',
      session_id: null,
    });

    renderPage();

    expect((await screen.findByText('Режим просмотра')).tagName).toBe('SMALL');
    expect(screen.queryByText(
      'Изменять или пересчитывать спецификацию может только владелец проекта или администратор.',
    )).not.toBeInTheDocument();
    expect(await screen.findByText('Чужая позиция')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Обновить' }))
      .toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Удалить Чужая позиция' }))
      .not.toBeInTheDocument();
    // «Добавить из БД» живёт в modal настроек и недоступна read-only
    expect(screen.queryByRole('button', { name: 'Добавить из БД' }))
      .not.toBeInTheDocument();
  });

  it('hydrates selection_required after F5 and permits an ER tab round trip before choice', async () => {
    const user = (await import('@testing-library/user-event')).default.setup();
    const { getSpecification } = await import('@/api/specifications');
    const fp = `sha256:${'b'.repeat(64)}`;
    const selectionRequiredSpec = {
      id: 'spec-outcome-1',
      project_id: mockProject.id,
      electrical_variant_id: firstVariant.id,
      items: [],
      snapshot: null,
      is_stale: false,
      generation_status: 'selection_required',
      generation_at: '2026-08-04T10:00:00Z',
      generation_diagnostics: [{
        code: 'SPEC_ACCESSORY_SELECTION_REQUIRED',
        kind: 'selection_required',
        message: 'Нужен выбор комплекта',
        issues: [],
        details: {},
      }],
      generation_candidate_groups: [{
        group_key: 'opaque:er-1:connection',
        electrical_variant_id: firstVariant.id,
        category: 'connection_kit',
        conditions: {},
        selection_source: 'none',
        candidate_set_fingerprint: fp,
        selected_catalog_item_id: null,
        candidates: [
          {
            catalog_item_id: 'item-a',
            catalog_id: 'catalog-1',
            catalog_version: 'v1',
            category: 'connection_kit',
            name: 'Комплект F5 A',
            mark: 'A',
            nomenclature_code: '001',
            supply_unit: 'шт.',
          },
          {
            catalog_item_id: 'item-b',
            catalog_id: 'catalog-1',
            catalog_version: 'v1',
            category: 'connection_kit',
            name: 'Комплект F5 B',
            mark: 'B',
            nomenclature_code: '002',
            supply_unit: 'шт.',
          },
        ],
      }],
      created_at: '2026-08-04T10:00:00Z',
      updated_at: '2026-08-04T10:00:00Z',
    };
    listElectricalVariantsMock.mockResolvedValue([firstVariant, secondVariant]);
    (getSpecification as ReturnType<typeof vi.fn>).mockImplementation(
      async (_projectId: string, electricalVariantId?: string) => (
        electricalVariantId === firstVariant.id ? selectionRequiredSpec : null
      ),
    );
    const waitingWorkflow = makeWorkflow('waiting_input', {
      waiting_results: [{
        electrical_variant_id: firstVariant.id,
        status: 'selection_required',
        total_objects: 1,
        contributing_objects: 1,
        unassigned_object_ids: [],
        excluded_unassigned_object_ids: [],
        diagnostics: selectionRequiredSpec.generation_diagnostics as CalculationWorkflow['waiting_results'][number]['diagnostics'],
        candidate_groups: selectionRequiredSpec.generation_candidate_groups as CalculationWorkflow['waiting_results'][number]['candidate_groups'],
        catalog_selections: {},
      }],
    });
    getActiveCalculationWorkflowMock.mockResolvedValue(waitingWorkflow);
    getCalculationWorkflowMock.mockResolvedValue(waitingWorkflow);
    resumeCalculationWorkflowMock.mockResolvedValue(makeWorkflow('succeeded', {
      workflow_version: 2,
      result: { project_id: mockProject.id, settings_version: 1, results: [] },
    }));
    useProjectStore.getState().setCurrentProject(mockProject);
    useCalculationVariantStore.getState().setSelectedVariantId(
      mockProject.id,
      firstVariant.id,
    );

    renderPage();

    // Panel is restored from the durable workflow after F5 — no new start is issued.
    expect(await screen.findByRole('button', { name: /Комплект F5 B/i })).toBeInTheDocument();
    expect(startCalculationWorkflowMock).not.toHaveBeenCalled();

    const er1Tab = screen.getByRole('tab', { name: /Спецификация ЭР1/i });
    const er2Tab = screen.getByRole('tab', { name: /Спецификация ЭР2/i });
    expect(er2Tab).not.toHaveAttribute('aria-disabled', 'true');
    await user.click(er2Tab);
    await waitFor(() => {
      expect(getSpecification).toHaveBeenCalledWith(mockProject.id, secondVariant.id);
    });
    expect(screen.queryByRole('button', { name: /Комплект F5 B/i })).not.toBeInTheDocument();

    await user.click(er1Tab);
    expect(await screen.findByRole('button', { name: /Комплект F5 B/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Комплект F5 B/i }));
    await user.click(screen.getByRole('button', { name: /Применить выбор и сформировать/i }));

    await waitFor(() => {
      expect(resumeCalculationWorkflowMock).toHaveBeenCalledWith(
        'workflow-1',
        expect.objectContaining({
          expected_workflow_version: 1,
          catalog_selections: { 'opaque:er-1:connection': 'item-b' },
        }),
      );
    });
  });
});

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

const listElectricalVariantsMock = vi.hoisted(() => vi.fn());

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
  getSpecification: vi.fn(),
  generateSpecification: vi.fn(),
  saveSpecificationItems: vi.fn(),
  listAccessoriesExtended: vi.fn().mockResolvedValue([]),
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
      variant_number: 1,
      items: [
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
    const { generateSpecification, getSpecification } = await import('@/api/specifications');
    let resolveGeneration!: (value: {
      project_id: string;
      settings_version: number;
      results: [];
    }) => void;
    const pendingGeneration = new Promise<{
      project_id: string;
      settings_version: number;
      results: [];
    }>((resolve) => {
      resolveGeneration = resolve;
    });
    listElectricalVariantsMock.mockResolvedValue([firstVariant, secondVariant]);
    (getSpecification as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (generateSpecification as ReturnType<typeof vi.fn>).mockReturnValue(pendingGeneration);
    useProjectStore.getState().setCurrentProject(mockProject);
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Сформировать' }));
    const dialog = await screen.findByRole('dialog', { name: 'Настройки формирования спецификации' });
    await user.click(within(dialog).getByRole('checkbox', { name: 'ЭР2' }));
    await user.click(within(dialog).getByRole('button', { name: 'Сформировать' }));
    expect(generateSpecification).toHaveBeenCalledWith(
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
        exclude_unassigned_confirmed: false,
        catalog_selections: {},
      },
    );
    // ER tabs are disabled while generation is in flight
    const er1Tab = screen.getByRole('tab', { name: /Спецификация ЭР1/i });
    const er2Tab = screen.getByRole('tab', { name: /Спецификация ЭР2/i });
    expect(er1Tab).toHaveAttribute('aria-disabled', 'true');
    expect(er2Tab).toHaveAttribute('aria-disabled', 'true');

    resolveGeneration({
      project_id: mockProject.id,
      settings_version: 1,
      results: [],
    });
    await waitFor(() => {
      expect(er1Tab).not.toHaveAttribute('aria-disabled', 'true');
    });
  });
  it('не показывает write-actions сотруднику, который только читает чужой проект', async () => {
    const { getSpecification } = await import('@/api/specifications');
    (getSpecification as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 's-1',
      project_id: mockProject.id,
      variant_number: 1,
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

    expect(await screen.findByText('Режим просмотра')).toBeInTheDocument();
    expect(await screen.findByText('Чужая позиция')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Обновить' }))
      .toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Удалить Чужая позиция' }))
      .not.toBeInTheDocument();
    // «Добавить из БД» живёт в modal настроек и недоступна read-only
    expect(screen.queryByRole('button', { name: 'Добавить из БД' }))
      .not.toBeInTheDocument();
  });
});

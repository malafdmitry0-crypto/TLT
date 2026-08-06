import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
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
  getSpecificationSettings: vi.fn().mockResolvedValue({ version: 1, settings: {} }),
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

describe('SpecificationPage (integration) — empty-display', () => {
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
  it('показывает заглушку «Проект не выбран» без проекта', () => {
    renderPage();
    expect(screen.getByText(/Проект не выбран/i)).toBeInTheDocument();
  });
  it('показывает кнопку «Сформировать» при пустых items', async () => {
    const { getSpecification } = await import('@/api/specifications');
    (getSpecification as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 's-1',
      project_id: 'p-1',
      electrical_variant_id: firstVariant.id,
      snapshot: null,
      items: [],
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    });
    useProjectStore.getState().setCurrentProject(mockProject);
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/Спецификация не сформирована/i)).toBeInTheDocument();
    });
    // Кнопка «Сформировать» в тулбаре (и в empty-alert)
    const buttons = screen.getAllByRole('button');
    expect(
      buttons.some((b) => b.textContent?.trim() === 'Сформировать')
    ).toBe(true);
  });
  it('отображает строки спецификации, пришедшие с бэкенда', async () => {
    const { getSpecification } = await import('@/api/specifications');
    (getSpecification as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 's-1',
      project_id: 'p-1',
      electrical_variant_id: firstVariant.id,
      snapshot: null,
      items: [
        {
          category: 'Кабель',
          name: 'ТЛТ-30',
          article: 'TLT-30-220',
          unit: 'м',
          quantity: 12,
          params: {},
        },
        {
          category: 'Аксессуары',
          name: 'Концевой набор',
          article: 'KIT-1',
          unit: 'шт.',
          quantity: 2,
          params: {},
        },
      ],
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    });
    useProjectStore.getState().setCurrentProject(mockProject);
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('ТЛТ-30')).toBeInTheDocument();
      expect(screen.getByText('Концевой набор')).toBeInTheDocument();
    });
    // При наличии items — кнопка «Обновить» в тулбаре (макет)
    expect(screen.getByRole('button', { name: /Обновить/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Настройки/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Сформировать отчёт/i })).toBeInTheDocument();
  });
  it('показывает предупреждение для устаревшей спецификации', async () => {
    const { getSpecification } = await import('@/api/specifications');
    (getSpecification as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 's-1',
      project_id: 'p-1',
      electrical_variant_id: firstVariant.id,
      snapshot: null,
      is_stale: true,
      stale_reason: 'object_params_updated',
      stale_at: '2026-01-01T00:00:00Z',
      stale_details: { object_ids: ['o-1'] },
      items: [
        {
          category: 'Кабель',
          name: 'Старая позиция',
          article: 'OLD',
          unit: 'м',
          quantity: 12,
          params: {},
        },
      ],
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    });
    useProjectStore.getState().setCurrentProject(mockProject);
    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/Спецификация устарела/i)).toBeInTheDocument();
      expect(screen.getByText('Старая позиция')).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /Сформировать заново/i })).toBeInTheDocument();
  });
});

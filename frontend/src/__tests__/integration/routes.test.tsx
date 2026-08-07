/**
 * Smoke-тесты на route-дерево: проверяем что ключевые URL рендерят правильную страницу
 * и role-based protection работает.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import TestMemoryRouter from '@/__tests__/utils/TestMemoryRouter';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AppRoutes from '@/routes';
import { useAuthStore } from '@/store/authStore';
import { useProjectStore } from '@/store/projectStore';

const lazyRouteTimeout = { timeout: 15_000 };

// Мокаем все API чтобы страницы не падали на загрузке
vi.mock('@/api/projects', () => ({
  listProjects: vi.fn().mockResolvedValue([]),
  listObjects: vi.fn().mockResolvedValue([]),
  getObjectsSummary: vi.fn().mockResolvedValue({
    total: 0,
    valid: 0,
    invalid: 0,
    by_type: { pipe: 0, tank: 0 },
    valid_by_type: { pipe: 0, tank: 0 },
    electrical_calculations_total: 0,
    successful_electrical_calculations: 0,
    failed_electrical_calculations: 0,
    objects_with_successful_electrical_calculation: 0,
  }),
  queryObjects: vi.fn().mockResolvedValue({
    items: [],
    page_info: {
      page: 1,
      page_size: 50,
      offset: 0,
      total_pages: 0,
      has_next_page: false,
      has_previous_page: false,
    },
    counts: { total: 0, by_type: { pipe: 0, tank: 0 }, filtered: 0 },
    query: { object_type: 'pipe', sort: null },
  }),
  getObjectQueryCapabilities: vi.fn().mockResolvedValue({
    version: 1,
    object_type: 'pipe',
    default_page_size: 50,
    max_page_size: 200,
    default_sort: { key: 'sort_order', dir: 'asc' },
    search: { enabled: true, max_text_length: 120, default_columns: ['name'] },
    fields: [],
  }),
  createProject: vi.fn(),
  deleteProject: vi.fn(),
  duplicateProject: vi.fn(),
  exportProjectCsv: vi.fn(),
  importProjectCsv: vi.fn(),
  exportProjectsCsvBulk: vi.fn(),
  importProjectsCsvBulk: vi.fn(),
}));
vi.mock('@/api/calculations', () => ({
  listElectricalCalcs: vi.fn().mockResolvedValue([]),
  batchCalcElectrical: vi.fn(),
  enqueueElectricalBatchJob: vi.fn(),
  enqueueHeatLossBatchJob: vi.fn(),
  getCalcTask: vi.fn(),
  cancelCalcTask: vi.fn(),
  getElectricalPage: vi.fn().mockResolvedValue({
    items: [],
    calculations: [],
    summary: {
      total_objects: 0,
      valid_objects: 0,
      invalid_objects: 0,
      electrical_calculations_total: 0,
      calculated_count: 0,
      failed_count: 0,
      total_cable_length: 0,
      total_power: 0,
      total_current: 0,
    },
    page_info: {
      page: 1,
      page_size: 50,
      offset: 0,
      total_pages: 0,
      has_next_page: false,
      has_previous_page: false,
    },
  }),
  selectCableManual: vi.fn(),
  listCables: vi.fn().mockResolvedValue([]),
  listCableOptions: vi.fn().mockResolvedValue([]),
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
  getSpecification: vi.fn().mockResolvedValue(null),
  generateSpecification: vi.fn(),
  saveSpecificationItems: vi.fn(),
}));
vi.mock('@/api/admin', () => ({
  listUsers: vi.fn().mockResolvedValue([]),
  createUser: vi.fn(),
  deactivateUser: vi.fn(),
  listCoefficients: vi.fn().mockResolvedValue([]),
  updateCoefficient: vi.fn(),
}));
vi.mock('@/api/references', () => ({
  getClimate: vi.fn().mockResolvedValue([]),
  getInsulation: vi.fn().mockResolvedValue([]),
  getPipeMaterials: vi.fn().mockResolvedValue([]),
  getSoilConductivity: vi.fn().mockResolvedValue([]),
  listInsulationMaterials: vi.fn().mockResolvedValue([]),
  listClimateCities: vi.fn().mockResolvedValue([]),
  listAccessoriesExtended: vi.fn().mockResolvedValue([]),
  listCablesExtended: vi.fn().mockResolvedValue([]),
}));
vi.mock('@/api/reports', () => ({
  getReportPreview: vi.fn().mockResolvedValue({ html: '<p>preview</p>', sections: [] }),
  exportReport: vi.fn(),
}));

function renderAt(path: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <TestMemoryRouter initialEntries={[path]}>
        <AppRoutes />
      </TestMemoryRouter>
    </QueryClientProvider>
  );
}

describe('AppRoutes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.getState().logout();
    useProjectStore.getState().setCurrentProject(null);
  });

  it('/ показывает HomePage', async () => {
    renderAt('/');
    expect((await screen.findAllByText(/без регистрации/i, undefined, lazyRouteTimeout))[0]).toBeInTheDocument();
  });

  it('/login показывает форму авторизации', async () => {
    renderAt('/login');
    expect((await screen.findAllByText(/Войти/i))[0]).toBeInTheDocument();
  });

  it('/ui-kit показывает публичную витрину компактных компонентов', async () => {
    renderAt('/ui-kit');
    expect(await screen.findByRole('heading', { name: 'Инженерный UI Kit' }, lazyRouteTimeout)).toBeInTheDocument();
  });

  it('/help/guest показывает текущий guest contract и project-file workflow', async () => {
    renderAt('/help/guest');
    await screen.findByText(/Гостевой режим/i, undefined, lazyRouteTimeout);

    const helpText = document.body.textContent ?? '';
    expect(helpText).toContain('3 дня');
    expect(helpText).toContain('500 объектов');
    expect(helpText).toContain('до 4 вариантов электрорасчёта');
    expect(helpText).toContain('один временный проект');
    expect(helpText).toContain('Начать без регистрации');
    expect(helpText).toContain('.tlt.csv');
    expect(helpText).toContain('Это не то же самое, что импорт отдельных объектов');
    expect(helpText).not.toMatch(/30 дней/i);
    expect(helpText).not.toMatch(/(?:^|\D)50 объектов/i);
  });

  it('/help/employee рендерит EmployeeHelpPage', async () => {
    renderAt('/help/employee');
    await screen.findByRole('heading', { name: /Инструкция для сотрудника/i }, lazyRouteTimeout);
    expect(document.body.textContent?.length).toBeGreaterThan(100);
  });

  it('/help/admin рендерит AdminHelpPage', async () => {
    renderAt('/help/admin');
    await screen.findByRole('heading', { name: /Инструкция для администратора/i }, lazyRouteTimeout);
    expect(document.body.textContent?.length).toBeGreaterThan(100);
  });

  it('/admin без role редиректит на /', async () => {
    renderAt('/admin/users');
    // ProtectedRoute → Navigate("/") → HomePage
    expect((await screen.findAllByText(/без регистрации/i, undefined, lazyRouteTimeout))[0]).toBeInTheDocument();
  });

  it('/projects для guest редиректит на /', async () => {
    useAuthStore.getState().setGuest('sid-1');
    renderAt('/projects');
    expect((await screen.findAllByText(/без регистрации/i, undefined, lazyRouteTimeout))[0]).toBeInTheDocument();
  });

  it('/workspace для admin редиректит на / (admin не работает с проектами)', async () => {
    useAuthStore.getState().setEmployee(
      { id: 'a', email: 'a@x', full_name: null, role: 'admin', is_active: true },
      { access: 'a', refresh: 'r' }
    );
    renderAt('/workspace');
    expect((await screen.findAllByText(/без регистрации/i, undefined, lazyRouteTimeout))[0]).toBeInTheDocument();
  });
});

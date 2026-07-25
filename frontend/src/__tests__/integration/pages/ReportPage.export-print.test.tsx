/* eslint-disable @typescript-eslint/no-unused-vars -- scenario split keeps shared preamble fixtures */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import TestMemoryRouter from '@/__tests__/utils/TestMemoryRouter';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ReportPage from '@/pages/ReportPage';
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

vi.mock('@/api/reports', () => ({
  getReportPreview: vi.fn(),
  exportReport: vi.fn(),
  REPORT_SECTIONS: ['summary', 'pipes', 'tanks', 'electrical', 'specification'],
  REPORT_SECTION_LABELS: {
    summary: 'Сводка / итоги',
    pipes: 'Трубопроводы',
    tanks: 'Резервуары',
    electrical: 'Электротехнический расчёт',
    specification: 'Спецификация',
  },
}));

const mockProject: Project = {
  id: 'p-1',
  name: 'Отчётный проект',
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

const thirdVariant: ElectricalVariant = {
  ...firstVariant,
  id: '33333333-3333-4333-8333-333333333333',
  name: 'Резервный ЭР',
  sort_order: 2,
  is_active: false,
  legacy_variant_number: 3,
};

const fifthVariant: ElectricalVariant = {
  ...firstVariant,
  id: '55555555-5555-4555-8555-555555555555',
  name: 'ЭР5',
  sort_order: 4,
  is_active: false,
  legacy_variant_number: null,
};

function renderPage(initialEntry = '/workspace/report') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <TestMemoryRouter initialEntries={[initialEntry]}>
        <ReportPage />
      </TestMemoryRouter>
    </QueryClientProvider>
  );
}

describe('ReportPage — export & print', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listElectricalVariantsMock.mockResolvedValue([
      firstVariant,
      thirdVariant,
      fifthVariant,
    ]);
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:report-test');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    localStorage.clear();
    useProjectStore.getState().setCurrentProject(null);
    useCalculationVariantStore.setState({
      selectedVariantIdByProject: {},
      variantByProject: {},
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('сотрудник видит кнопки экспорта PDF / Word / Excel', async () => {
    useAuthStore.setState({
      role: 'employee',
      user: {
        id: 'u-1',
        email: 'e@tlt.ru',
        full_name: null,
        role: 'employee',
        is_active: true,
      },
      sessionId: null,
      accessToken: 'tok',
      refreshToken: 'tok',
    });
    const { getReportPreview } = await import('@/api/reports');
    (getReportPreview as ReturnType<typeof vi.fn>).mockResolvedValue({
      project_id: 'p-1',
      html: '<div class="tlt-report"><h1>Отчёт</h1></div>',
      sections: ['Проект'],
      variant_number: 1,
    });
    useProjectStore.getState().setCurrentProject(mockProject);
    renderPage();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /PDF/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Word/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Excel/i })).toBeInTheDocument();
    });
  });

  it('FA-09: guest and employee see browser print button', async () => {
    const user = (await import('@testing-library/user-event')).default.setup();
    useAuthStore.setState({
      role: 'guest',
      user: null,
      sessionId: 'sid',
      accessToken: null,
      refreshToken: null,
    });
    const { getReportPreview } = await import('@/api/reports');
    (getReportPreview as ReturnType<typeof vi.fn>).mockResolvedValue({
      project_id: 'p-1',
      html: '<div class="tlt-report"><h1>Отчёт</h1></div>',
      sections: ['Проект'],
      variant_number: 1,
    });
    useProjectStore.getState().setCurrentProject(mockProject);
    const printSpy = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    renderPage();
    const printBtn = await screen.findByRole('button', { name: /Печать/i });
    await waitFor(() => expect(printBtn).toBeEnabled());
    await user.click(printBtn);
    expect(printSpy).toHaveBeenCalled();
    printSpy.mockRestore();
  });

  it('сотрудник: клик по PDF триггерит exportReport', async () => {
    const user = (await import('@testing-library/user-event')).default.setup();
    const { getReportPreview, exportReport } = await import('@/api/reports');
    (getReportPreview as ReturnType<typeof vi.fn>).mockResolvedValue({
      project_id: 'p-1', html: '<div></div>', sections: [], variant_number: 1,
    });
    (exportReport as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Blob(['fake'], { type: 'application/pdf' })
    );
    useAuthStore.setState({
      role: 'employee',
      user: { id: 'u', email: 'e@x', full_name: null, role: 'employee', is_active: true },
      sessionId: null, accessToken: 'a', refreshToken: 'r',
    });
    useProjectStore.getState().setCurrentProject(mockProject);
    // Prefer selected ER before mount so export has a concrete UUID immediately.
    useCalculationVariantStore.getState().setSelectedVariantId(mockProject.id, firstVariant.id);
    renderPage();
    // Wait for ER list + enabled PDF (avoid stale node after re-render).
    await waitFor(() => {
      expect(listElectricalVariantsMock).toHaveBeenCalled();
      expect(screen.getByRole('button', { name: /PDF/i })).toBeEnabled();
    });
    await user.click(screen.getByRole('button', { name: /PDF/i }));
    await waitFor(() =>
      expect(exportReport).toHaveBeenCalledWith(
        'p-1',
        'pdf',
        firstVariant.id,
        expect.any(Array),
      )
    );
  });

});

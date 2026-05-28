import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import TestMemoryRouter from '@/__tests__/utils/TestMemoryRouter';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ReportPage from '@/pages/ReportPage';
import { useAuthStore } from '@/store/authStore';
import { useCalculationVariantStore } from '@/store/calculationVariantStore';
import { useProjectStore } from '@/store/projectStore';
import type { Project } from '@/types/project';

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

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <TestMemoryRouter>
        <ReportPage />
      </TestMemoryRouter>
    </QueryClientProvider>
  );
}

describe('ReportPage (integration)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:report-test');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    localStorage.clear();
    useProjectStore.getState().setCurrentProject(null);
    useCalculationVariantStore.setState({ variantByProject: {} });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('показывает заглушку без выбранного проекта', () => {
    useAuthStore.setState({
      role: 'guest',
      user: null,
      sessionId: 'sid',
      accessToken: null,
      refreshToken: null,
    });
    renderPage();
    expect(screen.getByText(/Проект не выбран/i)).toBeInTheDocument();
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

  it('сотрудник: клик по PDF триггерит exportReport', async () => {
    const userEvent = (await import('@testing-library/user-event')).default;
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
    renderPage();
    await waitFor(() => screen.getByRole('button', { name: /PDF/i }));
    await userEvent.click(screen.getByRole('button', { name: /PDF/i }));
    await waitFor(() =>
      expect(exportReport).toHaveBeenCalledWith('p-1', 'pdf', 1, expect.any(Array))
    );
  });

  it('сотрудник: открывает модалку «Состав отчёта»', async () => {
    const userEvent = (await import('@testing-library/user-event')).default;
    const { getReportPreview } = await import('@/api/reports');
    (getReportPreview as ReturnType<typeof vi.fn>).mockResolvedValue({
      project_id: 'p-1', html: '<div></div>', sections: [], variant_number: 1,
    });
    useAuthStore.setState({
      role: 'employee',
      user: { id: 'u', email: 'e@x', full_name: null, role: 'employee', is_active: true },
      sessionId: null, accessToken: 'a', refreshToken: 'r',
    });
    useProjectStore.getState().setCurrentProject(mockProject);
    renderPage();
    await waitFor(() => screen.getByRole('button', { name: /Состав отчёта/i }));
    await userEvent.click(screen.getByRole('button', { name: /Состав отчёта/i }));
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
  });

  it('гостю кнопки экспорта не показываются', async () => {
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
      html: '<div></div>',
      sections: [],
      variant_number: 1,
    });
    useProjectStore.getState().setCurrentProject(mockProject);
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/Шаг 4. Отчёт по проекту/i)).toBeInTheDocument();
    });
    expect(screen.queryByRole('button', { name: /PDF/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Word/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Excel/i })).not.toBeInTheDocument();
    expect(
      screen.getByText(/Экспорт доступен только для сотрудников/i)
    ).toBeInTheDocument();
  });

  it('использует активный CO-вариант для предпросмотра отчёта', async () => {
    const { getReportPreview } = await import('@/api/reports');
    (getReportPreview as ReturnType<typeof vi.fn>).mockResolvedValue({
      project_id: 'p-1',
      html: '<div></div>',
      sections: [],
      variant_number: 3,
    });
    useAuthStore.setState({
      role: 'guest',
      user: null,
      sessionId: 'sid',
      accessToken: null,
      refreshToken: null,
    });
    useProjectStore.getState().setCurrentProject(mockProject);
    useCalculationVariantStore.getState().setVariant('p-1', 3);

    renderPage();

    await waitFor(() => {
      expect(getReportPreview).toHaveBeenCalledWith('p-1', 3, expect.any(Array));
    });
    expect(screen.getByText('СО3')).toBeInTheDocument();
  });
});

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import TestMemoryRouter from '@/__tests__/utils/TestMemoryRouter';
import ReportWizardPage from '@/pages/ReportWizardPage';
import { useAuthStore } from '@/store/authStore';
import { useCalculationVariantStore } from '@/store/calculationVariantStore';
import { useProjectStore } from '@/store/projectStore';
import type { ElectricalVariant } from '@/types/electricalVariant';
import type { Project } from '@/types/project';

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

const project: Project = {
  id: 'p-1',
  name: 'Проект отчёта',
  description: null,
  task_number: null,
  user_id: 'u-1',
  session_id: null,
  status: 'draft',
  owner_email: 'employee@example.test',
  object_types: [],
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

const mappedVariant: ElectricalVariant = {
  id: '33333333-3333-4333-8333-333333333333',
  project_id: project.id,
  name: 'Зимний режим',
  sort_order: 0,
  is_active: true,
  copied_from_id: null,
  legacy_variant_number: 3,
  specification_state: 'not_generated',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

const fifthVariant: ElectricalVariant = {
  ...mappedVariant,
  id: '55555555-5555-4555-8555-555555555555',
  name: 'ЭР5',
  sort_order: 4,
  is_active: false,
  legacy_variant_number: null,
};

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <TestMemoryRouter initialEntries={['/workspace/report/wizard']}>
        <ReportWizardPage />
      </TestMemoryRouter>
    </QueryClientProvider>,
  );
}

describe('ReportWizardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listElectricalVariantsMock.mockResolvedValue([mappedVariant, fifthVariant]);
    useProjectStore.getState().setCurrentProject(project);
    useCalculationVariantStore.setState({
      selectedVariantIdByProject: {},
      variantByProject: {},
    });
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
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:report-wizard');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses a custom named ER authoritative legacy mapping for preview and export', async () => {
    const { getReportPreview, exportReport } = await import('@/api/reports');
    (getReportPreview as ReturnType<typeof vi.fn>).mockResolvedValue({
      project_id: project.id,
      html: '<div>Зимний режим</div>',
      sections: [],
      variant_number: 3,
    });
    (exportReport as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Blob(['report'], { type: 'application/pdf' }),
    );
    renderPage();

    await waitFor(() => {
      expect(getReportPreview).toHaveBeenCalledWith(
        project.id,
        3,
        mappedVariant.id,
        expect.any(Array),
      );
    });
    expect(screen.getAllByText('Зимний режим').length).toBeGreaterThan(0);

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Далее: формат/i }));
    await user.click(screen.getByRole('button', { name: /Далее: предпросмотр/i }));
    await user.click(screen.getByRole('button', { name: /Скачать PDF/i }));

    await waitFor(() => {
      expect(exportReport).toHaveBeenCalledWith(
        project.id,
        'pdf',
        mappedVariant.id,
        expect.any(Array),
      );
    });
  });

  it('блокирует навигацию мастера пока UUID-scoped export не завершён', async () => {
    const { getReportPreview, exportReport } = await import('@/api/reports');
    (getReportPreview as ReturnType<typeof vi.fn>).mockResolvedValue({
      project_id: project.id,
      html: '<div>Зимний режим</div>',
      sections: [],
      variant_number: 3,
    });
    let resolveExport!: (value: Blob) => void;
    (exportReport as ReturnType<typeof vi.fn>).mockReturnValue(new Promise<Blob>((resolve) => {
      resolveExport = resolve;
    }));
    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: /Далее: формат/i }));
    await user.click(screen.getByRole('button', { name: /Далее: предпросмотр/i }));
    await user.click(screen.getByRole('button', { name: /Скачать PDF/i }));

    expect(exportReport).toHaveBeenCalledWith(
      project.id,
      'pdf',
      mappedVariant.id,
      expect.any(Array),
    );
    expect(screen.getByRole('button', { name: /Изменить формат/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Изменить разделы/i })).toBeDisabled();

    resolveExport(new Blob(['report'], { type: 'application/pdf' }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Изменить формат/i })).toBeEnabled();
    });
  });

  it('does not call report APIs for ER5 and offers a mapped recovery action', async () => {
    const { getReportPreview, exportReport } = await import('@/api/reports');
    (getReportPreview as ReturnType<typeof vi.fn>).mockResolvedValue({
      project_id: project.id,
      html: '<div>Зимний режим</div>',
      sections: [],
      variant_number: 3,
    });
    useCalculationVariantStore.getState().setSelectedVariantId(project.id, fifthVariant.id);
    renderPage();

    expect(await screen.findByText(/«ЭР5»: экспорт временно недоступен/i))
      .toBeInTheDocument();
    expect(getReportPreview).not.toHaveBeenCalled();
    expect(exportReport).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Выбрать Зимний режим' }));
    await waitFor(() => {
      expect(getReportPreview).toHaveBeenCalledWith(
        project.id,
        3,
        mappedVariant.id,
        expect.any(Array),
      );
    });
  });
});

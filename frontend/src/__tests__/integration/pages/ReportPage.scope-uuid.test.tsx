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

describe('ReportPage — ER UUID scope', () => {
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

  it('фиксирует UUID и имя ЭР на время экспорта и блокирует смену scope', async () => {
    const user = (await import('@testing-library/user-event')).default.setup();
    const { getReportPreview, exportReport } = await import('@/api/reports');
    let resolveExport!: (value: Blob) => void;
    const pendingExport = new Promise<Blob>((resolve) => {
      resolveExport = resolve;
    });
    (getReportPreview as ReturnType<typeof vi.fn>).mockResolvedValue({
      project_id: mockProject.id,
      html: '<div></div>',
      sections: [],
      variant_number: 3,
    });
    (exportReport as ReturnType<typeof vi.fn>).mockReturnValue(pendingExport);
    let downloadedName = '';
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function captureName(
      this: HTMLAnchorElement,
    ) {
      downloadedName = this.download;
    });
    useAuthStore.setState({
      role: 'employee',
      user: { id: 'u', email: 'e@x', full_name: null, role: 'employee', is_active: true },
      sessionId: null,
      accessToken: 'a',
      refreshToken: 'r',
    });
    useCalculationVariantStore.getState().setSelectedVariantId(mockProject.id, thirdVariant.id);
    useProjectStore.getState().setCurrentProject(mockProject);
    renderPage();

    await waitFor(() => {
      expect(listElectricalVariantsMock).toHaveBeenCalled();
      expect(screen.getByRole('button', { name: /PDF/i })).toBeEnabled();
    });
    await user.click(screen.getByRole('button', { name: /PDF/i }));
    await waitFor(() => {
      expect(exportReport).toHaveBeenCalledWith(
        mockProject.id,
        'pdf',
        thirdVariant.id,
        expect.any(Array),
      );
    });
    // Multi-select ER control (Checkbox.Group) is disabled while export is in flight.
    const erCheckboxes = () => Array.from(
      document.querySelectorAll<HTMLInputElement>(
        '.report-page-er-checkbox-group input[type="checkbox"], .report-page-er-options input[type="checkbox"]',
      ),
    );
    await waitFor(() => {
      const boxes = erCheckboxes();
      expect(boxes.length).toBeGreaterThan(0);
      expect(boxes.every((box) => box.disabled)).toBe(true);
    });

    resolveExport(new Blob(['report'], { type: 'application/pdf' }));
    await waitFor(() => {
      const boxes = erCheckboxes();
      expect(boxes.length).toBeGreaterThan(0);
      expect(boxes.every((box) => box.disabled)).toBe(false);
    });
    expect(downloadedName).toBe(`${mockProject.name}-${thirdVariant.name}.pdf`);
  });

  it('использует выбранный именованный ЭР для предпросмотра отчёта', async () => {
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
    useCalculationVariantStore.getState().setSelectedVariantId(
      'p-1',
      thirdVariant.id,
    );

    renderPage();

    await waitFor(() => {
      expect(getReportPreview).toHaveBeenCalledWith(
        'p-1',
        3,
        thirdVariant.id,
        expect.any(Array),
      );
    });
    expect(screen.getByText('Резервный ЭР')).toBeInTheDocument();
  });

  it('uses the canonical deep-link UUID on direct report entry', async () => {
    const { getReportPreview } = await import('@/api/reports');
    (getReportPreview as ReturnType<typeof vi.fn>).mockResolvedValue({
      project_id: 'p-1', html: '<div></div>', sections: [], variant_number: 3,
    });
    useAuthStore.setState({
      role: 'guest', user: null, sessionId: 'sid', accessToken: null, refreshToken: null,
    });
    useProjectStore.getState().setCurrentProject(mockProject);
    useCalculationVariantStore.getState().setSelectedVariantId(mockProject.id, firstVariant.id);

    renderPage(`/workspace/report?er=${thirdVariant.id}`);

    await waitFor(() => {
      expect(getReportPreview).toHaveBeenCalledWith(
        'p-1',
        3,
        thirdVariant.id,
        expect.any(Array),
      );
    });
    expect(screen.getByText('Резервный ЭР')).toBeInTheDocument();
  });

  it('запрашивает отчёт ЭР5 по UUID без legacy-слота и не подставляет данные ЭР1', async () => {
    const { getReportPreview } = await import('@/api/reports');
    (getReportPreview as ReturnType<typeof vi.fn>).mockResolvedValue({
      project_id: mockProject.id,
      html: '<div>ЭР5 UUID preview</div>',
      sections: [],
      variant_number: null,
      electrical_variant_id: fifthVariant.id,
      electrical_variant_name: fifthVariant.name,
    });
    useAuthStore.setState({
      role: 'guest',
      user: null,
      sessionId: 'sid',
      accessToken: null,
      refreshToken: null,
    });
    useCalculationVariantStore.getState().setSelectedVariantId(
      mockProject.id,
      fifthVariant.id,
    );
    useProjectStore.getState().setCurrentProject(mockProject);

    renderPage();

    await waitFor(() => {
      expect(getReportPreview).toHaveBeenCalled();
      const call = (getReportPreview as ReturnType<typeof vi.fn>).mock.calls.at(-1);
      expect(call?.[0]).toBe(mockProject.id);
      // UUID-only ER: legacy slot is null; id may be string or single-element list.
      expect(call?.[1]).toBeNull();
      const erArg = call?.[2];
      const erIds = Array.isArray(erArg) ? erArg : [erArg];
      expect(erIds).toContain(fifthVariant.id);
      expect(erIds).not.toContain(firstVariant.id);
    });
  });

});

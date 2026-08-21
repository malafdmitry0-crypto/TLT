/**
 * Shared fixtures + render harness for ReportPage integration scenarios.
 * Side-effect: registers API mocks. No tests in this file.
 */
import { beforeEach, afterEach, vi } from 'vitest';
import { render } from '@testing-library/react';
import TestMemoryRouter from '@/__tests__/utils/TestMemoryRouter';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ReportPage from '@/pages/ReportPage';
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

export const mockProject: Project = {
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

export const firstVariant: ElectricalVariant = {
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

export const thirdVariant: ElectricalVariant = {
  ...firstVariant,
  id: '33333333-3333-4333-8333-333333333333',
  name: 'Резервный ЭР',
  sort_order: 2,
  is_active: false,
  legacy_variant_number: 3,
};

export const fifthVariant: ElectricalVariant = {
  ...firstVariant,
  id: '55555555-5555-4555-8555-555555555555',
  name: 'ЭР5',
  sort_order: 4,
  is_active: false,
  legacy_variant_number: null,
};

export function renderPage(initialEntry = '/workspace/report') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <TestMemoryRouter initialEntries={[initialEntry]}>
        <ReportPage />
      </TestMemoryRouter>
    </QueryClientProvider>
  );
}

/** Shared beforeEach/afterEach for all ReportPage scenario files. */
export function setupReportPageTest() {
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
}

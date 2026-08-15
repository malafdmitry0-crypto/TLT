import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import TestMemoryRouter from '@/__tests__/utils/TestMemoryRouter';
import SpecificationPage from '@/pages/SpecificationPage';
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
    detail: (projectId: string, variantId: string) => (
      ['project', projectId, 'electrical-variant', variantId]
    ),
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
    ['spec-readiness', projectId, variantIds]
  ),
  getSpecificationReadiness: vi.fn().mockImplementation(
    async (projectId: string, variantIds: string[]) => ({
      project_id: projectId,
      status: 'ready',
      blockers: [],
      results: variantIds.map((id) => ({
        electrical_variant_id: id,
        status: 'ready',
        total_objects: 2,
        contributing_objects: 1,
        blockers: [],
      })),
    }),
  ),
  getSpecification: vi.fn(),
  getSpecificationErrorDetail: vi.fn(() => null),
  generateSpecification: vi.fn(),
  saveSpecificationItems: vi.fn(),
  listAccessoriesExtended: vi.fn().mockResolvedValue([]),
  candidateGroupNeedsUserChoice: vi.fn(() => false),
}));

const project: Project = {
  id: 'project-stale-spec',
  name: 'Stale specification regression',
  description: null,
  task_number: null,
  user_id: null,
  session_id: 'guest-session',
  status: 'draft',
  owner_email: null,
  object_types: ['pipe'],
  created_at: '2026-08-15T00:00:00Z',
  updated_at: '2026-08-15T00:00:00Z',
};

const variant: ElectricalVariant = {
  id: '11111111-1111-4111-8111-111111111111',
  project_id: project.id,
  name: 'ЭР1',
  sort_order: 0,
  is_active: true,
  copied_from_id: null,
  legacy_variant_number: 1,
  specification_state: 'stale',
  created_at: '2026-08-15T00:00:00Z',
  updated_at: '2026-08-15T00:00:00Z',
};

const confirmableDiagnostic = {
  code: 'SPEC_UNASSIGNED_CONFIRMATION_REQUIRED',
  kind: 'confirmable',
  message: 'Есть объекты без назначения в выбранном ЭР',
  issues: [],
  details: { unassigned_object_ids: ['object-unassigned'] },
};

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <TestMemoryRouter initialEntries={[
        `/workspace/specification?er=${variant.id}`,
      ]}>
        <SpecificationPage />
      </TestMemoryRouter>
    </QueryClientProvider>,
  );
}

describe('SpecificationPage — stale specification regeneration', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
    listElectricalVariantsMock.mockResolvedValue([variant]);
    useAuthStore.setState({
      role: 'guest',
      user: null,
      sessionId: 'guest-session',
      accessToken: null,
      refreshToken: null,
    });
    useProjectStore.getState().setCurrentProject(project);
    useCalculationVariantStore.setState({
      selectedVariantIdByProject: { [project.id]: variant.id },
      variantByProject: { [project.id]: 1 },
    });

    const { generateSpecification, getSpecification } = await import('@/api/specifications');
    (getSpecification as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'spec-generated-before-assignment-change',
      project_id: project.id,
      electrical_variant_id: variant.id,
      items: [{
        category: 'cable',
        name: 'Старая позиция',
        article: 'OLD',
        unit: 'м',
        quantity: '10',
        params: {},
        source: 'auto',
      }],
      snapshot: null,
      is_stale: true,
      stale_reason: 'electrical_assignment_unassigned',
      generation_status: 'generated',
      generation_diagnostics: [],
      generation_candidate_groups: [],
      generation_at: '2026-08-15T10:00:00Z',
      created_at: '2026-08-15T10:00:00Z',
      updated_at: '2026-08-15T10:05:00Z',
    });
    (generateSpecification as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        project_id: project.id,
        settings_version: 1,
        results: [{
          electrical_variant_id: variant.id,
          electrical_variant_name: variant.name,
          status: 'confirmation_required',
          items: [],
          excluded_unassigned_object_ids: [],
          diagnostics: [confirmableDiagnostic],
          candidate_groups: [],
          catalog_selections: {},
          snapshot: null,
        }],
      })
      .mockResolvedValueOnce({
        project_id: project.id,
        settings_version: 1,
        results: [{
          electrical_variant_id: variant.id,
          electrical_variant_name: variant.name,
          status: 'generated',
          items: [],
          excluded_unassigned_object_ids: ['object-unassigned'],
          diagnostics: [],
          candidate_groups: [],
          catalog_selections: {},
          snapshot: null,
        }],
      });
  });

  it('keeps confirmation executable when the cached specification still says generated', async () => {
    const user = userEvent.setup();
    const { generateSpecification } = await import('@/api/specifications');
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Обновить' }));
    const settings = await screen.findByRole('dialog', {
      name: 'Настройки формирования спецификации',
    });
    await user.click(within(settings).getByRole('checkbox', { name: variant.name }));
    const minLength = within(settings).getByRole('spinbutton', { name: 'Параметр L К2i' });
    const reserve = within(settings).getByRole('spinbutton', { name: 'Параметр R гр' });
    await user.clear(minLength);
    await user.type(minLength, '0');
    await user.clear(reserve);
    await user.type(reserve, '1');
    await user.click(within(settings).getByRole('button', { name: 'Пересчитать' }));

    const confirmation = await screen.findByRole('dialog', {
      name: 'Подтверждение исключения неназначенных объектов',
    });
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    await user.click(within(confirmation).getByRole('button', {
      name: 'Подтвердить и сформировать',
    }));

    await waitFor(() => expect(generateSpecification).toHaveBeenCalledTimes(2));
    expect(generateSpecification).toHaveBeenNthCalledWith(
      2,
      project.id,
      expect.objectContaining({
        variant_ids: [variant.id],
        exclude_unassigned_confirmed: true,
        options: expect.objectContaining({ L_K2i_m: '0', R_gr: '1' }),
      }),
    );
  });
});

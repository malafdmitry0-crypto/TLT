import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Suspense } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import TestMemoryRouter from '@/__tests__/utils/TestMemoryRouter';
import MainLayout from '@/components/layout/MainLayout';
import ProjectsPage from '@/pages/ProjectsPage';
import { useAuthStore } from '@/store/authStore';
import { useCalculationVariantStore } from '@/store/calculationVariantStore';
import { useProjectStore } from '@/store/projectStore';
import type { ElectricalVariant } from '@/types/electricalVariant';
import type { Project } from '@/types/project';

const apiMocks = vi.hoisted(() => ({
  listProjects: vi.fn(),
  listElectricalVariants: vi.fn(),
  getObjectsSummary: vi.fn(),
}));

vi.mock('@/api/projects', () => ({
  listProjects: apiMocks.listProjects,
  getObjectsSummary: apiMocks.getObjectsSummary,
  deleteProject: vi.fn(),
  createProject: vi.fn(),
  duplicateProject: vi.fn(),
  exportProjectCsv: vi.fn(),
  exportProjectsCsvBulk: vi.fn(),
  importProjectCsv: vi.fn(),
  importProjectsCsvBulk: vi.fn(),
}));

vi.mock('@/api/electricalVariants', () => ({
  electricalVariantQueryKeys: {
    list: (projectId: string) => ['project', projectId, 'electrical-variants'],
    readiness: (projectId: string) => ['project', projectId, 'electrical-readiness'],
    detail: (projectId: string, variantId: string) =>
      ['project', projectId, 'electrical-variant', variantId],
  },
  listElectricalVariants: apiMocks.listElectricalVariants,
  getElectricalVariantReadiness: vi.fn(),
  initializeElectricalVariants: vi.fn(),
  createEmptyElectricalVariant: vi.fn(),
  copyElectricalVariant: vi.fn(),
  renameElectricalVariant: vi.fn(),
  activateElectricalVariant: vi.fn(),
  deleteElectricalVariant: vi.fn(),
  createIdempotencyKey: vi.fn(() => 'test-idempotency-key'),
}));

const PROJECT_A_ID = 'project-a';
const PROJECT_B_ID = 'project-b';
const ER_A_ID = '11111111-1111-4111-8111-111111111111';
const ER_B_ID = '22222222-2222-4222-8222-222222222222';

function project(id: string, name: string): Project {
  return {
    id,
    name,
    description: null,
    task_number: null,
    user_id: 'user-1',
    session_id: null,
    status: 'draft',
    owner_email: 'engineer@tlt.ru',
    object_types: [],
    created_at: '2026-08-15T00:00:00Z',
    updated_at: '2026-08-15T00:00:00Z',
  };
}

function electricalVariant(projectId: string, id: string): ElectricalVariant {
  return {
    id,
    project_id: projectId,
    name: `ЭР ${projectId}`,
    sort_order: 0,
    is_active: true,
    copied_from_id: null,
    legacy_variant_number: 1,
    specification_state: 'not_generated',
    created_at: '2026-08-15T00:00:00Z',
    updated_at: '2026-08-15T00:00:00Z',
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function suspenseGate() {
  let opened = false;
  let openPromise!: () => void;
  const promise = new Promise<void>((resolve) => {
    openPromise = resolve;
  });
  return {
    promise,
    isOpen: () => opened,
    open: () => {
      opened = true;
      openPromise();
    },
  };
}

function LocationProbe() {
  const location = useLocation();
  return (
    <output data-testid="location">
      {location.pathname}{location.search}
    </output>
  );
}

function renderApplication(
  initialEntry = '/projects',
  workspaceGate?: ReturnType<typeof suspenseGate>,
) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  function WorkspaceRoute() {
    if (workspaceGate && !workspaceGate.isOpen()) {
      throw workspaceGate.promise;
    }
    return <div>Рабочая область теплового расчёта</div>;
  }

  return render(
    <QueryClientProvider client={queryClient}>
      <TestMemoryRouter initialEntries={[initialEntry]}>
        <LocationProbe />
        <Suspense fallback={<div>Загрузка рабочей области</div>}>
          <Routes>
            <Route
              element={<MainLayout />}
            >
              <Route
                path="/workspace/heat-calc"
                element={<WorkspaceRoute />}
              />
            </Route>
            <Route
              path="/projects"
              element={(
                <MainLayout>
                  <ProjectsPage />
                </MainLayout>
              )}
            />
          </Routes>
        </Suspense>
      </TestMemoryRouter>
    </QueryClientProvider>,
  );
}

describe('ProjectsPage navigation race (integration)', () => {
  const projectA = project(PROJECT_A_ID, 'Проект А');
  const projectB = project(PROJECT_B_ID, 'Проект Б');
  const variantA = electricalVariant(PROJECT_A_ID, ER_A_ID);
  const variantB = electricalVariant(PROJECT_B_ID, ER_B_ID);

  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({
      role: 'employee',
      user: {
        id: 'user-1',
        email: 'engineer@tlt.ru',
        full_name: null,
        role: 'employee',
        is_active: true,
      },
      sessionId: null,
      accessToken: 'token',
      refreshToken: 'refresh-token',
    });
    useProjectStore.getState().setCurrentProject(projectA);
    useCalculationVariantStore.setState({
      selectedVariantIdByProject: {},
      variantByProject: {},
    });
    apiMocks.listProjects.mockResolvedValue([projectA, projectB]);
    apiMocks.getObjectsSummary.mockResolvedValue({
      total: 0,
      valid: 0,
      invalid: 0,
      objects_with_electrical_calculation: 0,
      objects_with_successful_electrical_calculation: 0,
    });
  });

  it('does not let background ER synchronization add er to /projects', async () => {
    const variants = deferred<ElectricalVariant[]>();
    apiMocks.listElectricalVariants.mockReturnValue(variants.promise);

    renderApplication();

    await screen.findByText('Проект Б');
    expect(screen.getByTestId('location')).toHaveTextContent('/projects');

    variants.resolve([variantA]);

    await waitFor(() => {
      expect(
        useCalculationVariantStore.getState().selectedVariantIdByProject[PROJECT_A_ID],
      ).toBe(ER_A_ID);
    });
    expect(screen.getByTestId('location')).toHaveTextContent('/projects');
    expect(screen.getByTestId('location')).not.toHaveTextContent('er=');
  });

  it('opens project B with one click even when its ER response settles during navigation', async () => {
    const variantsA = deferred<ElectricalVariant[]>();
    const variantsB = deferred<ElectricalVariant[]>();
    const workspaceGate = suspenseGate();
    apiMocks.listElectricalVariants.mockImplementation((projectId: string) => {
      if (projectId === PROJECT_A_ID) return variantsA.promise;
      if (projectId === PROJECT_B_ID) return variantsB.promise;
      return Promise.resolve([]);
    });

    renderApplication(`/projects?er=${ER_A_ID}`, workspaceGate);

    await screen.findByText('Проект Б');
    variantsA.resolve([variantA]);
    await waitFor(() => {
      expect(
        useCalculationVariantStore.getState().selectedVariantIdByProject[PROJECT_A_ID],
      ).toBe(ER_A_ID);
    });

    const projectBRow = screen.getByText('Проект Б').closest('tr');
    expect(projectBRow).not.toBeNull();
    await userEvent.click(within(projectBRow!).getByRole('button', { name: 'Открыть' }));

    await waitFor(() => {
      expect(apiMocks.listElectricalVariants).toHaveBeenCalledWith(PROJECT_B_ID);
    });
    variantsB.resolve([variantB]);
    await waitFor(() => {
      expect(
        useCalculationVariantStore.getState().selectedVariantIdByProject[PROJECT_B_ID],
      ).toBe(ER_B_ID);
    });
    workspaceGate.open();

    await waitFor(() => {
      expect(screen.getByTestId('location')).toHaveTextContent(
        `/workspace/heat-calc?er=${ER_B_ID}`,
      );
    });
    expect(useProjectStore.getState().currentProject?.id).toBe(PROJECT_B_ID);
  });
});

/**
 * HeatCalc page test utilities (barrel).
 * Prefer importing fixtures from HeatCalcPage.test-fixtures when only data is needed.
 */
import './HeatCalcPage.test-mocks';

import {
  HEATCALC_PAGE_TEST_TIMEOUT,
  mockProject,
  makeObject,
  makeTank,
  makeProject,
} from './HeatCalcPage.test-fixtures';

export {
  HEATCALC_PAGE_TEST_TIMEOUT,
  mockProject,
  makeObject,
  makeTank,
  makeProject,
};

const HEATCALC_PAGE_TEST_IGNORED_WARNINGS = [
  'Warning: A suspended resource finished loading inside a test',
];


import { afterEach, beforeEach, expect, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import TestMemoryRouter from '@/__tests__/utils/TestMemoryRouter';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import HeatCalcPage from '@/pages/HeatCalcPage';
import { loadHeatCalcObjectWizard } from '@/pages/heatcalc/heatCalcObjectWizardLoader';
import { getUserPreference, updateUserPreference } from '@/api/preferences';
import { cancelCalcTask, enqueueHeatLossBatchJob, getCalcTask } from '@/api/calculations';
import { useAuthStore } from '@/store/authStore';
import { useProjectStore } from '@/store/projectStore';
import { useWorkspaceHeaderStore } from '@/store/workspaceHeaderStore';
import type { Project, ProjectObject } from '@/types/project';

export function renderPage() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <TestMemoryRouter>
        <HeatCalcPage />
      </TestMemoryRouter>
    </QueryClientProvider>
  );
}

export async function openColumnFilter(user: { click: (element: Element) => Promise<unknown> }, label: string) {
  await user.click(screen.getAllByLabelText(`Фильтр ${label}`)[0]);
}

export async function openTableSettingsDialog(user: { click: (element: Element) => Promise<unknown> }) {
  void user;
  const settingsButton = await screen.findByRole(
    'button',
    { name: 'Настройки отображения' },
    { timeout: HEATCALC_PAGE_TEST_TIMEOUT },
  );
  await act(async () => {
    fireEvent.click(settingsButton);
  });
  return screen.findByRole(
    'dialog',
    { name: /Настройки таблицы/ },
    { timeout: HEATCALC_PAGE_TEST_TIMEOUT },
  );
}

export async function openTableSettingsOtherTab(
  user: { click: (element: Element) => Promise<unknown> },
  dialog: HTMLElement,
) {
  await user.click(within(dialog).getByRole('tab', { name: 'Остальное' }));
  expect(within(dialog).getByText('Формат названий')).toBeInTheDocument();
}

export function getNormalGlideGrid() {
  return screen.getByTestId('normal-glide-grid');
}

export function getNormalGlideRows() {
  return Array.from(getNormalGlideGrid().querySelectorAll<HTMLElement>('[data-testid="normal-glide-row"]'));
}

export function getNormalGlideHeaderTexts() {
  return Array.from(getNormalGlideGrid().querySelectorAll<HTMLElement>('th'))
    .map((header) => header.textContent?.replace(/\s+/g, ' ').trim() ?? '');
}

export function getNormalGlideRowCells(row: HTMLElement) {
  return Array.from(row.querySelectorAll<HTMLElement>('td'))
    .map((cell) => cell.textContent?.replace(/\s+/g, ' ').trim() ?? '');
}

export function getExcelGlideGrid() {
  return screen.getByTestId('excel-glide-grid');
}

export function getExcelGlideRows() {
  return Array.from(getExcelGlideGrid().querySelectorAll<HTMLElement>('[data-testid="excel-glide-row"]'));
}

/** Project-scoped objects map for multi-project HeatCalcPage characterization. */
export function installProjectScopedObjects(
  objectsByProjectId: Record<string, ProjectObject[]>,
) {
  return import('@/api/projects').then(({ listObjects }) => {
    (listObjects as ReturnType<typeof vi.fn>).mockImplementation(
      async (projectId: string) => objectsByProjectId[projectId] ?? [],
    );
  });
}

export async function switchCurrentProject(project: Project) {
  await act(async () => {
    useProjectStore.getState().setCurrentProject(project);
  });
}

export function setupHeatCalcPageTest() {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn> | undefined;

  afterEach(async () => {
    // HeatCalcPage idle-preloads the wizard chunk (useHeatCalcRouteShellEffects).
    // Scheduling is cancel-aware, but an import() already in flight is not: if the
    // test ends first, Vitest tears the environment down and the pending import
    // rejects with EnvironmentTeardownError — 1134/1134 green, exit 1.
    // Awaiting the cached module promise settles it deterministically.
    await loadHeatCalcObjectWizard();
    await act(async () => {
      await Promise.resolve();
    });
    consoleErrorSpy?.mockRestore();
    consoleErrorSpy = undefined;
  });

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    useAuthStore.getState().logout();
    useProjectStore.getState().setCurrentProject(null);
    useWorkspaceHeaderStore.getState().setContext(null);
    vi.unstubAllEnvs();
    vi.stubEnv('VITE_COMMERCIAL_FEATURES_ENABLED', 'false');
    vi.clearAllMocks();
    const taskCreatedAt = new Date().toISOString();
    const originalConsoleError = console.error;
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation((message?: unknown, ...args: unknown[]) => {
      const text = typeof message === 'string' ? message : '';
      if (HEATCALC_PAGE_TEST_IGNORED_WARNINGS.some((warning) => text.includes(warning))) {
        return;
      }
      originalConsoleError(message, ...args);
    });
    (getUserPreference as ReturnType<typeof vi.fn>).mockImplementation(async (key: string) => ({
      key,
      value: null,
      user_id: 'user-test-1',
    }));
    (updateUserPreference as ReturnType<typeof vi.fn>).mockReset();
    (enqueueHeatLossBatchJob as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'heat-task-1',
      type: 'heat_loss_batch',
      status: 'queued',
      project_id: 'proj-test-1',
      progress: { current: 0, total: null, phase: 'queued', percent: null },
      result: null,
      error_message: null,
      cancel_requested: false,
      created_at: taskCreatedAt,
      started_at: null,
      finished_at: null,
      links: {
        status: '/api/v1/calc/jobs/heat-task-1',
        result: '/api/v1/calc/jobs/heat-task-1/result',
        cancel: '/api/v1/calc/jobs/heat-task-1/cancel',
      },
    });
    (getCalcTask as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'heat-task-1',
      type: 'heat_loss_batch',
      status: 'running',
      project_id: 'proj-test-1',
      progress: { current: 1, total: 2, phase: 'calculate', percent: 50 },
      result: null,
      error_message: null,
      cancel_requested: false,
      created_at: taskCreatedAt,
      started_at: null,
      finished_at: null,
      links: {
        status: '/api/v1/calc/jobs/heat-task-1',
        result: '/api/v1/calc/jobs/heat-task-1/result',
        cancel: '/api/v1/calc/jobs/heat-task-1/cancel',
      },
    });
    (cancelCalcTask as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'heat-task-1',
      type: 'heat_loss_batch',
      status: 'cancelled',
      project_id: 'proj-test-1',
      progress: { current: 1, total: 2, phase: 'cancelled', percent: 50 },
      result: null,
      error_message: null,
      cancel_requested: true,
      created_at: taskCreatedAt,
      started_at: null,
      finished_at: taskCreatedAt,
      links: {
        status: '/api/v1/calc/jobs/heat-task-1',
        result: '/api/v1/calc/jobs/heat-task-1/result',
        cancel: '/api/v1/calc/jobs/heat-task-1/cancel',
      },
    });
  });
}

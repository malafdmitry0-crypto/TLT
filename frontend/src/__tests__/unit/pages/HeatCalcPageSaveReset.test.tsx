import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import HeatCalcPage from '@/pages/HeatCalcPage';
import { useAuthStore } from '@/store/authStore';
import { useProjectStore } from '@/store/projectStore';
import { useWorkspaceHeaderStore } from '@/store/workspaceHeaderStore';
import type { Project, ProjectObject, ProjectObjectsQueryRequest } from '@/types/project';

vi.mock('@/components/wizard/ObjectWizard', async () => {
  const React = await import('react');
  return {
    default: function FakeObjectWizard(props: {
      objectType: string;
      initialParams?: Record<string, unknown>;
      onSubmit: (params: Record<string, unknown>) => void;
    }) {
      const [draftName, setDraftName] = React.useState(
        String(props.initialParams?.name ?? ''),
      );
      return React.createElement(
        'div',
        { 'data-testid': 'fake-object-wizard', 'data-object-type': props.objectType },
        React.createElement('input', {
          'data-testid': 'fake-draft-name',
          value: draftName,
          onChange: (event: React.ChangeEvent<HTMLInputElement>) =>
            setDraftName(event.target.value),
        }),
        React.createElement(
          'button',
          {
            id: 'inline-object-save',
            type: 'button',
            onClick: () => props.onSubmit({ name: draftName }),
          },
          'mock-save',
        ),
      );
    },
  };
});

vi.mock('@/api/projects', () => {
  const listObjects = vi.fn().mockResolvedValue([]);
  async function getObjectsSummary() {
    const all = await listObjects();
    const byType = {
      pipe: all.filter((item: ProjectObject) => item.object_type === 'pipe').length,
      tank: all.filter((item: ProjectObject) => item.object_type === 'tank').length,
    };
    const validByType = {
      pipe: all.filter((item: ProjectObject) => item.object_type === 'pipe' && item.is_valid).length,
      tank: all.filter((item: ProjectObject) => item.object_type === 'tank' && item.is_valid).length,
    };
    const valid = all.filter((item: ProjectObject) => item.is_valid).length;
    return {
      total: all.length,
      valid,
      invalid: all.length - valid,
      by_type: byType,
      valid_by_type: validByType,
      electrical_calculations_total: 0,
      successful_electrical_calculations: 0,
      failed_electrical_calculations: 0,
      objects_with_successful_electrical_calculation: 0,
    };
  }
  return {
    listObjects,
    getObjectsSummary: vi.fn(getObjectsSummary),
    queryObjects: vi.fn(async (_projectId: string, payload: ProjectObjectsQueryRequest) => {
      const all = await listObjects();
      const items = all.filter((item: ProjectObject) => item.object_type === payload.object_type);
      return {
        items,
        page_info: {
          page: payload.page ?? 1,
          page_size: payload.page_size ?? 50,
          offset: 0,
          total_pages: items.length ? 1 : 0,
          has_next_page: false,
          has_previous_page: false,
        },
        counts: {
          total: all.length,
          by_type: {
            pipe: all.filter((item: ProjectObject) => item.object_type === 'pipe').length,
            tank: all.filter((item: ProjectObject) => item.object_type === 'tank').length,
          },
          filtered: items.length,
        },
        query: { object_type: payload.object_type, sort: payload.sort ?? null },
      };
    }),
    getObjectQueryCapabilities: vi.fn(async (_projectId: string, objectType: 'pipe' | 'tank') => ({
      version: 1,
      object_type: objectType,
      default_page_size: 50,
      max_page_size: 200,
      default_sort: { key: 'sort_order', dir: 'asc' },
      search: { enabled: true, max_text_length: 120, default_columns: ['name'] },
      fields: [],
    })),
    createObject: vi.fn(),
    updateObject: vi.fn(),
    deleteObject: vi.fn(),
    reorderObjects: vi.fn(),
  };
});

vi.mock('@/api/calculations', () => ({
  cancelCalcTask: vi.fn(),
  enqueueElectricalBatchJob: vi.fn().mockResolvedValue({ id: 'task-1', status: 'queued' }),
  enqueueHeatLossBatchJob: vi.fn(),
  getCalcTask: vi.fn(),
}));

vi.mock('@/api/references', () => ({
  getClimate: vi.fn().mockResolvedValue([]),
  getInsulation: vi.fn().mockResolvedValue([]),
  getPipeMaterials: vi.fn().mockResolvedValue([]),
  getSoilConductivity: vi.fn().mockResolvedValue([]),
}));

vi.mock('@/api/preferences', () => ({
  getUserPreference: vi.fn().mockResolvedValue({
    key: 'heatcalc.tableColumns.v1',
    value: null,
    user_id: 'user-test-1',
  }),
  updateUserPreference: vi.fn(),
}));

const mockProject: Project = {
  id: 'proj-test-1',
  name: 'Тестовый проект',
  description: '',
  user_id: null,
  session_id: 'sess-test',
  status: 'draft',
  task_number: null,
  object_types: [],
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
  owner_email: null,
};

function makeObject(overrides: Partial<ProjectObject> = {}): ProjectObject {
  return {
    id: 'obj-1',
    project_id: 'proj-test-1',
    object_type: 'pipe',
    sort_order: 0,
    params: { name: 'Новая труба' },
    results: null,
    is_valid: true,
    validation_errors: null,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

function renderPage() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <HeatCalcPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('HeatCalcPage save reset', () => {
  beforeEach(() => {
    localStorage.clear();
    useAuthStore.getState().logout();
    useProjectStore.getState().setCurrentProject(null);
    useWorkspaceHeaderStore.getState().setContext(null);
    vi.clearAllMocks();
  });

  it('после сохранения новой записи сбрасывает форму к чистому черновику', async () => {
    const { listObjects, createObject } = await import('@/api/projects');
    (listObjects as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (createObject as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeObject({ params: { name: 'ee' } }),
    );

    useProjectStore.getState().setCurrentProject(mockProject);
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: 'Добавить' }));
    const draftNameInput = await screen.findByTestId('fake-draft-name');
    await user.type(draftNameInput, 'ee');
    expect(draftNameInput).toHaveValue('ee');

    await user.click(screen.getByRole('button', { name: 'Сохранить' }));

    await waitFor(() => {
      expect(createObject).toHaveBeenCalledWith(
        'proj-test-1',
        expect.objectContaining({
          object_type: 'pipe',
          params: { name: 'ee' },
        }),
      );
    });
    await waitFor(() => {
      expect(screen.getByTestId('fake-draft-name')).toHaveValue('');
    });
    await waitFor(() => {
      expect(screen.getByText('Режим: добавление')).toBeInTheDocument();
    });
    expect(useWorkspaceHeaderStore.getState().context).toBeNull();
  }, 10_000);
});

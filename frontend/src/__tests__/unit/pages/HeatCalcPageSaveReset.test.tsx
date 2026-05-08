import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import HeatCalcPage from '@/pages/HeatCalcPage';
import { useProjectStore } from '@/store/projectStore';
import { useWorkspaceHeaderStore } from '@/store/workspaceHeaderStore';
import type { Project, ProjectObject } from '@/types/project';

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

vi.mock('@/api/projects', () => ({
  listObjects: vi.fn().mockResolvedValue([]),
  createObject: vi.fn(),
  updateObject: vi.fn(),
  deleteObject: vi.fn(),
  reorderObjects: vi.fn(),
}));

vi.mock('@/api/calculations', () => ({
  batchCalcElectrical: vi.fn().mockResolvedValue({ calculated: 0, skipped: 0, heat_loss_failed: 0, errors: [], results: [] }),
}));

vi.mock('@/api/references', () => ({
  getClimate: vi.fn().mockResolvedValue([]),
  getInsulation: vi.fn().mockResolvedValue([]),
  getPipeMaterials: vi.fn().mockResolvedValue([]),
  getSoilConductivity: vi.fn().mockResolvedValue([]),
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

    await user.click(screen.getByRole('button', { name: 'Сохранить изменения' }));

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
      expect(useWorkspaceHeaderStore.getState().context).toMatchObject({
        title: 'Параметры: Трубы',
        modeLabel: 'новая запись',
      });
    });
  });
});

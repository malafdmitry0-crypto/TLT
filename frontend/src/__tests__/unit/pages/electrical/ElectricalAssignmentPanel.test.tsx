import type { ReactNode } from 'react';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import ElectricalAssignmentPanel from '@/pages/electrical/ElectricalAssignmentPanel';
import type {
  ElectricalAssignmentListParams,
  ElectricalAssignmentListResponse,
  ElectricalVariant,
} from '@/types/electricalVariant';

const apiMocks = vi.hoisted(() => ({
  list: vi.fn(),
  assign: vi.fn(),
  unassign: vi.fn(),
}));

vi.mock('@/api/electricalVariants', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/electricalVariants')>();
  return {
    ...actual,
    listElectricalVariantAssignments: apiMocks.list,
    assignElectricalVariantObjects: apiMocks.assign,
    unassignElectricalVariantObjects: apiMocks.unassign,
  };
});

const ER_ID = '55555555-5555-4555-8555-555555555555';
const variant: ElectricalVariant = {
  id: ER_ID,
  project_id: 'project-1',
  name: 'Пятый ЭР',
  sort_order: 4,
  is_active: false,
  copied_from_id: null,
  legacy_variant_number: null,
  specification_state: 'not_generated',
  created_at: '2026-07-18T00:00:00Z',
  updated_at: '2026-07-18T00:00:00Z',
};

function assignmentResponse(
  view: ElectricalAssignmentListParams['view'] = 'unassigned',
  version = 3,
): ElectricalAssignmentListResponse {
  const systemType = view === 'self_regulating'
    || view === 'resistive'
    || view === 'skin'
    || view === 'mineral'
    ? view
    : null;
  return {
    project_id: 'project-1',
    electrical_variant_id: ER_ID,
    items: [{
      id: 'assignment-1',
      project_id: 'project-1',
      electrical_variant_id: ER_ID,
      object_id: 'object-1',
      system_type: systemType,
      assignment_state: view === 'unassigned'
        ? 'unassigned'
        : view === 'skin' || view === 'mineral'
          ? 'unsupported'
          : 'stale',
      requested_cable_type: null,
      object_version_snapshot: 5,
      version,
      diagnostics: {},
      object: {
        id: 'object-1',
        project_id: 'project-1',
        object_type: 'pipe',
        sort_order: 0,
        version: 5,
        params: { name: 'Трубопровод 101' },
        results: { total_heat_loss: 120 },
        is_valid: true,
        validation_errors: null,
        created_at: '2026-07-18T00:00:00Z',
        updated_at: '2026-07-18T00:00:00Z',
      },
      created_at: '2026-07-18T00:00:00Z',
      updated_at: '2026-07-18T00:00:00Z',
    }],
    counts: {
      total: 5,
      filtered: 1,
      by_system: {
        unassigned: 1,
        self_regulating: 2,
        resistive: 2,
        skin: 0,
        mineral: 0,
      },
      by_state: { unassigned: 1, ready: 0, unsupported: 0, stale: 4, error: 0 },
    },
    page_info: {
      page: 1,
      page_size: 50,
      offset: 0,
      total_pages: 1,
      has_next_page: false,
      has_previous_page: false,
    },
  };
}

function renderPanel(
  canMutate = true,
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  }),
  onAssignmentsChanged?: () => void,
) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return {
    queryClient,
    ...render(
      <ElectricalAssignmentPanel
        projectId="project-1"
        electricalVariant={variant}
        canMutate={canMutate}
        onAssignmentsChanged={onAssignmentsChanged}
      />,
      { wrapper },
    ),
  };
}

async function selectOnlyAssignment(user: ReturnType<typeof userEvent.setup>) {
  const row = await screen.findByRole('row', { name: /Трубопровод 101/iu });
  await user.click(within(row).getByRole('checkbox'));
}

describe('ElectricalAssignmentPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMocks.list.mockImplementation(async (
      _projectId: string,
      _variantId: string,
      params: ElectricalAssignmentListParams,
    ) => assignmentResponse(params.view));
    apiMocks.assign.mockResolvedValue({
      project_id: 'project-1',
      electrical_variant_id: ER_ID,
      changed_count: 1,
      assignments: [],
      cleanup: {},
      specification_state: 'stale',
    });
    apiMocks.unassign.mockResolvedValue({
      project_id: 'project-1',
      electrical_variant_id: ER_ID,
      changed_count: 1,
      assignments: [],
      cleanup: { electrical_calculations: 1 },
      specification_state: 'stale',
    });
  });

  it('shows ordered counted tabs, explains unsupported systems, and loads ER5 by UUID', async () => {
    renderPanel();

    expect(await screen.findByText('Трубопровод 101')).toBeInTheDocument();
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((tab) => tab.textContent?.replace(/\s+/gu, ' ').trim())).toEqual([
      'Нераспределённые1',
      'Самрег2',
      'Резистив2',
      'Скин0',
      'Минеральный0',
    ]);
    expect(screen.getByRole('tab', { name: /Скин/iu })).toHaveAttribute('aria-disabled', 'false');
    expect(screen.getByRole('tab', { name: /Минеральный/iu })).toHaveAttribute('aria-disabled', 'false');
    expect(screen.getByText(/назначать в «Скин» и «Минеральный» нельзя/iu))
      .toBeInTheDocument();
    // Visible drop zones (not tab labels) for DnD assign
    expect(screen.getByTestId('assignment-drop-zones')).toBeInTheDocument();
    expect(screen.getByTestId('assignment-drop-zone-self_regulating')).toBeInTheDocument();
    expect(screen.getByTestId('assignment-drop-zone-resistive')).toBeInTheDocument();
    expect(screen.getByTestId('assignment-drop-zone-unassigned')).toHaveAttribute('data-disabled', 'true');
    expect(screen.getByText('Трубопровод')).toBeInTheDocument();
    expect(apiMocks.list).toHaveBeenCalledWith('project-1', ER_ID, {
      view: 'unassigned',
      page: 1,
      page_size: 50,
    });
  });

  it('lets users inspect and unassign a migrated unsupported system without assigning into it', async () => {
    const user = userEvent.setup();
    renderPanel();
    await screen.findByText('Трубопровод 101');

    await user.click(screen.getByRole('tab', { name: /Скин/iu }));
    expect(await screen.findByText('Не поддерживается')).toBeInTheDocument();
    await selectOnlyAssignment(user);

    expect(screen.getByRole('button', { name: 'Назначить: Самрег' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Назначить: Резистив' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Вернуть в нераспределённые' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Вернуть' }));

    await waitFor(() => {
      expect(apiMocks.unassign).toHaveBeenCalledWith('project-1', ER_ID, {
        confirm: true,
        items: [{ object_id: 'object-1', expected_version: 3 }],
      });
    });
  });

  it('assigns selected objects with their assignment versions and exact system type', async () => {
    const user = userEvent.setup();
    const onAssignmentsChanged = vi.fn();
    renderPanel(true, undefined, onAssignmentsChanged);
    await selectOnlyAssignment(user);

    await user.click(screen.getByRole('button', { name: 'Назначить: Самрег' }));

    await waitFor(() => {
      expect(apiMocks.assign).toHaveBeenCalledWith('project-1', ER_ID, {
        system_type: 'self_regulating',
        items: [{ object_id: 'object-1', expected_version: 3 }],
      });
    });
    await waitFor(() => expect(onAssignmentsChanged).toHaveBeenCalledTimes(1));
  });

  it('confirms unassign with scoped cleanup copy and preserves heat data in the explanation', async () => {
    const user = userEvent.setup();
    const { queryClient } = renderPanel();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    await screen.findByText('Трубопровод 101');
    await user.click(screen.getByRole('tab', { name: /Самрег/u }));
    await selectOnlyAssignment(user);
    expect(screen.getByRole('button', { name: 'Назначить: Самрег' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Назначить: Резистив' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Вернуть в нераспределённые' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(
      /электрические расчёты, кандидаты, папки кандидатов и секции выбранного ЭР/iu,
    ))
      .toBeInTheDocument();
    expect(within(dialog).getByText(/Теплорасчёт и параметры объекта сохранятся/iu))
      .toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Вернуть' }));

    await waitFor(() => {
      expect(apiMocks.unassign).toHaveBeenCalledWith('project-1', ER_ID, {
        confirm: true,
        items: [{ object_id: 'object-1', expected_version: 3 }],
      });
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['project', 'project-1', 'electrical-variant', ER_ID],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['spec', 'project-1', ER_ID],
    });
    expect(invalidateSpy).not.toHaveBeenCalledWith({
      queryKey: ['project', 'project-1', 'electrical-variant', 'neighbor-er'],
    });
  });

  it('disables mutation controls while pending and in read-only mode', async () => {
    let resolveMutation: ((value: unknown) => void) | undefined;
    apiMocks.assign.mockImplementation(() => new Promise((resolve) => {
      resolveMutation = resolve;
    }));
    const user = userEvent.setup();
    const pendingView = renderPanel();
    await selectOnlyAssignment(user);
    const assignButton = screen.getByRole('button', { name: 'Назначить: Самрег' });
    await user.click(assignButton);
    await waitFor(() => expect(assignButton).toBeDisabled());

    await act(async () => {
      resolveMutation?.({
        project_id: 'project-1',
        electrical_variant_id: ER_ID,
        changed_count: 1,
        assignments: [],
        cleanup: {},
        specification_state: 'stale',
      });
    });
    pendingView.unmount();

    renderPanel(false);
    expect(await screen.findByText('Режим просмотра')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Назначить: Самрег' })).toBeDisabled();
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
  });

  it('renders assignment load errors and retries without leaving the selected ER scope', async () => {
    apiMocks.list
      .mockRejectedValueOnce(new Error('Сервис назначений недоступен'))
      .mockResolvedValueOnce(assignmentResponse());
    const user = userEvent.setup();
    renderPanel();

    expect(await screen.findByText('Не удалось загрузить назначения выбранного ЭР'))
      .toBeInTheDocument();
    expect(screen.getByText('Сервис назначений недоступен')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Повторить' }));

    expect(await screen.findByText('Трубопровод 101')).toBeInTheDocument();
    expect(apiMocks.list).toHaveBeenCalledTimes(2);
    expect(apiMocks.list).toHaveBeenLastCalledWith('project-1', ER_ID, {
      view: 'unassigned',
      page: 1,
      page_size: 50,
    });
  });

  it('shows a version-conflict notice, clears selection and refetches authoritative data', async () => {
    apiMocks.assign.mockRejectedValue(Object.assign(
      new Error('Назначение уже изменено'),
      { status: 409, code: 'ELECTRICAL_ASSIGNMENT_VERSION_CONFLICT' },
    ));
    const user = userEvent.setup();
    const onAssignmentsChanged = vi.fn();
    renderPanel(true, undefined, onAssignmentsChanged);
    await selectOnlyAssignment(user);
    await user.click(screen.getByRole('button', { name: 'Назначить: Самрег' }));

    expect(await screen.findByText(/Назначения изменились на сервере/iu)).toBeInTheDocument();
    await waitFor(() => expect(apiMocks.list).toHaveBeenCalledTimes(2));
    expect(onAssignmentsChanged).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Назначить: Самрег' })).toBeDisabled();
  });

  it('explains that reassignment requires confirmed unassign and refetches the exact ER', async () => {
    apiMocks.assign.mockRejectedValue(Object.assign(
      new Error('Сначала снимите назначение'),
      { status: 409, code: 'ELECTRICAL_ASSIGNMENT_REASSIGN_REQUIRES_UNASSIGN' },
    ));
    const user = userEvent.setup();
    renderPanel();
    await selectOnlyAssignment(user);
    await user.click(screen.getByRole('button', { name: 'Назначить: Самрег' }));

    expect(await screen.findByText('Сначала верните объект в нераспределённые'))
      .toBeInTheDocument();
    expect(screen.getByText(/подтвердите возврат в нераспределённые/iu)).toBeInTheDocument();
    await waitFor(() => expect(apiMocks.list).toHaveBeenCalledTimes(2));
    expect(apiMocks.list).toHaveBeenLastCalledWith('project-1', ER_ID, {
      view: 'unassigned',
      page: 1,
      page_size: 50,
    });
  });

  it('offers confirmed scoped cleanup when an unassigned legacy row blocks assignment', async () => {
    apiMocks.assign.mockRejectedValue(Object.assign(
      new Error('Требуется очистка'),
      { status: 409, code: 'ELECTRICAL_ASSIGNMENT_CLEANUP_REQUIRED' },
    ));
    const user = userEvent.setup();
    renderPanel();
    await selectOnlyAssignment(user);
    await user.click(screen.getByRole('button', { name: 'Назначить: Самрег' }));

    expect(await screen.findByText('Найдены старые электрические данные'))
      .toBeInTheDocument();
    expect(screen.getByText(/Теплорасчёт сохранится/iu)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Подтвердить очистку' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/Теплорасчёт и параметры объекта сохранятся/iu))
      .toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Очистить' }));

    await waitFor(() => {
      expect(apiMocks.unassign).toHaveBeenCalledWith('project-1', ER_ID, {
        confirm: true,
        items: [{ object_id: 'object-1', expected_version: 3 }],
      });
    });
  });

  it('refetches on remount and renders persisted assignment state after reload', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    apiMocks.list
      .mockResolvedValueOnce(assignmentResponse('unassigned', 3))
      .mockResolvedValueOnce({
        ...assignmentResponse('unassigned', 4),
        items: [{
          ...assignmentResponse('unassigned', 4).items[0],
          object: {
            ...assignmentResponse('unassigned', 4).items[0].object,
            params: { name: 'Трубопровод после reload' },
          },
        }],
      });

    const first = renderPanel(true, queryClient);
    expect(await screen.findByText('Трубопровод 101')).toBeInTheDocument();
    first.unmount();
    renderPanel(true, queryClient);

    expect(await screen.findByText('Трубопровод после reload')).toBeInTheDocument();
    expect(apiMocks.list).toHaveBeenCalledTimes(2);
  });
});

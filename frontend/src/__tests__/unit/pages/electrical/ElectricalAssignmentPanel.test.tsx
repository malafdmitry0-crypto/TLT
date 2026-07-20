import type { ReactNode } from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';

import ElectricalAssignmentPanel from '@/pages/electrical/ElectricalAssignmentPanel';
import type {
  ElectricalAssignmentListParams,
  ElectricalAssignmentListResponse,
  ElectricalVariant,
} from '@/types/electricalVariant';
import type { ElectricalSystemView } from '@/pages/electrical/elecCalcSystemViewModel';

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

function assignmentResponse(): ElectricalAssignmentListResponse {
  return {
    project_id: 'project-1',
    electrical_variant_id: ER_ID,
    items: [],
    counts: {
      total: 5,
      filtered: 5,
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
      page_size: 1,
      offset: 0,
      total_pages: 1,
      has_next_page: false,
      has_previous_page: false,
    },
  };
}

function Harness({
  canMutate = true,
  initialView = 'unassigned' as ElectricalSystemView,
  selectedObjectIds = ['object-1'],
  onAssignmentsChanged,
  onAssignedNeedCalc,
}: {
  canMutate?: boolean;
  initialView?: ElectricalSystemView;
  selectedObjectIds?: string[];
  onAssignmentsChanged?: () => void;
  onAssignedNeedCalc?: (systemType: 'self_regulating' | 'resistive', objectIds: string[]) => void;
}) {
  const [systemView, setSystemView] = useState<ElectricalSystemView>(initialView);
  const [selected, setSelected] = useState(selectedObjectIds);
  const versionByObjectId = new Map([['object-1', 3]]);
  return (
    <ElectricalAssignmentPanel
      projectId="project-1"
      electricalVariant={variant}
      canMutate={canMutate}
      systemView={systemView}
      onSystemViewChange={setSystemView}
      selectedObjectIds={selected}
      onSelectedObjectIdsChange={setSelected}
      versionByObjectId={versionByObjectId}
      onAssignmentsChanged={onAssignmentsChanged}
      onAssignedNeedCalc={onAssignedNeedCalc}
    />
  );
}

function renderPanel(
  props: Parameters<typeof Harness>[0] = {},
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  }),
) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return {
    queryClient,
    ...render(<Harness {...props} />, { wrapper }),
  };
}

describe('ElectricalAssignmentPanel (system scope chrome)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMocks.list.mockImplementation(async (
      _projectId: string,
      _variantId: string,
      _params: ElectricalAssignmentListParams,
    ) => assignmentResponse());
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

  it('shows system tabs with counts and no second object table', async () => {
    renderPanel({ selectedObjectIds: [] });

    expect(await screen.findByText(/Система обогрева · Пятый ЭР/)).toBeInTheDocument();
    await waitFor(() => {
      const tabs = screen.getAllByRole('tab');
      expect(tabs.map((tab) => tab.textContent?.replace(/\s+/gu, ' ').trim())).toEqual([
        'Нераспределённые1',
        'Самрег2',
        'Резистив2',
        'Скин0',
        'Минеральный0',
      ]);
      expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
    });
    expect(screen.getByTestId('assignment-drop-zone-self_regulating'))
      .toHaveAttribute('data-disabled', 'false');
    expect(screen.getByTestId('assignment-drop-zone-unassigned'))
      .toHaveAttribute('data-disabled', 'true');
    // No dual assignment object grid
    expect(screen.queryByRole('columnheader', { name: 'Диагностика' })).not.toBeInTheDocument();
    expect(screen.getByText(/Одна таблица ниже фильтруется вкладкой/iu)).toBeInTheDocument();
  });

  it('assigns selected objects from unified table selection', async () => {
    const user = userEvent.setup();
    const onAssignmentsChanged = vi.fn();
    const onAssignedNeedCalc = vi.fn();
    renderPanel({ onAssignmentsChanged, onAssignedNeedCalc });

    await screen.findByText(/Система обогрева/);
    await user.click(screen.getByRole('button', { name: 'Назначить: Самрег' }));

    await waitFor(() => {
      expect(apiMocks.assign).toHaveBeenCalledWith('project-1', ER_ID, {
        system_type: 'self_regulating',
        items: [{ object_id: 'object-1', expected_version: 3 }],
      });
    });
    await waitFor(() => expect(onAssignmentsChanged).toHaveBeenCalledTimes(1));
    await waitFor(() => {
      expect(onAssignedNeedCalc).toHaveBeenCalledWith('self_regulating', ['object-1']);
    });
  });

  it('HTML5 drop onto Самрег assigns dragged ids', async () => {
    const { fireEvent } = await import('@testing-library/react');
    renderPanel({ selectedObjectIds: [] });
    await screen.findByText(/Система обогрева/);

    const zone = screen.getByTestId('assignment-drop-zone-self_regulating');
    const payload = JSON.stringify(['object-1']);
    const dataTransfer = {
      getData: (type: string) => (
        type === 'application/x-tlt-assignment-ids' || type === 'text/plain'
          ? payload
          : ''
      ),
      setData: vi.fn(),
      effectAllowed: 'move',
      dropEffect: 'move',
      types: ['application/x-tlt-assignment-ids', 'text/plain'],
    };

    fireEvent.dragOver(zone, { dataTransfer });
    fireEvent.drop(zone, { dataTransfer });

    await waitFor(() => {
      expect(apiMocks.assign).toHaveBeenCalledWith('project-1', ER_ID, {
        system_type: 'self_regulating',
        items: [{ object_id: 'object-1', expected_version: 3 }],
      });
    });
  });

  it('confirms unassign when system tab is active', async () => {
    const user = userEvent.setup();
    renderPanel({ initialView: 'self_regulating' });
    await screen.findByText(/Система обогрева/);

    expect(screen.getByTestId('assignment-drop-zone-self_regulating'))
      .toHaveAttribute('data-disabled', 'true');
    expect(screen.getByTestId('assignment-drop-zone-unassigned'))
      .toHaveAttribute('data-disabled', 'false');

    await user.click(screen.getByRole('button', { name: 'Вернуть в нераспределённые' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(withinDialog(dialog, 'Вернуть'));

    await waitFor(() => {
      expect(apiMocks.unassign).toHaveBeenCalledWith('project-1', ER_ID, {
        confirm: true,
        items: [{ object_id: 'object-1', expected_version: 3 }],
      });
    });
  });

  it('disables mutation controls in read-only mode', async () => {
    renderPanel({ canMutate: false });
    await screen.findByText('Режим просмотра');
    expect(screen.getByRole('button', { name: 'Назначить: Самрег' })).toBeDisabled();
    expect(screen.queryByTestId('assignment-drop-zones')).not.toBeInTheDocument();
  });
});

function withinDialog(dialog: HTMLElement, name: string) {
  return Array.from(dialog.querySelectorAll('button')).find(
    (btn) => btn.textContent?.trim() === name,
  ) as HTMLElement;
}

// silence unused act import if tree-shaken
void act;

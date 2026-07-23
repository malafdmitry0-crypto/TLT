import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, screen, waitFor } from '@testing-library/react';
import { QueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/store/authStore';
import { useCalculationVariantStore } from '@/store/calculationVariantStore';
import { useProjectStore } from '@/store/projectStore';
import { getCalcJobRefetchInterval } from '@/utils/calcJobPolling';
import { ELECTRICAL_TABLE_ENGINE_STORAGE_KEY } from '@/utils/electricalTableEngine';
import { electricalDataQueryKeys } from '@/api/electricalQueryKeys';
import { mockProject, makeObject, makeElectricalPage, makeCalcTask, renderPage } from '@/__tests__/integration/pages/electrical/elecCalcPageHarness';
import { electricalVariantApiMocks, defaultElectricalVariantListImplementation, electricalGlideGridMock, electricalAssignmentPanelMock } from '@/__tests__/integration/pages/electrical/elecCalcPageTestEnv';
import '@/__tests__/integration/pages/electrical/elecCalcPageTestEnv';

describe('ElecCalcPage shell / variants / polling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    electricalVariantApiMocks.list.mockReset();
    electricalVariantApiMocks.list.mockImplementation(
      defaultElectricalVariantListImplementation!,
    );
    electricalVariantApiMocks.readiness.mockReset();
    electricalVariantApiMocks.initialize.mockReset();
    electricalVariantApiMocks.create.mockReset();
    electricalVariantApiMocks.copy.mockReset();
    electricalVariantApiMocks.rename.mockReset();
    electricalVariantApiMocks.activate.mockReset();
    electricalVariantApiMocks.remove.mockReset();
    electricalVariantApiMocks.listAssignments.mockClear();
    electricalVariantApiMocks.assignObjects.mockReset();
    electricalVariantApiMocks.unassignObjects.mockReset();
    vi.unstubAllEnvs();
    vi.stubEnv('VITE_COMMERCIAL_FEATURES_ENABLED', 'true');
    electricalGlideGridMock.props = null;
    electricalAssignmentPanelMock.props = null;
    // Most scenarios exercise calculation behavior for already assigned
    // self-regulating objects. The real page starts on "unassigned", so the
    // harness explicitly performs the same tab change a user would.
    electricalAssignmentPanelMock.initialSystemView = 'self_regulating';
    localStorage.clear();
    // Main table uses AntD DOM here; candidate table is mocked through its Glide props.
    localStorage.setItem(ELECTRICAL_TABLE_ENGINE_STORAGE_KEY, 'table');
    useAuthStore.getState().logout();
    useAuthStore.getState().setGuest('sid');
    useProjectStore.getState().setCurrentProject(null);
    useCalculationVariantStore.setState({
      selectedVariantIdByProject: {},
      variantByProject: {},
    });
  });

  it('показывает заглушку без проекта', () => {
    renderPage();
    expect(screen.getByText(/Проект не выбран/i)).toBeInTheDocument();
  });

  it('пустой проект — показывает alert «Нет объектов»', async () => {
    const { getElectricalPage } = await import('@/api/calculations');
    (getElectricalPage as ReturnType<typeof vi.fn>).mockResolvedValue(makeElectricalPage([]));
    useProjectStore.getState().setCurrentProject(mockProject);
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/Нет объектов/i)).toBeInTheDocument();
    });
  });

  it('подхватывает activeJobId из навигации и начинает polling задачи', async () => {
    const { getCalcTask, getElectricalPage } = await import('@/api/calculations');
    (getElectricalPage as ReturnType<typeof vi.fn>).mockResolvedValue(makeElectricalPage([]));
    useProjectStore.getState().setCurrentProject(mockProject);
    renderPage({ activeJobId: 'task-nav' });
    await waitFor(() => {
      expect(getCalcTask).toHaveBeenCalledWith('task-nav');
    });
  });

  it('продолжает polling исходного ЭР после переключения и инвалидирует только его UUID', async () => {
    const { getCalcTask, getElectricalPage } = await import('@/api/calculations');
    const getCalcTaskMock = getCalcTask as ReturnType<typeof vi.fn>;
    (getElectricalPage as ReturnType<typeof vi.fn>).mockResolvedValue(makeElectricalPage([]));
    getCalcTaskMock
      .mockResolvedValueOnce(makeCalcTask(
        'task-er-1',
        '11111111-1111-4111-8111-111111111111',
        'running',
      ))
      .mockResolvedValueOnce(makeCalcTask(
        'task-er-1',
        '11111111-1111-4111-8111-111111111111',
        'succeeded',
        {
          finished_at: '2026-01-01T00:00:02Z',
          result: {
            scope: 'all',
            calculated: 1,
            skipped: 0,
            heat_loss_failed: 0,
            errors: [],
            results: [],
          },
        },
      ));
    useProjectStore.getState().setCurrentProject(mockProject);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    const user = (await import('@testing-library/user-event')).default.setup();
    renderPage({ activeJobId: 'task-er-1' }, queryClient);

    await waitFor(() => {
      expect(getCalcTaskMock).toHaveBeenCalledTimes(1);
    });
    await user.click(screen.getByRole('tab', { name: 'ЭР2' }));
    expect(screen.getByRole('tab', { name: 'ЭР2' })).toHaveAttribute('aria-selected', 'true');

    await waitFor(() => {
      expect(getCalcTaskMock).toHaveBeenCalledTimes(2);
    }, { timeout: 4_000 });
    await waitFor(() => {
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: electricalDataQueryKeys.variant(
          'p-1',
          '11111111-1111-4111-8111-111111111111',
        ),
      });
    });
    expect(invalidate).not.toHaveBeenCalledWith({
      queryKey: electricalDataQueryKeys.variant(
        'p-1',
        '22222222-2222-4222-8222-222222222222',
      ),
    });
  });

  it('использует редкий polling для очереди и фоновой вкладки', () => {
    expect(getCalcJobRefetchInterval('queued', false)).toBe(2000);
    expect(getCalcJobRefetchInterval('enqueued', false)).toBe(2000);
    expect(getCalcJobRefetchInterval('running', false)).toBe(1000);
    expect(getCalcJobRefetchInterval('running', true)).toBe(15000);
    expect(getCalcJobRefetchInterval('succeeded', false)).toBe(false);
  });

  it('строит именованные вкладки ЭР из lifecycle API', async () => {
    const { getElectricalPage } = await import('@/api/calculations');
    (getElectricalPage as ReturnType<typeof vi.fn>).mockResolvedValue(makeElectricalPage([]));
    useProjectStore.getState().setCurrentProject(mockProject);
    renderPage();
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'ЭР1' })).toBeInTheDocument();
    });
    expect(screen.getByRole('tab', { name: 'ЭР4' })).toBeInTheDocument();
  });

  it('перемонтирует workspace после изменения назначений и отбрасывает локальные страницы', async () => {
    const { getElectricalPage } = await import('@/api/calculations');
    (getElectricalPage as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeElectricalPage([makeObject()]),
    );
    useProjectStore.getState().setCurrentProject(mockProject);
    renderPage();

    await screen.findByText('Труба-1');
    const callsBeforeChange = (getElectricalPage as ReturnType<typeof vi.fn>).mock.calls.length;
    act(() => electricalAssignmentPanelMock.props?.onAssignmentsChanged?.());

    await waitFor(() => {
      expect((getElectricalPage as ReturnType<typeof vi.fn>).mock.calls.length)
        .toBeGreaterThan(callsBeforeChange);
    });
    expect(getElectricalPage).toHaveBeenLastCalledWith(expect.objectContaining({
      project_id: 'p-1',
      electrical_variant_id: '11111111-1111-4111-8111-111111111111',
      page: 1,
    }));
  });

  it('запрашивает электрорасчёты только для выбранного варианта СО', async () => {
    const { getElectricalPage } = await import('@/api/calculations');
    (getElectricalPage as ReturnType<typeof vi.fn>).mockResolvedValue(makeElectricalPage([]));
    useProjectStore.getState().setCurrentProject(mockProject);
    const user = (await import('@testing-library/user-event')).default.setup();
    renderPage();

    await waitFor(() => {
      expect(getElectricalPage).toHaveBeenCalledWith(expect.objectContaining({
        project_id: 'p-1',
        variant_number: 1,
        page: 1,
        page_size: 50,
      }));
    });

    await user.click(screen.getByRole('tab', { name: 'ЭР2' }));

    await waitFor(() => {
      expect(getElectricalPage).toHaveBeenCalledWith(expect.objectContaining({
        project_id: 'p-1',
        variant_number: 2,
        page: 1,
        page_size: 50,
      }));
    });
  });

  it('на старте показывает только неназначенные объекты, затем открывает расчётную систему', async () => {
    const { getElectricalPage } = await import('@/api/calculations');
    (getElectricalPage as ReturnType<typeof vi.fn>).mockResolvedValue(makeElectricalPage([makeObject()]));
    electricalAssignmentPanelMock.initialSystemView = 'unassigned';
    useProjectStore.getState().setCurrentProject(mockProject);
    renderPage();

    await waitFor(() => {
      expect(electricalAssignmentPanelMock.props?.systemView).toBe('unassigned');
    });
    expect(screen.queryByText('Труба-1')).not.toBeInTheDocument();

    electricalAssignmentPanelMock.initialSystemView = null;
    act(() => electricalAssignmentPanelMock.props?.onSystemViewChange?.('self_regulating'));

    await waitFor(() => {
      expect(screen.getByText('Труба-1')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Пересчитать выбранные \(0\)/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Пересчитать все · ЭР1/i })).toBeInTheDocument();
    });
  });

});

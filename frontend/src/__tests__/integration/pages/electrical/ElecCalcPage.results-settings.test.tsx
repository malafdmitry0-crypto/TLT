import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { useAuthStore } from '@/store/authStore';
import { useCalculationVariantStore } from '@/store/calculationVariantStore';
import { useProjectStore } from '@/store/projectStore';
import type { ElectricalCandidate } from '@/types/calculation';
import { ELECTRICAL_GUEST_TABLE_COLUMN_STORAGE_KEY } from '@/utils/electricalTableColumns';
import { ELECTRICAL_GUEST_CANDIDATE_TABLE_COLUMN_STORAGE_KEY } from '@/utils/electricalCandidateTableColumns';
import { ELECTRICAL_GUEST_TABLE_VIEW_STORAGE_KEY } from '@/utils/electricalTableViewSettings';
import { ELECTRICAL_TABLE_ENGINE_STORAGE_KEY } from '@/utils/electricalTableEngine';
import { mockProject, makeObject, makeElectricalPage, renderPage, openElectricalTableSettingsOtherTab } from '@/__tests__/integration/pages/electrical/elecCalcPageHarness';
import { electricalVariantApiMocks, defaultElectricalVariantListImplementation, electricalGlideGridMock, electricalAssignmentPanelMock } from '@/__tests__/integration/pages/electrical/elecCalcPageTestEnv';
import '@/__tests__/integration/pages/electrical/elecCalcPageTestEnv';

describe('ElecCalcPage results / settings', () => {
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

  it('позволяет настроить таблицу кандидатов отдельно от основной таблицы', async () => {
    const { getElectricalPage, listElectricalCandidates } = await import('@/api/calculations');
    const user = (await import('@testing-library/user-event')).default.setup();
    (listElectricalCandidates as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: 'cand-1',
        project_id: 'p-1',
        object_id: 'o-1',
        variant_number: 1,
        cable_type: 'self_regulating',
        cable_source: 'builtin',
        cable_mark: 'ТЛТ-10',
        dedupe_key: 'v1:cand-1',
        mode: 'auto',
        status: 'applicable',
        priority: 0,
        is_recommended: true,
        is_pinned: false,
        is_applied: false,
        reason_code: null,
        reason_message: null,
        engineer_comment: null,
        params: {},
        results: {
          total_power: 1000,
          order_cable_length: 55,
          current: 4.55,
          voltage: 220,
        },
        cable_snapshot: null,
        warnings: [],
        risk_flags: [],
        candidate_meta: {},
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
    ]);
    (getElectricalPage as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeElectricalPage([makeObject({ params: { name: 'Труба-1' } })], [
        {
          id: 'c-1',
          object_id: 'o-1',
          cable_type: 'self_regulating',
          cable_mark: 'ТЛТ-10',
          variant_number: 1,
          results: {
            selected_cable: 'ТЛТ-10',
            current: 4.55,
            voltage: 220,
          },
        },
      ]),
    );
    useProjectStore.getState().setCurrentProject(mockProject);
    renderPage();

    await waitFor(() => {
      expect(document.querySelector('.electrical-spreadsheet')?.textContent).toContain('Ток, А');
    });
    const row = await screen.findByRole('row', { name: /Труба-1/ });
    await user.click(row);
    await user.click(within(row).getByRole('button', { name: 'Подбор' }));
    const sizingDialog = await screen.findByRole('dialog', { name: /Подбор кабеля для/ });

    // findAllByText: candidate table paints async under full-suite load.
    expect((await within(sizingDialog).findAllByText('Ток, А')).length).toBeGreaterThan(0);
    await user.click(within(sizingDialog).getByRole('button', { name: 'Настройки таблицы' }));
    const settingsTitle = await screen.findByText('Настройки таблицы подбора кабеля');
    const settingsDialog = settingsTitle.closest('.ant-modal-content');
    expect(settingsDialog).toBeInstanceOf(HTMLElement);
    const settingsScope = within(settingsDialog as HTMLElement);
    expect(settingsScope.queryByText('Шаг')).not.toBeInTheDocument();
    expect(settingsScope.getByRole('checkbox', { name: /Показать Действия/i }))
      .toBeDisabled();
    expect(settingsScope.getByRole('checkbox', { name: /Показать Марка кабеля/i }))
      .toBeDisabled();

    await user.click(settingsScope.getByRole('checkbox', { name: /Показать Расчётный ток/i }));
    await user.click(settingsScope.getByRole('button', { name: 'Сохранить' }));

    await waitFor(() => {
      expect(within(sizingDialog).queryByText('Ток, А')).not.toBeInTheDocument();
    });
    expect(document.querySelector('.electrical-spreadsheet')?.textContent).toContain('Ток, А');

    const stored = JSON.parse(
      localStorage.getItem(ELECTRICAL_GUEST_CANDIDATE_TABLE_COLUMN_STORAGE_KEY) ?? '{}',
    );
    expect(stored.visibleOrder).not.toContain('current');
    expect(localStorage.getItem(ELECTRICAL_GUEST_TABLE_COLUMN_STORAGE_KEY)).toBeNull();
  });

  it('фильтрует, сортирует и меняет ширину колонок таблицы кандидатов', async () => {
    const { getElectricalPage, listElectricalCandidates } = await import('@/api/calculations');
    const user = (await import('@testing-library/user-event')).default.setup();
    const baseCandidate = {
      project_id: 'p-1',
      object_id: 'o-1',
      variant_number: 1,
      cable_source: 'builtin',
      priority: 0,
      is_pinned: false,
      is_applied: false,
      reason_code: null,
      reason_message: null,
      engineer_comment: null,
      params: {},
      cable_snapshot: null,
      warnings: [],
      risk_flags: [],
      candidate_meta: {},
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    };
    const makeCandidate = (candidate: Partial<ElectricalCandidate> & { id: string }): ElectricalCandidate => ({
      ...baseCandidate,
      dedupe_key: `v1:${candidate.id}`,
      mode: 'auto',
      status: 'applicable',
      is_recommended: false,
      ...candidate,
    } as ElectricalCandidate);
    (listElectricalCandidates as ReturnType<typeof vi.fn>).mockResolvedValue([
      makeCandidate({
        id: 'cand-mid',
        cable_type: 'single_core',
        cable_mark: 'СНТО-10/220',
        results: { current: 3.5, order_cable_length: 11.4 },
      }),
      makeCandidate({
        id: 'cand-low',
        cable_type: 'self_regulating',
        cable_mark: 'ТЛТ-10',
        results: { current: 1.2, order_cable_length: 13.2 },
      }),
      makeCandidate({
        id: 'cand-high',
        cable_type: 'three_core',
        cable_mark: 'КМСО-1,0-15',
        is_applied: true,
        results: { current: 8.4, order_cable_length: 9.5 },
      }),
    ]);
    (getElectricalPage as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeElectricalPage([makeObject({ params: { name: 'Труба-1' } })]),
    );
    localStorage.setItem(ELECTRICAL_GUEST_CANDIDATE_TABLE_COLUMN_STORAGE_KEY, JSON.stringify({
      version: 1,
      visibleOrder: ['marked', 'actions', 'mode', 'cable_mark', 'current', 'order_cable_length'],
      columns: {
        cable_mark: { widthPct: 19 },
        current: { widthPct: 10 },
      },
    }));
    useProjectStore.getState().setCurrentProject(mockProject);
    renderPage();

    const row = await screen.findByRole('row', { name: /Труба-1/ });
    await user.click(row);
    await user.click(within(row).getByRole('button', { name: 'Подбор' }));
    const sizingDialog = await screen.findByRole('dialog', { name: /Подбор кабеля для/ });
    const rowIds = () =>
      Array.from(sizingDialog.querySelectorAll('tr[data-testid^="candidate-row-"]'))
        .map((candidateRow) => candidateRow.getAttribute('data-testid'));

    expect(rowIds()).toEqual([
      'candidate-row-cand-high',
      'candidate-row-cand-mid',
      'candidate-row-cand-low',
    ]);

    await user.click(within(sizingDialog).getByRole('columnheader', { name: /Ток, А/ }));
    await waitFor(() => {
      expect(rowIds()).toEqual([
        'candidate-row-cand-high',
        'candidate-row-cand-low',
        'candidate-row-cand-mid',
      ]);
    });

    await user.click(within(sizingDialog).getByRole('button', { name: 'Фильтр Марка кабеля' }));
    await user.type(await screen.findByLabelText('Поиск: Марка кабеля'), 'КМСО');
    await user.click(screen.getByRole('button', { name: 'Применить' }));

    await waitFor(() => {
      expect(rowIds()).toEqual(['candidate-row-cand-high']);
    });
    expect(within(sizingDialog).getByRole('button', { name: 'Сбросить фильтры таблицы кандидатов' }))
      .toBeEnabled();

    await user.click(within(sizingDialog).getByRole('button', { name: 'Сбросить фильтры таблицы кандидатов' }));
    await waitFor(() => {
      expect(rowIds()).toEqual([
        'candidate-row-cand-high',
        'candidate-row-cand-mid',
        'candidate-row-cand-low',
      ]);
    });

    const resizeHandle = within(sizingDialog).getByRole('button', {
      name: 'Изменить ширину: Марка кабеля',
    });
    await act(async () => {
      fireEvent(resizeHandle, new MouseEvent('pointerdown', { clientX: 100, bubbles: true }));
      window.dispatchEvent(new MouseEvent('pointermove', { clientX: 150, bubbles: true }));
      window.dispatchEvent(new MouseEvent('pointerup', { clientX: 150, bubbles: true }));
    });

    await waitFor(() => {
      const stored = JSON.parse(
        localStorage.getItem(ELECTRICAL_GUEST_CANDIDATE_TABLE_COLUMN_STORAGE_KEY) ?? '{}',
      );
      expect(stored.columns.cable_mark.widthPct).toBeGreaterThan(19);
    });
    expect(localStorage.getItem(ELECTRICAL_GUEST_TABLE_COLUMN_STORAGE_KEY)).toBeNull();
  });

  it('сохраняет ручные кабели по умолчанию при полном массовом пересчёте', async () => {
    const { enqueueElectricalBatchJob, getElectricalPage } = await import('@/api/calculations');
    const objects = [
      makeObject({ id: 'o-1', params: { name: 'Труба-1' } }),
      makeObject({ id: 'o-2', sort_order: 1, params: { name: 'Труба-2' } }),
    ];
    (getElectricalPage as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeElectricalPage(objects, [
        {
          id: 'c-1',
          object_id: 'o-1',
          cable_type: 'self_regulating',
          cable_mark: 'ТЛТ-30',
          cable_mark_source: 'manual',
          variant_number: 1,
          results: { selected_cable: 'ТЛТ-30' },
        },
      ]),
    );
    (enqueueElectricalBatchJob as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'task-1',
      type: 'electrical_batch',
      status: 'enqueued',
      project_id: 'p-1',
      progress: { current: 0, total: null, phase: 'enqueued', percent: null },
      result: null,
      error_message: null,
      cancel_requested: false,
      created_at: '2026-01-01T00:00:00Z',
      started_at: null,
      finished_at: null,
      links: { status: '', result: '', cancel: '' },
    });
    useProjectStore.getState().setCurrentProject(mockProject);
    const user = (await import('@testing-library/user-event')).default.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Труба-1')).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: /Пересчитать все · ЭР1/i }));
    expect(await screen.findByText(/Найдено ручных выборов: 1/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Да, пересчитать все/i }));

    await waitFor(() => {
      expect(enqueueElectricalBatchJob).toHaveBeenCalledWith(
        'p-1',
        'builtin',
        1,
        'self_regulating_tt',
        expect.objectContaining({
          forceCableType: true,
          skipManual: true,
        }),
      );
    });
  });

  it('перезаписывает ручные кабели в массовом пересчёте только после явного чекбокса', async () => {
    const { enqueueElectricalBatchJob, getElectricalPage } = await import('@/api/calculations');
    (getElectricalPage as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeElectricalPage([makeObject()], [
        {
          id: 'c-1',
          object_id: 'o-1',
          cable_type: 'self_regulating',
          cable_mark: 'ТЛТ-30',
          cable_mark_source: 'manual',
          variant_number: 1,
          results: { selected_cable: 'ТЛТ-30' },
        },
      ]),
    );
    (enqueueElectricalBatchJob as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'task-1',
      type: 'electrical_batch',
      status: 'enqueued',
      project_id: 'p-1',
      progress: { current: 0, total: null, phase: 'enqueued', percent: null },
      result: null,
      error_message: null,
      cancel_requested: false,
      created_at: '2026-01-01T00:00:00Z',
      started_at: null,
      finished_at: null,
      links: { status: '', result: '', cancel: '' },
    });
    useProjectStore.getState().setCurrentProject(mockProject);
    const user = (await import('@testing-library/user-event')).default.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Труба-1')).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: /Пересчитать все · ЭР1/i }));
    await user.click(await screen.findByRole('checkbox', { name: /Перезаписать ручные выборы/i }));
    await user.click(screen.getByRole('button', { name: /Да, пересчитать все/i }));

    await waitFor(() => {
      expect(enqueueElectricalBatchJob).toHaveBeenCalledWith(
        'p-1',
        'builtin',
        1,
        'self_regulating_tt',
        expect.objectContaining({
          forceCableType: true,
          skipManual: false,
        }),
      );
    });
  });

  it('предупреждает о ручном кабеле при пересчёте выбранных строк', async () => {
    const { enqueueElectricalBatchJob, getElectricalPage } = await import('@/api/calculations');
    (getElectricalPage as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeElectricalPage([makeObject()], [
        {
          id: 'c-1',
          object_id: 'o-1',
          cable_type: 'self_regulating',
          cable_mark: 'ТЛТ-30',
          cable_mark_source: 'manual',
          variant_number: 1,
          results: { selected_cable: 'ТЛТ-30' },
        },
      ]),
    );
    (enqueueElectricalBatchJob as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'task-1',
      type: 'electrical_batch',
      status: 'enqueued',
      project_id: 'p-1',
      progress: { current: 0, total: null, phase: 'enqueued', percent: null },
      result: null,
      error_message: null,
      cancel_requested: false,
      created_at: '2026-01-01T00:00:00Z',
      started_at: null,
      finished_at: null,
      links: { status: '', result: '', cancel: '' },
    });
    useProjectStore.getState().setCurrentProject(mockProject);
    const user = (await import('@testing-library/user-event')).default.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Труба-1')).toBeInTheDocument();
    });
    const row = screen.getByRole('row', { name: /Труба-1/ });
    fireEvent.click(within(row).getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: /Пересчитать выбранные \(1\)/i }));
    expect(await screen.findByText(/Найдено ручных выборов: 1/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^Пересчитать$/i }));

    await waitFor(() => {
      expect(enqueueElectricalBatchJob).toHaveBeenCalledWith(
        'p-1',
        'builtin',
        1,
        'self_regulating_tt',
        expect.objectContaining({
          objectIds: ['o-1'],
          skipManual: true,
        }),
      );
    });
  });

  it('при успешном расчёте отображает подобранный кабель в карточке объекта', async () => {
    const { getElectricalPage } = await import('@/api/calculations');
    (getElectricalPage as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeElectricalPage([makeObject()], [
        {
        id: 'c-1',
        object_id: 'o-1',
        cable_type: 'self_regulating',
        cable_mark: 'ТЛТ-30',
        variant_number: 1,
        results: {
          selected_cable: 'ТЛТ-30',
          installed_cable_length: 10,
          order_cable_length: 11,
          total_power: 600,
          current: 2.7,
          voltage: 220,
        },
      },
      ]),
    );
    useProjectStore.getState().setCurrentProject(mockProject);
    renderPage();
    await waitFor(() => {
      expect(screen.getAllByText('ТЛТ-30').length).toBeGreaterThan(0);
    });
  });

  it('позволяет гостю скрыть колонку электрорасчёта через настройки таблицы', async () => {
    const { getElectricalPage } = await import('@/api/calculations');
    const user = (await import('@testing-library/user-event')).default.setup();
    (getElectricalPage as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeElectricalPage([makeObject()], [
        {
          id: 'c-1',
          object_id: 'o-1',
          cable_type: 'self_regulating',
          cable_mark: 'ТЛТ-30',
          variant_number: 1,
          results: {
            selected_cable: 'ТЛТ-30',
            winding_pitch: 0,
            num_circuits: 1,
            installed_cable_length: 10,
            order_cable_length: 11,
            power_per_meter: 30,
            installed_power_per_meter: 30,
            total_power: 600,
            current: 2.7,
            voltage: 220,
          },
        },
      ]),
    );
    useProjectStore.getState().setCurrentProject(mockProject);
    renderPage();

    await waitFor(() => {
      expect(document.querySelector('.electrical-spreadsheet')?.textContent).toContain('Ток, А');
      expect(document.querySelector('.electrical-spreadsheet')?.textContent).toContain('P каб., Вт/м');
      expect(document.querySelector('.electrical-spreadsheet')?.textContent).toContain('30,00');
    });

    await user.click(screen.getByRole('button', { name: 'Настройки' }));
    expect(
      await screen.findByRole('checkbox', { name: /Показать Удельная мощность выбранного кабеля, Вт\/м/i }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: /Показать Расчётный ток/i }));
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));

    await waitFor(() => {
      expect(document.querySelector('.electrical-spreadsheet')?.textContent).not.toContain('Ток, А');
    });
    const stored = JSON.parse(
      localStorage.getItem(ELECTRICAL_GUEST_TABLE_COLUMN_STORAGE_KEY) ?? '{}',
    );
    expect(stored.visibleOrder).not.toContain('current');
  });

  it('сохраняет размер шрифта и формат заголовков таблицы электрорасчёта', async () => {
    const { getElectricalPage } = await import('@/api/calculations');
    const user = (await import('@testing-library/user-event')).default.setup();
    (getElectricalPage as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeElectricalPage([makeObject()], [
        {
          id: 'c-1',
          object_id: 'o-1',
          cable_type: 'self_regulating',
          cable_mark: 'ТЛТ-30',
          variant_number: 1,
          results: {
            selected_cable: 'ТЛТ-30',
            winding_pitch: 0,
            num_circuits: 1,
            installed_cable_length: 10,
            order_cable_length: 11,
            total_power: 600,
            current: 2.7,
            voltage: 220,
          },
        },
      ]),
    );
    useProjectStore.getState().setCurrentProject(mockProject);
    renderPage();

    await waitFor(() => {
      expect(document.querySelector('.electrical-spreadsheet')?.textContent).toContain('Ток, А');
    });

    await user.click(screen.getByRole('button', { name: 'Настройки' }));
    const dialog = await screen.findByRole('dialog', { name: 'Настройки таблицы электрорасчёта' });
    await openElectricalTableSettingsOtherTab(user, dialog);
    await user.click(within(dialog).getByText('Компактный'));
    await user.click(within(dialog).getAllByText('Полные')[0]);
    await user.click(within(dialog).getByRole('button', { name: 'Сохранить' }));

    await waitFor(() => {
      expect(document.querySelector('.electrical-spreadsheet')).toHaveClass('calc-spreadsheet--compact');
      expect(document.querySelector('.electrical-spreadsheet')?.textContent).toContain('Расчётный ток, А');
    });
    const stored = JSON.parse(
      localStorage.getItem(ELECTRICAL_GUEST_TABLE_VIEW_STORAGE_KEY) ?? '{}',
    );
    expect(stored).toMatchObject({
      fontSize: 'compact',
      tableLabelFormat: 'full',
      settingsLabelFormat: 'full',
      calculationCableSource: 'builtin',
    });
    expect(stored).not.toHaveProperty('cablePickerObjectFields');
    expect(stored).not.toHaveProperty('cablePickerCableFields');
  });

  it('не показывает настройку характеристик выбора марки и не выводит служебный источник', async () => {
    const { getElectricalPage } = await import('@/api/calculations');
    const user = (await import('@testing-library/user-event')).default.setup();
    (getElectricalPage as ReturnType<typeof vi.fn>).mockResolvedValue(makeElectricalPage([makeObject()]));
    useProjectStore.getState().setCurrentProject(mockProject);
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Настройки' })).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: 'Настройки' }));
    const dialog = await screen.findByRole('dialog', { name: 'Настройки таблицы электрорасчёта' });
    expect(within(dialog).queryByRole('tab', { name: 'Выбор кабеля' })).not.toBeInTheDocument();
    expect(within(dialog).queryByText('Строка объекта')).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('tab', { name: 'Строка кабеля' })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('list', { name: 'Поля строки объекта' })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('list', { name: 'Поля строки кабеля' })).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Сохранить' }));

    const row = await screen.findByRole('row', { name: /Труба-1/ });
    fireEvent.click(row);
    await user.click(within(row).getByRole('button', { name: 'Выбор' }));
    const pickerDialog = await screen.findByRole('dialog', { name: /Выбор марки кабеля/ });
    expect(within(pickerDialog).queryByRole('table', { name: 'Характеристики объекта и кабеля' })).not.toBeInTheDocument();
    const cableCharacteristics = within(pickerDialog).getByRole('group', { name: 'Характеристики: кабель' });
    expect(cableCharacteristics).not.toHaveTextContent('Источник');
    expect(cableCharacteristics).not.toHaveTextContent('Склад:');
    expect(cableCharacteristics).toHaveTextContent('Бренд:');
  });

  it('открывает окно выбора марки уже без отдельной верхней секции', async () => {
    const { getElectricalPage } = await import('@/api/calculations');
    const user = (await import('@testing-library/user-event')).default.setup();
    (getElectricalPage as ReturnType<typeof vi.fn>).mockResolvedValue(makeElectricalPage([makeObject()]));
    useProjectStore.getState().setCurrentProject(mockProject);
    renderPage();

    const row = await screen.findByRole('row', { name: /Труба-1/ });
    fireEvent.click(row);
    await user.click(within(row).getByRole('button', { name: 'Выбор' }));
    expect(await screen.findByRole('dialog', { name: /Выбор марки кабеля/ })).toBeInTheDocument();

    const modalRoot = document.querySelector('.electrical-cable-picker-dialog') as HTMLElement;
    expect(modalRoot.style.width).toBe('min(92vw, 1056px)');
    expect(document.querySelector('.electrical-cable-picker-drag-bar')).not.toBeInTheDocument();
    expect(document.querySelector('.electrical-cable-picker-window')).not.toBeInTheDocument();
  });

});

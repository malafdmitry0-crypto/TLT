import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { useAuthStore } from '@/store/authStore';
import { useCalculationVariantStore } from '@/store/calculationVariantStore';
import { useProjectStore } from '@/store/projectStore';
import { ELECTRICAL_GUEST_TABLE_COLUMN_STORAGE_KEY } from '@/utils/electricalTableColumns';
import { ELECTRICAL_TABLE_ENGINE_STORAGE_KEY } from '@/utils/electricalTableEngine';
import { mockProject, makeObject, makeElectricalPage, renderPage } from '@/__tests__/integration/pages/electrical/elecCalcPageHarness';
import { apiMocks, electricalVariantApiMocks, defaultElectricalVariantListImplementation, electricalGlideGridMock, electricalAssignmentPanelMock } from '@/__tests__/integration/pages/electrical/elecCalcPageTestEnv';
import '@/__tests__/integration/pages/electrical/elecCalcPageTestEnv';

describe('ElecCalcPage catalog / recalculation / selection', () => {
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

  it('копирует выбранный ЭР по UUID без запуска batch-пересчёта', async () => {
    const {
      enqueueElectricalBatchJob,
      getElectricalPage,
      listElectricalCandidateFolders,
      listElectricalCandidates,
      selectCableForVariants,
    } = await import('@/api/calculations');
    (getElectricalPage as ReturnType<typeof vi.fn>).mockResolvedValue(makeElectricalPage(
      [makeObject()],
      [
        {
          id: 'calc-1',
          object_id: 'o-1',
          cable_type: 'self_regulating',
          cable_type_source: 'auto',
          cable_mark: 'ТЛТ-25',
          cable_mark_source: 'auto',
          cable_snapshot: null,
          cable_snapshot_status: null,
          variant_number: 1,
          params: {},
          results: { selected_cable: 'ТЛТ-25', order_cable_length: 10 },
        },
      ],
      { total_objects: 2, electrical_calculations_total: 1 },
    ));
    const fifthVariant = {
      id: '55555555-5555-4555-8555-555555555555',
      project_id: 'p-1',
      name: 'Копия ЭР1',
      sort_order: 4,
      is_active: false,
      copied_from_id: '11111111-1111-4111-8111-111111111111',
      legacy_variant_number: null,
      specification_state: 'not_generated',
      created_at: '2026-07-18T10:00:00Z',
      updated_at: '2026-07-18T10:00:00Z',
    };
    const defaultList = electricalVariantApiMocks.list.getMockImplementation();
    const initialVariants = await defaultList!();
    let copyCreated = false;
    electricalVariantApiMocks.list.mockImplementation(async () =>
      copyCreated ? [...initialVariants, fifthVariant] : initialVariants);
    electricalVariantApiMocks.copy.mockImplementation(async () => {
      copyCreated = true;
      return fifthVariant;
    });
    useProjectStore.getState().setCurrentProject(mockProject);
    const user = (await import('@testing-library/user-event')).default.setup();
    renderPage();

    const copyButton = await screen.findByRole('button', {
      name: /Создать копию выбранного ЭР «ЭР1»/i,
    });
    await waitFor(() => expect(copyButton).toBeEnabled());
    const pageCallsBeforeCopy = (getElectricalPage as ReturnType<typeof vi.fn>).mock.calls.length;
    const capabilityCallsBeforeCopy = apiMocks.electricalCapabilities.mock.calls.length;
    const candidateCallsBeforeCopy = (listElectricalCandidates as ReturnType<typeof vi.fn>)
      .mock.calls.length;
    const folderCallsBeforeCopy = (listElectricalCandidateFolders as ReturnType<typeof vi.fn>)
      .mock.calls.length;

    await user.click(copyButton);

    await waitFor(() => {
      expect(electricalVariantApiMocks.copy).toHaveBeenCalledWith(
        'p-1',
        '11111111-1111-4111-8111-111111111111',
        {},
        expect.any(String),
      );
    });
    expect(await screen.findByText(/«Копия ЭР1»: расчётные действия временно недоступны/))
      .toBeInTheDocument();
    // Unified scope chrome lives inside calc workspace; UUID-only ER has no workspace yet.
    expect(screen.queryByTestId('electrical-assignment-panel')).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Копия ЭР1' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(document.querySelector('#electrical-variant-workspace')).toBeNull();
    expect((getElectricalPage as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(
      pageCallsBeforeCopy,
    );
    expect(apiMocks.electricalCapabilities).toHaveBeenCalledTimes(capabilityCallsBeforeCopy);
    expect(listElectricalCandidates).toHaveBeenCalledTimes(candidateCallsBeforeCopy);
    expect(listElectricalCandidateFolders).toHaveBeenCalledTimes(folderCallsBeforeCopy);
    expect(selectCableForVariants).not.toHaveBeenCalled();
    expect(enqueueElectricalBatchJob).not.toHaveBeenCalled();
  });

  it('показывает lifecycle error и не повторяет copy с новой семантикой', async () => {
    const { getElectricalPage } = await import('@/api/calculations');
    (getElectricalPage as ReturnType<typeof vi.fn>).mockResolvedValue(makeElectricalPage([makeObject()]));
    electricalVariantApiMocks.copy.mockRejectedValueOnce(
      new Error('Копирование требует UUID cutover'),
    );
    useProjectStore.getState().setCurrentProject(mockProject);
    const user = (await import('@testing-library/user-event')).default.setup();
    renderPage();

    const copyButton = await screen.findByRole('button', {
      name: /Создать копию выбранного ЭР «ЭР1»/i,
    });
    await waitFor(() => expect(copyButton).toBeEnabled());
    await user.click(copyButton);

    expect(await screen.findByText('Копирование требует UUID cutover')).toBeInTheDocument();
    expect(electricalVariantApiMocks.copy).toHaveBeenCalledTimes(1);
  });

  it('при выключенных commercial features сохраняет технический каталог ТТ', async () => {
    vi.stubEnv('VITE_COMMERCIAL_FEATURES_ENABLED', 'false');
    const { enqueueElectricalBatchJob, getElectricalPage } = await import('@/api/calculations');
    const { getCablesTt, getResistiveCables } = await import('@/api/references');
    (getElectricalPage as ReturnType<typeof vi.fn>).mockResolvedValue(makeElectricalPage([makeObject()]));
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
      expect(screen.getByText(/Тип для пересчёта/i)).toBeInTheDocument();
      expect(screen.getByText('Труба-1')).toBeInTheDocument();
    });
    expect(screen.getByText('ТТН/ТТВ/ТТХ')).toBeInTheDocument();
    expect(getCablesTt).not.toHaveBeenCalled();
    expect(getResistiveCables).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: /Пересчитать все · ЭР1/i }));
    await user.click(await screen.findByRole('button', { name: /Да, пересчитать все/i }));

    await waitFor(() => {
      expect(enqueueElectricalBatchJob).toHaveBeenCalledWith(
        'p-1',
        'builtin',
        1,
        'self_regulating_tt',
        expect.objectContaining({
          forceCableType: true,
          objectOverrides: undefined,
          selectionMode: undefined,
          skipManual: true,
        }),
      );
    });
  });

  it('селектор типа кабеля оставляет доступным только подтверждённый ТТ-каталог', async () => {
    const { getElectricalPage } = await import('@/api/calculations');
    (getElectricalPage as ReturnType<typeof vi.fn>).mockResolvedValue(makeElectricalPage([makeObject()]));
    useProjectStore.getState().setCurrentProject(mockProject);
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/Тип для пересчёта/i)).toBeInTheDocument();
      expect(screen.getByText('Труба-1')).toBeInTheDocument();
    });
    const rowCheckbox = document.querySelector('tbody .ant-checkbox-input') as HTMLInputElement;
    fireEvent.click(rowCheckbox);
    const selectors = document.querySelectorAll('.ant-select-selector');
    const cableTypeSelect = Array.from(selectors).find((el) =>
      el.textContent?.includes('ТТН/ТТВ/ТТХ')
    );
    expect(cableTypeSelect).toBeTruthy();
    expect(screen.queryByText(/Однож. пост. мощн./i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Трёхж. пост. мощн./i)).not.toBeInTheDocument();
  });

  it('применяет выбранный сверху тип ко всем объектам при полном пересчёте', async () => {
    const { enqueueElectricalBatchJob, getElectricalPage } = await import('@/api/calculations');
    (getElectricalPage as ReturnType<typeof vi.fn>).mockResolvedValue(makeElectricalPage([makeObject()]));
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
      expect(screen.getByText(/Тип для пересчёта/i)).toBeInTheDocument();
      expect(screen.getByText('Труба-1')).toBeInTheDocument();
    });
    expect(screen.getByText('ТТН/ТТВ/ТТХ')).toBeInTheDocument();
    await user.type(await screen.findByLabelText('T3 поддержания'), '50');
    await user.click(screen.getByRole('button', { name: /Пересчитать все · ЭР1/i }));
    await user.click(await screen.findByRole('button', { name: /Да, пересчитать все/i }));

    await waitFor(() => {
      expect(enqueueElectricalBatchJob).toHaveBeenCalledWith(
        'p-1',
        'builtin',
        1,
        'self_regulating_tt',
        expect.objectContaining({
          aggressiveProduct: false,
          maintainTemperature: 50,
          forceCableType: true,
          skipManual: true,
        }),
      );
    });
    const options = (enqueueElectricalBatchJob as ReturnType<typeof vi.fn>).mock.calls[0][4];
    expect(options.objectIds).toBeUndefined();
    expect(options.objectOverrides).toBeUndefined();
  });

  it('пересчитывает только выбранную строку без лишнего override при единственном типе', async () => {
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
          cable_type: 'self_regulating_tt',
          cable_mark: '30ТТВ2-СТ',
          variant_number: 1,
          results: { selected_cable: '30ТТВ2-СТ' },
        },
        {
          id: 'c-2',
          object_id: 'o-2',
          cable_type: 'self_regulating_tt',
          cable_mark: '30ТТВ2-СТ',
          variant_number: 1,
          results: { selected_cable: '30ТТВ2-СТ' },
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
    localStorage.setItem(ELECTRICAL_GUEST_TABLE_COLUMN_STORAGE_KEY, JSON.stringify({
      version: 1,
      visibleOrder: ['index', 'object_name', 'cable_type', 'cable_mark'],
      columns: { cable_type: { widthPct: 13 } },
    }));
    const user = (await import('@testing-library/user-event')).default.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Труба-1')).toBeInTheDocument();
      expect(screen.getByText('Труба-2')).toBeInTheDocument();
    });
    expect(screen.getByRole('row', { name: /Труба-1/ })).toHaveTextContent('ТТН/ТТВ/ТТХ');
    expect(screen.getByRole('row', { name: /Труба-2/ })).toHaveTextContent('ТТН/ТТВ/ТТХ');
    const firstRow = screen.getByRole('row', { name: /Труба-1/ });
    fireEvent.click(within(firstRow).getByRole('checkbox'));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Пересчитать выбранные \(1\)/i })).toBeInTheDocument();
    });
    await user.type(await screen.findByLabelText('T3 поддержания'), '50');

    expect(screen.getAllByText('ТТН/ТТВ/ТТХ').length).toBeGreaterThan(0);
    expect(screen.getByRole('row', { name: /Труба-1/ })).toHaveTextContent('ТТН/ТТВ/ТТХ');
    expect(screen.getByRole('row', { name: /Труба-2/ })).toHaveTextContent('ТТН/ТТВ/ТТХ');
    await user.click(screen.getByRole('button', { name: /Пересчитать выбранные \(1\)/i }));

    await waitFor(() => {
      expect(enqueueElectricalBatchJob).toHaveBeenCalledWith(
        'p-1',
        'builtin',
        1,
        'self_regulating_tt',
        expect.objectContaining({
          maintainTemperature: 50,
          objectIds: ['o-1'],
          objectOverrides: undefined,
          skipManual: true,
        }),
      );
    });
  });

  it('не показывает источник ручного выбора в колонке марки', async () => {
    const { getElectricalPage } = await import('@/api/calculations');
    const objects = [
      makeObject({ id: 'o-1', params: { name: 'Труба-1' } }),
      makeObject({ id: 'o-2', sort_order: 1, params: { name: 'Труба-2' } }),
    ];
    (getElectricalPage as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeElectricalPage(objects, [
        {
          id: 'c-1',
          object_id: 'o-1',
          cable_type: 'self_regulating_tt',
          cable_mark: '30ТТВ2-СТ',
          cable_mark_source: 'manual',
          variant_number: 1,
          results: { selected_cable: '30ТТВ2-СТ' },
        },
        {
          id: 'c-2',
          object_id: 'o-2',
          cable_type: 'self_regulating_tt',
          cable_mark: '30ТТВ2-СТ',
          cable_mark_source: 'auto',
          variant_number: 1,
          results: { selected_cable: '30ТТВ2-СТ' },
        },
      ]),
    );
    useProjectStore.getState().setCurrentProject(mockProject);
    localStorage.setItem(ELECTRICAL_GUEST_TABLE_COLUMN_STORAGE_KEY, JSON.stringify({
      version: 1,
      visibleOrder: ['index', 'object_name', 'cable_type', 'cable_mark'],
      columns: { cable_mark: { widthPct: 18 } },
    }));
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('row', { name: /Труба-1/ })).toHaveTextContent('30ТТВ2-СТ');
      expect(screen.getByRole('row', { name: /Труба-1/ })).not.toHaveTextContent('ручн.');
      expect(screen.getByRole('row', { name: /Труба-2/ })).not.toHaveTextContent('ручн.');
    });
  });

  it('показывает в активной ячейке марки кнопки выбора и подбора', async () => {
    const {
      createElectricalCandidate,
      getElectricalPage,
      listElectricalCandidates,
    } = await import('@/api/calculations');
    const user = (await import('@testing-library/user-event')).default.setup();
    (listElectricalCandidates as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (createElectricalCandidate as ReturnType<typeof vi.fn>).mockResolvedValue({
      action: 'created',
      candidate: {
        id: 'cand-1',
        project_id: 'p-1',
        object_id: 'o-1',
        variant_number: 1,
        cable_type: 'self_regulating_tt',
        cable_source: 'builtin',
        cable_mark: '30ТТВ2-СТ',
        dedupe_key: 'v1:test',
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
        results: { total_power: 1000, order_cable_length: 55 },
        cable_snapshot: null,
        warnings: [],
        risk_flags: [],
        candidate_meta: {},
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
    });
    (getElectricalPage as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeElectricalPage([makeObject({ params: { name: 'Труба-1' } })], [
        {
          id: 'c-1',
          object_id: 'o-1',
          cable_type: 'self_regulating_tt',
          cable_mark: '30ТТВ2-СТ',
          cable_mark_source: 'manual',
          cable_snapshot: {
            cable_mark: '30ТТВ2-СТ',
            cable_type: 'self_regulating_tt',
            actual_catalog_source: 'builtin',
            technical: {
              model: '30ТТВ2',
              brand: 'ТТВ',
              voltage: 220,
              nominal_power: 30,
              q1: -0.141,
              q2: 32,
              max_product_temp: 120,
              max_vapor_temp: 210,
            },
          },
          variant_number: 1,
          results: { selected_cable: '30ТТВ2-СТ' },
        },
      ]),
    );
    useProjectStore.getState().setCurrentProject(mockProject);
    localStorage.setItem(ELECTRICAL_GUEST_TABLE_COLUMN_STORAGE_KEY, JSON.stringify({
      version: 1,
      visibleOrder: ['index', 'object_name', 'cable_mark'],
      columns: { cable_mark: { widthPct: 22 } },
    }));
    renderPage();

    const row = await screen.findByRole('row', { name: /Труба-1/ });
    fireEvent.click(row);

    expect(row).toHaveTextContent('30ТТВ2-СТ');
    expect(row).not.toHaveTextContent('ручн.');
    expect(within(row).getByRole('button', { name: 'Выбор' })).toBeEnabled();
    const sizingButton = within(row).getByRole('button', { name: 'Подбор' });
    expect(sizingButton).toBeEnabled();

    await user.click(sizingButton);
    const sizingDialog = await screen.findByRole('dialog', { name: /Подбор кабеля для/ });
    expect(sizingDialog).toBeInTheDocument();
    expect(within(sizingDialog).queryByRole('group', { name: 'Характеристики: кабель' })).not.toBeInTheDocument();
    const objectCharacteristics = within(sizingDialog).getByRole('group', { name: 'Характеристики: объект' });
    expect(objectCharacteristics).toHaveTextContent('Тип объекта:');
    expect(objectCharacteristics).toHaveTextContent('Труба');
    expect(objectCharacteristics).toHaveTextContent('Диаметр:');
    expect(objectCharacteristics).toHaveTextContent('Длина:');
    expect(
      (objectCharacteristics.querySelector('.cable-picker-characteristics-columns') as HTMLElement)
        .style
        .getPropertyValue('--cable-picker-characteristics-column-count'),
      ).toBe('4');
    expect(within(sizingDialog).getByRole('radio', { name: 'Авторасчёт' })).toBeChecked();
    // findAllByText: таблица кандидатов рендерится асинхронно — под нагрузкой
    // полного прогона getAllByText успевал отработать до её появления (flaky).
    expect((await within(sizingDialog).findAllByText('Пометка')).length).toBeGreaterThan(0);
    expect(within(sizingDialog).getAllByText('Действия').length).toBeGreaterThan(0);
    expect(within(sizingDialog).queryByRole('columnheader', { name: 'Статус' })).not.toBeInTheDocument();
    expect(within(sizingDialog).getAllByText('T3, °C').length).toBeGreaterThan(0);
    expect(within(sizingDialog).getAllByText('T проп., °C').length).toBeGreaterThan(0);
    expect(within(sizingDialog).getAllByText('Агр.').length).toBeGreaterThan(0);
    expect(within(sizingDialog).getAllByText('Мощность, Вт').length).toBeGreaterThan(0);
    expect(within(sizingDialog).getAllByText('Ток, А').length).toBeGreaterThan(0);
    expect(within(sizingDialog).getAllByText('U расч., В').length).toBeGreaterThan(0);
    await waitFor(() => {
      expect(listElectricalCandidates).toHaveBeenCalledWith(
        'p-1',
        'o-1',
        1,
        '11111111-1111-4111-8111-111111111111',
      );
    });
    expect(createElectricalCandidate).not.toHaveBeenCalled();
    const autoButton = within(sizingDialog).getByRole('button', { name: 'Запустить авторасчёт' });
    expect(autoButton).toBeEnabled();
    expect(within(sizingDialog).getByText(/Вариантов пока нет/)).toBeInTheDocument();
    await user.click(autoButton);
    await waitFor(() => {
      expect(createElectricalCandidate).toHaveBeenCalledWith(expect.objectContaining({
        project_id: 'p-1',
        object_id: 'o-1',
        variant_number: 1,
        electrical_variant_id: '11111111-1111-4111-8111-111111111111',
        cable_type: 'self_regulating_tt',
        mode: 'auto',
        cable_mark: null,
      }));
    });
    expect(within(sizingDialog).queryByRole('button', { name: 'Применить' })).not.toBeInTheDocument();
  });

});

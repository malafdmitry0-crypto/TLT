import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { useAuthStore } from '@/store/authStore';
import { useProjectStore } from '@/store/projectStore';
import type { ElectricalCalcSummary } from '@/types/calculation';
import { ELECTRICAL_GUEST_TABLE_COLUMN_STORAGE_KEY } from '@/utils/electricalTableColumns';
import { ELECTRICAL_TABLE_ENGINE_STORAGE_KEY } from '@/utils/electricalTableEngine';
import { mockProject, makeObject, makeElectricalPage, renderPage } from '@/__tests__/integration/pages/electrical/elecCalcPageHarness';
import { apiMocks, electricalGlideGridMock, electricalAssignmentPanelMock, resetElecCalcIntegrationState } from '@/__tests__/integration/pages/electrical/elecCalcPageTestEnv';
import '@/__tests__/integration/pages/electrical/elecCalcPageTestEnv';

describe('ElecCalcPage table / pagination / batch / copy', () => {
  beforeEach(() => {
    resetElecCalcIntegrationState();
  });

  it('сохраняет таблицы и настройки, но блокирует project-write действия для чужого employee', async () => {
    const user = (await import('@testing-library/user-event')).default.setup();
    const {
      createElectricalCandidate,
      getElectricalPage,
      selectCableForVariants,
    } = await import('@/api/calculations');
    (getElectricalPage as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeElectricalPage([makeObject()]),
    );
    useAuthStore.getState().setEmployee({
      id: 'viewer-1',
      email: 'viewer@example.test',
      full_name: null,
      role: 'employee',
      is_active: true,
    }, { access: 'token' });
    useProjectStore.getState().setCurrentProject({
      ...mockProject,
      user_id: 'owner-2',
      session_id: null,
    });

    renderPage();

    expect(await screen.findByText('Режим просмотра')).toBeInTheDocument();
    expect(await screen.findByText('Труба-1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Пересчитать выбранные \(0\)/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Пересчитать все · ЭР1/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Настройки' })).not.toBeDisabled();
    // Default: wide params panel off — compact controls in action bar.
    // TltSelect (Ant): aria-label on root + combobox; disabled via data-disabled / ant-select-disabled.
    const isTltSelectDisabled = (el: HTMLElement) =>
      el.getAttribute('data-disabled') === 'true'
      || el.getAttribute('aria-disabled') === 'true'
      || el.classList.contains('ant-select-disabled')
      || el.closest('.ant-select')?.classList.contains('ant-select-disabled') === true
      || el.closest('[data-disabled="true"]') != null
      || el.hasAttribute('disabled')
      || (el as HTMLButtonElement | HTMLInputElement).disabled === true;
    const cableTypeForRecalc = screen.getAllByLabelText('Тип кабеля для пересчёта')[0];
    expect(isTltSelectDisabled(cableTypeForRecalc)).toBeTruthy();
    expect(screen.getAllByLabelText('Напряжение питания')[0]).toBeDisabled();

    await user.click(screen.getByRole('checkbox', { name: 'Расширенные параметры' }));
    const cableTypeWide = screen.getAllByLabelText('Тип кабеля')[0];
    expect(isTltSelectDisabled(cableTypeWide)).toBeTruthy();
    expect(screen.getAllByLabelText('Напряжение питания')[0]).toBeDisabled();

    await user.click(screen.getByText('Труба-1'));
    expect(await screen.findByRole('button', { name: 'Выбор' })).toBeDisabled();
    const sizing = screen.getByRole('button', { name: 'Подбор' });
    expect(sizing).not.toBeDisabled();
    await user.click(sizing);

    expect(await screen.findByRole('dialog', { name: /Подбор кабеля для Труба-1/ }))
      .toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Запустить авторасчёт' })).toBeDisabled();
    expect(screen.getByLabelText('Комментарий к выбранному кандидату')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Настройки таблицы' })).not.toBeDisabled();

    expect(apiMocks.enqueueVariantBatch).not.toHaveBeenCalled();
    expect(selectCableForVariants).not.toHaveBeenCalled();
    expect(createElectricalCandidate).not.toHaveBeenCalled();
  });

  it('показывает ошибку теплопотерь круглым icon-tag, а не текстовым badge', async () => {
    const { getElectricalPage } = await import('@/api/calculations');
    localStorage.setItem(ELECTRICAL_GUEST_TABLE_COLUMN_STORAGE_KEY, JSON.stringify({
      version: 1,
      visibleOrder: ['index', 'object_name', 'heat_loss_status', 'electrical_status'],
    }));
    (getElectricalPage as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeElectricalPage([
        makeObject({
          params: { name: 'Резервуар с ошибкой теплопотерь' },
          is_valid: false,
          validation_errors: {
            category: 'validation',
            message: 'Не заполнена геометрия резервуара',
          },
        }),
      ]),
    );
    useProjectStore.getState().setCurrentProject(mockProject);

    renderPage();

    const row = await screen.findByRole('row', { name: /Резервуар с ошибкой теплопотерь/ });
    expect(within(row).getByLabelText('Ошибка')).toBeInTheDocument();
    expect(within(row).queryByText(/^Ошибка$/)).not.toBeInTheDocument();
  });

  it('при открытии вкладки не подставляет марку и не запускает электрорасчёт без явного действия', async () => {
    const {
      batchCalcElectrical,
      enqueueElectricalBatchJob,
      getElectricalPage,
      selectCableForVariants,
    } = await import('@/api/calculations');
    localStorage.setItem(ELECTRICAL_GUEST_TABLE_COLUMN_STORAGE_KEY, JSON.stringify({
      version: 1,
      visibleOrder: [
        'index',
        'object_name',
        'electrical_status',
        'cable_type',
        'cable_mark',
        'installed_cable_length',
        'total_power',
        'current',
      ],
    }));
    (getElectricalPage as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeElectricalPage([makeObject({ params: { name: 'Труба без электрорасчёта' } })]),
    );
    useProjectStore.getState().setCurrentProject(mockProject);

    renderPage();

    const row = await screen.findByRole('row', { name: /Труба без электрорасчёта/ });
    expect(row).not.toHaveTextContent('Авто');
    expect(row).not.toHaveTextContent('Саморегулирующийся');
    expect(row).toHaveTextContent('—');
    expect(batchCalcElectrical).not.toHaveBeenCalled();
    expect(enqueueElectricalBatchJob).not.toHaveBeenCalled();
    expect(selectCableForVariants).not.toHaveBeenCalled();
  });

  it('для stale электрорасчёта не показывает старую марку и старые результаты как актуальные', async () => {
    const { getElectricalPage } = await import('@/api/calculations');
    localStorage.setItem(ELECTRICAL_GUEST_TABLE_COLUMN_STORAGE_KEY, JSON.stringify({
      version: 1,
      visibleOrder: [
        'index',
        'object_name',
        'electrical_status',
        'cable_mark',
        'winding_pitch_mm',
        'number_of_threads',
        'installed_cable_length',
        'order_cable_length',
        'total_power',
        'current',
      ],
    }));
    (getElectricalPage as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeElectricalPage([makeObject({ params: { name: 'Труба со старым расчётом' } })], [
        {
          id: 'calc-stale',
          object_id: 'o-1',
          cable_type: 'self_regulating',
          cable_mark: 'ТЛТ-30',
          cable_mark_source: 'auto',
          variant_number: 1,
          results: {
            selected_cable: 'ТЛТ-30',
            category: 'stale',
            error_code: 'stale_electrical_calculation',
            message: 'Теплопотери объекта изменились. Пересчитайте электрорасчёт.',
            stale: true,
            winding_pitch: 0,
            num_circuits: 2,
            installed_cable_length: 10,
            order_cable_length: 11,
            total_power: 600,
            current: 2.7,
          },
        },
      ]),
    );
    useProjectStore.getState().setCurrentProject(mockProject);

    renderPage();

    const row = await screen.findByRole('row', { name: /Труба со старым расчётом/ });
    expect(screen.getByLabelText('Требуется пересчёт')).toBeInTheDocument();
    expect(row).not.toHaveTextContent('ТЛТ-30');
    expect(row).not.toHaveTextContent('600');
    expect(row).not.toHaveTextContent('2.7');
  });

  it('показывает сообщения ошибок в отдельной области, а не колонкой таблицы', async () => {
    const { getElectricalPage } = await import('@/api/calculations');
    const user = (await import('@testing-library/user-event')).default.setup();
    const firstObject = makeObject({
      id: 'o-error-1',
      params: { name: 'Резервуар со сферой 1' },
    });
    const secondObject = makeObject({
      id: 'o-error-2',
      params: { name: 'Резервуар со сферой 2' },
    });
    (getElectricalPage as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeElectricalPage([firstObject, secondObject], [
        {
          id: 'c-error-1',
          object_id: firstObject.id,
          cable_type: 'self_regulating',
          cable_mark: null,
          variant_number: 1,
          results: {
            error_code: 'unsupported_layout',
            category: 'unsupported',
            message:
              'Электрорасчёт укладки кабеля для сферического резервуара не применим: формула укладки не определена.',
            hint:
              'Теплопотери доступны, но формула укладки кабеля для сферического резервуара не утверждена.',
            suggested_actions: [],
          },
        },
        {
          id: 'c-error-2',
          object_id: secondObject.id,
          cable_type: 'self_regulating',
          cable_mark: null,
          variant_number: 1,
          results: {
            error_code: 'POWER_TOO_HIGH',
            category: 'formula',
            message: 'Не найден кабель с мощностью ≥ 132.67 Вт/м с учётом навива и количества ниток',
            suggested_actions: ['TRY_OTHER_CABLE_TYPE'],
          },
        },
      ]),
    );
    useProjectStore.getState().setCurrentProject(mockProject);
    renderPage();

    const errorRegion = await screen.findByLabelText('Сообщения ошибок электрорасчёта');
    expect(screen.getByLabelText('Не применимо')).toBeInTheDocument();
    expect(errorRegion).toHaveTextContent('Ошибок: 1');
    expect(errorRegion).not.toHaveTextContent('Резервуар со сферой 1');
    expect(errorRegion).not.toHaveTextContent('геометрия укладки кабеля');
    expect(errorRegion).not.toHaveTextContent('CalculationError');
    expect(document.querySelector('.electrical-spreadsheet')?.textContent).not.toContain('Сообщение');

    await user.click(screen.getByText('Резервуар со сферой 2'));
    await waitFor(() => {
      expect(errorRegion).not.toHaveTextContent('Резервуар со сферой 2');
      expect(errorRegion).toHaveTextContent('Не найден кабель с мощностью');
      expect(errorRegion).toHaveTextContent('Мощность выше линейки');
      expect(errorRegion).toHaveTextContent('Попробовать другой тип кабеля');
      expect(errorRegion).not.toHaveTextContent('Попробовать 2 нитки');
      expect(errorRegion).not.toHaveTextContent('Попробовать 3 нитки');
    });
  });

  it('пагинирует таблицу электрики, чтобы не рендерить все строки сразу', async () => {
    const { getElectricalPage } = await import('@/api/calculations');
    const objects = Array.from({ length: 80 }, (_, index) =>
      makeObject({
        id: `o-${index + 1}`,
        sort_order: index,
        params: { name: `Труба-${index + 1}` },
      })
    );
    (getElectricalPage as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeElectricalPage(
        objects.slice(0, 50),
        [],
        { total_objects: 80, valid_objects: 80, invalid_objects: 0 },
        { total_pages: 2, has_next_page: true },
      ),
    );
    useProjectStore.getState().setCurrentProject(mockProject);
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('1-50 из 80')).toBeInTheDocument();
    });
    expect(screen.getByText('Труба-1')).toBeInTheDocument();
    expect(screen.getByText('Труба-50')).toBeInTheDocument();
    expect(screen.queryByText('Труба-51')).not.toBeInTheDocument();
    expect(document.querySelector('.ant-pagination')).toBeTruthy();
  });

  it('в Glide-режиме догружает следующую cursor-порцию в бесконечный список', async () => {
    const { getElectricalPage } = await import('@/api/calculations');
    const objects = Array.from({ length: 80 }, (_, index) =>
      makeObject({
        id: `o-${index + 1}`,
        sort_order: index,
        params: { name: `Труба-${index + 1}` },
      })
    );
    (getElectricalPage as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(
        makeElectricalPage(
          objects.slice(0, 50),
          [],
          { total_objects: 80, valid_objects: 80, invalid_objects: 0 },
          {
            total_pages: 2,
            has_next_page: true,
            next_cursor: { id: 'o-50', sort_order: 49 },
          },
        ),
      )
      .mockResolvedValueOnce(
        makeElectricalPage(
          objects.slice(50),
          [],
          { total_objects: 80, valid_objects: 80, invalid_objects: 0 },
          {
            page: 2,
            offset: 50,
            total_pages: 2,
            has_previous_page: true,
            has_next_page: false,
          },
        ),
      );
    localStorage.setItem(ELECTRICAL_TABLE_ENGINE_STORAGE_KEY, 'glide');
    useProjectStore.getState().setCurrentProject(mockProject);
    renderPage();

    await screen.findByTestId('electrical-glide-grid-mock');
    await waitFor(() => {
      expect(electricalGlideGridMock.props?.infiniteLoading).toMatchObject({
        loaded: 50,
        total: 80,
        hasNextPage: true,
      });
      expect(electricalGlideGridMock.props?.rows).toHaveLength(50);
    });

    fireEvent.click(screen.getByRole('button', { name: 'Догрузить строки' }));

    await waitFor(() => {
      expect(getElectricalPage).toHaveBeenCalledWith(expect.objectContaining({
        page: 2,
        page_size: 50,
        after_sort_order: 49,
        after_id: 'o-50',
      }));
    });
    await waitFor(() => {
      expect(electricalGlideGridMock.props?.infiniteLoading).toMatchObject({
        loaded: 80,
        total: 80,
        hasNextPage: false,
      });
      expect(electricalGlideGridMock.props?.rows).toHaveLength(80);
    });
  });

  it('ставит batch ТТ в очередь с electrical params, а не пустым набором', async () => {
    const { enqueueElectricalBatchJob, getElectricalPage } = await import('@/api/calculations');
    (getElectricalPage as ReturnType<typeof vi.fn>).mockResolvedValue(makeElectricalPage([makeObject()]));
    (enqueueElectricalBatchJob as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'task-1',
      type: 'electrical_batch',
      status: 'enqueued',
      project_id: 'p-1',
      electrical_variant_id: '11111111-1111-4111-8111-111111111111',
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
      expect(screen.getByRole('button', { name: /Пересчитать выбранные \(0\)/i })).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getByText('Труба-1')).toBeInTheDocument();
    });
    const rowCheckbox = document.querySelector('tbody .ant-checkbox-input') as HTMLInputElement;
    fireEvent.click(rowCheckbox);
    await user.click(screen.getByRole('button', { name: /Пересчитать выбранные \(1\)/i }));

    await waitFor(() => {
      expect(enqueueElectricalBatchJob).toHaveBeenCalledWith(
        'p-1',
        'builtin',
        1,
        'self_regulating_tt',
        expect.objectContaining({
          supplyVoltage: 220,
          windingCoefficient: 1,
          layingStep: 0.1,
          objectIds: ['o-1'],
          skipManual: true,
        }),
      );
    });
    expect(apiMocks.enqueueVariantBatch).toHaveBeenCalledWith(
      'p-1',
      '11111111-1111-4111-8111-111111111111',
      'builtin',
      'self_regulating_tt',
      expect.any(Object),
    );
    const options = (enqueueElectricalBatchJob as ReturnType<typeof vi.fn>).mock.calls[0][4];
    expect(options.objectOverrides).toBeUndefined();
  });

  it('fail-closed ограничивает row actions и explicit selected payload назначениями ЭР', async () => {
    const { getElectricalPage } = await import('@/api/calculations');
    const user = (await import('@testing-library/user-event')).default.setup();
    const objects = [
      makeObject({ id: 'o-compatible', params: { name: 'Совместимый объект' } }),
      makeObject({
        id: 'o-unassigned',
        sort_order: 1,
        params: { name: 'Нераспределённый объект' },
      }),
      makeObject({
        id: 'o-other-system',
        sort_order: 2,
        params: { name: 'Объект другой системы' },
      }),
      makeObject({
        id: 'o-three-core',
        sort_order: 3,
        params: { name: 'Трёхжильный объект' },
      }),
    ];
    const calculations: ElectricalCalcSummary[] = objects.map((object, index) => ({
      id: `calc-${index}`,
      object_id: object.id,
      cable_type: object.id === 'o-three-core' ? 'three_core' : 'self_regulating',
      cable_mark: object.id === 'o-three-core' ? 'ТТ Р3 x 0,5-0,6' : 'ТЛТ-20',
      variant_number: 1,
      results: { selected_cable: 'ТЛТ-20' },
    }));
    (getElectricalPage as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeElectricalPage(
        objects,
        calculations,
        {},
        {},
        [
          {
            object_id: 'o-compatible',
            system_type: 'self_regulating',
            assignment_state: 'stale',
            version: 4,
          },
          {
            object_id: 'o-unassigned',
            system_type: null,
            assignment_state: 'unassigned',
            version: 2,
          },
          {
            object_id: 'o-other-system',
            system_type: 'resistive',
            assignment_state: 'ready',
            version: 8,
          },
          {
            object_id: 'o-three-core',
            system_type: 'resistive',
            assignment_state: 'ready',
            version: 3,
          },
        ],
      ),
    );
    apiMocks.enqueueBatch.mockResolvedValue({
      id: 'task-assignment-scope',
      type: 'electrical_batch',
      status: 'enqueued',
      project_id: 'p-1',
      electrical_variant_id: '11111111-1111-4111-8111-111111111111',
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
    renderPage();

    const compatibleRow = await screen.findByRole('row', { name: /Совместимый объект/ });
    const compatibleCheckbox = within(compatibleRow).getByRole('checkbox');
    expect(compatibleCheckbox).toBeEnabled();
    expect(screen.queryByText('Нераспределённый объект')).not.toBeInTheDocument();
    expect(screen.queryByText('Объект другой системы')).not.toBeInTheDocument();

    electricalAssignmentPanelMock.initialSystemView = null;
    act(() => electricalAssignmentPanelMock.props?.onSystemViewChange?.('unassigned'));
    const unassignedRow = await screen.findByRole('row', { name: /Нераспределённый объект/ });
    expect(within(unassignedRow).getByRole('checkbox')).toBeEnabled();
    await user.click(within(unassignedRow).getByText('Нераспределённый объект'));
    expect(within(unassignedRow).getByRole('button', { name: 'Выбор' })).toBeDisabled();
    expect(within(unassignedRow).getByRole('button', { name: 'Подбор' })).toBeDisabled();

    act(() => electricalAssignmentPanelMock.props?.onSystemViewChange?.('resistive'));
    const otherSystemRow = await screen.findByRole('row', { name: /Объект другой системы/ });
    expect(within(otherSystemRow).getByRole('checkbox')).toBeDisabled();
    expect(within(otherSystemRow).getByRole('checkbox'))
      .toHaveAccessibleName(/Резистив.*совместимый тип/i);

    act(() => electricalAssignmentPanelMock.props?.onSystemViewChange?.('self_regulating'));
    const compatibleRowAfterSwitch = await screen.findByRole('row', { name: /Совместимый объект/ });
    const compatibleCheckboxAfterSwitch = within(compatibleRowAfterSwitch).getByRole('checkbox');
    fireEvent.click(compatibleCheckboxAfterSwitch);
    await user.click(screen.getByRole('button', { name: /Пересчитать выбранные \(1\)/i }));

    await waitFor(() => {
      expect(apiMocks.enqueueVariantBatch).toHaveBeenCalledWith(
        'p-1',
        '11111111-1111-4111-8111-111111111111',
        'builtin',
        'self_regulating_tt',
        expect.objectContaining({
          objectIds: ['o-compatible'],
        }),
      );
    });
  });

});

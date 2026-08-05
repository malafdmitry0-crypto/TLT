import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { useAuthStore } from '@/store/authStore';
import { useProjectStore } from '@/store/projectStore';
import { ELECTRICAL_GUEST_TABLE_COLUMN_STORAGE_KEY } from '@/utils/electricalTableColumns';
import { mockProject, makeObject, makeElectricalPage, renderPage } from '@/__tests__/integration/pages/electrical/elecCalcPageHarness';
import { apiMocks, resetElecCalcIntegrationState } from '@/__tests__/integration/pages/electrical/elecCalcPageTestEnv';
import '@/__tests__/integration/pages/electrical/elecCalcPageTestEnv';

describe('ElecCalcPage table / batch — permissions-status', () => {
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
    // Recalculation inputs live only in the compact action bar.
    // Селекта типа кабеля в панели нет — система задаётся вкладкой распределения
    expect(screen.queryByLabelText('Тип кабеля для пересчёта')).not.toBeInTheDocument();
    // U больше не контрол — проверяем блокировку на оставшихся полях укладки
    expect(screen.queryByLabelText('Напряжение питания')).not.toBeInTheDocument();
    expect(screen.getAllByLabelText('Высота обогрева резервуара')[0]).toBeDisabled();
    expect(screen.queryByRole('checkbox', { name: 'Расширенные параметры' }))
      .not.toBeInTheDocument();
    expect(screen.queryByTestId('eleccalc-params-panel')).not.toBeInTheDocument();
    expect(screen.queryByText('Кабель и схема подключения')).not.toBeInTheDocument();
    expect(screen.queryByText('Расчётные входы')).not.toBeInTheDocument();
    expect(screen.queryByText('Укладка кабеля')).not.toBeInTheDocument();

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
      params: { name: 'Резервуар с неизвестной геометрией' },
    });
    const secondObject = makeObject({
      id: 'o-error-2',
      params: { name: 'Резервуар с ошибкой мощности' },
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
              'Электрорасчёт укладки кабеля для неизвестной геометрии резервуара не применим.',
            hint:
              'Формула укладки кабеля для этой геометрии резервуара не определена.',
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
    expect(errorRegion).not.toHaveTextContent('Резервуар с неизвестной геометрией');
    expect(errorRegion).not.toHaveTextContent('геометрия укладки кабеля');
    expect(errorRegion).not.toHaveTextContent('CalculationError');
    expect(document.querySelector('.electrical-spreadsheet')?.textContent).not.toContain('Сообщение');

    await user.click(screen.getByText('Резервуар с ошибкой мощности'));
    await waitFor(() => {
      expect(errorRegion).not.toHaveTextContent('Резервуар с ошибкой мощности');
      expect(errorRegion).toHaveTextContent('Не найден кабель с мощностью');
      expect(errorRegion).toHaveTextContent('Мощность выше линейки');
      expect(errorRegion).toHaveTextContent('Попробовать другой тип кабеля');
      expect(errorRegion).not.toHaveTextContent('Попробовать 2 нитки');
      expect(errorRegion).not.toHaveTextContent('Попробовать 3 нитки');
    });
  });
});

import { describe, it, expect, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { useAuthStore } from '@/store/authStore';
import { useProjectStore } from '@/store/projectStore';
import {
  HEATCALC_REGISTERED_TABLE_COLUMN_CACHE_KEY,
  HEATCALC_TABLE_COLUMN_PREF_KEY,
  getDefaultTableColumnSettings,
} from '@/utils/heatCalcTableColumns';
import {
  HEATCALC_GUEST_TABLE_VIEW_STORAGE_KEY,
  HEATCALC_REGISTERED_TABLE_VIEW_CACHE_KEY,
  HEATCALC_TABLE_VIEW_PREF_KEY,
} from '@/utils/heatCalcTableViewSettings';
import {
  HEATCALC_CALCULATION_DETAILS_PREF_KEY,
  HEATCALC_REGISTERED_CALCULATION_DETAILS_CACHE_KEY,
} from '@/utils/heatCalcCalculationDetailsSettings';
import {
  HEATCALC_FIELD_INPUT_PREF_KEY,
  HEATCALC_REGISTERED_FIELD_INPUT_CACHE_KEY,
} from '@/utils/heatCalcFieldInputSettings';
import { HEATCALC_EXCEL_ENGINE_STORAGE_KEY } from '@/utils/heatCalcExcelEngine';
import {
  HEATCALC_PAGE_TEST_TIMEOUT,
  makeObject,
  mockProject,
  openTableSettingsDialog,
  openTableSettingsOtherTab,
  renderPage,
  setupHeatCalcPageTest,
} from './HeatCalcPage.test-utils';

describe('HeatCalcPage inline edit', () => {
  setupHeatCalcPageTest();

  describe('Inline-редактирование', () => {
    function useGlideExcelEngineForDomCellTest() {
      vi.stubEnv('VITE_COMMERCIAL_FEATURES_ENABLED', 'true');
      localStorage.setItem(HEATCALC_EXCEL_ENGINE_STORAGE_KEY, 'glide');
    }

    it('не показывает настройку inline-редактирования и игнорирует старый persisted inline flag', async () => {
      const { listObjects, updateObject } = await import('@/api/projects');
      (listObjects as ReturnType<typeof vi.fn>).mockResolvedValue([makeObject()]);
      localStorage.setItem('heatcalc.tableView.v1.guest', JSON.stringify({
        version: 1,
        fontSize: 'large',
        tableLabelFormat: 'short',
        settingsLabelFormat: 'full',
        inlineEditingEnabled: true,
        formPlacement: 'top',
        sideFormWidthPct: 34,
        formSectionWeights: [1.655, 1.35, 1.2],
      }));
      localStorage.setItem(HEATCALC_GUEST_TABLE_VIEW_STORAGE_KEY, JSON.stringify({
        version: 2,
        fontSize: 'standard',
        tableLabelFormat: 'short',
        settingsLabelFormat: 'full',
        inlineEditingEnabled: true,
        formPlacement: 'top',
        sideFormWidthPct: 34,
        formSectionWeights: [1.655, 1.35, 1.2],
      }));

      useProjectStore.getState().setCurrentProject(mockProject);
      const user = (await import('@testing-library/user-event')).default.setup();
      renderPage();

      await screen.findByText('Труба DN100');
      const table = document.querySelector<HTMLElement>('.calc-spreadsheet');
      expect(table).not.toBeNull();
      const tableElement = table!;

      const dialog = await openTableSettingsDialog(user);
      await openTableSettingsOtherTab(user, dialog);
      expect(within(dialog).queryByRole('checkbox', { name: 'Редактировать ячейки в таблице' }))
        .not.toBeInTheDocument();
      await user.click(within(dialog).getByRole('button', { name: 'Отмена' }));

      expect(within(tableElement).queryByRole('button', { name: 'Труба DN100' })).not.toBeInTheDocument();
      await user.dblClick(within(tableElement).getByText('Труба DN100'));
      expect(screen.queryByText(/Несохранено:/)).not.toBeInTheDocument();
      expect(document.querySelector('.row-dirty')).not.toBeInTheDocument();
      expect(document.querySelector('.editable-cell-enabled')).not.toBeInTheDocument();
      expect(updateObject).not.toHaveBeenCalled();
    }, HEATCALC_PAGE_TEST_TIMEOUT);

    it('в обычном режиме не создаёт dirty draft при кликах по табличным ячейкам', async () => {
      const { listObjects, updateObject } = await import('@/api/projects');
      (listObjects as ReturnType<typeof vi.fn>).mockResolvedValue([makeObject()]);

      useProjectStore.getState().setCurrentProject(mockProject);
      const user = (await import('@testing-library/user-event')).default.setup();
      renderPage();

      await screen.findByText('Труба DN100');
      const table = document.querySelector<HTMLElement>('.calc-spreadsheet');
      expect(table).not.toBeNull();
      const tableElement = table!;

      await user.dblClick(within(tableElement).getByText('60'));

      expect(within(tableElement).queryByDisplayValue('60.0')).not.toBeInTheDocument();
      expect(screen.queryByText(/Несохранено:/)).not.toBeInTheDocument();
      expect(document.querySelector('.row-dirty')).not.toBeInTheDocument();
      expect(updateObject).not.toHaveBeenCalled();
    }, HEATCALC_PAGE_TEST_TIMEOUT);

    it('в Excel-режиме не автосохраняет ячейку и подсвечивает только изменённую ячейку', async () => {
      useGlideExcelEngineForDomCellTest();
      const { listObjects, updateObject } = await import('@/api/projects');
      const source = makeObject();
      (listObjects as ReturnType<typeof vi.fn>).mockResolvedValue([source]);
      (updateObject as ReturnType<typeof vi.fn>).mockResolvedValue(
        makeObject({ params: { ...source.params, process_temperature: 70 } }),
      );

      useProjectStore.getState().setCurrentProject(mockProject);
      const user = (await import('@testing-library/user-event')).default.setup();
      renderPage();

      await screen.findByText('Труба DN100');
      await user.click(screen.getByText('Excel-режим'));

      const row = (await screen.findByText('Труба DN100')).closest('tr');
      expect(row).toBeInstanceOf(HTMLElement);
      const processCell = within(row as HTMLElement).getByRole('button', { name: '60' });
      await user.dblClick(processCell);
      const editor = await within(row as HTMLElement).findByDisplayValue('60.0');
      fireEvent.change(editor, { target: { value: '70' } });
      fireEvent.keyDown(editor, { key: 'Enter' });

      expect(updateObject).not.toHaveBeenCalled();
      const dirtyCell = await within(row as HTMLElement).findByRole('button', { name: '70' });
      expect(dirtyCell).toHaveClass('dirty');
      expect(row).toHaveClass('row-excel-dirty');
      expect(row).not.toHaveClass('row-dirty');
      expect(await screen.findByText('Несохранено: 1')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Сбросить все (1)' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Сохранить' })).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Сохранить' }));
      await waitFor(() => {
        expect(updateObject).toHaveBeenCalledWith(
          'proj-test-1',
          source.id,
          expect.objectContaining({
            params: expect.objectContaining({ process_temperature: 70 }),
          }),
        );
      });
    }, HEATCALC_PAGE_TEST_TIMEOUT);

    it('в Excel-режиме не показывает пустую таблицу, пока догружается полный список объектов', async () => {
      useGlideExcelEngineForDomCellTest();
      const { listObjects } = await import('@/api/projects');
      const source = makeObject();
      const previousRequestIdleCallback = window.requestIdleCallback;
      const previousCancelIdleCallback = window.cancelIdleCallback;
      window.requestIdleCallback = vi.fn(() => 1);
      window.cancelIdleCallback = vi.fn();
      let delayFullList = false;
      let resolveFullList: ((rows: ReturnType<typeof makeObject>[]) => void) | undefined;
      (listObjects as ReturnType<typeof vi.fn>).mockImplementation(() => {
        if (!delayFullList) return Promise.resolve([source]);
        return new Promise((resolve) => {
          resolveFullList = resolve;
        });
      });

      useProjectStore.getState().setCurrentProject(mockProject);
      const user = (await import('@testing-library/user-event')).default.setup();
      renderPage();

      await screen.findByText('Труба DN100');
      delayFullList = true;
      await user.click(screen.getByText('Excel-режим'));

      await waitFor(() => {
        expect(document.querySelector('.calc-spreadsheet--excel-mode')).toBeInTheDocument();
      });
      const excelGrid = document.querySelector<HTMLElement>('.calc-spreadsheet--excel-mode');
      expect(excelGrid).not.toBeNull();
      expect(within(excelGrid!).getByRole('button', { name: 'Труба DN100' })).toBeInTheDocument();
      expect(within(excelGrid!).queryByText(/не добавлены/i)).not.toBeInTheDocument();

      resolveFullList?.([source]);
      window.requestIdleCallback = previousRequestIdleCallback;
      window.cancelIdleCallback = previousCancelIdleCallback;
    }, HEATCALC_PAGE_TEST_TIMEOUT);

    it('в Excel-режиме показывает конкретную ошибку поля при сохранении', async () => {
      useGlideExcelEngineForDomCellTest();
      const { listObjects, updateObject } = await import('@/api/projects');
      (listObjects as ReturnType<typeof vi.fn>).mockResolvedValue([makeObject()]);

      useProjectStore.getState().setCurrentProject(mockProject);
      const user = (await import('@testing-library/user-event')).default.setup();
      renderPage();

      await screen.findByText('Труба DN100');
      await user.click(screen.getByText('Excel-режим'));

      const row = (await screen.findByText('Труба DN100')).closest('tr');
      expect(row).toBeInstanceOf(HTMLElement);
      await user.dblClick(within(row as HTMLElement).getByRole('button', { name: '60' }));
      const editor = await within(row as HTMLElement).findByDisplayValue('60.0');
      fireEvent.change(editor, { target: { value: '-30' } });
      fireEvent.keyDown(editor, { key: 'Enter' });

      await user.click(screen.getByRole('button', { name: 'Сохранить' }));

      expect(updateObject).not.toHaveBeenCalled();
      expect(screen.queryByLabelText('Ошибки в Excel-таблице')).not.toBeInTheDocument();
      const selectedRowErrors = await screen.findByLabelText('Ошибки выбранной строки');
      expect(selectedRowErrors).toHaveTextContent(
        /Температура поддержания: Требуемая температура объекта должна быть выше температуры среды/,
      );
      expect(screen.queryByText('Исправьте ошибки в строке перед сохранением')).not.toBeInTheDocument();
    }, HEATCALC_PAGE_TEST_TIMEOUT);

    it('в обычном режиме подсвечивает поле, указанное в ошибке draft-валидации выбранной строки', async () => {
      const { listObjects } = await import('@/api/projects');
      const source = makeObject({
        params: {
          ...makeObject().params,
          name: 'Подземная труба с indoor tm',
          placement: 'underground',
          burial_depth: 0.4,
          ground_type: 'sand_1480_w5',
          ground_conductivity: 1.11,
          insulation_temperature_basis: 'indoor',
        },
      });
      (listObjects as ReturnType<typeof vi.fn>).mockResolvedValue([source]);

      useProjectStore.getState().setCurrentProject(mockProject);
      const user = (await import('@testing-library/user-event')).default.setup();
      renderPage();

      await user.click(await screen.findByText('Подземная труба с indoor tm'));
      const lengthInput = await screen.findByTestId('pipe-length-input');
      const basisSelect = screen.getByTestId('insulation-temperature-basis-select');
      expect(basisSelect.closest('.ant-form-item')).not.toHaveClass('ant-form-item-has-error');

      await user.clear(lengthInput);
      await user.type(lengthInput, '26');

      const selectedRowErrors = await screen.findByLabelText('Ошибки выбранной строки');
      expect(selectedRowErrors).toHaveTextContent(
        'Режим температуры изоляции: Режим tm изоляции не соответствует размещению объекта',
      );
      await waitFor(() => {
        expect(screen.getByTestId('insulation-temperature-basis-select').closest('.ant-form-item'))
          .toHaveClass('ant-form-item-has-error');
      });
      expect(screen.getByText('Режим tm изоляции не соответствует размещению объекта')).toBeInTheDocument();
    }, HEATCALC_PAGE_TEST_TIMEOUT);

    it('для зарегистрированного пользователя без записи очищает кеш и возвращает дефолтный JSON', async () => {
      const { listObjects } = await import('@/api/projects');
      const { getUserPreference } = await import('@/api/preferences');
      (listObjects as ReturnType<typeof vi.fn>).mockResolvedValue([makeObject()]);
      (getUserPreference as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        key: HEATCALC_TABLE_COLUMN_PREF_KEY,
        value: null,
        user_id: 'user-test-1',
      });
      localStorage.setItem(
        HEATCALC_REGISTERED_TABLE_COLUMN_CACHE_KEY,
        JSON.stringify({
          userId: 'user-test-1',
          settings: getDefaultTableColumnSettings(),
          cachedAt: '2026-05-08T00:00:00.000Z',
        }),
      );
      localStorage.setItem(
        HEATCALC_REGISTERED_TABLE_VIEW_CACHE_KEY,
        JSON.stringify({
          userId: 'user-test-1',
          settings: {
            version: 2,
            fontSize: 'large',
            tableLabelFormat: 'short',
            settingsLabelFormat: 'full',
            formPlacement: 'top',
            sideFormWidthPct: 34,
            formSectionWeights: [1.655, 1.35, 1.2],
          },
          cachedAt: '2026-05-08T00:00:00.000Z',
        }),
      );
      localStorage.setItem(
        HEATCALC_REGISTERED_CALCULATION_DETAILS_CACHE_KEY,
        JSON.stringify({
          userId: 'user-test-1',
          settings: {
            version: 1,
            preset: 'detailed',
            visibleMetrics: ['delta_t', 'thermal_resistance'],
          },
          cachedAt: '2026-05-08T00:00:00.000Z',
        }),
      );
      localStorage.setItem(
        HEATCALC_REGISTERED_FIELD_INPUT_CACHE_KEY,
        JSON.stringify({
          userId: 'user-test-1',
          settings: {
            version: 1,
            fields: {
              pipe: {
                outer_diameter_mm: { step: 10 },
              },
            },
          },
          cachedAt: '2026-05-08T00:00:00.000Z',
        }),
      );
      useAuthStore.getState().setEmployee(
        {
          id: 'user-test-1',
          email: 'user@test.local',
          full_name: null,
          role: 'employee',
          is_active: true,
        },
        { access: 'access-token', refresh: 'refresh-token' },
      );

      useProjectStore.getState().setCurrentProject(mockProject);
      renderPage();

      await waitFor(() => {
        expect(getUserPreference).toHaveBeenCalledWith(HEATCALC_TABLE_COLUMN_PREF_KEY);
        expect(getUserPreference).toHaveBeenCalledWith(HEATCALC_TABLE_VIEW_PREF_KEY);
        expect(getUserPreference).toHaveBeenCalledWith(HEATCALC_CALCULATION_DETAILS_PREF_KEY);
        expect(getUserPreference).toHaveBeenCalledWith(HEATCALC_FIELD_INPUT_PREF_KEY);
      });
      await waitFor(() => {
        expect(localStorage.getItem(HEATCALC_REGISTERED_TABLE_COLUMN_CACHE_KEY)).toBeNull();
        expect(localStorage.getItem(HEATCALC_REGISTERED_TABLE_VIEW_CACHE_KEY)).toBeNull();
        expect(localStorage.getItem(HEATCALC_REGISTERED_CALCULATION_DETAILS_CACHE_KEY)).toBeNull();
        expect(localStorage.getItem(HEATCALC_REGISTERED_FIELD_INPUT_CACHE_KEY)).toBeNull();
      });
      await waitFor(() => {
        expect(screen.getAllByText('DN').length).toBeGreaterThan(0);
        expect(screen.getByTestId('outer-diameter-input')).toHaveAttribute('step', '1');
      });
    });

    it('для зарегистрированного пользователя сохраняет настройки через API и кеширует только ответ БД', async () => {
      const { listObjects } = await import('@/api/projects');
      const { updateUserPreference } = await import('@/api/preferences');
      (listObjects as ReturnType<typeof vi.fn>).mockResolvedValue([makeObject()]);
      (updateUserPreference as ReturnType<typeof vi.fn>).mockImplementation(async (key, value) => ({
        key,
        value,
        user_id: 'user-test-1',
      }));
      useAuthStore.getState().setEmployee(
        {
          id: 'user-test-1',
          email: 'user@test.local',
          full_name: null,
          role: 'employee',
          is_active: true,
        },
        { access: 'access-token', refresh: 'refresh-token' },
      );

      useProjectStore.getState().setCurrentProject(mockProject);
      const user = (await import('@testing-library/user-event')).default.setup();
      renderPage();

      await screen.findByText('Труба DN100');
      const dialog = await openTableSettingsDialog(user);
      await user.click(within(dialog).getByRole('checkbox', { name: 'DN' }));
      const stepInput = within(dialog).getByRole('spinbutton', { name: 'Шаг: Наружный диаметр' });
      fireEvent.change(stepInput, { target: { value: '2.5' } });
      fireEvent.blur(stepInput);
      await openTableSettingsOtherTab(user, dialog);
      await user.click(within(dialog).getByText('Крупный'));
      await user.click(within(dialog).getByRole('button', { name: 'Применить' }));

      await waitFor(() => {
        expect(updateUserPreference).toHaveBeenCalledWith(
          HEATCALC_TABLE_COLUMN_PREF_KEY,
          expect.any(Object),
        );
        expect(updateUserPreference).toHaveBeenCalledWith(
          HEATCALC_TABLE_VIEW_PREF_KEY,
          expect.any(Object),
        );
        expect(updateUserPreference).toHaveBeenCalledWith(
          HEATCALC_FIELD_INPUT_PREF_KEY,
          expect.any(Object),
        );
      });
      const preferencePayload = (updateUserPreference as ReturnType<typeof vi.fn>).mock.calls.find(
        ([key]) => key === HEATCALC_TABLE_COLUMN_PREF_KEY,
      )?.[1];
      expect(preferencePayload).toBeDefined();
      expect(preferencePayload.types.pipe.visibleOrder).not.toContain('pipe_dn');
      expect(preferencePayload.types.pipe.columns.pipe_dn).not.toHaveProperty('visible');
      expect(preferencePayload.types.pipe.columns.pipe_dn).not.toHaveProperty('order');
      await waitFor(() => {
        expect(screen.queryAllByRole('columnheader').map((header) => header.textContent)).not.toContain('DN');
      });
      const cached = JSON.parse(localStorage.getItem(HEATCALC_REGISTERED_TABLE_COLUMN_CACHE_KEY) ?? '{}');
      expect(cached.userId).toBe('user-test-1');
      expect(cached.settings.types.pipe.visibleOrder).not.toContain('pipe_dn');
      expect(cached.settings.types.pipe.columns.pipe_dn).not.toHaveProperty('visible');
      expect(cached.settings.types.pipe.columns.pipe_dn).not.toHaveProperty('order');
      const viewCached = JSON.parse(localStorage.getItem(HEATCALC_REGISTERED_TABLE_VIEW_CACHE_KEY) ?? '{}');
      expect(viewCached.userId).toBe('user-test-1');
      expect(viewCached.settings).toEqual({
        version: 2,
        fontSize: 'large',
        tableLabelFormat: 'short',
        settingsLabelFormat: 'full',
        formPlacement: 'top',
        sideFormWidthPct: 34,
        formSectionWeights: [1.655, 1.35, 1.2],
      });
      const fieldInputPayload = (updateUserPreference as ReturnType<typeof vi.fn>).mock.calls.find(
        ([key]) => key === HEATCALC_FIELD_INPUT_PREF_KEY,
      )?.[1];
      expect(fieldInputPayload.fields.pipe.outer_diameter_mm).toEqual({ step: 2.5 });
      const fieldInputCached = JSON.parse(localStorage.getItem(HEATCALC_REGISTERED_FIELD_INPUT_CACHE_KEY) ?? '{}');
      expect(fieldInputCached.userId).toBe('user-test-1');
      expect(fieldInputCached.settings.fields.pipe.outer_diameter_mm).toEqual({ step: 2.5 });
    }, HEATCALC_PAGE_TEST_TIMEOUT);
  });
});

import { describe, it, expect, vi } from 'vitest';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
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
      localStorage.setItem(HEATCALC_EXCEL_ENGINE_STORAGE_KEY, 'glide');
    }

    it('включает inline-редактирование через настройки таблицы и сохраняет draft только по кнопке', async () => {
      const { listObjects, updateObject } = await import('@/api/projects');
      const source = makeObject();
      (listObjects as ReturnType<typeof vi.fn>).mockResolvedValue([source]);
      (updateObject as ReturnType<typeof vi.fn>).mockResolvedValue(
        makeObject({ params: { ...source.params, name: 'Труба inline' } }),
      );

      useProjectStore.getState().setCurrentProject(mockProject);
      const user = (await import('@testing-library/user-event')).default.setup();
      renderPage();

      await screen.findByText('Труба DN100');
      const dialog = await openTableSettingsDialog(user);
      await openTableSettingsOtherTab(user, dialog);
      const inlineToggle = within(dialog).getByRole('checkbox', { name: 'Редактировать ячейки в таблице' });
      expect(inlineToggle).not.toBeChecked();
      await user.click(inlineToggle);
      await user.click(within(dialog).getByRole('button', { name: 'Применить' }));

      await user.click(await screen.findByText('Труба DN100'));
      const editor = await screen.findByDisplayValue('Труба DN100');
      await user.clear(editor);
      await user.type(editor, 'Труба inline');
      await user.keyboard('{Enter}');

      expect(updateObject).not.toHaveBeenCalled();
      expect(await screen.findByText('Несохранено: 1')).toBeInTheDocument();
      expect(screen.getByText('Труба inline')).toBeInTheDocument();
      const dirtyCell = screen.getByRole('button', { name: 'Труба inline' });
      expect(dirtyCell).toHaveClass('dirty');
      expect(dirtyCell.closest('tr')).toHaveClass('row-dirty');
      expect(dirtyCell.closest('td')).toHaveClass('editable-cell-enabled');

      expect(screen.queryByText('Сохранить все (1)')).not.toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Сохранить' }));

      await waitFor(() => {
        expect(updateObject).toHaveBeenCalledWith(
          'proj-test-1',
          source.id,
          expect.objectContaining({
            params: expect.objectContaining({ name: 'Труба inline' }),
          }),
        );
      });
      await waitFor(() => {
        expect(screen.queryByText('Несохранено: 1')).not.toBeInTheDocument();
      });
      const saved = JSON.parse(localStorage.getItem(HEATCALC_GUEST_TABLE_VIEW_STORAGE_KEY) ?? '{}');
      expect(saved.inlineEditingEnabled).toBe(true);
    }, HEATCALC_PAGE_TEST_TIMEOUT);

    it('при отключении inline-редактирования Cancel сохраняет draft, а Discard сбрасывает draft и применяет настройки', async () => {
      const { listObjects, updateObject } = await import('@/api/projects');
      const source = makeObject();
      (listObjects as ReturnType<typeof vi.fn>).mockResolvedValue([source]);
      (updateObject as ReturnType<typeof vi.fn>).mockResolvedValue(
        makeObject({ params: { ...source.params, name: 'Труба cancel draft' } }),
      );

      useProjectStore.getState().setCurrentProject(mockProject);
      const user = (await import('@testing-library/user-event')).default.setup();
      renderPage();

      await screen.findByText('Труба DN100');
      const enableDialog = await openTableSettingsDialog(user);
      await openTableSettingsOtherTab(user, enableDialog);
      await user.click(within(enableDialog).getByRole('checkbox', { name: 'Редактировать ячейки в таблице' }));
      await user.click(within(enableDialog).getByRole('button', { name: 'Применить' }));

      await user.click(await screen.findByRole('button', { name: 'Труба DN100' }));
      const editor = await screen.findByDisplayValue('Труба DN100');
      await user.clear(editor);
      await user.type(editor, 'Труба cancel draft');
      await user.keyboard('{Enter}');
      expect(await screen.findByText('Несохранено: 1')).toBeInTheDocument();

      const disableDialog = await openTableSettingsDialog(user);
      await openTableSettingsOtherTab(user, disableDialog);
      const inlineToggle = within(disableDialog).getByRole('checkbox', {
        name: 'Редактировать ячейки в таблице',
      });
      expect(inlineToggle).toBeChecked();
      await user.click(inlineToggle);
      await user.click(within(disableDialog).getByRole('button', { name: 'Применить' }));

      const cancelModal = screen.getByText('Отключить редактирование ячеек?').closest('.ant-modal');
      expect(cancelModal).toBeInstanceOf(HTMLElement);
      await user.click(within(cancelModal as HTMLElement).getByRole('button', { name: 'Cancel' }));

      await waitFor(() => {
        expect(screen.getByText('Отключить редактирование ячеек?')).not.toBeVisible();
      });
      expect(screen.getByText('Несохранено: 1')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Труба cancel draft' })).toBeInTheDocument();
      expect(within(disableDialog).getByRole('checkbox', {
        name: 'Редактировать ячейки в таблице',
      })).toBeChecked();
      expect(JSON.parse(localStorage.getItem(HEATCALC_GUEST_TABLE_VIEW_STORAGE_KEY) ?? '{}'))
        .toMatchObject({ inlineEditingEnabled: true });

      await user.click(within(disableDialog).getByRole('checkbox', {
        name: 'Редактировать ячейки в таблице',
      }));
      await user.click(within(disableDialog).getByRole('button', { name: 'Применить' }));
      const discardModal = screen.getByText('Отключить редактирование ячеек?').closest('.ant-modal');
      expect(discardModal).toBeInstanceOf(HTMLElement);
      await user.click(within(discardModal as HTMLElement).getByRole('button', { name: 'Discard' }));

      await waitFor(() => {
        expect(screen.queryByText('Несохранено: 1')).not.toBeInTheDocument();
      });
      expect(screen.queryByText('Труба cancel draft')).not.toBeInTheDocument();
      expect(screen.getByText('Труба DN100')).toBeInTheDocument();
      expect(localStorage.getItem(HEATCALC_GUEST_TABLE_VIEW_STORAGE_KEY)).toBeNull();
      expect(updateObject).not.toHaveBeenCalled();
    }, HEATCALC_PAGE_TEST_TIMEOUT);

    it('при отключении inline-редактирования Save применяет настройки только после успешного сохранения draft', async () => {
      const { listObjects, updateObject } = await import('@/api/projects');
      const source = makeObject();
      (listObjects as ReturnType<typeof vi.fn>).mockResolvedValue([source]);
      let resolveUpdate: (value: ReturnType<typeof makeObject>) => void = () => {};
      const updatePromise = new Promise<ReturnType<typeof makeObject>>((resolve) => {
        resolveUpdate = resolve;
      });
      (updateObject as ReturnType<typeof vi.fn>).mockReturnValue(updatePromise);

      useProjectStore.getState().setCurrentProject(mockProject);
      const user = (await import('@testing-library/user-event')).default.setup();
      renderPage();

      await screen.findByText('Труба DN100');
      const enableDialog = await openTableSettingsDialog(user);
      await openTableSettingsOtherTab(user, enableDialog);
      await user.click(within(enableDialog).getByRole('checkbox', { name: 'Редактировать ячейки в таблице' }));
      await user.click(within(enableDialog).getByRole('button', { name: 'Применить' }));

      await user.click(await screen.findByRole('button', { name: 'Труба DN100' }));
      const editor = await screen.findByDisplayValue('Труба DN100');
      await user.clear(editor);
      await user.type(editor, 'Труба save draft');
      await user.keyboard('{Enter}');
      expect(await screen.findByText('Несохранено: 1')).toBeInTheDocument();

      const disableDialog = await openTableSettingsDialog(user);
      await openTableSettingsOtherTab(user, disableDialog);
      await user.click(within(disableDialog).getByRole('checkbox', { name: 'Редактировать ячейки в таблице' }));
      await user.click(within(disableDialog).getByRole('button', { name: 'Применить' }));
      const saveModal = screen.getByText('Отключить редактирование ячеек?').closest('.ant-modal');
      expect(saveModal).toBeInstanceOf(HTMLElement);
      await user.click(within(saveModal as HTMLElement).getByRole('button', { name: 'Save' }));

      await waitFor(() => {
        expect(updateObject).toHaveBeenCalledWith(
          'proj-test-1',
          source.id,
          expect.objectContaining({
            params: expect.objectContaining({ name: 'Труба save draft' }),
          }),
        );
      });
      expect(JSON.parse(localStorage.getItem(HEATCALC_GUEST_TABLE_VIEW_STORAGE_KEY) ?? '{}'))
        .toMatchObject({ inlineEditingEnabled: true });
      expect(screen.getByText('Отключить редактирование ячеек?')).toBeVisible();

      await act(async () => {
        resolveUpdate(makeObject({ params: { ...source.params, name: 'Труба save draft' } }));
        await updatePromise;
      });

      await waitFor(() => {
        expect(screen.getByText('Отключить редактирование ячеек?')).not.toBeVisible();
      });
      expect(screen.queryByText('Несохранено: 1')).not.toBeInTheDocument();
      expect(localStorage.getItem(HEATCALC_GUEST_TABLE_VIEW_STORAGE_KEY)).toBeNull();
    }, HEATCALC_PAGE_TEST_TIMEOUT);

    it('подсвечивает только inline-редактируемые ячейки при включенном режиме', async () => {
      const { listObjects } = await import('@/api/projects');
      (listObjects as ReturnType<typeof vi.fn>).mockResolvedValue([makeObject()]);

      useProjectStore.getState().setCurrentProject(mockProject);
      const user = (await import('@testing-library/user-event')).default.setup();
      renderPage();

      const table = document.querySelector<HTMLElement>('.calc-spreadsheet');
      expect(table).not.toBeNull();
      const tableElement = table!;
      await waitFor(() => {
        expect(within(tableElement).getByText('Труба DN100')).toBeInTheDocument();
      });
      const initialNameCell = within(tableElement).getByText('Труба DN100').closest('td');
      expect(initialNameCell).not.toHaveClass('editable-cell-enabled');
      expect(within(tableElement).queryByRole('button', { name: 'Труба DN100' })).not.toBeInTheDocument();

      const dialog = await openTableSettingsDialog(user);
      await openTableSettingsOtherTab(user, dialog);
      await user.click(within(dialog).getByRole('checkbox', { name: 'Редактировать ячейки в таблице' }));
      await user.click(within(dialog).getByRole('button', { name: 'Применить' }));

      const editableName = await within(tableElement).findByRole('button', { name: 'Труба DN100' });
      expect(editableName).toHaveClass('editable-cell-display');
      expect(editableName.closest('td')).toHaveClass('editable-cell-host');
      expect(editableName.closest('td')).toHaveClass('editable-cell-enabled');

      const bodyRow = editableName.closest('tr');
      expect(bodyRow).not.toBeNull();
      const rowNumberCell = bodyRow!.querySelectorAll('td')[1];
      expect(rowNumberCell).toBeInstanceOf(HTMLElement);
      expect(rowNumberCell).not.toHaveClass('editable-cell-enabled');
    }, HEATCALC_PAGE_TEST_TIMEOUT);

    it('подсвечивает невалидную inline-ячейку до сохранения и не отправляет её', async () => {
      const { listObjects, updateObject } = await import('@/api/projects');
      const source = makeObject();
      const validationError = 'Требуемая температура объекта должна быть выше температуры среды';
      (listObjects as ReturnType<typeof vi.fn>).mockResolvedValue([source]);
      (updateObject as ReturnType<typeof vi.fn>).mockResolvedValue(
        makeObject({ params: { ...source.params, name: 'Труба valid' } }),
      );

      useProjectStore.getState().setCurrentProject(mockProject);
      const user = (await import('@testing-library/user-event')).default.setup();
      renderPage();

      await screen.findByText('Труба DN100');
      const dialog = await openTableSettingsDialog(user);
      await openTableSettingsOtherTab(user, dialog);
      await user.click(within(dialog).getByRole('checkbox', { name: 'Редактировать ячейки в таблице' }));
      await user.click(within(dialog).getByRole('button', { name: 'Применить' }));

      const row = (await screen.findByText('Труба DN100')).closest('tr');
      expect(row).toBeInstanceOf(HTMLElement);
      await user.click(within(row as HTMLElement).getByRole('button', { name: '60' }));
      const editor = await within(row as HTMLElement).findByDisplayValue('60.0');
      fireEvent.change(editor, { target: { value: '-30' } });
      fireEvent.keyDown(editor, { key: 'Enter' });

      const invalidCell = await within(row as HTMLElement).findByTitle(validationError);
      expect(invalidCell).toHaveClass('error');
      expect(await screen.findByText('Несохранено: 1')).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Сохранить' }));
      expect(updateObject).not.toHaveBeenCalled();

      const fixedEditor = await within(row as HTMLElement).findByDisplayValue('-30');
      fireEvent.change(fixedEditor, { target: { value: '70' } });
      fireEvent.keyDown(fixedEditor, { key: 'Enter' });

      await waitFor(() => {
        expect(within(row as HTMLElement).queryByTitle(validationError)).not.toBeInTheDocument();
      });
      const fixedCell = await screen.findByRole('button', { name: '70' });
      expect(fixedCell).not.toHaveClass('error');

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

    it('сохраняет валидные dirty-строки и оставляет невалидные dirty-строки', async () => {
      const { listObjects, updateObject } = await import('@/api/projects');
      const validationError = 'Требуемая температура объекта должна быть выше температуры среды';
      const baseParams = makeObject().params;
      const invalidSource = makeObject({
        id: 'pipe-invalid',
        params: { ...baseParams, name: 'Труба invalid' },
      });
      const validSource = makeObject({
        id: 'pipe-valid',
        sort_order: 1,
        params: { ...baseParams, name: 'Труба valid' },
      });
      (listObjects as ReturnType<typeof vi.fn>).mockResolvedValue([invalidSource, validSource]);
      (updateObject as ReturnType<typeof vi.fn>).mockImplementation(
        async (_projectId: string, objectId: string, payload: { params: Record<string, unknown> }) =>
          makeObject({ id: objectId, params: payload.params }),
      );

      useProjectStore.getState().setCurrentProject(mockProject);
      const user = (await import('@testing-library/user-event')).default.setup();
      renderPage();

      await screen.findByText('Труба invalid');
      const dialog = await openTableSettingsDialog(user);
      await openTableSettingsOtherTab(user, dialog);
      await user.click(within(dialog).getByRole('checkbox', { name: 'Редактировать ячейки в таблице' }));
      await user.click(within(dialog).getByRole('button', { name: 'Применить' }));

      const invalidRow = (await screen.findByText('Труба invalid')).closest('tr');
      expect(invalidRow).toBeInstanceOf(HTMLElement);
      await user.click(within(invalidRow as HTMLElement).getByRole('button', { name: '60' }));
      const invalidEditor = await within(invalidRow as HTMLElement).findByDisplayValue('60.0');
      fireEvent.change(invalidEditor, { target: { value: '-30' } });
      fireEvent.keyDown(invalidEditor, { key: 'Enter' });
      expect(await within(invalidRow as HTMLElement).findByTitle(validationError)).toHaveClass('error');

      await user.click(await screen.findByRole('button', { name: 'Труба valid' }));
      const validEditor = await screen.findByDisplayValue('Труба valid');
      await user.clear(validEditor);
      await user.type(validEditor, 'Труба valid saved');
      await user.keyboard('{Enter}');
      expect(await screen.findByText('Несохранено: 2')).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Сохранить' }));

      await waitFor(() => {
        expect(updateObject).toHaveBeenCalledTimes(1);
      });
      expect(updateObject).toHaveBeenCalledWith(
        'proj-test-1',
        'pipe-valid',
        expect.objectContaining({
          params: expect.objectContaining({ name: 'Труба valid saved' }),
        }),
      );
      expect(screen.getByTitle(validationError)).toHaveClass('error');
      await waitFor(() => {
        expect(screen.getByText('Несохранено: 1')).toBeInTheDocument();
      });
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
            version: 1,
            fontSize: 'large',
            inlineEditingEnabled: false,
            formPlacement: 'top',
            sideFormWidthPct: 34,
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
        version: 1,
        fontSize: 'large',
        tableLabelFormat: 'short',
        settingsLabelFormat: 'full',
        inlineEditingEnabled: false,
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

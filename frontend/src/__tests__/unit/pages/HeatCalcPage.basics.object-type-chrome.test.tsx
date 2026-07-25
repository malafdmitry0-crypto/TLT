import { describe, it, expect, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { useProjectStore } from '@/store/projectStore';
import { useWorkspaceHeaderStore } from '@/store/workspaceHeaderStore';
import { HEATCALC_GUEST_TABLE_COLUMN_STORAGE_KEY } from '@/utils/heatCalcTableColumns';
import { HEATCALC_GUEST_TABLE_VIEW_STORAGE_KEY } from '@/utils/heatCalcTableViewSettings';
import {
  HEATCALC_PAGE_TEST_TIMEOUT,
  getNormalGlideGrid,
  getNormalGlideHeaderTexts,
  getNormalGlideRowCells,
  getNormalGlideRows,
  makeObject,
  makeTank,
  mockProject,
  openColumnFilter,
  openTableSettingsDialog,
  renderPage,
  setupHeatCalcPageTest,
} from './HeatCalcPage.test-utils';

describe('HeatCalcPage basics — object type', () => {
  setupHeatCalcPageTest();

  describe('Переключатель типа объектов — settings / chrome', () => {
    it('настройки таблицы для режима «Все» сохраняются отдельно от труб и резервуаров', async () => {
      const { listObjects } = await import('@/api/projects');
      (listObjects as ReturnType<typeof vi.fn>).mockResolvedValue([
        makeObject(),
        makeTank(),
      ]);

      useProjectStore.getState().setCurrentProject(mockProject);
      const user = (await import('@testing-library/user-event')).default.setup();
      renderPage();

      const typeToolbar = screen.getByRole('toolbar', { name: 'Тип объекта и блок параметров' });
      await user.click(await within(typeToolbar).findByRole('button', { name: /Все:/ }));
      expect(await screen.findByText('Труба DN100')).toBeInTheDocument();
      expect(await screen.findByText('Резервуар прямоугольный')).toBeInTheDocument();

      const dialog = await openTableSettingsDialog(user);
      expect(within(dialog).getByText('Все')).toBeInTheDocument();
      await user.click(within(dialog).getByRole('checkbox', { name: 'Температура поддержания' }));
      await user.click(within(dialog).getByRole('button', { name: 'Применить' }));

      await waitFor(() => {
        expect(getNormalGlideHeaderTexts()).not.toContain('Т подд.');
      });
      const saved = JSON.parse(localStorage.getItem(HEATCALC_GUEST_TABLE_COLUMN_STORAGE_KEY) ?? '{}');
      expect(saved.types.all.visibleOrder).not.toContain('process_temperature');
      expect(saved.types.pipe.visibleOrder).toContain('process_temperature');
      expect(saved.types.tank.visibleOrder).toContain('process_temperature');
    }, HEATCALC_PAGE_TEST_TIMEOUT);

    it('режим «Все» позволяет включить поля труб и резервуаров и показывает прочерки для чужого типа', async () => {
      const { listObjects } = await import('@/api/projects');
      (listObjects as ReturnType<typeof vi.fn>).mockResolvedValue([
        makeObject(),
        makeTank(),
      ]);

      useProjectStore.getState().setCurrentProject(mockProject);
      const user = (await import('@testing-library/user-event')).default.setup();
      renderPage();

      const typeToolbar = screen.getByRole('toolbar', { name: 'Тип объекта и блок параметров' });
      await user.click(await within(typeToolbar).findByRole('button', { name: /Все:/ }));
      expect(await screen.findByText('Труба DN100')).toBeInTheDocument();
      expect(await screen.findByText('Резервуар прямоугольный')).toBeInTheDocument();
      expect(getNormalGlideHeaderTexts()).not.toContain('DN');
      expect(getNormalGlideHeaderTexts()).not.toContain('Форма');

      const dialog = await openTableSettingsDialog(user);
      expect(within(dialog).getByRole('checkbox', { name: 'DN' })).not.toBeChecked();
      expect(within(dialog).getByRole('checkbox', { name: 'Форма резервуара' })).not.toBeChecked();
      await user.click(within(dialog).getByRole('checkbox', { name: 'DN' }));
      await user.click(within(dialog).getByRole('checkbox', { name: 'Форма резервуара' }));
      await user.click(within(dialog).getByRole('button', { name: 'Применить' }));

      const table = getNormalGlideGrid();
      await waitFor(() => {
        const headerTexts = getNormalGlideHeaderTexts();
        expect(headerTexts).toContain('DN');
        expect(headerTexts).toContain('Форма');
      });
      const headerTexts = getNormalGlideHeaderTexts();
      const dnIndex = headerTexts.findIndex((text) => text === 'DN');
      const shapeIndex = headerTexts.findIndex((text) => text === 'Форма');
      expect(dnIndex).toBeGreaterThan(-1);
      expect(shapeIndex).toBeGreaterThan(-1);

      const pipeRow = within(table).getByText('Труба DN100').closest('[data-testid="normal-glide-row"]') as HTMLElement | null;
      const tankRow = within(table).getByText('Резервуар прямоугольный').closest('[data-testid="normal-glide-row"]') as HTMLElement | null;
      expect(pipeRow).not.toBeNull();
      expect(tankRow).not.toBeNull();
      const pipeCells = getNormalGlideRowCells(pipeRow!);
      const tankCells = getNormalGlideRowCells(tankRow!);

      expect(pipeCells[dnIndex]).toBe('DN100');
      expect(pipeCells[shapeIndex]).toBe('—');
      expect(tankCells[dnIndex]).toBe('—');
      expect(tankCells[shapeIndex]).toBe('Прямоуг.');

      const saved = JSON.parse(localStorage.getItem(HEATCALC_GUEST_TABLE_COLUMN_STORAGE_KEY) ?? '{}');
      expect(saved.types.all.visibleOrder).toEqual(expect.arrayContaining(['pipe_dn', 'tank_shape']));
      expect(saved.types.pipe.visibleOrder).toContain('pipe_dn');
      expect(saved.types.tank.visibleOrder).toContain('tank_shape');
    }, HEATCALC_PAGE_TEST_TIMEOUT);

    it('кнопка «Добавить» сбрасывает форму активного типа без dropdown', async () => {
      useProjectStore.getState().setCurrentProject(mockProject);
      const user = (await import('@testing-library/user-event')).default.setup();
      renderPage();

      const formActionsToolbar = screen.getByRole('toolbar', { name: 'Действия блока заполнения' });
      const addButton = within(formActionsToolbar).getByRole('button', { name: 'Добавить' });
      expect(await screen.findByTestId('object-name-input', {}, { timeout: HEATCALC_PAGE_TEST_TIMEOUT })).toBeInTheDocument();
      await user.type(screen.getByTestId('object-name-input'), 'Черновик трубы');
      await user.click(addButton);
      await waitFor(() => {
        expect(screen.getByTestId('object-name-input')).toHaveValue('');
      });

      await user.click(screen.getByRole('button', { name: /Резервуар:/ }));
      await user.click(addButton);

      expect(await screen.findByTestId('tank-shape-select', {}, { timeout: HEATCALC_PAGE_TEST_TIMEOUT })).toBeInTheDocument();
    }, HEATCALC_PAGE_TEST_TIMEOUT);

    it('основные действия toolbar доступны по имени при icon-only отображении', async () => {
      useProjectStore.getState().setCurrentProject(mockProject);
      renderPage();

      const addButton = screen.getByRole('button', { name: 'Добавить' });
      const tableFieldsButton = screen.getByRole('button', { name: 'Настройки отображения' });
      const saveButton = screen.getByRole('button', { name: 'Сохранить' });
      const deleteButton = screen.getByRole('button', { name: 'Удалить выбранные' });
      const importButton = screen.getByRole('button', { name: 'Импорт XLSX/CSV' });

      const typeToolbar = screen.getByRole('toolbar', { name: 'Тип объекта и блок параметров' });
      const formActionsToolbar = screen.getByRole('toolbar', { name: 'Действия блока заполнения' });
      const tableActionsToolbar = screen.getByRole('toolbar', { name: 'Действия таблицы объектов' });
      const paramsBlock = screen.getByLabelText('Блок заполнения параметров');
      expect(typeToolbar.compareDocumentPosition(paramsBlock) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(paramsBlock.compareDocumentPosition(formActionsToolbar) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(formActionsToolbar.compareDocumentPosition(tableActionsToolbar) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(formActionsToolbar.parentElement).toBe(tableActionsToolbar.parentElement);
      expect(formActionsToolbar.parentElement).toHaveClass('actionbar-actions-row');
      expect(within(typeToolbar).getByRole('button', { name: /Трубопровод:/ })).toHaveAttribute('aria-pressed', 'true');
      expect(within(typeToolbar).getByRole('button', { name: /Резервуар:/ })).toHaveAttribute('aria-pressed', 'false');
      expect(within(typeToolbar).getByRole('button', { name: /Все:/ })).toHaveAttribute('aria-pressed', 'false');
      expect(within(typeToolbar).getByText('Режим: добавление')).toBeInTheDocument();
      expect(within(typeToolbar).getByRole('checkbox', { name: 'Показать блок заполнения параметров' })).toBeChecked();
      expect(within(formActionsToolbar).getByRole('button', { name: 'Добавить' })).toBe(addButton);
      expect(within(formActionsToolbar).getByRole('button', { name: 'Сохранить' })).toBe(saveButton);
      expect(within(formActionsToolbar).getByRole('button', { name: 'Удалить выбранные' })).toBe(deleteButton);
      expect(deleteButton).toBeDisabled();
      expect(deleteButton).toHaveClass('action-icon-button');
      expect(deleteButton).toHaveTextContent(/^$/);
      expect(saveButton.compareDocumentPosition(deleteButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(within(formActionsToolbar).queryByRole('button', { name: 'Сбросить' })).not.toBeInTheDocument();
      expect(within(tableActionsToolbar).getByRole('button', { name: 'Настройки отображения' })).toBe(tableFieldsButton);
      expect(within(tableActionsToolbar).getByRole('button', { name: 'Добавить копии выбранных' })).toBeDisabled();
      expect(within(tableActionsToolbar).queryByRole('button', { name: 'Удалить выбранные' })).not.toBeInTheDocument();
      expect(within(tableActionsToolbar).getByRole('button', { name: 'Импорт XLSX/CSV' })).toBe(importButton);
      // Excel mode is core HeatCalc editing (not commercial-gated).
      expect(within(tableActionsToolbar).getByText('Excel-режим')).toBeInTheDocument();
      expect(within(tableActionsToolbar).getByText('Обычный режим')).toBeInTheDocument();
      const resetFiltersButton = within(tableActionsToolbar).getByRole('button', { name: 'Сбросить фильтры таблицы' });
      expect(resetFiltersButton).toBeDisabled();
      expect(resetFiltersButton).toHaveTextContent(/^$/);
      expect(within(tableActionsToolbar).queryByRole('button', { name: 'Трубопровод' })).not.toBeInTheDocument();
      expect(within(tableActionsToolbar).queryByRole('button', { name: 'Резервуар' })).not.toBeInTheDocument();
      expect(within(tableActionsToolbar).queryByText(/Режим:/)).not.toBeInTheDocument();
      expect(within(tableActionsToolbar).queryByRole('checkbox', { name: 'Показать блок заполнения параметров' })).not.toBeInTheDocument();
      expect(within(tableActionsToolbar).queryByText(/Все рассчитаны/)).not.toBeInTheDocument();
      expect(useWorkspaceHeaderStore.getState().context).toBeNull();
      expect(tableFieldsButton).toHaveClass('action-icon-button');
      expect(tableFieldsButton).toHaveTextContent(/^$/);
      expect(addButton).toHaveClass('action-add-button');
      expect(addButton).toHaveClass('action-icon-button');
      expect(addButton).toHaveTextContent(/^$/);
      expect(saveButton).toHaveClass('action-save-button');
      expect(saveButton).toHaveClass('action-icon-button');
      expect(saveButton).toHaveTextContent(/^$/);
      expect(saveButton).not.toBeDisabled();
      expect(importButton).toHaveClass('action-icon-button');
      expect(importButton).toHaveTextContent(/^$/);
      expect(within(typeToolbar).getByRole('button', { name: /Трубопровод:\s*0/ })).toBeInTheDocument();
      expect(within(typeToolbar).getByRole('button', { name: /Резервуар:\s*0/ })).toBeInTheDocument();
      expect(within(typeToolbar).getByRole('button', { name: /Все:\s*0/ })).toBeInTheDocument();
      expect(screen.queryByLabelText('Количество объектов')).not.toBeInTheDocument();
      expect(await screen.findByTestId('object-name-input', {}, { timeout: HEATCALC_PAGE_TEST_TIMEOUT })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Сбросить' })).not.toBeInTheDocument();
    });

    it('скрывает блок вручную, убирает режим и сбрасывает заполненные параметры', async () => {
      useProjectStore.getState().setCurrentProject(mockProject);
      const user = (await import('@testing-library/user-event')).default.setup();
      renderPage();
      const paramsBlock = () =>
        document.querySelector<HTMLElement>('[aria-label="Блок заполнения параметров"]');

      const typeToolbar = screen.getByRole('toolbar', { name: 'Тип объекта и блок параметров' });
      const visibilityToggle = within(typeToolbar).getByRole('checkbox', {
        name: 'Показать блок заполнения параметров',
      });
      expect(visibilityToggle).toBeChecked();
      expect(paramsBlock()).toBeVisible();
      expect(await screen.findByTestId('object-name-input', {}, { timeout: HEATCALC_PAGE_TEST_TIMEOUT })).toBeInTheDocument();
      await user.type(screen.getByTestId('object-name-input'), 'Черновик трубы');
      expect(screen.getByTestId('object-name-input')).toHaveValue('Черновик трубы');

      await user.click(visibilityToggle);
      expect(visibilityToggle).not.toBeChecked();
      expect(paramsBlock()).not.toBeVisible();
      expect(screen.queryByRole('toolbar', { name: 'Действия блока заполнения' })).not.toBeInTheDocument();
      expect(within(typeToolbar).queryByText(/Режим:/)).not.toBeInTheDocument();
      expect(screen.queryByTestId('object-name-input')).not.toBeInTheDocument();

      expect(screen.queryByRole('button', { name: 'Добавить' })).not.toBeInTheDocument();
      expect(within(typeToolbar).queryByText(/Режим:/)).not.toBeInTheDocument();
      expect(paramsBlock()).not.toBeVisible();

      await user.click(visibilityToggle);
      expect(visibilityToggle).toBeChecked();
      expect(await screen.findByTestId('object-name-input', {}, { timeout: HEATCALC_PAGE_TEST_TIMEOUT })).toBeInTheDocument();
      expect(screen.getByRole('toolbar', { name: 'Действия блока заполнения' })).toBeInTheDocument();
      expect(within(typeToolbar).getByText('Режим: добавление')).toBeInTheDocument();
      expect(screen.getByTestId('object-name-input')).toHaveValue('');
      expect(paramsBlock()).toBeVisible();
    }, HEATCALC_PAGE_TEST_TIMEOUT);

    it('при боковом размещении оставляет toolbar внутри области таблицы', async () => {
      localStorage.setItem(HEATCALC_GUEST_TABLE_VIEW_STORAGE_KEY, JSON.stringify({
        version: 2,
        fontSize: 'standard',
        tableLabelFormat: 'short',
        settingsLabelFormat: 'full',
        formPlacement: 'right',
        sideFormWidthPct: 34,
        formSectionWeights: [1.655, 1.35, 1.2],
      }));
      useProjectStore.getState().setCurrentProject(mockProject);
      renderPage();

      const layout = document.querySelector<HTMLElement>('.heatcalc-workspace-layout--right');
      const tablePane = document.querySelector<HTMLElement>('.heatcalc-workspace-layout--right .heatcalc-table-pane');
      const paramsBlock = screen.getByLabelText('Блок заполнения параметров');
      const typeToolbar = screen.getByRole('toolbar', { name: 'Тип объекта и блок параметров' });
      const formActionsToolbar = screen.getByRole('toolbar', { name: 'Действия блока заполнения' });
      const tableActionsToolbar = screen.getByRole('toolbar', { name: 'Действия таблицы объектов' });

      expect(layout).toBeInTheDocument();
      expect(tablePane).toBeInTheDocument();
      expect(tablePane).toContainElement(typeToolbar);
      expect(tablePane).toContainElement(formActionsToolbar);
      expect(tablePane).toContainElement(tableActionsToolbar);
      expect(document.querySelectorAll('[role="toolbar"][aria-label="Тип объекта и блок параметров"]')).toHaveLength(1);
      expect(document.querySelectorAll('[role="toolbar"][aria-label="Действия блока заполнения"]')).toHaveLength(1);
      expect(document.querySelectorAll('[role="toolbar"][aria-label="Действия таблицы объектов"]')).toHaveLength(1);
      expect(tablePane).not.toContainElement(paramsBlock);
      expect(layout).toContainElement(paramsBlock);
      expect(typeToolbar.compareDocumentPosition(formActionsToolbar) & Node.DOCUMENT_POSITION_FOLLOWING)
        .toBeTruthy();
      expect(formActionsToolbar.compareDocumentPosition(tableActionsToolbar) & Node.DOCUMENT_POSITION_FOLLOWING)
        .toBeTruthy();
      expect(tablePane!.compareDocumentPosition(paramsBlock) & Node.DOCUMENT_POSITION_FOLLOWING)
        .toBeTruthy();
      expect(within(typeToolbar).getByRole('checkbox', { name: 'Показать блок заполнения параметров' }))
        .toBeChecked();
      expect(within(formActionsToolbar).getByRole('button', { name: 'Добавить' })).toBeVisible();
      expect(within(tableActionsToolbar).getByRole('button', { name: 'Настройки отображения' })).toBeVisible();
      expect(await screen.findByTestId('object-name-input', {}, { timeout: HEATCALC_PAGE_TEST_TIMEOUT })).toBeInTheDocument();
    });
  });
});

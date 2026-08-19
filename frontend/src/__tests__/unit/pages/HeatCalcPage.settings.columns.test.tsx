import { describe, it, expect, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { useProjectStore } from '@/store/projectStore';
import { HEATCALC_GUEST_TABLE_COLUMN_STORAGE_KEY } from '@/utils/heatCalcTableColumns';
import {
  HEATCALC_GUEST_TABLE_VIEW_STORAGE_KEY,
} from '@/utils/heatCalcTableViewSettings';
import {
  HEATCALC_PAGE_TEST_TIMEOUT,
  makeObject,
  makeTank,
  mockProject,
  openTableSettingsDialog,
  openTableSettingsOtherTab,
  renderPage,
  setupHeatCalcPageTest,
} from './HeatCalcPage.test-utils';

describe('HeatCalcPage settings — columns', () => {
  setupHeatCalcPageTest();

  describe('Настройки таблицы и формы', () => {
    it('берёт дефолтные колонки из JSON и не пишет гостевой localStorage до изменения', async () => {
      const { listObjects } = await import('@/api/projects');
      (listObjects as ReturnType<typeof vi.fn>).mockResolvedValue([makeObject()]);

      useProjectStore.getState().setCurrentProject(mockProject);
      renderPage();

      await screen.findByText('Труба DN100');
      expect(screen.queryAllByRole('columnheader').map((header) => header.textContent))
        .not.toContain('DN');
      expect(localStorage.getItem(HEATCALC_GUEST_TABLE_COLUMN_STORAGE_KEY)).toBeNull();
    });

    it('сохраняет гостевые настройки колонок в localStorage и применяет их только к выбранному типу', async () => {
      const { listObjects } = await import('@/api/projects');
      (listObjects as ReturnType<typeof vi.fn>).mockResolvedValue([
        makeObject(),
        makeTank(),
      ]);

      useProjectStore.getState().setCurrentProject(mockProject);
      const user = (await import('@testing-library/user-event')).default.setup();
      renderPage();

      await screen.findByText('Труба DN100');
      const dialog = await openTableSettingsDialog(user);
      const rowByKey = (key: string) => {
        const row = dialog.querySelector<HTMLElement>(`.column-layout-row[data-column-key="${key}"]`);
        expect(row).not.toBeNull();
        return row!;
      };

      expect(within(dialog).getAllByText('Вводится').length).toBeGreaterThan(0);
      expect(within(dialog).getAllByText('Вычисляется').length).toBeGreaterThan(0);
      expect(within(dialog).getAllByText('Удельное').length).toBeGreaterThan(0);
      expect(within(dialog).getAllByText('Итог').length).toBeGreaterThan(0);
      expect(within(dialog).getAllByText('Применено').length).toBeGreaterThan(0);
      expect(within(dialog).getAllByText('Геометрия').length).toBeGreaterThan(0);
      expect(within(dialog).getAllByText('R').length).toBeGreaterThan(0);
      expect(within(dialog).getAllByText('Производное').length).toBeGreaterThan(0);
      expect(within(dialog).queryByText('Расчётное')).not.toBeInTheDocument();
      expect(within(dialog).queryByText('Шаг')).not.toBeInTheDocument();
      expect(within(dialog).queryByRole('spinbutton', { name: /^Шаг:/ })).not.toBeInTheDocument();
      expect(within(dialog).queryByRole('button', { name: /^Сбросить шаг:/ })).not.toBeInTheDocument();
      expect(within(rowByKey('name')).getByText('Вводится')).toBeInTheDocument();
      expect(within(rowByKey('pipe_material')).getByText('Вводится')).toBeInTheDocument();
      expect(within(dialog).getByRole('checkbox', {
        name: 'Минимальная температура окружающей среды',
      })).toBeInTheDocument();
      expect(within(dialog).getByRole('checkbox', {
        name: 'Максимальная температура окружающей среды',
      })).toBeInTheDocument();
      expect(dialog.querySelector('.column-layout-row[data-column-key="pipe_dn"]')).toBeNull();
      expect(within(rowByKey('total_heat_loss_design')).getByText('Вычисляется')).toBeInTheDocument();
      expect(within(rowByKey('total_heat_loss_design')).getByText('Итог')).toBeInTheDocument();
      expect(within(rowByKey('thermal_resistance')).getByText('Вычисляется')).toBeInTheDocument();
      expect(within(rowByKey('thermal_resistance')).getByText('R')).toBeInTheDocument();
      expect(dialog.querySelector('.column-layout-row[data-column-key="index"]')).toBeNull();
      expect(within(dialog).queryByText('Номер строки')).not.toBeInTheDocument();
      for (const serviceKey of ['heat_loss_status', 'type']) {
        expect(within(rowByKey(serviceKey)).queryByText('Вводится')).not.toBeInTheDocument();
        expect(within(rowByKey(serviceKey)).queryByText('Вычисляется')).not.toBeInTheDocument();
      }
      expect(screen.getByRole('button', {
        name: 'Фильтр Максимальная температура окружающей среды',
      })).toBeInTheDocument();
      await user.click(within(dialog).getByRole('checkbox', { name: 'Длина трубопровода' }));
      await user.click(within(dialog).getByRole('button', { name: 'Применить' }));

      await waitFor(() => {
        expect(screen.queryAllByRole('columnheader').map((header) => header.textContent)).not.toContain('DN');
      });
      const saved = JSON.parse(localStorage.getItem(HEATCALC_GUEST_TABLE_COLUMN_STORAGE_KEY) ?? '{}');
      expect(saved.types.pipe.visibleOrder).not.toContain('pipe_length');
      expect(saved.types.pipe.columns).not.toHaveProperty('pipe_dn');
      expect(saved.types.tank.visibleOrder).toContain('tank_dimensions');

      await user.click(screen.getByRole('button', { name: /Резервуар:/ }));
      await waitFor(() => {
        expect(screen.getByText('Резервуар прямоугольный')).toBeInTheDocument();
      });
      expect(screen.getAllByText('Габариты').length).toBeGreaterThan(0);
    }, HEATCALC_PAGE_TEST_TIMEOUT);
    it('сохраняет порядок и ширину колонок из окна «Настройки таблицы»', async () => {
      const { listObjects } = await import('@/api/projects');
      (listObjects as ReturnType<typeof vi.fn>).mockResolvedValue([makeObject()]);

      useProjectStore.getState().setCurrentProject(mockProject);
      const user = (await import('@testing-library/user-event')).default.setup();
      renderPage();

      await screen.findByText('Труба DN100');
      const dialog = await openTableSettingsDialog(user);
      const visibleColumnKeys = () =>
        Array.from(dialog.querySelectorAll('.column-layout-row:not(.hidden)'))
          .map((row) => row.getAttribute('data-column-key'));

      // TltNumberField (Ant InputNumber) exposes spinbutton
      const orderInput = within(dialog).getByRole('spinbutton', { name: 'Порядок: Длина трубопровода' });
      const widthInput = within(dialog).getByRole('spinbutton', { name: 'Ширина: Длина трубопровода' });
      fireEvent.change(orderInput, { target: { value: '3' } });
      expect(visibleColumnKeys().slice(0, 7)).toEqual([
        'heat_loss_status',
        'heat_loss_per_meter_base',
        'total_heat_loss_design',
        'name',
        'placement',
        'pipe_outer_diameter',
        'pipe_length',
      ]);
      fireEvent.blur(orderInput);
      await waitFor(() => {
        expect(visibleColumnKeys().slice(0, 7)).toEqual([
          'heat_loss_status',
          'heat_loss_per_meter_base',
          'pipe_length',
          'total_heat_loss_design',
          'name',
          'placement',
          'pipe_outer_diameter',
        ]);
      });
      fireEvent.change(widthInput, { target: { value: '12.5' } });
      fireEvent.blur(widthInput);
      await user.click(within(dialog).getByRole('button', { name: 'Применить' }));

      const saved = JSON.parse(localStorage.getItem(HEATCALC_GUEST_TABLE_COLUMN_STORAGE_KEY) ?? '{}');
      expect(saved.types.pipe.visibleOrder.slice(0, 8)).toEqual([
        'index',
        'heat_loss_status',
        'heat_loss_per_meter_base',
        'pipe_length',
        'total_heat_loss_design',
        'name',
        'placement',
        'pipe_outer_diameter',
      ]);
      expect(saved.types.pipe.columns.pipe_length).toMatchObject({ widthPct: 12.5 });
      expect(saved.types.pipe.columns).not.toHaveProperty('pipe_dn');
    }, HEATCALC_PAGE_TEST_TIMEOUT);
    it('не показывает выбор размера текста и принудительно использует compact для старых guest-настроек', async () => {
      const { listObjects } = await import('@/api/projects');
      (listObjects as ReturnType<typeof vi.fn>).mockResolvedValue([makeObject()]);
      localStorage.setItem(HEATCALC_GUEST_TABLE_VIEW_STORAGE_KEY, JSON.stringify({
        version: 2,
        fontSize: 'large',
        tableLabelFormat: 'short',
        settingsLabelFormat: 'full',
        formPlacement: 'top',
        sideFormWidthPct: 34,
        formSectionWeights: [1.655, 1.35, 1.2],
      }));

      useProjectStore.getState().setCurrentProject(mockProject);
      const user = (await import('@testing-library/user-event')).default.setup();
      renderPage();

      await screen.findByText('Труба DN100');
      await waitFor(() => {
        expect(document.querySelector('.calc-spreadsheet--compact')).toBeInTheDocument();
      });
      expect(document.querySelector('.calc-spreadsheet--large')).not.toBeInTheDocument();
      const dialog = await openTableSettingsDialog(user);
      await openTableSettingsOtherTab(user, dialog);
      expect(within(dialog).queryByText('Размер текста таблицы')).not.toBeInTheDocument();
      expect(within(dialog).queryByText('Крупный')).not.toBeInTheDocument();
      await user.click(within(dialog).getAllByText('Полные')[0]);
      await user.click(within(dialog).getByRole('button', { name: 'Применить' }));

      const saved = JSON.parse(localStorage.getItem(HEATCALC_GUEST_TABLE_VIEW_STORAGE_KEY) ?? '{}');
      expect(saved).toMatchObject({
        fontSize: 'compact',
        tableLabelFormat: 'full',
      });
      expect(saved).not.toHaveProperty('fontSizePx');
    }, HEATCALC_PAGE_TEST_TIMEOUT);
  });
});

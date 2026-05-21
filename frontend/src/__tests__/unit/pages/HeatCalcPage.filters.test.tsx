import { describe, it, expect, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { useProjectStore } from '@/store/projectStore';
import {
  HEATCALC_PAGE_TEST_TIMEOUT,
  makeObject,
  makeTank,
  mockProject,
  openColumnFilter,
  openTableSettingsDialog,
  renderPage,
  setupHeatCalcPageTest,
} from './HeatCalcPage.test-utils';

describe('HeatCalcPage filters', () => {
  setupHeatCalcPageTest();

  describe('Фильтры и сортировка таблицы', () => {
    it('фильтр по наименованию скрывает строки только в таблице, не меняя счётчики расчёта', async () => {
      const { listObjects } = await import('@/api/projects');
      const base = makeObject().params;
      (listObjects as ReturnType<typeof vi.fn>).mockResolvedValue([
        makeObject({ id: 'pipe-north', params: { ...base, name: 'Труба Север' } }),
        makeObject({ id: 'pipe-south', params: { ...base, name: 'Труба Юг' } }),
      ]);

      useProjectStore.getState().setCurrentProject(mockProject);
      const user = (await import('@testing-library/user-event')).default.setup();
      renderPage();

      await screen.findByText('Труба Север');
      await screen.findByText('Труба Юг');
      await openColumnFilter(user, 'Наименование');
      await user.type(await screen.findByLabelText('Поиск: Наименование'), 'юг');
      await user.click(screen.getByRole('button', { name: 'Применить' }));

      await waitFor(() => {
        expect(screen.queryByText('Труба Север')).not.toBeInTheDocument();
      });
      expect(screen.getByText('Труба Юг')).toBeInTheDocument();
      expect(screen.getByText('1/2')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Трубопровод:\s*1\/2/ })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Все:\s*2/ })).toBeInTheDocument();
    });

    it('range-фильтр по числовой колонке работает в отображаемых единицах и сбрасывается общей кнопкой', async () => {
      const { listObjects } = await import('@/api/projects');
      const base = makeObject().params;
      (listObjects as ReturnType<typeof vi.fn>).mockResolvedValue([
        makeObject({ id: 'pipe-60', params: { ...base, name: 'Труба 60', outer_diameter: 0.06 } }),
        makeObject({ id: 'pipe-219', params: { ...base, name: 'Труба 219', outer_diameter: 0.219 } }),
      ]);

      useProjectStore.getState().setCurrentProject(mockProject);
      const user = (await import('@testing-library/user-event')).default.setup();
      renderPage();

      await screen.findByText('Труба 60');
      await openColumnFilter(user, 'Наружный диаметр');
      await user.type(await screen.findByLabelText('Минимум: Наружный диаметр'), '100');
      await user.click(screen.getByRole('button', { name: 'Применить' }));

      await waitFor(() => {
        expect(screen.queryByText('Труба 60')).not.toBeInTheDocument();
      });
      expect(screen.getByText('Труба 219')).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Сбросить фильтры таблицы' }));
      expect(await screen.findByText('Труба 60')).toBeInTheDocument();
      expect(screen.getByText('Труба 219')).toBeInTheDocument();
    }, HEATCALC_PAGE_TEST_TIMEOUT);

    it('при скрытии колонки убирает невидимый фильтр по этой колонке', async () => {
      const { listObjects } = await import('@/api/projects');
      const base = makeObject().params;
      (listObjects as ReturnType<typeof vi.fn>).mockResolvedValue([
        makeObject({ id: 'pipe-60', params: { ...base, name: 'Труба 60', outer_diameter: 0.06 } }),
        makeObject({ id: 'pipe-219', params: { ...base, name: 'Труба 219', outer_diameter: 0.219 } }),
      ]);

      useProjectStore.getState().setCurrentProject(mockProject);
      const user = (await import('@testing-library/user-event')).default.setup();
      renderPage();

      await screen.findByText('Труба 60');
      await openColumnFilter(user, 'Наружный диаметр');
      await user.type(await screen.findByLabelText('Минимум: Наружный диаметр'), '100');
      await user.click(screen.getByRole('button', { name: 'Применить' }));
      await waitFor(() => {
        expect(screen.queryByText('Труба 60')).not.toBeInTheDocument();
      });

      const dialog = await openTableSettingsDialog(user);
      await user.click(within(dialog).getByRole('checkbox', { name: 'Наружный диаметр' }));
      await user.click(within(dialog).getByRole('button', { name: 'Применить' }));

      expect(await screen.findByText('Труба 60')).toBeInTheDocument();
      expect(screen.getByText('Труба 219')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Сбросить фильтры таблицы' })).toBeDisabled();
    }, HEATCALC_PAGE_TEST_TIMEOUT);

    it('сортировка по диаметру меняет только визуальный порядок строк', async () => {
      const { listObjects } = await import('@/api/projects');
      const base = makeObject().params;
      (listObjects as ReturnType<typeof vi.fn>).mockResolvedValue([
        makeObject({ id: 'pipe-219', sort_order: 0, params: { ...base, name: 'Труба 219', outer_diameter: 0.219 } }),
        makeObject({ id: 'pipe-60', sort_order: 1, params: { ...base, name: 'Труба 60', outer_diameter: 0.06 } }),
      ]);

      useProjectStore.getState().setCurrentProject(mockProject);
      const user = (await import('@testing-library/user-event')).default.setup();
      renderPage();

      await screen.findByText('Труба 219');
      await user.click(screen.getByRole('columnheader', { name: /Ø, мм/ }));

      await waitFor(() => {
        const rows = [...document.querySelectorAll('.calc-spreadsheet .ant-table-tbody > tr[data-row-key]')];
        expect(rows[0]).toHaveTextContent('Труба 60');
        expect(rows[1]).toHaveTextContent('Труба 219');
      });
      expect(screen.getByRole('button', { name: /Трубопровод:\s*2/ })).toBeInTheDocument();
    });

    it('фильтры труб не переносятся на резервуары', async () => {
      const { listObjects } = await import('@/api/projects');
      const base = makeObject().params;
      (listObjects as ReturnType<typeof vi.fn>).mockResolvedValue([
        makeObject({ id: 'pipe-north', params: { ...base, name: 'Труба Север' } }),
        makeObject({ id: 'pipe-south', params: { ...base, name: 'Труба Юг' } }),
        makeTank({ id: 'tank-main', params: { ...makeTank().params, name: 'Резервуар основной' } }),
      ]);

      useProjectStore.getState().setCurrentProject(mockProject);
      const user = (await import('@testing-library/user-event')).default.setup();
      renderPage();

      await screen.findByText('Труба Север');
      await openColumnFilter(user, 'Наименование');
      await user.type(await screen.findByLabelText('Поиск: Наименование'), 'юг');
      await user.click(screen.getByRole('button', { name: 'Применить' }));
      await waitFor(() => {
        expect(screen.queryByText('Труба Север')).not.toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /Резервуар:/ }));
      expect(await screen.findByText('Резервуар основной')).toBeInTheDocument();
      expect(screen.queryByText('1/1')).not.toBeInTheDocument();
    }, HEATCALC_PAGE_TEST_TIMEOUT);

    it('скрытая фильтром выбранная строка снимается с выбора, но форма остаётся открытой', async () => {
      const { listObjects } = await import('@/api/projects');
      const base = makeObject().params;
      (listObjects as ReturnType<typeof vi.fn>).mockResolvedValue([
        makeObject({ id: 'pipe-north', params: { ...base, name: 'Труба Север' } }),
        makeObject({ id: 'pipe-south', params: { ...base, name: 'Труба Юг' } }),
      ]);

      useProjectStore.getState().setCurrentProject(mockProject);
      const user = (await import('@testing-library/user-event')).default.setup();
      renderPage();

      await user.click(await screen.findByText('Труба Север'));
      await waitFor(() => {
        expect(screen.getByText('Режим: изменение')).toBeInTheDocument();
      });
      const table = document.querySelector<HTMLElement>('.calc-spreadsheet');
      expect(table).not.toBeNull();
      const rowCheckboxes = within(table!).getAllByRole('checkbox');
      await user.click(rowCheckboxes[1]);
      expect(await screen.findByRole('button', { name: /Трубопровод:\s*1\/2/ })).toBeInTheDocument();
      expect(screen.queryByText(/Выбрано:/)).not.toBeInTheDocument();

      await openColumnFilter(user, 'Наименование');
      await user.type(await screen.findByLabelText('Поиск: Наименование'), 'юг');
      await user.click(screen.getByRole('button', { name: 'Применить' }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Трубопровод:\s*1\/2/ })).toBeInTheDocument();
      });
      expect(screen.getByText('Режим: изменение')).toBeInTheDocument();
      expect(screen.getByText('Труба Юг')).toBeInTheDocument();
    }, HEATCALC_PAGE_TEST_TIMEOUT);

    it('при переключении типа очищает выбранные строки', async () => {
      const { listObjects } = await import('@/api/projects');
      (listObjects as ReturnType<typeof vi.fn>).mockResolvedValue([
        makeObject(),
        makeTank(),
      ]);

      useProjectStore.getState().setCurrentProject(mockProject);
      const user = (await import('@testing-library/user-event')).default.setup();
      renderPage();

      await screen.findByText('Труба DN100');
      const table = document.querySelector<HTMLElement>('.calc-spreadsheet');
      expect(table).not.toBeNull();
      const rowCheckboxes = within(table!).getAllByRole('checkbox');
      await user.click(rowCheckboxes[1]);

      expect(await screen.findByRole('button', { name: /Трубопровод:\s*1\/1/ })).toBeInTheDocument();
      expect(screen.queryByText(/Выбрано:/)).not.toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: /Резервуар:/ }));
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Резервуар:\s*1/ })).toHaveAttribute('aria-pressed', 'true');
      });
      expect(screen.queryByText(/Выбрано:/)).not.toBeInTheDocument();
    }, HEATCALC_PAGE_TEST_TIMEOUT);
  });
});

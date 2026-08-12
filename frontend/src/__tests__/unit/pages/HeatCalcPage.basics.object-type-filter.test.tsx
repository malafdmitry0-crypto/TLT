import { describe, it, expect, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { useProjectStore } from '@/store/projectStore';
import { useWorkspaceHeaderStore } from '@/store/workspaceHeaderStore';
import {
  HEATCALC_PAGE_TEST_TIMEOUT,
  getNormalGlideGrid,
  getNormalGlideRows,
  makeObject,
  makeTank,
  mockProject,
  openColumnFilter,
  renderPage,
  setupHeatCalcPageTest,
} from './HeatCalcPage.test-utils';

describe('HeatCalcPage basics — object type', () => {
  setupHeatCalcPageTest();

  describe('Переключатель типа объектов — filter', () => {
    it('обычный режим игнорирует старый флаг normalTableEngine=table и всегда показывает Glide', async () => {
      const { listObjects } = await import('@/api/projects');
      (listObjects as ReturnType<typeof vi.fn>).mockResolvedValue([makeObject()]);
      localStorage.setItem('heatcalc.normalTableEngine', 'table');

      useProjectStore.getState().setCurrentProject(mockProject);
      renderPage();

      expect(await screen.findByText('Труба DN100')).toBeInTheDocument();
      expect(getNormalGlideGrid()).toBeInTheDocument();
      expect(document.querySelector('.ant-table-wrapper')).not.toBeInTheDocument();
    }, HEATCALC_PAGE_TEST_TIMEOUT);

    it('по умолчанию показывает только трубопроводы', async () => {
      const { listObjects } = await import('@/api/projects');
      (listObjects as ReturnType<typeof vi.fn>).mockResolvedValue([
        makeObject(),
        makeTank(),
      ]);

      useProjectStore.getState().setCurrentProject(mockProject);
      renderPage();

      await waitFor(() => {
        expect(screen.getByText('Труба DN100')).toBeInTheDocument();
      });
      expect(screen.queryByText('Резервуар прямоугольный')).not.toBeInTheDocument();
      expect(screen.queryByText('DN')).not.toBeInTheDocument();
      expect(screen.getAllByText('Ø, мм').length).toBeGreaterThan(0);
      expect(screen.getAllByText('L, м').length).toBeGreaterThan(0);
      expect(screen.getAllByText('q до K, Вт/м').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Q проект., Вт').length).toBeGreaterThan(0);
      expect(screen.getByText('50,0')).toBeInTheDocument();
    });

    it('при переключении на резервуар показывает только резервуары и форму добавления резервуара', async () => {
      const { listObjects } = await import('@/api/projects');
      (listObjects as ReturnType<typeof vi.fn>).mockResolvedValue([
        makeObject(),
        makeTank(),
      ]);

      useProjectStore.getState().setCurrentProject(mockProject);
      const user = (await import('@testing-library/user-event')).default.setup();
      renderPage();

      const typeToolbar = screen.getByRole('toolbar', { name: 'Тип объекта и блок параметров' });
      expect(await screen.findByTestId('object-name-input', {}, { timeout: HEATCALC_PAGE_TEST_TIMEOUT })).toBeInTheDocument();
      // Правая форма «Алгоритм выбора кабеля» (ТНП orange block) рядом с теплорасчётом.
      expect(screen.getByText('Алгоритм выбора кабеля')).toBeInTheDocument();
      expect(document.querySelector('[data-testid="heat-cable-algorithm-form"]')).toBeInTheDocument();
      expect(screen.queryByText('Электропараметры и арматура')).not.toBeInTheDocument();
      // Structured heat: protected object-fields + layers table + cable panel.
      expect(document.querySelector('.object-wizard-wide-panel[data-panel="wide"]')).toBeInTheDocument();
      expect(document.querySelector('[data-testid="heat-pdf-three-column-form"]')).toBeInTheDocument();
      expect(document.querySelector('.object-wizard-side-panel')).not.toBeInTheDocument();
      expect(document.querySelector('[data-testid="heat-object-fields"]')).toBeInTheDocument();
      expect(document.querySelector('[data-testid="insulation-layers-table"]')).toBeInTheDocument();
      expect([...document.querySelectorAll('.inline-form-section-banner')].map((title) =>
        title.textContent?.replace(/\s+/g, ' ').trim(),
      )).toEqual(['Расчёт теплопотерь', 'Алгоритм выбора кабеля']);
      expect(within(typeToolbar).getByText('Режим: добавление')).toBeInTheDocument();
      await user.click(await within(typeToolbar).findByRole('button', { name: /Резервуар:/ }));
      expect(within(typeToolbar).getByRole('button', { name: /Резервуар:/ })).toHaveAttribute('aria-pressed', 'true');

      await waitFor(() => {
        expect(screen.getByText('Резервуар прямоугольный')).toBeInTheDocument();
      });
      await waitFor(() => {
        expect(within(typeToolbar).getByText('Режим: добавление')).toBeInTheDocument();
      });
      expect(useWorkspaceHeaderStore.getState().context).toBeNull();
      expect(screen.queryByText('Труба DN100')).not.toBeInTheDocument();
      expect(screen.getAllByText('Форма').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Габариты').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Размещение').length).toBeGreaterThan(0);
      expect(screen.getAllByText('q до K, Вт/м²').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Q проект., Вт').length).toBeGreaterThan(0);
      expect(screen.getByText('35,0')).toBeInTheDocument();
      expect(screen.queryByText('DN')).not.toBeInTheDocument();
      expect(screen.queryByText('L, м')).not.toBeInTheDocument();
      expect(screen.queryByText('Зад.')).not.toBeInTheDocument();
      expect(document.body.textContent).toMatch(/3\s*000.*2\s*000.*1\s*500 мм/);
      expect(screen.getByText('Алгоритм выбора кабеля')).toBeInTheDocument();
      expect(screen.getByTestId('tank-shape-select')).toBeInTheDocument();
      expect(screen.queryByText('Электропараметры и арматура')).not.toBeInTheDocument();
      expect([...document.querySelectorAll('.inline-form-section-banner')].map((title) =>
        title.textContent?.replace(/\s+/g, ' ').trim(),
      )).toEqual(['Расчёт теплопотерь', 'Алгоритм выбора кабеля']);

      await user.click(screen.getByText('Резервуар прямоугольный'));
      await waitFor(() => {
        expect(within(typeToolbar).getByText('Режим: изменение')).toBeInTheDocument();
      });

      await user.click(within(typeToolbar).getByRole('button', { name: /Трубопровод:/ }));
      expect(within(typeToolbar).getByRole('button', { name: /Трубопровод:/ })).toHaveAttribute('aria-pressed', 'true');
      await waitFor(() => {
        expect(within(typeToolbar).getByText('Режим: добавление')).toBeInTheDocument();
      });
      expect(screen.getByTestId('pipe-material-select')).toBeInTheDocument();
      expect(screen.queryByTestId('pipe-lambda-mode-select')).not.toBeInTheDocument();
      expect(screen.queryByTestId('tank-shape-select')).not.toBeInTheDocument();
    }, HEATCALC_PAGE_TEST_TIMEOUT);

    it('режим «Все» показывает трубопроводы и резервуары в одной таблице', async () => {
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

      expect(within(typeToolbar).getByRole('button', { name: /Все:/ })).toHaveAttribute('aria-pressed', 'true');
      expect(await screen.findByText('Труба DN100')).toBeInTheDocument();
      expect(await screen.findByText('Резервуар прямоугольный')).toBeInTheDocument();
      expect(screen.getAllByText('Тип').length).toBeGreaterThan(0);
    });

    it('режим «Все» поддерживает сортировку и фильтры в колонках при включённых коммерческих фичах', async () => {
      vi.stubEnv('VITE_COMMERCIAL_FEATURES_ENABLED', 'true');
      const { listObjects } = await import('@/api/projects');
      (listObjects as ReturnType<typeof vi.fn>).mockResolvedValue([
        makeObject({ id: 'pipe-beta', sort_order: 0, params: { ...makeObject().params, name: 'Бета труба' } }),
        makeTank({ id: 'tank-alpha', sort_order: 1, params: { ...makeTank().params, name: 'Альфа резервуар' } }),
      ]);

      useProjectStore.getState().setCurrentProject(mockProject);
      const user = (await import('@testing-library/user-event')).default.setup();
      renderPage();

      const typeToolbar = screen.getByRole('toolbar', { name: 'Тип объекта и блок параметров' });
      await user.click(await within(typeToolbar).findByRole('button', { name: /Все:/ }));
      expect(await screen.findByText('Бета труба')).toBeInTheDocument();
      expect(await screen.findByText('Альфа резервуар')).toBeInTheDocument();

      const heatTable = document.querySelector('.srs-table-wrap')! as HTMLElement;
      await user.click(within(heatTable).getByRole('columnheader', { name: /Наименование/ }));
      await waitFor(() => {
        const rows = getNormalGlideRows();
        expect(rows[0]).toHaveTextContent('Альфа резервуар');
        expect(rows[1]).toHaveTextContent('Бета труба');
      });

      await openColumnFilter(user, 'Наименование');
      await user.type(await screen.findByLabelText('Поиск: Наименование'), 'альфа');
      await user.click(screen.getByRole('button', { name: 'Применить' }));

      await waitFor(() => {
        expect(screen.queryByText('Бета труба')).not.toBeInTheDocument();
      });
      expect(screen.getByText('Альфа резервуар')).toBeInTheDocument();
      expect(screen.getByText('1/2')).toBeInTheDocument();
      expect(within(typeToolbar).getByRole('button', { name: /Все:\s*1\/2/ })).toBeInTheDocument();
    }, HEATCALC_PAGE_TEST_TIMEOUT);

  });
});

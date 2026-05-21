import { describe, it, expect, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { useProjectStore } from '@/store/projectStore';
import { HEATCALC_GUEST_TABLE_COLUMN_STORAGE_KEY } from '@/utils/heatCalcTableColumns';
import {
  HEATCALC_GUEST_TABLE_VIEW_STORAGE_KEY,
} from '@/utils/heatCalcTableViewSettings';
import { HEATCALC_GUEST_CALCULATION_DETAILS_STORAGE_KEY } from '@/utils/heatCalcCalculationDetailsSettings';
import {
  HEATCALC_GUEST_FIELD_INPUT_STORAGE_KEY,
} from '@/utils/heatCalcFieldInputSettings';
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

describe('HeatCalcPage settings', () => {
  setupHeatCalcPageTest();

  describe('Настройки таблицы и формы', () => {
    it('берёт дефолтные колонки из JSON и не пишет гостевой localStorage до изменения', async () => {
      const { listObjects } = await import('@/api/projects');
      (listObjects as ReturnType<typeof vi.fn>).mockResolvedValue([makeObject()]);

      useProjectStore.getState().setCurrentProject(mockProject);
      renderPage();

      await screen.findByText('Труба DN100');
      expect(screen.getAllByText('DN').length).toBeGreaterThan(0);
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
      expect(within(rowByKey('name')).getByText('Вводится')).toBeInTheDocument();
      expect(within(rowByKey('pipe_material')).getByText('Вводится')).toBeInTheDocument();
      expect(within(rowByKey('pipe_dn')).getByText('Вычисляется')).toBeInTheDocument();
      expect(within(rowByKey('total_heat_loss')).getByText('Вычисляется')).toBeInTheDocument();
      expect(within(rowByKey('total_heat_loss')).getByText('Итог')).toBeInTheDocument();
      expect(within(rowByKey('thermal_resistance')).getByText('Вычисляется')).toBeInTheDocument();
      expect(within(rowByKey('thermal_resistance')).getByText('R')).toBeInTheDocument();
      for (const serviceKey of ['index', 'heat_loss_status', 'type']) {
        expect(within(rowByKey(serviceKey)).queryByText('Вводится')).not.toBeInTheDocument();
        expect(within(rowByKey(serviceKey)).queryByText('Вычисляется')).not.toBeInTheDocument();
      }
      await user.click(within(dialog).getByRole('checkbox', { name: 'DN' }));
      await user.click(within(dialog).getByRole('button', { name: 'Применить' }));

      await waitFor(() => {
        expect(screen.queryAllByRole('columnheader').map((header) => header.textContent)).not.toContain('DN');
      });
      const saved = JSON.parse(localStorage.getItem(HEATCALC_GUEST_TABLE_COLUMN_STORAGE_KEY) ?? '{}');
      expect(saved.types.pipe.visibleOrder).not.toContain('pipe_dn');
      expect(saved.types.pipe.columns.pipe_dn).not.toHaveProperty('visible');
      expect(saved.types.pipe.columns.pipe_dn).not.toHaveProperty('order');
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

      const orderInput = within(dialog).getByRole('spinbutton', { name: 'Порядок: DN' });
      const widthInput = within(dialog).getByRole('spinbutton', { name: 'Ширина: DN' });
      fireEvent.change(orderInput, { target: { value: '3' } });
      expect(visibleColumnKeys().slice(0, 8)).toEqual([
        'index',
        'heat_loss_status',
        'heat_loss_per_meter',
        'total_heat_loss',
        'name',
        'placement',
        'pipe_outer_diameter',
        'pipe_dn',
      ]);
      fireEvent.blur(orderInput);
      await waitFor(() => {
        expect(visibleColumnKeys().slice(0, 8)).toEqual([
          'index',
          'heat_loss_status',
          'pipe_dn',
          'heat_loss_per_meter',
          'total_heat_loss',
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
        'pipe_dn',
        'heat_loss_per_meter',
        'total_heat_loss',
        'name',
        'placement',
        'pipe_outer_diameter',
      ]);
      expect(saved.types.pipe.columns.pipe_dn).toMatchObject({ widthPct: 12.5 });
      expect(saved.types.pipe.columns.pipe_dn).not.toHaveProperty('visible');
      expect(saved.types.pipe.columns.pipe_dn).not.toHaveProperty('order');
    }, HEATCALC_PAGE_TEST_TIMEOUT);

    it('сохраняет размер текста таблицы отдельной guest-настройкой', async () => {
      const { listObjects } = await import('@/api/projects');
      (listObjects as ReturnType<typeof vi.fn>).mockResolvedValue([makeObject()]);

      useProjectStore.getState().setCurrentProject(mockProject);
      const user = (await import('@testing-library/user-event')).default.setup();
      renderPage();

      await screen.findByText('Труба DN100');
      expect(localStorage.getItem(HEATCALC_GUEST_TABLE_VIEW_STORAGE_KEY)).toBeNull();
      const dialog = await openTableSettingsDialog(user);
      await openTableSettingsOtherTab(user, dialog);
      await user.click(within(dialog).getByText('Крупный'));
      await user.click(within(dialog).getByRole('button', { name: 'Применить' }));

      await waitFor(() => {
        expect(document.querySelector('.calc-spreadsheet--large')).toBeInTheDocument();
      });
      const saved = JSON.parse(localStorage.getItem(HEATCALC_GUEST_TABLE_VIEW_STORAGE_KEY) ?? '{}');
      expect(saved).toEqual({
        version: 1,
        fontSize: 'large',
        tableLabelFormat: 'short',
        settingsLabelFormat: 'full',
        inlineEditingEnabled: false,
        formPlacement: 'top',
        sideFormWidthPct: 34,
        formSectionWeights: [1.095, 1.35, 1.2, 0.56],
      });
      expect(saved).not.toHaveProperty('fontSizePx');
    }, HEATCALC_PAGE_TEST_TIMEOUT);

    it('сохраняет форматы названий для таблицы и настроек колонок', async () => {
      const { listObjects } = await import('@/api/projects');
      (listObjects as ReturnType<typeof vi.fn>).mockResolvedValue([makeObject()]);

      useProjectStore.getState().setCurrentProject(mockProject);
      const user = (await import('@testing-library/user-event')).default.setup();
      renderPage();

      await screen.findByText('Труба DN100');
      expect(screen.queryAllByRole('columnheader').some((header) =>
        header.textContent?.includes('Ø, мм'))).toBe(true);

      const dialog = await openTableSettingsDialog(user);
      await openTableSettingsOtherTab(user, dialog);
      await user.click(within(dialog).getAllByText('Полные')[0]);
      await user.click(within(dialog).getAllByText('Краткие')[1]);
      await user.click(within(dialog).getByRole('button', { name: 'Применить' }));

      await waitFor(() => {
        expect(screen.queryAllByRole('columnheader').some((header) =>
          header.textContent?.includes('Наружный диаметр'))).toBe(true);
      });
      const saved = JSON.parse(localStorage.getItem(HEATCALC_GUEST_TABLE_VIEW_STORAGE_KEY) ?? '{}');
      expect(saved).toMatchObject({
        tableLabelFormat: 'full',
        settingsLabelFormat: 'short',
      });

      const nextDialog = await openTableSettingsDialog(user);
      expect(within(nextDialog).getByText('Ø, мм')).toBeInTheDocument();
    }, HEATCALC_PAGE_TEST_TIMEOUT);

    it('сохраняет положение блока параметров в настройках отображения', async () => {
      const { listObjects } = await import('@/api/projects');
      (listObjects as ReturnType<typeof vi.fn>).mockResolvedValue([makeObject()]);

      useProjectStore.getState().setCurrentProject(mockProject);
      const user = (await import('@testing-library/user-event')).default.setup();
      renderPage();

      await screen.findByText('Труба DN100');
      const dialog = await openTableSettingsDialog(user);
      await openTableSettingsOtherTab(user, dialog);
      await user.click(within(dialog).getByText('Слева'));
      await user.click(within(dialog).getByRole('button', { name: 'Применить' }));

      await waitFor(() => {
        expect(document.querySelector('.heatcalc-workspace-layout--left')).toBeInTheDocument();
      });
      const saved = JSON.parse(localStorage.getItem(HEATCALC_GUEST_TABLE_VIEW_STORAGE_KEY) ?? '{}');
      expect(saved).toMatchObject({
        version: 1,
        fontSize: 'standard',
        tableLabelFormat: 'short',
        settingsLabelFormat: 'full',
        inlineEditingEnabled: false,
        formPlacement: 'left',
        sideFormWidthPct: 34,
      });
    }, HEATCALC_PAGE_TEST_TIMEOUT);

    it('запоминает ширину боковых областей после перетаскивания разделителя', async () => {
      const { listObjects } = await import('@/api/projects');
      (listObjects as ReturnType<typeof vi.fn>).mockResolvedValue([makeObject()]);

      useProjectStore.getState().setCurrentProject(mockProject);
      const user = (await import('@testing-library/user-event')).default.setup();
      renderPage();

      await screen.findByText('Труба DN100');
      const dialog = await openTableSettingsDialog(user);
      await openTableSettingsOtherTab(user, dialog);
      await user.click(within(dialog).getByText('Слева'));
      await user.click(within(dialog).getByRole('button', { name: 'Применить' }));

      await waitFor(() => {
        expect(document.querySelector('.heatcalc-workspace-layout--left')).toBeInTheDocument();
      });
      const layout = document.querySelector('.heatcalc-workspace-layout--left') as HTMLElement;
      expect(layout).toBeInTheDocument();
      vi.spyOn(layout, 'getBoundingClientRect').mockReturnValue({
        x: 0,
        y: 0,
        left: 0,
        top: 0,
        right: 1000,
        bottom: 600,
        width: 1000,
        height: 600,
        toJSON: () => ({}),
      } as DOMRect);

      const handle = screen.getByRole('separator', { name: 'Изменить ширину областей' });
      fireEvent.mouseDown(handle, { clientX: 340 });
      fireEvent.mouseMove(window, { clientX: 480 });
      fireEvent.mouseUp(window, { clientX: 480 });

      const saved = JSON.parse(localStorage.getItem(HEATCALC_GUEST_TABLE_VIEW_STORAGE_KEY) ?? '{}');
      expect(saved).toMatchObject({
        formPlacement: 'left',
        sideFormWidthPct: 48,
      });
    }, HEATCALC_PAGE_TEST_TIMEOUT);

    it('запоминает ширину горизонтальных областей формы после перетаскивания разделителя', async () => {
      const { listObjects } = await import('@/api/projects');
      (listObjects as ReturnType<typeof vi.fn>).mockResolvedValue([makeObject()]);

      useProjectStore.getState().setCurrentProject(mockProject);
      renderPage();

      await screen.findByText('Труба DN100');
      await waitFor(() => {
        expect(document.querySelector('.form-grid-srs')).toBeInTheDocument();
      });
      const grid = document.querySelector('.form-grid-srs') as HTMLElement;
      vi.spyOn(grid, 'getBoundingClientRect').mockReturnValue({
        x: 0,
        y: 0,
        left: 0,
        top: 0,
        right: 1400,
        bottom: 240,
        width: 1400,
        height: 240,
        toJSON: () => ({}),
      } as DOMRect);

      const handles = screen.getAllByRole('separator', { name: 'Изменить ширину областей формы' });
      fireEvent.mouseDown(handles[1], { clientX: 700 });
      fireEvent.mouseMove(window, { clientX: 820 });
      fireEvent.mouseUp(window, { clientX: 820 });

      const saved = JSON.parse(localStorage.getItem(HEATCALC_GUEST_TABLE_VIEW_STORAGE_KEY) ?? '{}');
      expect(saved.formPlacement).toBe('top');
      expect(saved.formSectionWeights[1]).toBeGreaterThan(1.35);
      expect(saved.formSectionWeights[2]).toBeLessThan(1.2);
    }, HEATCALC_PAGE_TEST_TIMEOUT);

    it('показывает расшифровку расчёта без ошибочного Tср', async () => {
      const { listObjects } = await import('@/api/projects');
      (listObjects as ReturnType<typeof vi.fn>).mockResolvedValue([
        makeObject({
          params: {
            ...makeObject().params,
            process_temperature: 60,
            ambient_temperature: -20,
            ambient_temperature_source: 'climate',
          },
          results: {
            heat_loss_per_meter: 50,
            total_heat_loss: 5000,
            alpha_vnesh: 24.1,
            safety_factor: 1.2,
            insulation_resistance: 1.5447,
            external_resistance: 0.0389,
            effective_length: 64,
          },
        }),
      ]);

      useProjectStore.getState().setCurrentProject(mockProject);
      const user = (await import('@testing-library/user-event')).default.setup();
      renderPage();

      await user.click(await screen.findByText('Труба DN100'));

      expect(await screen.findByText('Расшифровка расчёта:')).toBeInTheDocument();
      expect(screen.getByText('ΔT: 80°C')).toBeInTheDocument();
      expect(screen.getByText('α примен.: 24,1 Вт/м²К')).toBeInTheDocument();
      expect(screen.getByText('Lэфф: 64,0 м')).toBeInTheDocument();
      expect(screen.queryByText(/Tср/)).not.toBeInTheDocument();
      expect(screen.queryByText(/\(—\)/)).not.toBeInTheDocument();
    }, HEATCALC_PAGE_TEST_TIMEOUT);

    it('сохраняет настройки расшифровки расчёта отдельно от настроек таблицы', async () => {
      const { listObjects } = await import('@/api/projects');
      (listObjects as ReturnType<typeof vi.fn>).mockResolvedValue([makeObject()]);

      useProjectStore.getState().setCurrentProject(mockProject);
      const user = (await import('@testing-library/user-event')).default.setup();
      renderPage();

      await screen.findByText('Труба DN100');
      expect(localStorage.getItem(HEATCALC_GUEST_CALCULATION_DETAILS_STORAGE_KEY)).toBeNull();
      const dialog = await openTableSettingsDialog(user);
      await openTableSettingsOtherTab(user, dialog);
      await user.click(within(dialog).getByText('Подробно'));
      await user.click(within(dialog).getByRole('button', { name: 'Применить' }));

      const saved = JSON.parse(localStorage.getItem(HEATCALC_GUEST_CALCULATION_DETAILS_STORAGE_KEY) ?? '{}');
      expect(saved).toMatchObject({ version: 1, preset: 'detailed' });
      expect(saved.visibleMetrics).toContain('thermal_resistance');
      expect(saved.visibleMetrics).toContain('temperature_source');
    }, HEATCALC_PAGE_TEST_TIMEOUT);

    it('сохраняет гостевой шаг числового поля и применяет его в форме', async () => {
      const { listObjects } = await import('@/api/projects');
      (listObjects as ReturnType<typeof vi.fn>).mockResolvedValue([makeObject()]);

      useProjectStore.getState().setCurrentProject(mockProject);
      const user = (await import('@testing-library/user-event')).default.setup();
      renderPage();

      await screen.findByText('Труба DN100');
      await screen.findByText('Геометрия трубы');
      const dialog = await openTableSettingsDialog(user);
      const stepInput = within(dialog).getByRole('spinbutton', { name: 'Шаг: Наружный диаметр' });
      fireEvent.change(stepInput, { target: { value: '10' } });
      fireEvent.blur(stepInput);
      await user.click(within(dialog).getByRole('button', { name: 'Применить' }));

      const saved = JSON.parse(localStorage.getItem(HEATCALC_GUEST_FIELD_INPUT_STORAGE_KEY) ?? '{}');
      expect(saved.fields.pipe.outer_diameter_mm).toEqual({ step: 10 });
      await waitFor(() => {
        expect(screen.getByTestId('outer-diameter-input')).toHaveAttribute('step', '10');
      });
    }, HEATCALC_PAGE_TEST_TIMEOUT);
  });
});

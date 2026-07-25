/* eslint-disable @typescript-eslint/no-unused-vars -- scenario split keeps shared preamble fixtures */
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { useProjectStore } from '@/store/projectStore';
import { HEATCALC_GUEST_TABLE_COLUMN_STORAGE_KEY } from '@/utils/heatCalcTableColumns';
import {
  HEATCALC_GUEST_TABLE_VIEW_STORAGE_KEY,
} from '@/utils/heatCalcTableViewSettings';
import { HEATCALC_GUEST_CALCULATION_DETAILS_STORAGE_KEY } from '@/utils/heatCalcCalculationDetailsSettings';
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

describe('HeatCalcPage settings — panel layout geometry', () => {
  setupHeatCalcPageTest();
  describe('Настройки таблицы и формы', () => {
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
        version: 2,
        fontSize: 'compact',
        tableLabelFormat: 'short',
        settingsLabelFormat: 'full',
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
        sideFormWidthPct: 52,
      });
    }, HEATCALC_PAGE_TEST_TIMEOUT);

    it('wide-форма (top) не показывает section-resize handles — layout CSS grid', async () => {
      // После layout wide/side (ObjectWizardWidePanel) междесекционные separator'ы
      // сняты: sectionResizeEnabled=false, handles не рендерятся. Side-form resize
      // (слева/справа) покрыт соседним тестом «боковых областей».
      const { listObjects } = await import('@/api/projects');
      (listObjects as ReturnType<typeof vi.fn>).mockResolvedValue([makeObject()]);

      useProjectStore.getState().setCurrentProject(mockProject);
      renderPage();

      await screen.findByText('Труба DN100');
      await waitFor(() => {
        expect(document.querySelector('.form-grid-srs')).toBeInTheDocument();
      });
      expect(document.querySelector('.form-grid-srs--merged')).toBeInTheDocument();
      expect(document.querySelectorAll('.form-col-resize-handle')).toHaveLength(0);
      expect(
        screen.queryByRole('separator', { name: 'Изменить ширину областей формы' }),
      ).not.toBeInTheDocument();
      // Side workspace separator must not appear for top placement either.
      expect(
        screen.queryByRole('separator', { name: 'Изменить ширину областей' }),
      ).not.toBeInTheDocument();
    }, HEATCALC_PAGE_TEST_TIMEOUT);

  });
});

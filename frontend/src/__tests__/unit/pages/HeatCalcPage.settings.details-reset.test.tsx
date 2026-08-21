import { describe, it, expect, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { useProjectStore } from '@/store/projectStore';
import {
  HEATCALC_GUEST_TABLE_VIEW_STORAGE_KEY,
} from '@/utils/heatCalcTableViewSettings';
import { HEATCALC_GUEST_CALCULATION_DETAILS_STORAGE_KEY } from '@/utils/heatCalcCalculationDetailsSettings';
import {
  HEATCALC_PAGE_TEST_TIMEOUT,
  makeObject,
  mockProject,
  openTableSettingsDialog,
  openTableSettingsOtherTab,
  renderPage,
  setupHeatCalcPageTest,
} from './HeatCalcPage.test-utils';

describe('HeatCalcPage settings — details/reset', () => {
  setupHeatCalcPageTest();

  describe('Настройки таблицы и формы', () => {
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
    it('удаляет guest-настройки вида и расшифровки после сброса к дефолтам', async () => {
      const { listObjects } = await import('@/api/projects');
      (listObjects as ReturnType<typeof vi.fn>).mockResolvedValue([makeObject()]);

      useProjectStore.getState().setCurrentProject(mockProject);
      const user = (await import('@testing-library/user-event')).default.setup();
      renderPage();

      await screen.findByText('Труба DN100');
      const dialog = await openTableSettingsDialog(user);
      await openTableSettingsOtherTab(user, dialog);
      await user.click(within(dialog).getByText('Слева'));
      await user.click(within(dialog).getByText('Подробно'));
      await user.click(within(dialog).getByRole('button', { name: 'Применить' }));

      await waitFor(() => {
        expect(localStorage.getItem(HEATCALC_GUEST_TABLE_VIEW_STORAGE_KEY)).not.toBeNull();
        expect(localStorage.getItem(HEATCALC_GUEST_CALCULATION_DETAILS_STORAGE_KEY)).not.toBeNull();
      });

      const resetDialog = await openTableSettingsDialog(user);
      expect(within(resetDialog).queryByText('Шаг')).not.toBeInTheDocument();
      await openTableSettingsOtherTab(user, resetDialog);
      await user.click(within(resetDialog).getByText('Вверху'));
      await user.click(within(resetDialog).getByRole('button', { name: 'Сбросить расшифровку' }));
      await user.click(within(resetDialog).getByRole('button', { name: 'Применить' }));

      await waitFor(() => {
        expect(localStorage.getItem(HEATCALC_GUEST_TABLE_VIEW_STORAGE_KEY)).toBeNull();
        expect(localStorage.getItem(HEATCALC_GUEST_CALCULATION_DETAILS_STORAGE_KEY)).toBeNull();
      });
      await waitFor(() => {
        expect(screen.getByTestId('outer-diameter-input')).toHaveAttribute('step', '1');
      });
    }, HEATCALC_PAGE_TEST_TIMEOUT);
  });
});

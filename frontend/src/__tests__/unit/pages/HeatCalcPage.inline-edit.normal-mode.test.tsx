/* eslint-disable @typescript-eslint/no-unused-vars -- scenario split keeps shared preamble fixtures */
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

describe('HeatCalcPage inline-edit — normal mode', () => {
  setupHeatCalcPageTest();
  describe('Inline-редактирование', () => {
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

  });
});

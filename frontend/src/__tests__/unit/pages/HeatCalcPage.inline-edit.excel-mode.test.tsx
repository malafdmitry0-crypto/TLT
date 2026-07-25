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

describe('HeatCalcPage inline-edit — excel mode', () => {
  setupHeatCalcPageTest();
  describe('Inline-редактирование', () => {
    function useGlideExcelEngineForDomCellTest() {
      vi.stubEnv('VITE_COMMERCIAL_FEATURES_ENABLED', 'true');
      localStorage.setItem(HEATCALC_EXCEL_ENGINE_STORAGE_KEY, 'glide');
    }

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

  });
});

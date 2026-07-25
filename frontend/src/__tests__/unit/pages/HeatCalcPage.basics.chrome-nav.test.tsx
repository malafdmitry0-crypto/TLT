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

describe('HeatCalcPage basics — chrome / nav', () => {
  setupHeatCalcPageTest();

  describe('Кнопка «Сформировать отчёт»', () => {
    it('отсутствует на странице при наличии проекта', () => {
      useProjectStore.getState().setCurrentProject(mockProject);
      renderPage();
      expect(screen.queryByText(/Сформировать отчёт/i)).not.toBeInTheDocument();
    });

    it('отсутствует на странице без проекта', () => {
      renderPage();
      expect(screen.queryByText(/Сформировать отчёт/i)).not.toBeInTheDocument();
    });
  });

  describe('Кнопка «Электрорасчёт»', () => {
    it('отсутствует на странице расчёта теплопотерь', () => {
      useProjectStore.getState().setCurrentProject(mockProject);
      renderPage();
      expect(screen.queryByRole('button', { name: /электрорасчёт/i })).not.toBeInTheDocument();
    });
  });

  describe('Навигация таблицы', () => {
    it('не показывает внутренние вкладки исходных данных и результатов', () => {
      useProjectStore.getState().setCurrentProject(mockProject);
      renderPage();
      expect(screen.queryByRole('button', { name: 'Исходные данные' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Результаты расчёта' })).not.toBeInTheDocument();
      expect(screen.queryByText('Тип кабеля:')).not.toBeInTheDocument();
    });
  });
});

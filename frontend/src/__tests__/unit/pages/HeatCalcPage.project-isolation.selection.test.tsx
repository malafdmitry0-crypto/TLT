/* eslint-disable @typescript-eslint/no-unused-vars -- scenario split keeps shared preamble */
/**
 * RISK-HEAT-CHAR-01 — high-level project isolation for HeatCalcPage.
 *
 * Characterizes observable workspace isolation after project A → B:
 * rows, drafts, selection, active cell / edit mode, pagination, and request scope.
 * Production changes are out of scope for this slice.
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { useProjectStore } from '@/store/projectStore';
import { HEATCALC_EXCEL_ENGINE_STORAGE_KEY } from '@/utils/heatCalcExcelEngine';
import {
  HEATCALC_PAGE_TEST_TIMEOUT,
  getExcelGlideGrid,
  getExcelGlideRows,
  getNormalGlideGrid,
  getNormalGlideRows,
  installProjectScopedObjects,
  makeObject,
  makeProject,
  renderPage,
  setupHeatCalcPageTest,
  switchCurrentProject,
} from './HeatCalcPage.test-utils';

const PROJECT_A = makeProject({ id: 'proj-a', name: 'Проект А' });
const PROJECT_B = makeProject({ id: 'proj-b', name: 'Проект Б' });

const PIPE_A1_NAME = 'Труба A-1';
const PIPE_A2_NAME = 'Труба A-2';
const PIPE_A3_NAME = 'Труба A-3';
const PIPE_B1_NAME = 'Труба B-1';
const PIPE_B2_NAME = 'Труба B-2';

function pipesForProject(
  projectId: string,
  names: string[],
): ReturnType<typeof makeObject>[] {
  return names.map((name, index) => makeObject({
    id: `${projectId}-pipe-${index + 1}`,
    project_id: projectId,
    sort_order: index,
    params: {
      ...makeObject().params,
      name,
    },
  }));
}

async function enableSmallPageSize() {
  const { getObjectQueryCapabilities } = await import('@/api/projects');
  (getObjectQueryCapabilities as ReturnType<typeof vi.fn>).mockImplementation(
    async (_projectId: string, objectType: 'pipe' | 'tank') => ({
      version: 1,
      object_type: objectType,
      default_page_size: 2,
      max_page_size: 200,
      default_sort: { key: 'sort_order', dir: 'asc' },
      search: { enabled: true, max_text_length: 120, default_columns: ['name'] },
      fields: [],
    }),
  );
}

function useGlideExcelEngine() {
  vi.stubEnv('VITE_COMMERCIAL_FEATURES_ENABLED', 'true');
  localStorage.setItem(HEATCALC_EXCEL_ENGINE_STORAGE_KEY, 'glide');
}

function queryCallsAfter(
  queryObjects: ReturnType<typeof vi.fn>,
  fromIndex: number,
): Array<[string, { page?: number; page_size?: number; object_type: string }]> {
  return queryObjects.mock.calls
    .slice(fromIndex)
    .map((call) => [call[0] as string, call[1] as { page?: number; page_size?: number; object_type: string }]);
}

function listCallsAfter(
  listObjects: ReturnType<typeof vi.fn>,
  fromIndex: number,
): string[] {
  return listObjects.mock.calls
    .slice(fromIndex)
    .map((call) => call[0] as string);
}

describe('HeatCalcPage project isolation — selection pruning', () => {
  setupHeatCalcPageTest();

    it('не оставляет checkbox-selection проекта A после перехода на B', async () => {
      await enableSmallPageSize();
      const projectAPipes = pipesForProject(PROJECT_A.id, [PIPE_A1_NAME, PIPE_A2_NAME]);
      const projectBPipes = pipesForProject(PROJECT_B.id, [PIPE_B1_NAME, PIPE_B2_NAME]);
      await installProjectScopedObjects({
        [PROJECT_A.id]: projectAPipes,
        [PROJECT_B.id]: projectBPipes,
      });

      useProjectStore.getState().setCurrentProject(PROJECT_A);
      renderPage();

      await screen.findByText(PIPE_A1_NAME);
      const table = getNormalGlideGrid();
      fireEvent.click(within(table).getByRole('checkbox', { name: `Выбрать ${PIPE_A1_NAME}` }));
      fireEvent.click(within(table).getByRole('checkbox', { name: `Выбрать ${PIPE_A2_NAME}` }));
      expect(screen.getByRole('button', { name: /Пересчитать теплопотери выбранных строк \(2\)/i }))
        .toBeInTheDocument();

      await switchCurrentProject(PROJECT_B);
      await waitFor(() => {
        expect(screen.getByText(PIPE_B1_NAME)).toBeInTheDocument();
      });

      expect(screen.queryByRole('button', { name: /Пересчитать теплопотери выбранных строк/i }))
        .not.toBeInTheDocument();
      const tableAfter = getNormalGlideGrid();
      for (const checkbox of within(tableAfter).getAllByRole('checkbox')) {
        expect(checkbox).not.toBeChecked();
      }
    }, HEATCALC_PAGE_TEST_TIMEOUT);

});

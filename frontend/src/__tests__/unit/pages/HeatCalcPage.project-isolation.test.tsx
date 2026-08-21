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

describe('HeatCalcPage project isolation', () => {
  setupHeatCalcPageTest();

  describe('normal mode', () => {
    it('после A → B не показывает rows/selection/draft/pagination проекта A и ходит только в B', async () => {
      const { listObjects, queryObjects } = await import('@/api/projects');
      const { enqueueHeatLossBatchJob } = await import('@/api/calculations');
      await enableSmallPageSize();

      const projectAPipes = pipesForProject(PROJECT_A.id, [PIPE_A1_NAME, PIPE_A2_NAME, PIPE_A3_NAME]);
      const projectBPipes = pipesForProject(PROJECT_B.id, [PIPE_B1_NAME, PIPE_B2_NAME]);
      await installProjectScopedObjects({
        [PROJECT_A.id]: projectAPipes,
        [PROJECT_B.id]: projectBPipes,
      });

      useProjectStore.getState().setCurrentProject(PROJECT_A);
      const user = (await import('@testing-library/user-event')).default.setup();
      renderPage();

      expect(await screen.findByText(PIPE_A1_NAME)).toBeInTheDocument();
      expect(screen.getByText(PIPE_A2_NAME)).toBeInTheDocument();
      expect(screen.queryByText(PIPE_A3_NAME)).not.toBeInTheDocument();

      const table = getNormalGlideGrid();
      fireEvent.click(within(table).getByRole('checkbox', { name: `Выбрать ${PIPE_A1_NAME}` }));
      expect(within(table).getByRole('checkbox', { name: `Выбрать ${PIPE_A1_NAME}` })).toBeChecked();

      await user.click(screen.getByText(PIPE_A1_NAME));
      await waitFor(() => {
        expect(screen.getByText('Режим: изменение')).toBeInTheDocument();
      });
      const lengthInput = await screen.findByTestId('pipe-length-input', {}, { timeout: HEATCALC_PAGE_TEST_TIMEOUT });
      await user.clear(lengthInput);
      await user.type(lengthInput, '42');
      expect(await screen.findByText(/Несохранено:\s*1/)).toBeInTheDocument();

      const nextPageButton = await screen.findByRole('button', { name: 'Следующая страница' });
      await user.click(nextPageButton);
      await waitFor(() => {
        expect(screen.getByText(PIPE_A3_NAME)).toBeInTheDocument();
      });
      expect(screen.getByTestId('normal-glide-current-page')).toHaveTextContent('2');
      expect(screen.getByText(PIPE_A1_NAME)).toBeInTheDocument();

      const queryCallsBeforeSwitch = (queryObjects as ReturnType<typeof vi.fn>).mock.calls.length;
      const listCallsBeforeSwitch = (listObjects as ReturnType<typeof vi.fn>).mock.calls.length;

      await switchCurrentProject(PROJECT_B);

      await waitFor(() => {
        expect(screen.getByText(PIPE_B1_NAME)).toBeInTheDocument();
      });
      expect(screen.getByText(PIPE_B2_NAME)).toBeInTheDocument();
      expect(screen.queryByText(PIPE_A1_NAME)).not.toBeInTheDocument();
      expect(screen.queryByText(PIPE_A2_NAME)).not.toBeInTheDocument();
      expect(screen.queryByText(PIPE_A3_NAME)).not.toBeInTheDocument();

      const tableAfter = getNormalGlideGrid();
      const checkboxes = within(tableAfter).getAllByRole('checkbox');
      expect(checkboxes.length).toBeGreaterThan(0);
      for (const checkbox of checkboxes) {
        expect(checkbox).not.toBeChecked();
      }
      expect(screen.queryByText(/Несохранено:/)).not.toBeInTheDocument();
      expect(document.querySelector('.row-dirty')).not.toBeInTheDocument();
      expect(document.querySelector('.row-excel-dirty')).not.toBeInTheDocument();
      expect(screen.queryByTestId('normal-glide-current-page')).not.toBeInTheDocument();
      expect(getNormalGlideRows().map((row) => row.getAttribute('data-row-key'))).toEqual(
        projectBPipes.map((pipe) => pipe.id),
      );

      const queriesAfterSwitch = queryCallsAfter(
        queryObjects as ReturnType<typeof vi.fn>,
        queryCallsBeforeSwitch,
      );
      expect(queriesAfterSwitch.length).toBeGreaterThan(0);
      for (const [projectId, payload] of queriesAfterSwitch) {
        expect(projectId).toBe(PROJECT_B.id);
        expect(payload.page ?? 1).toBe(1);
      }

      const listsAfterSwitch = listCallsAfter(
        listObjects as ReturnType<typeof vi.fn>,
        listCallsBeforeSwitch,
      );
      for (const projectId of listsAfterSwitch) {
        expect(projectId).toBe(PROJECT_B.id);
      }

      await user.click(screen.getByRole('button', { name: 'Пересчитать все' }));
      await waitFor(() => {
        expect(enqueueHeatLossBatchJob).toHaveBeenCalledWith(PROJECT_B.id, true, undefined);
      });
      expect(enqueueHeatLossBatchJob).not.toHaveBeenCalledWith(
        PROJECT_A.id,
        expect.anything(),
        expect.anything(),
      );
    }, HEATCALC_PAGE_TEST_TIMEOUT);
  });

  describe('Excel mode', () => {
    it('после A → B не переносит dirty draft, selection/active cell и rows проекта A', async () => {
      useGlideExcelEngine();
      const { listObjects, queryObjects, updateObject } = await import('@/api/projects');
      await enableSmallPageSize();

      const projectAPipes = pipesForProject(PROJECT_A.id, [PIPE_A1_NAME, PIPE_A2_NAME]);
      const projectBPipes = pipesForProject(PROJECT_B.id, [PIPE_B1_NAME, PIPE_B2_NAME]);
      await installProjectScopedObjects({
        [PROJECT_A.id]: projectAPipes,
        [PROJECT_B.id]: projectBPipes,
      });
      (updateObject as ReturnType<typeof vi.fn>).mockImplementation(
        async (projectId: string, objectId: string, payload: { params?: Record<string, unknown> }) => {
          const source = [...projectAPipes, ...projectBPipes].find((pipe) => pipe.id === objectId);
          if (!source) {
            throw new Error(`updateObject: unknown object ${objectId}`);
          }
          return {
            ...source,
            project_id: projectId,
            params: {
              ...source.params,
              ...(payload.params ?? {}),
            },
          };
        },
      );

      useProjectStore.getState().setCurrentProject(PROJECT_A);
      const user = (await import('@testing-library/user-event')).default.setup();
      renderPage();

      await screen.findByText(PIPE_A1_NAME);
      await user.click(screen.getByText('Excel-режим'));
      const excelGrid = await screen.findByTestId('excel-glide-grid', {}, { timeout: HEATCALC_PAGE_TEST_TIMEOUT });
      const rowA1 = (await within(excelGrid).findByText(PIPE_A1_NAME)).closest('tr');
      expect(rowA1).toBeInstanceOf(HTMLElement);
      const processCell = within(rowA1 as HTMLElement).getByRole('button', { name: '60' });
      await user.click(processCell);
      expect(processCell).toHaveAttribute('aria-selected', 'true');

      await user.dblClick(processCell);
      const editor = await within(rowA1 as HTMLElement).findByDisplayValue('60.0');
      fireEvent.change(editor, { target: { value: '75' } });
      fireEvent.keyDown(editor, { key: 'Enter' });

      const dirtyCell = await within(rowA1 as HTMLElement).findByRole('button', { name: '75' });
      expect(dirtyCell).toHaveClass('dirty');
      expect(rowA1).toHaveClass('row-excel-dirty');
      expect(await screen.findByText('Несохранено: 1')).toBeInTheDocument();

      const queryCallsBeforeSwitch = (queryObjects as ReturnType<typeof vi.fn>).mock.calls.length;
      const listCallsBeforeSwitch = (listObjects as ReturnType<typeof vi.fn>).mock.calls.length;

      await switchCurrentProject(PROJECT_B);

      await waitFor(() => {
        expect(screen.getByText(PIPE_B1_NAME)).toBeInTheDocument();
      });
      expect(screen.getByText(PIPE_B2_NAME)).toBeInTheDocument();
      expect(screen.queryByText(PIPE_A1_NAME)).not.toBeInTheDocument();
      expect(screen.queryByText(PIPE_A2_NAME)).not.toBeInTheDocument();
      // Excel mode keeps the draft chrome visible; isolation requires zero dirty rows from A.
      expect(screen.getByText('Несохранено: 0')).toBeInTheDocument();
      expect(screen.queryByText(/Несохранено:\s*[1-9]/)).not.toBeInTheDocument();
      expect(document.querySelector('.dirty')).not.toBeInTheDocument();
      expect(document.querySelector('.row-excel-dirty')).not.toBeInTheDocument();
      expect(document.querySelector('[aria-selected="true"]')).not.toBeInTheDocument();
      expect(document.querySelector('[data-excel-selected="true"]')).not.toBeInTheDocument();

      const excelAfter = getExcelGlideGrid();
      expect(within(excelAfter).queryByText(PIPE_A1_NAME)).not.toBeInTheDocument();
      expect(getExcelGlideRows().some((row) => row.getAttribute('data-row-key')?.startsWith(PROJECT_A.id)))
        .toBe(false);
      expect(getExcelGlideRows().map((row) => row.getAttribute('data-row-key'))).toEqual(
        expect.arrayContaining(projectBPipes.map((pipe) => pipe.id)),
      );

      const listsAfterSwitch = listCallsAfter(
        listObjects as ReturnType<typeof vi.fn>,
        listCallsBeforeSwitch,
      );
      expect(listsAfterSwitch.length).toBeGreaterThan(0);
      for (const projectId of listsAfterSwitch) {
        expect(projectId).toBe(PROJECT_B.id);
      }

      const queriesAfterSwitch = queryCallsAfter(
        queryObjects as ReturnType<typeof vi.fn>,
        queryCallsBeforeSwitch,
      );
      for (const [projectId] of queriesAfterSwitch) {
        expect(projectId).toBe(PROJECT_B.id);
      }

      const rowB1 = (await within(excelAfter).findByText(PIPE_B1_NAME)).closest('tr');
      expect(rowB1).toBeInstanceOf(HTMLElement);
      await user.dblClick(within(rowB1 as HTMLElement).getByRole('button', { name: '60' }));
      const editorB = await within(rowB1 as HTMLElement).findByDisplayValue('60.0');
      fireEvent.change(editorB, { target: { value: '80' } });
      fireEvent.keyDown(editorB, { key: 'Enter' });
      expect(await screen.findByText('Несохранено: 1')).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Сохранить' }));
      await waitFor(() => {
        expect(updateObject).toHaveBeenCalledWith(
          PROJECT_B.id,
          projectBPipes[0].id,
          expect.objectContaining({
            params: expect.objectContaining({ process_temperature: 80 }),
          }),
        );
      });
      expect(updateObject).not.toHaveBeenCalledWith(
        PROJECT_A.id,
        expect.anything(),
        expect.anything(),
      );
    }, HEATCALC_PAGE_TEST_TIMEOUT);

    it('не смешивает project-scoped state при возврате из Excel в normal на проекте B', async () => {
      useGlideExcelEngine();
      await enableSmallPageSize();

      const projectAPipes = pipesForProject(PROJECT_A.id, [PIPE_A1_NAME]);
      const projectBPipes = pipesForProject(PROJECT_B.id, [PIPE_B1_NAME, PIPE_B2_NAME]);
      await installProjectScopedObjects({
        [PROJECT_A.id]: projectAPipes,
        [PROJECT_B.id]: projectBPipes,
      });

      useProjectStore.getState().setCurrentProject(PROJECT_A);
      const user = (await import('@testing-library/user-event')).default.setup();
      renderPage();

      await screen.findByText(PIPE_A1_NAME);
      await user.click(screen.getByText('Excel-режим'));
      const excelGrid = await screen.findByTestId('excel-glide-grid', {}, { timeout: HEATCALC_PAGE_TEST_TIMEOUT });
      const rowA1 = (await within(excelGrid).findByText(PIPE_A1_NAME)).closest('tr');
      expect(rowA1).toBeInstanceOf(HTMLElement);
      await user.dblClick(within(rowA1 as HTMLElement).getByRole('button', { name: '60' }));
      const editor = await within(rowA1 as HTMLElement).findByDisplayValue('60.0');
      fireEvent.change(editor, { target: { value: '66' } });
      fireEvent.keyDown(editor, { key: 'Enter' });
      expect(await screen.findByText('Несохранено: 1')).toBeInTheDocument();

      await switchCurrentProject(PROJECT_B);
      await waitFor(() => {
        expect(screen.getByText(PIPE_B1_NAME)).toBeInTheDocument();
      });
      expect(screen.getByText('Несохранено: 0')).toBeInTheDocument();
      expect(screen.queryByText(/Несохранено:\s*[1-9]/)).not.toBeInTheDocument();

      await user.click(screen.getByText('Обычный режим'));
      await waitFor(() => {
        expect(getNormalGlideGrid()).toBeInTheDocument();
      });
      expect(screen.getByText(PIPE_B1_NAME)).toBeInTheDocument();
      expect(screen.getByText(PIPE_B2_NAME)).toBeInTheDocument();
      expect(screen.queryByText(PIPE_A1_NAME)).not.toBeInTheDocument();
      // Leaving Excel mode hides draft chrome when no dirty rows remain.
      expect(screen.queryByText(/Несохранено:/)).not.toBeInTheDocument();
      expect(document.querySelector('.row-dirty')).not.toBeInTheDocument();
      expect(document.querySelector('.row-excel-dirty')).not.toBeInTheDocument();

      const table = getNormalGlideGrid();
      for (const checkbox of within(table).getAllByRole('checkbox')) {
        expect(checkbox).not.toBeChecked();
      }
    }, HEATCALC_PAGE_TEST_TIMEOUT);
  });

  describe('selection pruning vs shared ids', () => {
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

      const table = getNormalGlideGrid();
      await screen.findByText(PIPE_A1_NAME);
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
});

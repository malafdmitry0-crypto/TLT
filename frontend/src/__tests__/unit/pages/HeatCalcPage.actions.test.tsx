import { describe, it, expect, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { useProjectStore } from '@/store/projectStore';
import { useWorkspaceHeaderStore } from '@/store/workspaceHeaderStore';
import {
  HEATCALC_PAGE_TEST_TIMEOUT,
  getNormalGlideGrid,
  getNormalGlideRows,
  makeObject,
  mockProject,
  renderPage,
  setupHeatCalcPageTest,
} from './HeatCalcPage.test-utils';

describe('HeatCalcPage actions', () => {
  setupHeatCalcPageTest();

  describe('Панель действий объекта', () => {
    it('запускает фоновый пересчёт теплопотерь и показывает прогресс', async () => {
      const { listObjects } = await import('@/api/projects');
      const { cancelCalcTask, enqueueHeatLossBatchJob, getCalcTask } = await import('@/api/calculations');
      (listObjects as ReturnType<typeof vi.fn>).mockResolvedValue([makeObject()]);

      useProjectStore.getState().setCurrentProject(mockProject);
      const user = (await import('@testing-library/user-event')).default.setup();
      renderPage();

      await screen.findByText('Труба DN100');
      await user.click(screen.getByRole('button', { name: 'Пересчитать все' }));

      await waitFor(() => {
        expect(enqueueHeatLossBatchJob).toHaveBeenCalledWith('proj-test-1', true, undefined);
      });
      await waitFor(() => {
        expect(getCalcTask).toHaveBeenCalledWith('heat-task-1');
      });
      expect(await screen.findByText(/Пересчёт теплопотерь выполняется · 1\/2 \(50%\)/i))
        .toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Отменить пересчёт теплопотерь' }));
      await waitFor(() => {
        expect(cancelCalcTask).toHaveBeenCalledWith('heat-task-1');
      });
    }, HEATCALC_PAGE_TEST_TIMEOUT);

    it('после успешного фонового пересчёта запрашивает свежие объекты', async () => {
      const { listObjects, getObjectsSummary } = await import('@/api/projects');
      const { getCalcTask } = await import('@/api/calculations');
      (listObjects as ReturnType<typeof vi.fn>).mockResolvedValue([makeObject()]);
      (getCalcTask as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'heat-task-1',
        type: 'heat_loss_batch',
        status: 'succeeded',
        project_id: 'proj-test-1',
        progress: { current: 1, total: 1, phase: 'done', percent: 100 },
        result: { updated: 1, failed: 0, errors: [] },
        error_message: null,
        cancel_requested: false,
        created_at: '2026-01-01T00:00:00Z',
        started_at: '2026-01-01T00:00:00Z',
        finished_at: '2026-01-01T00:00:01Z',
        links: {
          status: '/api/v1/calc/jobs/heat-task-1',
          result: '/api/v1/calc/jobs/heat-task-1/result',
          cancel: '/api/v1/calc/jobs/heat-task-1/cancel',
        },
      });

      useProjectStore.getState().setCurrentProject(mockProject);
      const user = (await import('@testing-library/user-event')).default.setup();
      renderPage();

      await screen.findByText('Труба DN100');
      await user.click(screen.getByRole('button', { name: 'Пересчитать все' }));

      await waitFor(() => {
        expect(getCalcTask).toHaveBeenCalledWith('heat-task-1');
      });
      await waitFor(() => {
        expect((getObjectsSummary as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThanOrEqual(2);
      });
    });

    it('запускает точечный пересчёт теплопотерь по выбранным строкам', async () => {
      const { listObjects } = await import('@/api/projects');
      const { enqueueHeatLossBatchJob } = await import('@/api/calculations');
      const source = makeObject();
      const secondSource = makeObject({
        id: 'obj-2',
        sort_order: 1,
        params: { ...source.params, name: 'Труба DN150' },
      });
      (listObjects as ReturnType<typeof vi.fn>).mockResolvedValue([source, secondSource]);

      useProjectStore.getState().setCurrentProject(mockProject);
      const user = (await import('@testing-library/user-event')).default.setup();
      renderPage();

      await screen.findByText('Труба DN100');
      const table = getNormalGlideGrid();
      fireEvent.click(within(table).getByRole('checkbox', { name: 'Выбрать Труба DN100' }));
      fireEvent.click(within(table).getByRole('checkbox', { name: 'Выбрать Труба DN150' }));
      await user.click(screen.getByRole('button', { name: /Пересчитать теплопотери выбранных строк \(2\)/i }));

      await waitFor(() => {
        expect(enqueueHeatLossBatchJob).toHaveBeenCalledWith('proj-test-1', true, [source.id, secondSource.id]);
      });
    }, HEATCALC_PAGE_TEST_TIMEOUT);

    it('запускает точечный пересчёт теплопотерь по активной строке без checkbox-selection', async () => {
      const { listObjects } = await import('@/api/projects');
      const { enqueueHeatLossBatchJob } = await import('@/api/calculations');
      const source = makeObject();
      const secondSource = makeObject({
        id: 'obj-2',
        sort_order: 1,
        params: { ...source.params, name: 'Труба DN150' },
      });
      (listObjects as ReturnType<typeof vi.fn>).mockResolvedValue([source, secondSource]);

      useProjectStore.getState().setCurrentProject(mockProject);
      const user = (await import('@testing-library/user-event')).default.setup();
      renderPage();

      await user.click(await screen.findByText('Труба DN150'));
      await waitFor(() => {
        expect(screen.getByText('Режим: изменение')).toBeInTheDocument();
      });
      await user.click(screen.getByRole('button', { name: /Пересчитать теплопотери активной строки/i }));

      await waitFor(() => {
        expect(enqueueHeatLossBatchJob).toHaveBeenCalledWith('proj-test-1', true, [secondSource.id]);
      });
    }, HEATCALC_PAGE_TEST_TIMEOUT);

    it('оставляет отдельную кнопку пересчёта всех объектов при активной строке', async () => {
      const { listObjects } = await import('@/api/projects');
      const { enqueueHeatLossBatchJob } = await import('@/api/calculations');
      const source = makeObject();
      const secondSource = makeObject({
        id: 'obj-2',
        sort_order: 1,
        params: { ...source.params, name: 'Труба DN150' },
      });
      (listObjects as ReturnType<typeof vi.fn>).mockResolvedValue([source, secondSource]);

      useProjectStore.getState().setCurrentProject(mockProject);
      const user = (await import('@testing-library/user-event')).default.setup();
      renderPage();

      await user.click(await screen.findByText('Труба DN150'));
      await waitFor(() => {
        expect(screen.getByText('Режим: изменение')).toBeInTheDocument();
      });
      await user.click(screen.getByRole('button', { name: 'Пересчитать все' }));

      await waitFor(() => {
        expect(enqueueHeatLossBatchJob).toHaveBeenCalledWith('proj-test-1', true, undefined);
      });
    }, HEATCALC_PAGE_TEST_TIMEOUT);

    it('после сохранения редактируемого объекта отправляет version и остаётся на возвращённой записи', async () => {
      const { listObjects, updateObject } = await import('@/api/projects');
      const source = makeObject({ version: 7 });
      (listObjects as ReturnType<typeof vi.fn>).mockResolvedValue([source]);
      (updateObject as ReturnType<typeof vi.fn>).mockResolvedValue(
        makeObject({
          id: source.id,
          version: 8,
          params: { ...source.params, name: 'Труба DN100 сервер' },
        }),
      );

      useProjectStore.getState().setCurrentProject(mockProject);
      const user = (await import('@testing-library/user-event')).default.setup();
      renderPage();

      await user.click(await screen.findByText('Труба DN100'));
      await waitFor(() => {
        expect(screen.getByText('Режим: изменение')).toBeInTheDocument();
      });
      expect(useWorkspaceHeaderStore.getState().context).toBeNull();

      const toolbarSaveButton = screen
        .getAllByRole('button', { name: 'Сохранить' })
        .find((button) => button.classList.contains('action-save-button'));
      expect(toolbarSaveButton).toBeDefined();
      await screen.findByTestId('object-name-input');
      await user.click(toolbarSaveButton!);

      await waitFor(() => {
        expect(updateObject).toHaveBeenCalledWith(
          'proj-test-1',
          source.id,
          expect.objectContaining({
            version: 7,
            params: expect.objectContaining({
              name: 'Труба DN100',
            }),
          }),
        );
      });
      await waitFor(() => {
        expect(screen.getByText('Режим: изменение')).toBeInTheDocument();
      });
      expect(screen.getByText('Расчёт теплопотерь')).toBeInTheDocument();
      await waitFor(() => {
        expect(screen.getByDisplayValue('Труба DN100 сервер')).toBeInTheDocument();
      });
    });

    it('создаёт копии объектов, выбранных галочками', async () => {
      const { listObjects, createObject } = await import('@/api/projects');
      const source = makeObject();
      const secondSource = makeObject({
        id: 'obj-2',
        sort_order: 1,
        params: { ...source.params, name: 'Труба DN150' },
      });
      const objects = [source, secondSource];
      (listObjects as ReturnType<typeof vi.fn>).mockImplementation(async () => objects);
      (createObject as ReturnType<typeof vi.fn>).mockImplementation(
        async (_projectId: string, payload: { object_type: 'pipe' | 'tank'; params: Record<string, unknown>; sort_order: number }) => {
          const created = makeObject({
            id: `copy-${payload.sort_order}`,
            object_type: payload.object_type,
            params: payload.params,
            sort_order: payload.sort_order,
          });
          objects.push(created);
          return created;
        },
      );

      useProjectStore.getState().setCurrentProject(mockProject);
      renderPage();

      await screen.findByText('Труба DN100');
      const table = getNormalGlideGrid();
      fireEvent.click(within(table).getByRole('checkbox', { name: 'Выбрать Труба DN100' }));
      fireEvent.click(within(table).getByRole('checkbox', { name: 'Выбрать Труба DN150' }));
      fireEvent.click(screen.getByRole('button', { name: 'Добавить копии выбранных' }));

      await waitFor(() => {
        expect(createObject).toHaveBeenCalledTimes(2);
      });
      expect(createObject).toHaveBeenNthCalledWith(
        1,
        'proj-test-1',
        expect.objectContaining({
          object_type: 'pipe',
          params: expect.objectContaining({ name: 'Труба DN100 (копия)' }),
          sort_order: 2,
        }),
      );
      expect(createObject).toHaveBeenNthCalledWith(
        2,
        'proj-test-1',
        expect.objectContaining({
          object_type: 'pipe',
          params: expect.objectContaining({ name: 'Труба DN150 (копия)' }),
          sort_order: 3,
        }),
      );
      await waitFor(() => {
        expect(screen.getByText('Режим: изменение')).toBeInTheDocument();
        expect(screen.getByTestId('object-name-input')).toHaveValue('Труба DN150 (копия)');
      });
      await waitFor(() => {
        const rows = getNormalGlideRows();
        const focusedRow = rows.find((row) => row.textContent?.includes('Труба DN150 (копия)'));
        expect(focusedRow).toHaveClass('row-selected');
        expect(within(focusedRow as HTMLElement).getByRole('checkbox')).not.toBeChecked();
      });
    }, HEATCALC_PAGE_TEST_TIMEOUT);

    it('удаляет объекты, выбранные галочками', async () => {
      const { listObjects, deleteObject } = await import('@/api/projects');
      const source = makeObject();
      const secondSource = makeObject({
        id: 'obj-2',
        sort_order: 1,
        params: { ...source.params, name: 'Труба DN150' },
      });
      (listObjects as ReturnType<typeof vi.fn>).mockResolvedValue([source, secondSource]);
      (deleteObject as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      useProjectStore.getState().setCurrentProject(mockProject);
      renderPage();

      await screen.findByText('Труба DN100');
      const table = getNormalGlideGrid();
      fireEvent.click(within(table).getByRole('checkbox', { name: 'Выбрать Труба DN100' }));
      fireEvent.click(within(table).getByRole('checkbox', { name: 'Выбрать Труба DN150' }));
      fireEvent.click(screen.getByRole('button', { name: 'Удалить выбранные' }));
      fireEvent.click(await screen.findByRole('button', { name: 'Удалить' }));

      await waitFor(() => {
        expect(deleteObject).toHaveBeenCalledTimes(2);
      });
      expect(deleteObject).toHaveBeenNthCalledWith(
        1,
        'proj-test-1',
        source.id,
      );
      expect(deleteObject).toHaveBeenNthCalledWith(
        2,
          'proj-test-1',
        secondSource.id,
      );
    }, HEATCALC_PAGE_TEST_TIMEOUT);
  });
});

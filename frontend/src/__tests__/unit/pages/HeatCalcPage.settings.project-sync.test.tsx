/**
 * Кейс §5.9/§5.11: гостевые настройки отображения живут на проекте.
 * Сохранение пишет display-settings проекта; загрузка проекта с настройками
 * применяет их даже при чистом localStorage («Скачать → очистить → Загрузить»).
 */
import { describe, it, expect, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { useProjectStore } from '@/store/projectStore';
import {
  getDefaultTableColumnSettings,
  setTableColumnVisibility,
} from '@/utils/heatCalcTableColumns';
import {
  HEATCALC_PAGE_TEST_TIMEOUT,
  makeObject,
  mockProject,
  openTableSettingsDialog,
  renderPage,
  setupHeatCalcPageTest,
} from './HeatCalcPage.test-utils';

describe('HeatCalcPage settings — project display-settings sync (guest)', () => {
  setupHeatCalcPageTest();

  it('сохранение колонок гостем пишет display-settings проекта', async () => {
    const { listObjects } = await import('@/api/projects');
    const { updateProjectDisplaySettings } = await import('@/api/displaySettings');
    (listObjects as ReturnType<typeof vi.fn>).mockResolvedValue([makeObject()]);

    useProjectStore.getState().setCurrentProject(mockProject);
    const user = (await import('@testing-library/user-event')).default.setup();
    renderPage();

    await screen.findByText('Труба DN100');
    const dialog = await openTableSettingsDialog(user);
    await user.click(within(dialog).getByRole('checkbox', { name: 'Длина трубопровода' }));
    await user.click(within(dialog).getByRole('button', { name: 'Применить' }));

    await waitFor(() => {
      expect(updateProjectDisplaySettings).toHaveBeenCalled();
    });
    const [projectId, expectedVersion, payload] = (
      updateProjectDisplaySettings as ReturnType<typeof vi.fn>
    ).mock.calls.at(-1)!;
    expect(projectId).toBe(mockProject.id);
    expect(expectedVersion).toBe(0);
    const section = payload.heatcalc as {
      tableColumns?: { types: { pipe: { visibleOrder: string[] } } };
    };
    expect(section.tableColumns).toBeDefined();
    expect(section.tableColumns!.types.pipe.visibleOrder).not.toContain('pipe_length');
  }, HEATCALC_PAGE_TEST_TIMEOUT);

  it('применяет проектные настройки при чистом localStorage (перенос файла на другую машину)', async () => {
    const { listObjects } = await import('@/api/projects');
    const { getProjectDisplaySettings, updateProjectDisplaySettings } = await import(
      '@/api/displaySettings'
    );
    (listObjects as ReturnType<typeof vi.fn>).mockResolvedValue([makeObject()]);
    const savedColumns = setTableColumnVisibility(
      getDefaultTableColumnSettings(), 'pipe', 'pipe_length', false,
    );
    (getProjectDisplaySettings as ReturnType<typeof vi.fn>).mockResolvedValue({
      project_id: mockProject.id,
      version: 2,
      settings: { heatcalc: { tableColumns: savedColumns } },
    });

    useProjectStore.getState().setCurrentProject(mockProject);
    renderPage();

    await screen.findByText('Труба DN100');
    await waitFor(() => {
      expect(
        screen.queryAllByRole('columnheader').map((header) => header.textContent),
      ).not.toContain('DN');
    }, { timeout: HEATCALC_PAGE_TEST_TIMEOUT });
    // Настройки не пишутся обратно на сервер: применение — не изменение.
    expect(updateProjectDisplaySettings).not.toHaveBeenCalled();
  }, HEATCALC_PAGE_TEST_TIMEOUT);

  it('не мигрирует дефолтные настройки на проект при version=0', async () => {
    const { listObjects } = await import('@/api/projects');
    const { getProjectDisplaySettings, updateProjectDisplaySettings } = await import(
      '@/api/displaySettings'
    );
    (listObjects as ReturnType<typeof vi.fn>).mockResolvedValue([makeObject()]);
    // mockResolvedValue из соседнего теста переживает clearAllMocks — задаём явно.
    (getProjectDisplaySettings as ReturnType<typeof vi.fn>).mockResolvedValue({
      project_id: mockProject.id,
      version: 0,
      settings: {},
    });

    useProjectStore.getState().setCurrentProject(mockProject);
    renderPage();

    await screen.findByText('Труба DN100');
    await waitFor(() => {
      expect(getProjectDisplaySettings).toHaveBeenCalled();
    });
    expect(updateProjectDisplaySettings).not.toHaveBeenCalled();
  }, HEATCALC_PAGE_TEST_TIMEOUT);
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { useProjectStore } from '@/store/projectStore';
import { ELECTRICAL_GUEST_TABLE_COLUMN_STORAGE_KEY } from '@/utils/electricalTableColumns';
import {
  mockProject,
  makeObject,
  makeElectricalPage,
  renderPage,
} from '@/__tests__/integration/pages/electrical/elecCalcPageHarness';
import { resetElecCalcIntegrationState } from '@/__tests__/integration/pages/electrical/elecCalcPageTestEnv';
import '@/__tests__/integration/pages/electrical/elecCalcPageTestEnv';

describe('ElecCalcPage catalog / recalculation / selection — cable mark UI', () => {
  beforeEach(() => {
    resetElecCalcIntegrationState();
  });

  it('не показывает источник ручного выбора в колонке марки', async () => {
    const { getElectricalPage } = await import('@/api/calculations');
    const objects = [
      makeObject({ id: 'o-1', params: { name: 'Труба-1' } }),
      makeObject({ id: 'o-2', sort_order: 1, params: { name: 'Труба-2' } }),
    ];
    (getElectricalPage as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeElectricalPage(objects, [
        {
          id: 'c-1',
          object_id: 'o-1',
          cable_type: 'self_regulating_tt',
          cable_mark: '30ТТВ2-СТ',
          cable_mark_source: 'manual',
          variant_number: 1,
          results: { selected_cable: '30ТТВ2-СТ' },
        },
        {
          id: 'c-2',
          object_id: 'o-2',
          cable_type: 'self_regulating_tt',
          cable_mark: '30ТТВ2-СТ',
          cable_mark_source: 'auto',
          variant_number: 1,
          results: { selected_cable: '30ТТВ2-СТ' },
        },
      ]),
    );
    useProjectStore.getState().setCurrentProject(mockProject);
    localStorage.setItem(ELECTRICAL_GUEST_TABLE_COLUMN_STORAGE_KEY, JSON.stringify({
      version: 1,
      visibleOrder: ['index', 'object_name', 'cable_type', 'cable_mark'],
      columns: { cable_mark: { widthPct: 18 } },
    }));
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('row', { name: /Труба-1/ })).toHaveTextContent('30ТТВ2-СТ');
      expect(screen.getByRole('row', { name: /Труба-1/ })).not.toHaveTextContent('ручн.');
      expect(screen.getByRole('row', { name: /Труба-2/ })).not.toHaveTextContent('ручн.');
    });
  });

  it('оставляет в активной ячейке марки только единый сценарий выбора', async () => {
    const { getElectricalPage } = await import('@/api/calculations');
    (getElectricalPage as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeElectricalPage([makeObject({ params: { name: 'Труба-1' } })], [{
        id: 'c-1',
        object_id: 'o-1',
        cable_type: 'self_regulating_tt',
        cable_mark: '30ТТВ2-СТ',
        cable_mark_source: 'manual',
        variant_number: 1,
        results: { selected_cable: '30ТТВ2-СТ' },
      }]),
    );
    useProjectStore.getState().setCurrentProject(mockProject);
    localStorage.setItem(ELECTRICAL_GUEST_TABLE_COLUMN_STORAGE_KEY, JSON.stringify({
      version: 1,
      visibleOrder: ['index', 'object_name', 'cable_mark'],
      columns: { cable_mark: { widthPct: 22 } },
    }));
    renderPage();

    const row = await screen.findByRole('row', { name: /Труба-1/ });
    fireEvent.click(row);

    expect(within(row).getByRole('button', { name: 'Выбор' })).toBeEnabled();
    expect(within(row).queryByRole('button', { name: 'Подбор' })).not.toBeInTheDocument();
  });
});

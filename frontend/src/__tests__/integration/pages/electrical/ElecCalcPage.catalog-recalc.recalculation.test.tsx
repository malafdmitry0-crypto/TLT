/* eslint-disable @typescript-eslint/no-unused-vars -- scenario split keeps shared preamble fixtures */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { useProjectStore } from '@/store/projectStore';
import { ELECTRICAL_GUEST_TABLE_COLUMN_STORAGE_KEY } from '@/utils/electricalTableColumns';
import { mockProject, makeObject, makeElectricalPage, renderPage } from '@/__tests__/integration/pages/electrical/elecCalcPageHarness';
import { apiMocks, electricalVariantApiMocks, resetElecCalcIntegrationState } from '@/__tests__/integration/pages/electrical/elecCalcPageTestEnv';
import '@/__tests__/integration/pages/electrical/elecCalcPageTestEnv';

describe('ElecCalcPage catalog-recalc — recalculation scope', () => {
  beforeEach(() => {
    resetElecCalcIntegrationState();
  });

  it('применяет выбранный сверху тип ко всем объектам при полном пересчёте', async () => {
    const { enqueueElectricalBatchJob, getElectricalPage } = await import('@/api/calculations');
    (getElectricalPage as ReturnType<typeof vi.fn>).mockResolvedValue(makeElectricalPage([makeObject()]));
    (enqueueElectricalBatchJob as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'task-1',
      type: 'electrical_batch',
      status: 'enqueued',
      project_id: 'p-1',
      progress: { current: 0, total: null, phase: 'enqueued', percent: null },
      result: null,
      error_message: null,
      cancel_requested: false,
      created_at: '2026-01-01T00:00:00Z',
      started_at: null,
      finished_at: null,
      links: { status: '', result: '', cancel: '' },
    });
    useProjectStore.getState().setCurrentProject(mockProject);
    const user = (await import('@testing-library/user-event')).default.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/Тип для пересчёта/i)).toBeInTheDocument();
      expect(screen.getByText('Труба-1')).toBeInTheDocument();
    });
    expect(screen.getAllByText('ТТН/ТТВ/ТТХ').length).toBeGreaterThan(0);
    await user.type(await screen.findByLabelText('T3 поддержания'), '50');
    await user.click(screen.getByRole('button', { name: /Пересчитать все · ЭР1/i }));
    await user.click(await screen.findByRole('button', { name: /Да, пересчитать все/i }));

    await waitFor(() => {
      expect(enqueueElectricalBatchJob).toHaveBeenCalledWith(
        'p-1',
        'builtin',
        1,
        'self_regulating_tt',
        expect.objectContaining({
          aggressiveProduct: false,
          maintainTemperature: 50,
          forceCableType: true,
          skipManual: true,
        }),
      );
    });
    const options = (enqueueElectricalBatchJob as ReturnType<typeof vi.fn>).mock.calls[0][4];
    expect(options.objectIds).toBeUndefined();
    expect(options.objectOverrides).toBeUndefined();
  });

  it('пересчитывает только выбранную строку без лишнего override при единственном типе', async () => {
    const { enqueueElectricalBatchJob, getElectricalPage } = await import('@/api/calculations');
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
          variant_number: 1,
          results: { selected_cable: '30ТТВ2-СТ' },
        },
        {
          id: 'c-2',
          object_id: 'o-2',
          cable_type: 'self_regulating_tt',
          cable_mark: '30ТТВ2-СТ',
          variant_number: 1,
          results: { selected_cable: '30ТТВ2-СТ' },
        },
      ]),
    );
    (enqueueElectricalBatchJob as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'task-1',
      type: 'electrical_batch',
      status: 'enqueued',
      project_id: 'p-1',
      progress: { current: 0, total: null, phase: 'enqueued', percent: null },
      result: null,
      error_message: null,
      cancel_requested: false,
      created_at: '2026-01-01T00:00:00Z',
      started_at: null,
      finished_at: null,
      links: { status: '', result: '', cancel: '' },
    });
    useProjectStore.getState().setCurrentProject(mockProject);
    localStorage.setItem(ELECTRICAL_GUEST_TABLE_COLUMN_STORAGE_KEY, JSON.stringify({
      version: 1,
      visibleOrder: ['index', 'object_name', 'cable_type', 'cable_mark'],
      columns: { cable_type: { widthPct: 13 } },
    }));
    const user = (await import('@testing-library/user-event')).default.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Труба-1')).toBeInTheDocument();
      expect(screen.getByText('Труба-2')).toBeInTheDocument();
    });
    expect(screen.getByRole('row', { name: /Труба-1/ })).toHaveTextContent('ТТН/ТТВ/ТТХ');
    expect(screen.getByRole('row', { name: /Труба-2/ })).toHaveTextContent('ТТН/ТТВ/ТТХ');
    const firstRow = screen.getByRole('row', { name: /Труба-1/ });
    fireEvent.click(within(firstRow).getByRole('checkbox'));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Пересчитать выбранные \(1\)/i })).toBeInTheDocument();
    });
    await user.type(await screen.findByLabelText('T3 поддержания'), '50');

    expect(screen.getAllByText('ТТН/ТТВ/ТТХ').length).toBeGreaterThan(0);
    expect(screen.getByRole('row', { name: /Труба-1/ })).toHaveTextContent('ТТН/ТТВ/ТТХ');
    expect(screen.getByRole('row', { name: /Труба-2/ })).toHaveTextContent('ТТН/ТТВ/ТТХ');
    await user.click(screen.getByRole('button', { name: /Пересчитать выбранные \(1\)/i }));

    await waitFor(() => {
      expect(enqueueElectricalBatchJob).toHaveBeenCalledWith(
        'p-1',
        'builtin',
        1,
        'self_regulating_tt',
        expect.objectContaining({
          maintainTemperature: 50,
          objectIds: ['o-1'],
          objectOverrides: undefined,
          skipManual: true,
        }),
      );
    });
  });

});

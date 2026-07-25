import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { useProjectStore } from '@/store/projectStore';
import { mockProject, makeObject, makeElectricalPage, renderPage } from '@/__tests__/integration/pages/electrical/elecCalcPageHarness';
import { resetElecCalcIntegrationState } from '@/__tests__/integration/pages/electrical/elecCalcPageTestEnv';
import '@/__tests__/integration/pages/electrical/elecCalcPageTestEnv';

describe('ElecCalcPage cable-meta — inline edit & batch queue', () => {
  beforeEach(() => {
    resetElecCalcIntegrationState();
  });

  it('не пересчитывает объект из inline-полей таблицы', async () => {
    const { getElectricalPage, selectCableForVariants } = await import('@/api/calculations');
    (getElectricalPage as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeElectricalPage([makeObject()], [
        {
        id: 'c-1',
        object_id: 'o-1',
        cable_type: 'self_regulating',
        cable_mark: 'ТЛТ-30',
        variant_number: 1,
        results: {
          selected_cable: 'ТЛТ-30',
          winding_pitch: 0,
          num_circuits: 1,
          installed_cable_length: 10,
          order_cable_length: 11,
          total_power: 600,
          current: 2.7,
          voltage: 220,
        },
      },
      ]),
    );
    (selectCableForVariants as ReturnType<typeof vi.fn>).mockResolvedValue([{
      id: 'c-1',
      object_id: 'o-1',
      cable_type: 'self_regulating',
      cable_mark: 'ТЛТ-30',
      variant_number: 1,
      results: { winding_pitch: 80, num_circuits: 1 },
    }]);
    useProjectStore.getState().setCurrentProject(mockProject);
    renderPage();

    await waitFor(() => {
      expect(screen.getAllByText('ТЛТ-30').length).toBeGreaterThan(0);
    });
    fireEvent.click(screen.getByText('Труба-1').closest('tr') as HTMLTableRowElement);
    expect(document.querySelector('.electrical-spreadsheet input[role="spinbutton"]')).toBeNull();
    expect(document.querySelector('.electrical-spreadsheet .ant-select-selector')).toBeNull();
    expect(selectCableForVariants).not.toHaveBeenCalled();
  });

  it('ставит batch в очередь с выбранным типом ТТН/ТТВ/ТТХ и его параметрами', async () => {
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
    const rowCheckbox = document.querySelector('tbody .ant-checkbox-input') as HTMLInputElement;
    fireEvent.click(rowCheckbox);
    await waitFor(() => {
      expect(screen.getByText(/Тип для пересчёта/i)).toBeInTheDocument();
    });
    // TltSelect shows selected value in trigger and may mirror label text elsewhere.
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
    expect(options.objectOverrides).toBeUndefined();
  });

});
